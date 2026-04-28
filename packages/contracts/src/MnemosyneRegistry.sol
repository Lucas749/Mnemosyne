// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./StakeVault.sol";
import "./interfaces/IERC7857.sol";

/// @title MnemosyneRegistry — on-chain entry lifecycle + ERC-7857 iNFT minting
contract MnemosyneRegistry is Ownable {
    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 public constant CHALLENGE_WINDOW = 48 hours;
    uint256 public constant MIN_STAKE = 0.005 ether;

    // ─── Types ───────────────────────────────────────────────────────────────

    enum EntryDomain { factual, labeled_example, structured_data, observation, correction }
    enum EntryStatus { pending, active, contested, stale, burned }

    struct Entry {
        bytes32 id;
        string storageRef;
        string embeddingRef;
        string[] tags;
        EntryDomain domain;
        address submitter;
        uint256 stakeAmount;
        EntryStatus status;
        uint256 submittedAt;
        uint256 challengeWindowEnd;
        uint256 queryCount;
        uint256 royaltiesEarned;
        uint256 lastQueriedAt;
        uint256 inftTokenId;
    }

    // ─── State ───────────────────────────────────────────────────────────────

    StakeVault public immutable stakeVault;
    IERC7857 public immutable inftContract;

    mapping(bytes32 => Entry) public entries;

    // Authorized callers (ChallengeManager, keepers)
    mapping(address => bool) public authorized;

    // ─── Events ──────────────────────────────────────────────────────────────

    event EntrySubmitted(bytes32 indexed entryId, address indexed submitter, uint256 stake);
    event EntryActivated(bytes32 indexed entryId, uint256 inftTokenId);
    event EntryBurned(bytes32 indexed entryId, string reason);
    event EntryContested(bytes32 indexed entryId, uint256 challengeCount);
    event QueryRecorded(bytes32 indexed entryId, uint256 royaltyAmount);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error InsufficientStake();
    error EntryNotFound();
    error NotPending();
    error NotActive();
    error ChallengeWindowOpen();
    error Unauthorized();

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyAuthorized() {
        if (!authorized[msg.sender] && msg.sender != owner()) revert Unauthorized();
        _;
    }

    modifier entryExists(bytes32 entryId) {
        if (entries[entryId].submitter == address(0)) revert EntryNotFound();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _stakeVault, address _inftContract) Ownable(msg.sender) {
        stakeVault = StakeVault(_stakeVault);
        inftContract = IERC7857(_inftContract);
    }

    function setAuthorized(address account, bool status) external onlyOwner {
        authorized[account] = status;
    }

    // ─── External ────────────────────────────────────────────────────────────

    /// @notice Submit a new entry. Caller must send ETH stake.
    function submit(
        string calldata storageRef,
        string calldata embeddingRef,
        string[] calldata tags,
        EntryDomain domain
    ) external payable returns (bytes32 entryId) {
        if (msg.value < MIN_STAKE) revert InsufficientStake();

        entryId = keccak256(abi.encodePacked(storageRef, msg.sender, block.timestamp));

        entries[entryId] = Entry({
            id: entryId,
            storageRef: storageRef,
            embeddingRef: embeddingRef,
            tags: tags,
            domain: domain,
            submitter: msg.sender,
            stakeAmount: msg.value,
            status: EntryStatus.pending,
            submittedAt: block.timestamp,
            challengeWindowEnd: block.timestamp + CHALLENGE_WINDOW,
            queryCount: 0,
            royaltiesEarned: 0,
            lastQueriedAt: 0,
            inftTokenId: 0
        });

        // Forward stake to vault
        stakeVault.lock{value: msg.value}(msg.sender, msg.value);

        emit EntrySubmitted(entryId, msg.sender, msg.value);
    }

    /// @notice Activate entry after challenge window — mints ERC-7857 iNFT.
    /// Called by Challenge Watcher keeper.
    function activateEntry(bytes32 entryId) external onlyAuthorized entryExists(entryId) {
        Entry storage e = entries[entryId];
        if (e.status != EntryStatus.pending) revert NotPending();
        if (block.timestamp < e.challengeWindowEnd) revert ChallengeWindowOpen();

        e.status = EntryStatus.active;

        IERC7857.IntelligentData[] memory iData = new IERC7857.IntelligentData[](1);
        iData[0] = IERC7857.IntelligentData({
            dataDescription: _domainString(e.domain),
            dataHash: keccak256(abi.encodePacked(e.storageRef))
        });
        uint256 tokenId = inftContract.mint(iData, e.submitter);
        e.inftTokenId = tokenId;

        emit EntryActivated(entryId, tokenId);
    }

    /// @notice Burn an entry (overturned or expired). Called by keeper / ChallengeManager.
    function burnEntry(bytes32 entryId, string calldata reason) external onlyAuthorized entryExists(entryId) {
        Entry storage e = entries[entryId];
        if (e.status == EntryStatus.burned) revert NotActive();

        e.status = EntryStatus.burned;

        if (e.inftTokenId != 0) {
            inftContract.burn(e.inftTokenId);
        }

        emit EntryBurned(entryId, reason);
    }

    /// @notice Mark entry as contested (3+ open challenges).
    function markContested(bytes32 entryId, uint256 challengeCount) external onlyAuthorized entryExists(entryId) {
        Entry storage e = entries[entryId];
        if (e.status != EntryStatus.active) revert NotActive();
        e.status = EntryStatus.contested;
        emit EntryContested(entryId, challengeCount);
    }

    /// @notice Record a query hit. Tracks query count and royalty accumulation.
    function recordQuery(bytes32 entryId, uint256 royaltyAmount) external onlyAuthorized entryExists(entryId) {
        Entry storage e = entries[entryId];
        e.queryCount++;
        e.royaltiesEarned += royaltyAmount;
        e.lastQueriedAt = block.timestamp;
        emit QueryRecorded(entryId, royaltyAmount);
    }

    function getEntry(bytes32 entryId) external view returns (Entry memory) {
        return entries[entryId];
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _domainString(EntryDomain d) internal pure returns (string memory) {
        if (d == EntryDomain.factual) return "factual";
        if (d == EntryDomain.labeled_example) return "labeled_example";
        if (d == EntryDomain.structured_data) return "structured_data";
        if (d == EntryDomain.observation) return "observation";
        return "correction";
    }
}
