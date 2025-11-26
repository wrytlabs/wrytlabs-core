// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

import {IMorpho, MarketParams, Id, Position, Market} from '../morpho/IMorpho.sol';
import {SharesMathLib} from '../morpho/SharesMathLib.sol';
import {IMorphoFlashLoanCallback} from '../morpho/IMorphoCallbacks.sol';

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

contract FlashloanOrchestrator is ReentrancyGuard, IMorphoFlashLoanCallback {
	using Math for uint256;
	using SharesMathLib for uint256;
	using SafeERC20 for IERC20;

	IMorpho private immutable morpho;

	// workflow vars
	address public sender;
	address[] public tokens;
	uint256[] public amounts;
	address flashToken;
	uint256 flashAmount;

	uint8 actionIndex;
	Action[] actionData;
	bytes[] actionResult;

	// event
	event Executed(address action);

	// errors
	error NotMorpho();
	error InvalidAddress();
	error ExecutionFailed(uint8 index);

	constructor(address _morpho) {
		morpho = IMorpho(_morpho);
	}

	// ---------------------------------------------------------------------------------------

	function execute(
		address[] calldata _tokens,
		uint256[] calldata _amounts,
		address _flashToken,
		uint256 _flashAmount,
		Action[] calldata _actionData
	) external nonReentrant {
		// set vars
		sender = msg.sender;
		tokens = _tokens;
		amounts = _amounts;
		flashToken = _flashToken;
		flashAmount = _flashAmount;
		actionData = _actionData;

		// transfer tokens
		for (uint8 i = 0; i < tokens.length; i++) {
			uint256 amount = amounts[i];

			if (amount > 0) {
				IERC20(tokens[i]).safeTransferFrom(sender, address(this), amount);
			}
		}

		// perform flashloan
		bytes memory data = abi.encode(0);
		morpho.flashLoan(flashToken, flashAmount, data);

		// sweep tokens
		for (uint8 i = 0; i < tokens.length; i++) {
			address token = tokens[i];
			uint256 bal = IERC20(token).balanceOf(address(this));

			if (bal > 0) {
				IERC20(token).transfer(sender, bal);
			}
		}

		// clean up
		clearVars();
	}

	// ---------------------------------------------------------------------------------------

	function onMorphoFlashLoan(uint256 assets, bytes calldata /* data */) external {
		if (msg.sender != address(morpho)) revert NotMorpho();

		for (uint8 h = 0; h < actionData.length; h++) {
			actionIndex = h;
			Action storage action = actionData[h];

			// verify action address
			if (action.target == address(0)) {
				revert InvalidAddress();
			}

			// approve all token balances to action.target
			for (uint8 i = 0; i < tokens.length; i++) {
				address token = tokens[i];
				uint256 bal = IERC20(token).balanceOf(address(this));

				if (bal > 0) {
					IERC20(token).forceApprove(action.target, bal);
				}
			}

			// execute action
			(bool success, bytes memory returnData) = action.target.call{value: action.value}(action.data);
			actionResult[h] = returnData;

			// verify execution
			if (!success) {
				revert ExecutionFailed(h);
			}

			// reset allowance
			for (uint8 i = 0; i < tokens.length; i++) {
				IERC20(tokens[i]).forceApprove(action.target, 0);
			}

			// emit event
		}

		// forceApprove for flashloan repayment
		IERC20(flashToken).forceApprove(address(morpho), assets);
	}

	// ---------------------------------------------------------------------------------------

	function clearVars() internal {
		delete sender;
		delete tokens;
		delete amounts;
		delete flashToken;
		delete flashAmount;

		delete actionIndex;
		delete actionData;
		delete actionResult;
	}
}
