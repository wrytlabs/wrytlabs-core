// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

import {IMorpho, MarketParams, Id, Position, Market} from '../morpho/IMorpho.sol';
import {SharesMathLib} from '../morpho/SharesMathLib.sol';
import {IMorphoFlashLoanCallback} from '../morpho/IMorphoCallbacks.sol';
import {IFlashloanOrchestrator, Action} from './IFlashloanOrchestrator.sol';
import {IFlashloanHook} from './IFlashloanHook.sol';

/// @title FlashloanOrchestrator
/// @notice Orchestrates complex DeFi operations using Morpho flashloans
/// @dev This contract allows users to execute multiple actions atomically within a flashloan context.
/// Users can provide tokens, request a flashloan, and execute a series of actions before repaying the loan.
/// @author WrytLabs
contract FlashloanOrchestrator is ReentrancyGuard, IMorphoFlashLoanCallback, IFlashloanOrchestrator {
	using Math for uint256;
	using SharesMathLib for uint256;
	using SafeERC20 for IERC20;

	/// @notice The Morpho protocol contract used for flashloans
	IMorpho private immutable morpho;

	// ============ State Variables ============

	/// @notice Address of the user who initiated the current execution
	/// @dev Reset after each execution for security
	address public sender;

	/// @notice Array of token addresses provided by the user
	address[] public tokens;

	/// @notice Array of token amounts provided by the user
	uint256[] public amounts;

	/// @notice Token used for flashloan
	address public flashToken;

	/// @notice Amount borrowed via flashloan
	uint256 public flashAmount;

	/// @notice Current action being executed (for error tracking)
	uint8 public actionIndex;

	/// @notice Array of actions to execute during flashloan
	Action[] public actionData;

	/// @notice Results from executed actions
	bytes[] public actionResult;

	/// @notice Initializes the FlashloanOrchestrator with Morpho protocol
	/// @param _morpho Address of the Morpho protocol contract
	/// @dev Validates that _morpho is not zero address for security
	constructor(address _morpho) {
		if (_morpho == address(0)) revert InvalidAddress();
		morpho = IMorpho(_morpho);
	}

	// ============ External Functions ============

	/// @inheritdoc IFlashloanOrchestrator
	/// @dev Validates inputs, transfers user tokens, executes flashloan, and sweeps remaining tokens
	function execute(
		address[] calldata _tokens,
		uint256[] calldata _amounts,
		address _flashToken,
		uint256 _flashAmount,
		Action[] calldata _actionData
	) external nonReentrant returns (bytes[] memory) {
		// Input validation
		if (_tokens.length != _amounts.length) revert ArrayLengthMismatch();
		if (_flashToken == address(0)) revert InvalidAddress();
		if (_actionData.length == 0) revert NoActionsProvided();

		// Store execution parameters
		sender = msg.sender;
		tokens = _tokens;
		amounts = _amounts;
		flashToken = _flashToken;
		flashAmount = _flashAmount;
		actionData = _actionData;

		// Initialize action results array
		actionResult = new bytes[](_actionData.length);

		// Transfer user-provided tokens to this contract
		for (uint8 i = 0; i < tokens.length; i++) {
			uint256 amount = amounts[i];

			if (amount > 0) {
				// Validate token address to prevent zero address transfers
				if (tokens[i] == address(0)) revert InvalidAddress();
				IERC20(tokens[i]).safeTransferFrom(sender, address(this), amount);
			}
		}

		// Execute flashloan with minimal callback data
		bytes memory data = abi.encode(0); // Minimal data for callback identification
		morpho.flashLoan(flashToken, flashAmount, data);

		// Return any remaining tokens to the user
		for (uint8 i = 0; i < tokens.length; i++) {
			address token = tokens[i];
			uint256 bal = IERC20(token).balanceOf(address(this));

			if (bal > 0) {
				// Use safeTransfer for additional safety
				IERC20(token).safeTransfer(sender, bal);
			}
		}

		// Return any remaining ETH to the user
		uint256 ethBalance = address(this).balance;
		if (ethBalance > 0) {
			(bool success, ) = payable(sender).call{value: ethBalance}('');
			if (!success) revert InvalidRefund();
		}

		// Backup action results before clearing state
		bytes[] memory results = actionResult;

		// Clear state variables for security and gas optimization
		clearVars();

		// Return the backed up results
		return results;
	}

	// ============ Callback Functions ============

	/// @notice Callback function called by Morpho during flashloan execution
	/// @param assets The amount of assets that need to be repaid to Morpho
	/// @param data Arbitrary data passed from the flashloan call (unused)
	/// @dev This function executes all queued actions and approves repayment
	function onMorphoFlashLoan(uint256 assets, bytes calldata data) external {
		// Security: Only Morpho can call this callback
		if (msg.sender != address(morpho)) revert NotMorpho();

		// Execute all queued actions sequentially
		for (uint8 h = 0; h < actionData.length; h++) {
			actionIndex = h;
			Action storage action = actionData[h];

			// Validate action target to prevent calls to zero address
			if (action.target == address(0)) {
				revert InvalidAddress();
			}

			// Prevent recursive calls to this contract for security
			if (action.target == address(this)) {
				revert RecursiveCallNotAllowed();
			}

			// Grant temporary token approvals to the action target
			for (uint8 i = 0; i < tokens.length; i++) {
				address token = tokens[i];
				uint256 bal = IERC20(token).balanceOf(address(this));
				if (bal > 0) {
					// Approve the exact balance for security
					IERC20(token).forceApprove(action.target, bal);
				}
			}

			// Also approve flashloan token if it's not already in the tokens array
			if (!_isTokenInArray(flashToken)) {
				uint256 flashBal = IERC20(flashToken).balanceOf(address(this));
				if (flashBal > 0) {
					IERC20(flashToken).forceApprove(action.target, flashBal);
				}
			}

			IFlashloanHook hook = IFlashloanHook(action.target);

			// Verify orchestrator address
			if (address(hook.orchestrator()) != address(this)) {
				revert InvalidAddress();
			}

			// Execute the action with the specified value and data
			actionResult[h] = hook.onFlashloanHook{value: action.value}(action.data);

			// Emit event for successful action execution
			emit Executed(sender, action.target);

			// Reset all token allowances for security
			for (uint8 i = 0; i < tokens.length; i++) {
				IERC20(tokens[i]).forceApprove(action.target, 0);
			}

			// Reset flashloan token allowance if it was approved
			if (!_isTokenInArray(flashToken)) {
				IERC20(flashToken).forceApprove(action.target, 0);
			}
		}

		// Approve Morpho to collect the flashloan repayment
		// This must happen after all actions to ensure sufficient balance
		IERC20(flashToken).forceApprove(address(morpho), assets);
	}

	// ============ Internal Functions ============

	/// @notice Clears all execution state variables
	/// @dev Called after each execution to reset state and prevent data leakage
	function clearVars() internal {
		// Reset user and execution context
		delete sender;
		delete tokens;
		delete amounts;
		delete flashToken;
		delete flashAmount;

		// Reset action execution state
		delete actionIndex;
		delete actionData;
		delete actionResult;
	}

	/// @notice Checks if a token is already in the tokens array
	/// @param token The token address to check
	/// @return exists True if token is in the array, false otherwise
	/// @dev Used to avoid duplicate approvals for flashloan token
	function _isTokenInArray(address token) internal view returns (bool exists) {
		for (uint8 i = 0; i < tokens.length; i++) {
			if (tokens[i] == token) {
				return true;
			}
		}
		return false;
	}

	// ============ Fallback Functions ============

	/// @notice Allows contract to receive ETH for action executions that require ETH
	/// @dev ETH can be used as value in action calls
	receive() external payable {
		// Allow ETH deposits for action execution
	}

	/// @notice Fallback function to handle unexpected calls
	/// @dev Reverts to prevent accidental calls to unsupported functions
	fallback() external payable {
		revert UnsupportedFunction();
	}
}
