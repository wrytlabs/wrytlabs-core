// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

import './Membership.sol';

// ---------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------

struct DepositRequest {
	uint256 entryId;
	string currency;
	uint256 amount;
	bool pending;
	bool denied;
}

struct EarnEntry {
	uint256 deposit;
	uint256 withdraw;
	uint256 claim;
	uint256 interestTick;
	uint256 locktime;
}

// ---------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------

contract EarnPosition is ERC721Enumerable, Ownable {
	Membership public immutable membership;
	EarnManager public immutable manager;

	constructor(
		string memory _name,
		string memory _symbol,
		Membership _membership,
		EarnManager _manager
	) ERC721(_name, _symbol) Ownable(address(_manager)) {
		membership = _membership;
		manager = _manager;
	}

	function safeMint(address receiver, uint256 tokenId) external onlyOwner {
		_safeMint(receiver, tokenId);
	}
}

// ---------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------

contract EarnManager is ReentrancyGuard {
	using SafeERC20 for IERC20;

	// ---------------------------------------------------------------------------------------
	// define
	Membership public immutable membership;
	EarnPosition public immutable earnPosition;
	EarnEntry[] public entries;
	DepositRequest[] public depositRequests;

	uint256 public immutable locktimePeriod = 10000;
	uint256 public immutable decs = 8;
	uint256 public totalDeposit;
	uint256 public totalWithdraw;
	uint256 public totalClaim;

	mapping(string currency => bool isAllowed) depositCurrency;

	// ---------------------------------------------------------------------------------------
	// event
	event DepositCurrency(string indexed currency, bool isAllowed); // governance

	event PositionCreated(uint256 entryId, address indexed owner);
	event DepositRequested(uint256 requestId, uint256 indexed entryId, string currency, uint256 amount);
	event DepositDenied();
	event DepositAccepted();

	// ---------------------------------------------------------------------------------------
	// error
	error InvalidEntryId(uint256 entryId);
	error NotOwnedEntry(address addr, uint256 entryId);
	error RequestInvalid(uint256 requestId);

	// ---------------------------------------------------------------------------------------
	modifier validEntry(uint256 entryId) {
		if (entryId >= entries.length) revert InvalidEntryId(entryId); // indexing from 1
		_;
	}

	modifier ownedEntry(uint256 entryId) {
		if (entryId >= entries.length) revert InvalidEntryId(entryId);
		if (earnPosition.ownerOf(entryId) != msg.sender) revert NotOwnedEntry(msg.sender, entryId);
		_;
	}

	// ---------------------------------------------------------------------------------------
	constructor(Membership _membership) {
		membership = _membership;
		earnPosition = new EarnPosition('Earn Position', 'EPOS', membership, this);
	}

	// ---------------------------------------------------------------------------------------
	function editDepositCurrency(string calldata currency, bool isAllowed) public {
		membership.verifyAdmin(msg.sender);
		depositCurrency[currency] = isAllowed;
		emit DepositCurrency(currency, isAllowed);
	}

	// ---------------------------------------------------------------------------------------
	function createPosition() public returns (uint256) {
		membership.verifyAtLeastMember(msg.sender);
		return _createPositionTo(msg.sender);
	}

	function createPositionTo(address owner) public returns (uint256) {
		membership.verifyAdmin(msg.sender);
		return _createPositionTo(owner);
	}

	function _createPositionTo(address owner) internal returns (uint256) {
		uint256 entryId = entries.length + 1;
		entries.push(EarnEntry(0, 0, 0, 0, 0));
		earnPosition.safeMint(owner, entryId);
		emit PositionCreated(entryId, owner);
		return entryId;
	}

	// ---------------------------------------------------------------------------------------
	function depositRequest(uint256 entryId, string calldata currency, uint256 amount) public ownedEntry(entryId) {
		membership.verifyAtLeastMember(msg.sender);
		_depositRequestFrom(entryId, currency, amount);
	}

	function depositRequestFrom(uint256 entryId, string calldata currency, uint256 amount) public validEntry(entryId) {
		membership.verifyAdmin(msg.sender);
		_depositRequestFrom(entryId, currency, amount);
	}

	function _depositRequestFrom(uint256 entryId, string calldata currency, uint256 amount) internal {
		depositRequests.push(DepositRequest(entryId, currency, amount, true, false));
		emit DepositRequested(depositRequests.length, entryId, currency, amount);
	}

	// ---------------------------------------------------------------------------------------
	function depositRequestAccepted(uint256 requestId, uint256 entryPrice) public {
		// membership.verifyAtLeastExecutor(msg.sender);
		// DepositRequest storage request = depositRequests[requestId];
		// if (request.pending == false || request.denied == true) revert RequestInvalid(requestId);
		// EarnEntry storage entry = entries[request.entryId];
	}

	// claim
	// idx -> request to

	// withdraw

	// result deposit and mint or update

	// result claim and transfer interest

	// result withdraw and transfer claim and funds
}
