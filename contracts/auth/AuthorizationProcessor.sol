// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';

enum OperationKind {
	TRANSFER,
	DEPOSIT,
	PROCESS,
	CLAIM
}

struct Authorization {
	OperationKind kind;
	address from;
	address to;
	address token;
	uint256 amount;
	bytes32 nonce;
	uint256 validAfter;
	uint256 validBefore;
	bytes signature;
}

struct Allowance {
	uint256 deposit;
	uint256 transfer;
	uint256 process;
	uint256 claim;
}

contract AuthorizationProcessor is EIP712, ReentrancyGuard {
	using Math for uint256;
	using SafeERC20 for IERC20;

	mapping(address from => mapping(address signer => mapping(address token => Allowance allowance))) public authorized;
	mapping(address owner => mapping(address token => uint256 amount)) public balanceOf;
	mapping(address => mapping(bytes32 => bool)) public nonces;

	bytes32 public constant AUTHORIZATION_TYPEHASH =
		keccak256(
			'Authorization(uint8 kind,address from,address to,address token,uint256 amount,bytes32 nonce,uint256 validAfter,uint256 validBefore)'
		);

	// ---------------------------------------------------------------------------------------

	event Authorized(address indexed from, address indexed signer, address indexed token, Allowance allowance);

	event AllowanceUsed(address indexed from, address indexed signer, address indexed token, OperationKind kind, uint256 amount);
	event NonceUsed(address indexed signer, bytes32 nonce);
	event AuthorizationCanceled(address indexed signer, bytes32 nonce);

	event Deposit(address indexed from, address indexed to, address indexed token, uint256 amount, address signer);
	event Transfer(address indexed from, address indexed to, address indexed token, uint256 amount, address signer);
	event Process(address indexed from, address indexed to, address indexed token, uint256 amount, address signer);
	event Claim(address indexed from, address indexed to, address indexed token, uint256 amount, address signer);

	// ---------------------------------------------------------------------------------------

	error SignatureInvalid();
	error NonceAlreadyUsed(address signer, bytes32 nonce);

	error NotAuthorized(address from, address signer, OperationKind kind, uint256 allowance);
	error AuthorizationExpired(uint256 validBefore);
	error AuthorizationNotYetValid(uint256 validAfter);

	error InsufficientBalance(address owner, address token, uint256 balance, uint256 amount);

	// ---------------------------------------------------------------------------------------

	constructor() EIP712('AuthorizationProcessor', '1') {}

	// ---------------------------------------------------------------------------------------

	function verifySignature(Authorization calldata auth) public view returns (address signer) {
		bytes32 structHash = keccak256(
			abi.encode(
				AUTHORIZATION_TYPEHASH,
				uint8(auth.kind),
				auth.from,
				auth.to,
				auth.token,
				auth.amount,
				auth.nonce,
				auth.validAfter,
				auth.validBefore
			)
		);
		bytes32 hash = _hashTypedDataV4(structHash);
		signer = ECDSA.recover(hash, auth.signature);
		if (signer == address(0)) revert SignatureInvalid();
	}

	function verifyAuthorization(Authorization calldata auth, address signer) public view {
		if (nonces[signer][auth.nonce]) revert NonceAlreadyUsed(signer, auth.nonce);
		if (block.timestamp < auth.validAfter) revert AuthorizationNotYetValid(auth.validAfter);
		if (block.timestamp > auth.validBefore) revert AuthorizationExpired(auth.validBefore);
	}

	function _getRequiredAllowance(Authorization calldata auth, address signer) internal view returns (uint256) {
		if (auth.kind == OperationKind.TRANSFER) return authorized[auth.from][signer][auth.token].transfer;
		if (auth.kind == OperationKind.DEPOSIT) return authorized[auth.from][signer][auth.token].deposit;
		if (auth.kind == OperationKind.PROCESS) return authorized[auth.from][signer][auth.token].process;
		if (auth.kind == OperationKind.CLAIM) return authorized[auth.from][signer][auth.token].claim;
		return 0;
	}

	function verifyAllowance(Authorization calldata auth, address signer) public view returns (uint256) {
		if (auth.from != signer) {
			uint256 allowance = _getRequiredAllowance(auth, signer);
			if (allowance < auth.amount) {
				revert NotAuthorized(auth.from, signer, auth.kind, allowance);
			}
			return auth.amount;
		}
		return 0;
	}

	// ---------------------------------------------------------------------------------------

	// to give authorization to a signer
	function authorize(address signer, address token, Allowance calldata allowance) external nonReentrant {
		_authorize(signer, token, allowance);
	}

	function authorizeAuth(Authorization calldata auth, address signer) external nonReentrant {
		Allowance memory tokenAuth = authorized[msg.sender][signer][auth.token];

		if (auth.kind == OperationKind.TRANSFER) {
			tokenAuth.transfer += auth.amount;
		} else if (auth.kind == OperationKind.DEPOSIT) {
			tokenAuth.deposit += auth.amount;
		} else if (auth.kind == OperationKind.PROCESS) {
			tokenAuth.process += auth.amount;
		} else if (auth.kind == OperationKind.CLAIM) {
			tokenAuth.claim += auth.amount;
		}

		_authorize(signer, auth.token, tokenAuth);
	}

	function _authorize(address signer, address token, Allowance memory allowance) internal {
		authorized[msg.sender][signer][token] = allowance;
		emit Authorized(msg.sender, signer, token, allowance);
	}

	// ---------------------------------------------------------------------------------------

	function cancelAuthorization(bytes32 nonce) external {
		if (nonces[msg.sender][nonce]) error NonceAlreadyUsed(msg.sender, nonce);
		nonces[msg.sender][nonce] = true;
		event AuthorizationCanceled(address indexed signer, bytes32 nonce);
	}

	function _consumeAuthorization(Authorization calldata auth, address signer) internal {
		nonces[signer][auth.nonce] = true;
		emit NonceUsed(signer, auth.nonce);
	}

	function _consumeAllowance(Authorization calldata auth, address signer, uint256 reduce) internal {
		if (reduce == 0) return;

		if (auth.kind == OperationKind.TRANSFER) authorized[auth.from][signer][auth.token].transfer -= reduce;
		else if (auth.kind == OperationKind.DEPOSIT) authorized[auth.from][signer][auth.token].deposit -= reduce;
		else if (auth.kind == OperationKind.PROCESS) authorized[auth.from][signer][auth.token].process -= reduce;
		else if (auth.kind == OperationKind.CLAIM) authorized[auth.from][signer][auth.token].claim -= reduce;

		emit AllowanceUsed(auth.from, signer, auth.token, auth.kind, reduce);
	}

	// ---------------------------------------------------------------------------------------

	function _executeTransfer(Authorization calldata auth, address signer) internal {
		IERC20(auth.token).safeTransferFrom(auth.from, auth.to, auth.amount);
		emit Transfer(auth.from, auth.to, auth.token, auth.amount, signer);
	}

	function _executeDeposit(Authorization calldata auth, address signer) internal {
		IERC20(auth.token).safeTransferFrom(auth.from, address(this), auth.amount);
		balanceOf[auth.to][auth.token] += auth.amount;
		emit Deposit(auth.from, auth.to, auth.token, auth.amount, signer);
	}

	function _executeProcess(Authorization calldata auth, address signer) internal {
		if (balanceOf[auth.from][auth.token] < auth.amount) {
			revert InsufficientBalance(auth.from, auth.token, balanceOf[auth.from][auth.token], auth.amount);
		}
		balanceOf[auth.from][auth.token] -= auth.amount;
		balanceOf[auth.to][auth.token] += auth.amount;
		emit Process(auth.from, auth.to, auth.token, auth.amount, signer);
	}

	function _executeClaim(Authorization calldata auth, address signer) internal {
		if (balanceOf[auth.from][auth.token] < auth.amount) {
			revert InsufficientBalance(auth.from, auth.token, balanceOf[auth.from][auth.token], auth.amount);
		}
		balanceOf[auth.from][auth.token] -= auth.amount;
		IERC20(auth.token).safeTransfer(auth.to, auth.amount);
		emit Claim(auth.from, auth.to, auth.token, auth.amount, signer);
	}

	function _execute(Authorization calldata auth) internal {
		address signer = verifySignature(auth);
		verifyAuthorization(auth, signer);

		uint256 reduceAllowance = verifyAllowance(auth, signer);

		_consumeAllowance(auth, signer, reduceAllowance);
		_consumeAuthorization(auth, signer);

		if (auth.kind == OperationKind.TRANSFER) {
			_executeTransfer(auth, signer);
		} else if (auth.kind == OperationKind.DEPOSIT) {
			_executeDeposit(auth, signer);
		} else if (auth.kind == OperationKind.PROCESS) {
			_executeProcess(auth, signer);
		} else if (auth.kind == OperationKind.CLAIM) {
			_executeClaim(auth, signer);
		}
	}

	// ---------------------------------------------------------------------------------------

	function executeWithAuthorization(Authorization calldata auth) external nonReentrant {
		_execute(auth);
	}

	function batchExecute(Authorization[] calldata auths) external nonReentrant {
		for (uint256 i = 0; i < auths.length; i++) {
			_execute(auths[i]);
		}
	}
}
