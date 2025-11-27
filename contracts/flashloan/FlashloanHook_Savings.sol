// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import {IMorpho, MarketParams, Id, Position, Market} from '../morpho/IMorpho.sol';
import {SharesMathLib} from '../morpho/SharesMathLib.sol';
import {SavingsVaultZCHF} from '../vault/SavingsVaultZCHF.sol';

import {IFlashloanHook} from './IFlashloanHook.sol';
import {IFlashloanOrchestrator} from './IFlashloanOrchestrator.sol';

contract FlashloanHook_Savings is IFlashloanHook {
	using Math for uint256;
	using SharesMathLib for uint256;
	using SafeERC20 for IERC20;

	IFlashloanOrchestrator public immutable orchestrator;

	IMorpho public immutable morpho;
	SavingsVaultZCHF public immutable savingsVault;
	MarketParams public market;

	// opcodes
	uint8 public constant INCREASE_LEVERAGE = 0;
	uint8 public constant DECREASE_LEVERAGE = 1;
	uint8 public constant CLOSE_TO_LOAN = 2;
	uint8 public constant CLOSE_TO_COLLATERAL = 3;

	// events
	event Executed(uint8 opcode, uint256 flash, uint256 amountIn, uint256 amountOut, uint256 provided);

	// errors
	error InvalidOpcode(uint8 given);

	constructor(address _orchestrator, address _morpho, address _savingsVault, Id _market) {
		orchestrator = IFlashloanOrchestrator(_orchestrator);
		morpho = IMorpho(_morpho);
		savingsVault = SavingsVaultZCHF(_savingsVault);
		market = morpho.idToMarketParams(_market);
	}

	// ---------------------------------------------------------------------------------------

	function getMarketId(MarketParams memory marketParams) public pure returns (bytes32) {
		return
			keccak256(
				abi.encode(marketParams.loanToken, marketParams.collateralToken, marketParams.oracle, marketParams.irm, marketParams.lltv)
			);
	}

	// ---------------------------------------------------------------------------------------

	function transferAllToken(address _token) internal returns (uint256, IERC20) {
		IERC20 token = IERC20(_token);
		uint256 bal = token.balanceOf(address(orchestrator));
		if (bal > 0) {
			token.safeTransferFrom(address(orchestrator), address(this), bal);
		}
		return (token.balanceOf(address(orchestrator)), token);
	}

	// ---------------------------------------------------------------------------------------

	function _supplyCollateral(uint256 assets, address onBehalf) internal {
		IERC20(market.collateralToken).forceApprove(address(morpho), assets);
		morpho.supplyCollateral(market, assets, onBehalf, new bytes(0));
	}

	function _withdrawCollateral(uint256 assets, address onBehalf, address target) internal {
		morpho.withdrawCollateral(market, assets, onBehalf, target);
	}

	function _borrow(uint256 assets, address onBehalf, address target) internal returns (uint256 assetsBorrowed, uint256 sharesBorrowed) {
		(assetsBorrowed, sharesBorrowed) = morpho.borrow(market, assets, 0, onBehalf, target);
	}

	function _repay(uint256 assets, address onBehalf) internal returns (uint256 assetsRepaid, uint256 sharesRepaid) {
		IERC20(market.loanToken).forceApprove(address(morpho), assets);
		(assetsRepaid, sharesRepaid) = morpho.repay(market, assets, 0, onBehalf, new bytes(0));
	}

	function _repayShares(uint256 shares, address onBehalf) internal returns (uint256 assetsRepaid, uint256 sharesRepaid) {
		IERC20(market.loanToken).forceApprove(address(morpho), type(uint256).max);
		(assetsRepaid, sharesRepaid) = morpho.repay(market, 0, shares, onBehalf, new bytes(0));
		IERC20(market.loanToken).forceApprove(address(morpho), 0);
	}

	// ---------------------------------------------------------------------------------------

	function onFlashloanHook(bytes calldata data) external payable returns (bytes memory) {
		// verify orchestrator
		if (msg.sender != address(orchestrator)) revert IFlashloanOrchestrator.InvalidAddress();

		// decode
		uint8 opcode = abi.decode(data, (uint8));
		address sender = orchestrator.sender();

		// verify sender
		if (sender == address(0)) {
			revert IFlashloanOrchestrator.InvalidAddress();
		}

		// get loan and collateral tokens
		(uint256 loanAmount, IERC20 loan) = transferAllToken(market.loanToken);
		(uint256 collateralAmount, IERC20 collateral) = transferAllToken(market.collateralToken);
		uint256 flashAmount = orchestrator.flashAmount();

		if (opcode == INCREASE_LEVERAGE) {
			// forceApprove and execute vault deposit
			loan.forceApprove(address(savingsVault), loanAmount);
			uint256 amountOut = savingsVault.deposit(loanAmount, address(this));

			// supply collateral - includes any ERC20 Transfers from before
			_supplyCollateral(collateralAmount + amountOut, sender);

			// borrow for flashloan repayment
			_borrow(flashAmount, sender, address(orchestrator));

			emit Executed(INCREASE_LEVERAGE, flashAmount, loanAmount, amountOut, collateralAmount);
		} else if (opcode == DECREASE_LEVERAGE) {
			// forceApprove and execute vault redeem
			collateral.forceApprove(address(savingsVault), collateralAmount);
			uint256 amountOut = savingsVault.redeem(collateralAmount, address(this), address(this));

			// repay loan - includes any ERC20 Transfers from before
			uint256 repayAmount = loanAmount + amountOut;
			_repay(repayAmount, sender);

			// withdraw collateral for flashloan repayment
			_withdrawCollateral(flashAmount, sender, address(orchestrator));

			emit Executed(DECREASE_LEVERAGE, flashAmount, collateralAmount, amountOut, repayAmount);
		} else if (opcode == CLOSE_TO_LOAN) {
			// get infos
			Id marketId = Id.wrap(getMarketId(market));
			Position memory p = morpho.position(marketId, sender);

			// repay loan
			_repayShares(p.borrowShares, sender);

			// withdraw collateral
			_withdrawCollateral(p.collateral, sender, address(this));

			// forceApprove and execute vault redeem
			collateral.forceApprove(address(savingsVault), p.collateral);
			uint256 amountOut = savingsVault.redeem(p.collateral, address(this), address(this));

			// refund for flashloan repayment
			loan.transfer(address(orchestrator), flashAmount);

			// transfer equity balance
			uint256 equity = loan.balanceOf(address(this));
			loan.transfer(sender, equity);

			emit Executed(CLOSE_TO_LOAN, flashAmount, p.collateral, amountOut, equity);
		} else if (opcode == CLOSE_TO_COLLATERAL) {
			// get infos
			Id marketId = Id.wrap(getMarketId(market));
			Position memory p = morpho.position(marketId, sender);

			// repay loan
			_repayShares(p.borrowShares, sender);

			// withdraw collateral
			_withdrawCollateral(p.collateral, sender, address(this));

			// balance of loan token
			uint256 bal = loan.balanceOf(address(this));

			if (bal < flashAmount) {
				// missing assets, execute vault withdraw
				savingsVault.withdraw(flashAmount - bal, address(this), address(this));
			} else if (bal > flashAmount) {
				// too much assets, approve & execute vault deposit
				uint256 depositAmount = bal - flashAmount;
				loan.forceApprove(address(savingsVault), depositAmount);
				savingsVault.deposit(depositAmount, address(this));
			}

			// refund for flashloan repayment
			loan.transfer(address(orchestrator), flashAmount);

			// transfer collateral to sender
			uint256 remainingCollateral = collateral.balanceOf(address(this));
			collateral.transfer(sender, remainingCollateral);

			emit Executed(CLOSE_TO_COLLATERAL, flashAmount, p.collateral, bal, remainingCollateral);
		} else revert InvalidOpcode(opcode);

		return abi.encode(true);
	}
}
