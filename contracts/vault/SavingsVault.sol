// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ERC4626, ERC20, IERC20} from '@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol';
import {Ownable2Step, Ownable} from '@openzeppelin/contracts/access/Ownable2Step.sol';

import {ISavings} from './helpers/ISavings.sol';

/**
 * @title SavingsVault
 * @notice ERC-4626-compatible vault adapter for the ISavings module.
 *         This vault tracks interest-bearing deposits using a custom price-based mechanism,
 *         where share value increases over time as interest accrues.
 *
 * @dev The vault mitigates dilution and price manipulation attacks on empty vaults
 *      (a known vulnerability in ERC-4626) by using an explicit price model that starts at 1e18,
 *      instead of relying on the default totalAssets / totalSupply ratio when supply is zero.
 *
 *      Interest is recognized through a manual `_accrueInterest()` call, which updates the internal
 *      price based on newly accrued interest. Withdrawals are protected by a locking mechanism tied
 *      to `savings.currentTicks()`, preventing premature exits and mitigating manipulation of
 *      account-based interest shifts enforced by `savings.INTEREST_DELAY()`.
 */
contract SavingsVault is ERC4626, Ownable2Step {
	using Math for uint256;

	ISavings public immutable savings;
	uint256 public totalClaimed;

	event SetReferral(address indexed referrer, uint24 referralFeePPM);
	event InterestClaimed(uint256 interest, uint256 totalClaimed);

	constructor(
		address _owner,
		IERC20 _coin,
		ISavings _savings,
		string memory _name,
		string memory _symbol
	) ERC4626(_coin) ERC20(_name, _symbol) Ownable(_owner) {
		savings = _savings;
	}

	// ---------------------------------------------------------------------------------------

	/// @notice Returns the current savings account state for this contract
	/// @dev Uses the external `savings` contract to fetch the account details
	function info() public view returns (ISavings.Account memory) {
		return savings.savings(address(this));
	}

	/// @notice Returns the current price per share of the contract
	/// @dev If no shares exist, it defaults to 1 ether (implying 1:1 value)
	function price() public view returns (uint256) {
		uint256 totalShares = totalSupply();
		if (totalShares == 0) return 1 ether;
		return (totalAssets() * 1 ether) / totalShares;
	}

	/// @notice Calculates the accrued interest for this contract, minus referral fee if applicable
	/// @dev If the account has a referrer, a referral fee is deducted from the interest
	function _interest() internal view returns (uint256) {
		uint256 interest = savings.accruedInterest(address(this));
		ISavings.Account memory state = info();

		if (state.referrer != address(0)) {
			return interest - (interest * state.referralFeePPM) / 1_000_000;
		} else {
			return interest;
		}
	}

	// ---------------------------------------------------------------------------------------
	// Override functions of ERC4626

	function totalAssets() public view override returns (uint256) {
		return savings.savings(address(this)).saved + _interest();
	}

	function _convertToShares(uint256 assets, Math.Rounding rounding) internal view virtual override returns (uint256) {
		return (assets * 1 ether) / price();
	}

	function _convertToAssets(uint256 shares, Math.Rounding rounding) internal view virtual override returns (uint256) {
		return (shares * price()) / 1 ether;
	}

	// ---------------------------------------------------------------------------------------
	// Locking mechanism to prevent premature withdrawals.
	// Interest is shifted over time, and early exits could lead to exploitation
	// at the expense of other depositors if not properly gated.

	/// @notice Checks whether the vault's funds are unlocked and eligible for withdrawal.
	/// @dev Compares the current tick with the tick at which the vault's funds become available.
	function isUnlocked() public view returns (bool) {
		return savings.currentTicks() >= savings.savings(address(this)).ticks;
	}

	/// @notice Returns the time (in seconds) until the vault's funds are unlocked.
	/// @dev Uses the tick difference and current rate in parts per million (PPM) to compute time remaining.
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

	function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares) internal virtual override {
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

	/// @notice Internal function to accrue and record interest if available
	/// @dev Retrieves net interest (after referral fee, if any) via `_interest()`
	/// @dev If there is interest and shares exist, adds it to `totalClaimed` and emits an event
	function _accrueInterest() internal {
		uint256 interest = _interest();

		if (interest > 0 && totalSupply() > 0) {
			totalClaimed += interest;
			emit InterestClaimed(interest, totalClaimed);
		}
	}

	// ---------------------------------------------------------------------------------------

	/// @notice Sets the referral for this contract's savings account
	/// @dev Only callable by the contract owner
	/// @dev The `savings` module enforces that the referral fee does not exceed the 25% (250,000 PPM) maximum
	function setReferral(address referrer, uint24 referralFeePPM) external onlyOwner {
		savings.save(0, referrer, referralFeePPM);
		emit SetReferral(referrer, referralFeePPM);
	}
}
