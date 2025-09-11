// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Address} from '@openzeppelin/contracts/utils/Address.sol';

/**
 * @title Queue
 * @notice A smart contract for executing batch operations with failure handling
 * @dev Implements ownership, reentrancy protection, and pausable functionality
 */
contract Queue is Ownable {
    using Address for address;

    // ============ Events ============

    /// @notice Emitted when a batch is executed
    /// @param batchId The unique identifier for the batch
    /// @param executor The address that executed the batch
    /// @param actions The actions that were executed
    /// @param results Array indicating success/failure of each action
    /// @param allowFailureMap The failure map used for this batch
    event BatchExecuted(
        uint256 indexed batchId,
        address indexed executor,
        Action[] actions,
        bool[] results,
        uint256 allowFailureMap
    );

    /// @notice Emitted when an individual action fails
    /// @param batchId The batch identifier
    /// @param actionIndex The index of the failed action
    /// @param reason The reason for failure
    event ActionFailed(
        uint256 indexed batchId,
        uint256 actionIndex,
        string reason
    );

    /// @notice Emitted when the contract is paused
    /// @param account The address that paused the contract
    event Paused(address indexed account);

    /// @notice Emitted when the contract is unpaused
    /// @param account The address that unpaused the contract
    event Unpaused(address indexed account);

    // ============ Structs ============

    /// @notice Represents a single action to be executed
    /// @param target The target contract address
    /// @param value The amount of ETH to send with the call
    /// @param data The encoded function call data
    struct Action {
        address target;
        uint256 value;
        bytes data;
    }

    /// @notice Configuration for batch execution
    /// @param maxActions Maximum number of actions allowed per batch
    /// @param maxValue Maximum ETH value allowed per action
    /// @param allowedTargets Mapping of allowed target addresses
    struct BatchConfig {
        uint256 maxActions;
        uint256 maxValue;
        mapping(address => bool) allowedTargets;
    }

    // ============ State Variables ============

    /// @notice Counter for batch IDs
    uint256 private _batchCounter;

    /// @notice Configuration for batch execution
    BatchConfig public batchConfig;

    /// @notice Mapping to track executed batch IDs to prevent replay
    mapping(uint256 => bool) public executedBatches;

    // ============ Errors ============

    /// @notice Thrown when no actions are provided
    error InvalidActionCount();
    
    /// @notice Thrown when an action execution fails
    /// @param index The index of the failed action
    error ActionExecutionFailed(uint256 index);
    
    /// @notice Thrown when target address is invalid
    error InvalidTargetAddress();
    
    /// @notice Thrown when value exceeds maximum allowed
    error ValueExceedsMaximum();
    
    /// @notice Thrown when target is not in allowed list
    error TargetNotAllowed();
    
    /// @notice Thrown when batch has already been executed
    error BatchAlreadyExecuted();
    
    /// @notice Thrown when batch size exceeds maximum
    error BatchSizeExceedsMaximum();

    // ============ Modifiers ============

    /// @notice Validates that actions array is not empty
    /// @param actions The actions array to validate
    modifier validActions(Action[] calldata actions) {
        if (actions.length == 0) revert InvalidActionCount();
        if (actions.length > batchConfig.maxActions) revert BatchSizeExceedsMaximum();
        _;
    }

    /// @notice Validates that the contract has sufficient balance
    /// @param totalValue The total value to be sent
    modifier sufficientBalance(uint256 totalValue) {
        require(address(this).balance >= totalValue, "Insufficient contract balance");
        _;
    }

    // ============ Constructor ============

    /// @notice Initializes the Queue contract
    /// @param _maxActions Maximum number of actions allowed per batch
    /// @param _maxValue Maximum ETH value allowed per action
    constructor(uint256 _maxActions, uint256 _maxValue) Ownable(msg.sender) {
        batchConfig.maxActions = _maxActions;
        batchConfig.maxValue = _maxValue;
    }

    // ============ Core Functions ============

    /// @notice Executes a batch of actions with failure handling
    /// @param actions Array of actions to execute
    /// @param allowFailureMap Bitmap allowing specific actions to fail without reverting the entire batch
    /// @return results Array indicating success/failure of each action
    /// @return batchId The unique identifier for this batch
    function executeBatch(
        Action[] calldata actions,
        uint256 allowFailureMap
    ) 
        external 
        onlyOwner 
        validActions(actions)
        returns (bool[] memory results, uint256 batchId)
    {
        // Generate batch ID based on actions and metadata
        batchId = _createBatchId(actions, allowFailureMap);
        
        // Check if batch has already been executed
        if (executedBatches[batchId]) revert BatchAlreadyExecuted();
        
        // Mark batch as executed
        executedBatches[batchId] = true;
        
        results = new bool[](actions.length);
        uint256 totalValue = 0;
        
        // Validate all actions before execution
        for (uint256 i = 0; i < actions.length; i++) {
            Action calldata action = actions[i];
            
            // Validate target address
            if (action.target == address(0)) revert InvalidTargetAddress();
            
            // Validate value
            if (action.value > batchConfig.maxValue) revert ValueExceedsMaximum();
            
            // Check if target is allowed (if restrictions are enabled)
            if (batchConfig.allowedTargets[address(0)] == false) {
                if (!batchConfig.allowedTargets[action.target]) revert TargetNotAllowed();
            }
            
            totalValue += action.value;
        }
        
        // Check sufficient balance
        if (totalValue > 0) {
            require(address(this).balance >= totalValue, "Insufficient contract balance");
        }
        
        // Execute actions
        for (uint256 i = 0; i < actions.length; i++) {
            Action calldata action = actions[i];
            
            // Execute action
            (bool success, bytes memory returnData) = action.target.call{
                value: action.value
            }(action.data);
            
            if (success) {
                results[i] = true;
            } else {
                // Check if failure is allowed for this action
                if (allowFailureMap & (1 << i) == 0) {
                    revert ActionExecutionFailed(i);
                }
                results[i] = false;
                emit ActionFailed(batchId, i, string(returnData));
            }
        }
        
        emit BatchExecuted(batchId, msg.sender, actions, results, allowFailureMap);
    }

    /// @notice Creates a unique batch ID based on actions and metadata
    /// @param actions The actions to be executed
    /// @param allowFailureMap The failure map for the batch
    /// @return batchId The unique batch identifier
    function _createBatchId(
        Action[] calldata actions,
        uint256 allowFailureMap
    ) internal view returns (uint256 batchId) {
        bytes32 hash = keccak256(
            abi.encode(
                actions,
                allowFailureMap,
                block.chainid,
                _batchCounter
            )
        );
        batchId = uint256(hash);
    }

    // ============ Configuration Functions ============

    /// @notice Sets the maximum number of actions allowed per batch
    /// @param maxActions The new maximum number of actions
    function setMaxActions(uint256 maxActions) external onlyOwner {
        batchConfig.maxActions = maxActions;
    }

    /// @notice Sets the maximum value allowed per action
    /// @param maxValue The new maximum value
    function setMaxValue(uint256 maxValue) external onlyOwner {
        batchConfig.maxValue = maxValue;
    }

    /// @notice Adds a target address to the allowed list
    /// @param target The target address to allow
    function allowTarget(address target) external onlyOwner {
        require(target != address(0), "Invalid target address");
        batchConfig.allowedTargets[target] = true;
    }

    /// @notice Removes a target address from the allowed list
    /// @param target The target address to disallow
    function disallowTarget(address target) external onlyOwner {
        batchConfig.allowedTargets[target] = false;
    }

    /// @notice Disables target restrictions (allows all targets)
    function disableTargetRestrictions() external onlyOwner {
        batchConfig.allowedTargets[address(0)] = true;
    }

    /// @notice Enables target restrictions
    function enableTargetRestrictions() external onlyOwner {
        batchConfig.allowedTargets[address(0)] = false;
    }

    // ============ Emergency Functions ============



    /// @notice Emergency withdrawal of all ETH from the contract
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    /// @notice Emergency withdrawal of specific amount
    /// @param amount The amount to withdraw
    function emergencyWithdrawAmount(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        require(amount <= address(this).balance, "Insufficient balance");
        
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Withdrawal failed");
    }

    // ============ View Functions ============

    /// @notice Gets the current batch counter
    /// @return The current batch counter value
    function getBatchCounter() external view returns (uint256) {
        return _batchCounter;
    }

    /// @notice Checks if a target address is allowed
    /// @param target The target address to check
    /// @return True if the target is allowed
    function isTargetAllowed(address target) external view returns (bool) {
        if (batchConfig.allowedTargets[address(0)] == false) {
            return batchConfig.allowedTargets[target];
        }
        return true;
    }

    /// @notice Gets the current batch configuration
    /// @return maxActions Maximum number of actions allowed
    /// @return maxValue Maximum value allowed per action
    function getBatchConfig() external view returns (uint256 maxActions, uint256 maxValue) {
        maxActions = batchConfig.maxActions;
        maxValue = batchConfig.maxValue;
    }

    // ============ Receive Function ============

    /// @notice Allows the contract to receive ETH
    receive() external payable {}
}
