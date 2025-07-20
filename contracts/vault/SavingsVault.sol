// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ERC4626, ERC20, IERC20} from '@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol';

import {ISavings} from './helpers/ISavings.sol';

contract SavingsVault is ERC4626 {
	using Math for uint256;

	ISavings public immutable savings;
	uint256 public totalClaimed;

	event InterestClaimed(uint256 interest, uint256 totalClaimed);

	constructor(
		ISavings _savings,
		string memory _name,
		string memory _symbol
	) ERC4626(IERC20(_savings.zchf())) ERC20(_name, _symbol) {
		savings = _savings;
	}

	// ---------------------------------------------------------------------------------------

	function price() public view returns (uint256) {
		uint256 totalShares = totalSupply();
		if (totalShares == 0) return 1 ether;
		return (totalAssets() * 1 ether) / totalShares;
	}

	function info() public view returns (ISavings.Account memory) {
		return savings.savings(address(this));
	}

	// ---------------------------------------------------------------------------------------
	// Override functions of ERC4626

	function totalAssets() public view override returns (uint256) {
		return savings.savings(address(this)).saved + savings.accruedInterest(address(this));
	}

	function _convertToShares(uint256 assets, Math.Rounding rounding) internal view virtual override returns (uint256) {
		return (assets * 1 ether) / price();
	}

	function _convertToAssets(uint256 shares, Math.Rounding rounding) internal view virtual override returns (uint256) {
		return (shares * price()) / 1 ether;
	}

	// ---------------------------------------------------------------------------------------
	// Locking Mechanism - since interests are shifted and otherwise would cause an exploit on behalf of the depositors

	function isUnlocked() public view returns (bool) {
		return savings.currentTicks() >= savings.savings(address(this)).ticks;
	}

	function untilUnlocked() public view returns (uint256) {
		if (isUnlocked()) return 0;
		uint256 diff = savings.savings(address(this)).ticks - savings.currentTicks();
		return (diff / savings.currentRatePPM());
	}

	// ---------------------------------------------------------------------------------------

	function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal virtual override {
		_accrueInterest();

		// If _asset is ERC-777, `transferFrom` can trigger a reentrancy BEFORE the transfer happens through the
		// `tokensToSend` hook. On the other hand, the `tokenReceived` hook, that is triggered after the transfer,
		// calls the vault, which is assumed not malicious.
		//
		// Conclusion: we need to do the transfer before we mint so that any reentrancy would happen before the
		// assets are transferred and before the shares are minted, which is a valid state.
		// slither-disable-next-line reentrancy-no-eth
		SafeERC20.safeTransferFrom(IERC20(asset()), caller, address(this), assets);
		savings.save(uint192(assets));

		_mint(receiver, shares);

		emit Deposit(caller, receiver, assets, shares);
	}

	function _withdraw(
		address caller,
		address receiver,
		address owner,
		uint256 assets,
		uint256 shares
	) internal virtual override {
		// 3 days in seconds (259200) fits safely in uint40 (max ~1.1e12)
		if (isUnlocked() == false) revert ISavings.FundsLocked(uint40(untilUnlocked()));

		_accrueInterest();

		if (caller != owner) {
			_spendAllowance(owner, caller, shares);
		}

		// If _asset is ERC-777, `transfer` can trigger a reentrancy AFTER the transfer happens through the
		// `tokensReceived` hook. On the other hand, the `tokensToSend` hook, that is triggered before the transfer,
		// calls the vault, which is assumed not malicious.
		//
		// Conclusion: we need to do the transfer after the burn so that any reentrancy would happen after the
		// shares are burned and after the assets are transferred, which is a valid state.
		_burn(owner, shares);

		savings.withdraw(receiver, uint192(assets));

		emit Withdraw(caller, receiver, owner, assets, shares);
	}

	// ---------------------------------------------------------------------------------------

	function _accrueInterest() internal {
		uint256 interest = uint256(savings.accruedInterest(address(this)));

		if (interest > 0 && totalSupply() > 0) {
			totalClaimed += interest;
		}

		emit InterestClaimed(interest, totalClaimed);
	}
}
