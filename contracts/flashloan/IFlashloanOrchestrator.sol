// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Represents a single action to be executed
/// @param target The target contract address
/// @param value The amount of ETH to send with the call
/// @param data The encoded function call data
struct Action {
	address target;
	uint256 value;
	bytes data;
}

/// @title IFlashloanOrchestrator
/// @notice Interface for the FlashloanOrchestrator contract that enables flashloan-based action execution
interface IFlashloanOrchestrator {
	// ---------------------------------------------------------------------------------------
	// Events
	// ---------------------------------------------------------------------------------------

	/// @notice Emitted when an action is successfully executed
	/// @param target The address of the executed action target
	event Executed(address indexed sender, address target);

	// ---------------------------------------------------------------------------------------
	// Errors
	// ---------------------------------------------------------------------------------------

	/// @notice Thrown when the caller is not Morpho
	error NotMorpho();

	/// @notice Thrown when an invalid input is provided
	error InvalidInput();

	/// @notice Thrown when an invalid address is provided
	error InvalidAddress();

	/// @notice Thrown when an ether refund reverts
	error InvalidRefund();

	/// @notice Thrown when token and amount arrays have different lengths
	error ArrayLengthMismatch();

	/// @notice Thrown when no actions are provided for execution
	error NoActionsProvided();

	/// @notice Thrown when action target points to this contract (prevents recursion)
	error RecursiveCallNotAllowed();

	/// @notice Thrown when an unsupported function is called
	error UnsupportedFunction();

	// ---------------------------------------------------------------------------------------
	// State Variable Getters
	// ---------------------------------------------------------------------------------------

	/// @notice Gets the address of the user who initiated the current execution
	/// @return The sender address
	function sender() external view returns (address);

	/// @notice Gets the array of token addresses provided by the user
	/// @param index The index of the token to retrieve
	/// @return The token address at the specified index
	function tokens(uint256 index) external view returns (address);

	/// @notice Gets the array of token amounts provided by the user
	/// @param index The index of the amount to retrieve
	/// @return The amount at the specified index
	function amounts(uint256 index) external view returns (uint256);

	/// @notice Gets the token used for flashloan
	/// @return The flashloan token address
	function flashToken() external view returns (address);

	/// @notice Gets the amount borrowed via flashloan
	/// @return The flashloan amount
	function flashAmount() external view returns (uint256);

	/// @notice Gets the current action being executed (for error tracking)
	/// @return The current action index
	function actionIndex() external view returns (uint8);

	/// @notice Gets the action data at a specific index
	/// @param index The index of the action to retrieve
	/// @return target The target contract address
	/// @return value The amount of ETH to send with the call
	/// @return data The encoded function call data
	function actionData(uint256 index) external view returns (address target, uint256 value, bytes memory data);

	/// @notice Gets the result from an executed action
	/// @param index The index of the action result to retrieve
	/// @return The action execution result
	function actionResult(uint256 index) external view returns (bytes memory);

	// ---------------------------------------------------------------------------------------
	// Functions
	// ---------------------------------------------------------------------------------------

	/// @notice Executes a series of actions using flashloan funding
	/// @param _tokens Array of token addresses to transfer from caller
	/// @param _amounts Array of amounts corresponding to tokens
	/// @param _flashToken Token to flashloan
	/// @param _flashAmount Amount to flashloan
	/// @param _actionData Array of actions to execute during the flashloan
	function execute(
		address[] calldata _tokens,
		uint256[] calldata _amounts,
		address _flashToken,
		uint256 _flashAmount,
		Action[] calldata _actionData
	) external returns (bytes[] memory);
}
