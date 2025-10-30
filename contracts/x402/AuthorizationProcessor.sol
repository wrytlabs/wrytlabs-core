// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

struct Authorization {
	address from;
	address to;
	address token;
	uint256 amount;
	bytes32 nonce;
	uint256 validAfter;
	uint256 validBefore;
}

struct Allowance {
	uint256 deposit;
	uint256 transfer;
	uint256 process;
	uint256 claim;
}

contract AuthorizationProcessor {
	using Math for uint256;
	using SafeERC20 for IERC20;

	mapping(address from => mapping(address signer => mapping(address token => Allowance allowance))) public authorized;
	mapping(address owner => mapping(address token => uint256 amount)) public balanceOf;

	event Authorized(address indexed from, address indexed signer, address indexed token, Allowance allowance);

	event Deposit(address indexed from, address indexed to, address indexed token, uint256 amount, address signer);
	event Transfer(address indexed from, address indexed to, address indexed token, uint256 amount, address signer);
	event Process(address indexed from, address indexed to, address indexed token, uint256 amount, address signer);
	event Claim(address indexed from, address indexed to, address indexed token, uint256 amount, address signer);

	error SignatureInvalid();
	error NotAuthorized(address from, address signer, uint256 allowance);

	constructor() {}

	// to give authorization to a signer
	function authorize(address signer, address token, Allowance calldata allowance) external returns (bool) {
		authorized[msg.sender][signer][token] = allowance;
		return true;
	}

	// contract/user -> processor --- deposit
	function depositWithAuthorization(Authorization calldata auth) external {
		// check sig

		// revert if invalid

		address signer;

		// check if funds are coming from the signer or a different source
		if (auth.from != signer) {
			// check if signer is authorized to deposit on behalf
			if (authorized[auth.from][signer][auth.token].deposit < auth.amount) {
				// revert, not authorized
			} else {
				// deduct authorized allowance for signer
				authorized[auth.from][signer][auth.token].deposit -= auth.amount;
			}
		}

		// safe transfer from this contract
		IERC20(auth.token).safeTransferFrom(auth.from, address(this), auth.amount);

		// add deposit on behalf of "to"
		balanceOf[auth.to][auth.token] += auth.amount;

		emit Deposit(auth.from, auth.to, auth.token, auth.amount, signer);
	}

	// contract -> recipient --- transfer
	function transferWithAuthorization(Authorization calldata auth) external {}

	// processor -> processor --- process
	function processWithAuthorization(Authorization calldata auth) external {}

	// processor -> recipient --- claim
	function claimWithAuthorization(Authorization calldata auth) external {}
}
