// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import '@openzeppelin/contracts/access/AccessControl.sol';

contract Membership is AccessControl {
	bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
	bytes32 public constant EXECUTOR_ROLE = keccak256('EXECUTOR_ROLE');
	bytes32 public constant MEMBER_ROLE = keccak256('MEMBER_ROLE');

	// ---------------------------------------------------------------------------------------
	constructor(address admin, address executor, address member) {
		_setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
		_setRoleAdmin(EXECUTOR_ROLE, ADMIN_ROLE);
		_setRoleAdmin(MEMBER_ROLE, EXECUTOR_ROLE);

		_setupRole(ADMIN_ROLE, admin);

		_setupRole(EXECUTOR_ROLE, admin);
		_setupRole(EXECUTOR_ROLE, executor);

		_setupRole(MEMBER_ROLE, admin);
		_setupRole(MEMBER_ROLE, executor);
		_setupRole(MEMBER_ROLE, member);
	}

	function checkMember(address member) public view returns (bool) {
		return hasRole(MEMBER_ROLE, member);
	}

	function checkExecutor(address executor) public view returns (bool) {
		return hasRole(EXECUTOR_ROLE, executor);
	}

	function checkAdmin(address admin) public view returns (bool) {
		return hasRole(ADMIN_ROLE, admin);
	}

	function checkAllRoles(address addr) public view returns (bool) {
		if (checkMember(addr) || checkExecutor(addr) || checkAdmin(addr)) return true;
		return false;
	}

	function checkExecutorOrAdmin(address addr) public view returns (bool) {
		if (checkExecutor(addr) || checkAdmin(addr)) return true;
		return false;
	}
}
