// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import './Membership.sol';

contract Earn is Ownable, ERC721 {
	Membership public immutable membership;

	constructor(address _owner, Membership _membership) ERC721('Earn Deposit Token', 'EDT') Ownable() {
		if (_owner != msg.sender) transferOwnership(_owner);
		membership = _membership;
	}

	// create, for members
	// creates and nft with todenId: idx

	// deposit
	// idx -> request to deposit x amount
	function deposit(uint256 amount) public {}

	function depositFrom(address from, uint256 amount) public {}

	function _depositFrom(address from, uint256 amount) internal {}

	// claim
	// idx -> request to

	// withdraw

	// result deposit and mint or update

	// result claim and transfer interest

	// result withdraw and transfer claim and funds
}
