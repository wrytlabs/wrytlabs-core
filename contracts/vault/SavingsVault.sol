// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ERC4626, ERC20, IERC20} from '@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol';

import {ISavings} from './helpers/ISavings.sol';

contract SavingsVault is ERC4626 {
	using Math for uint256;
	using SafeERC20 for IERC20;

	ISavings public immutable savings;
	uint256 public totalClaimed;

	constructor(IERC20 _asset, string memory _name, string memory _symbol) ERC4626(_asset) ERC20(_name, _symbol) {
		savings = _savings;
	}

	// ---------------------------------------------------------------------------------------

	function price() public view returns (uint256) {
		uint256 totalShares = totalSupply();
		if (totalShares == 0) return 1 ether;
		return (totalAssets() * 1 ether) / totalShares;
	}

	function info() public view returns (Account) {
		return savings.savings(address(this));
	}

	// ---------------------------------------------------------------------------------------
	// Override functions of ERC4626

	function totalAssets() public view override returns (uint256) {
		return savings.savings(address(this)).saved + savings.accruedInterest(address(this));
	}

	function _convertToShares(uint256 assets, Math.Rounding rounding) internal view virtual returns (uint256) {
		return (assets * 1 ether) / price();
	}

	function _convertToAssets(uint256 shares, Math.Rounding rounding) internal view virtual returns (uint256) {
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

	function deposit(uint256 assets, address receiver) public override returns (uint256) {
		_update();

		_asset.safeTransferFrom(msg.sender, address(this), amount);
		savings.save(uint192(amount));

		uint256 shares = convertToShares(assets);
		_mint(receiver, shares);

		emit Saved(receiver, assets, shares, price());
		return shares;
	}
}
