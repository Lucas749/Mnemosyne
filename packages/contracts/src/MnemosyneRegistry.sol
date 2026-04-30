// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./StakeVault.sol";
import "./interfaces/IERC7857.sol";

/// @title MnemosyneRegistry — on-chain entry lifecycle + ERC-7857 iNFT minting
contract MnemosyneRegistry is Ownable {
    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 public constant MIN_STAKE = 0.005 ether;

    // Owner-adjustable — start at 5 min for testnet demos, set to 48 hours for production
    uint256 public challengeWindow = 5 minutes;

    // ─── Types ───────────────────────────────────────────────────────────────

    enum EntryDomain { factual, labeled_example, structured_data, observation, correction }
    enum EntryStatus { pending, active, contested, stale, burned }

    struct Entry {
        bytes32 id;
        string storageRef;      // AES-256-GCM encrypted 0G storage ref
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

    /// @notice On-chain user profile — payment preferences and aggregate stats.
    ///         Users set this themselves; readable by the frontend and distributor.
    struct UserProfile {
        address paymentToken;   // preferred ERC-20 for royalty payouts (address(0) = ETH)
        string  ensName;        // optional ENS name for discovery
        uint256 totalEntries;   // entries ever submitted
        uint256 totalQueries;   // total query hits across all entries
        uint256 totalRoyalties; // cumulative A0GI earned (accounting)
    }

    // ─── State ───────────────────────────────────────────────────────────────

    StakeVault public immutable stakeVault;
    IERC7857   public immutable inftContract;

    mapping(bytes32 => Entry)       public entries;
    mapping(address => UserProfile) public profiles;
    mapping(address => bool)        public authorized;

    // Entry indexes — for frontend enumeration
    bytes32[]                          private _allEntries;
    mapping(address => bytes32[])      private _submitterEntries;

    // ─── Events ──────────────────────────────────────────────────────────────

    event EntrySubmitted(bytes32 indexed entryId, address indexed submitter, uint256 stake);
    event EntryActivated(bytes32 indexed entryId, uint256 inftTokenId);
    event EntryBurned(bytes32 indexed entryId, string reason);
    event EntryContested(bytes32 indexed entryId, uint256 challengeCount);
    event QueryRecorded(bytes32 indexed entryId, uint256 royaltyAmount);
    event ProfileUpdated(address indexed user, address paymentToken, string ensName);

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
        stakeVault   = StakeVault(_stakeVault);
        inftContract = IERC7857(_inftContract);
    }

    function setAuthorized(address account, bool status) external onlyOwner {
        authorized[account] = status;
    }

    function setChallengeWindow(uint256 windowSeconds) external onlyOwner {
        challengeWindow = windowSeconds;
    }

    // ─── User profile ─────────────────────────────────────────────────────────

    /// @notice Set payment token preference and optional ENS name.
    ///         Called by contributors to declare how they want royalties paid.
    ///         address(0) as paymentToken means "pay me in ETH".
    function setProfile(address paymentToken, string calldata ensName) external {
        UserProfile storage p = profiles[msg.sender];
        p.paymentToken = paymentToken;
        p.ensName      = ensName;
        emit ProfileUpdated(msg.sender, paymentToken, ensName);
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
            challengeWindowEnd: block.timestamp + challengeWindow,
            queryCount: 0,
            royaltiesEarned: 0,
            lastQueriedAt: 0,
            inftTokenId: 0
        });

        // Index for frontend enumeration
        _allEntries.push(entryId);
        _submitterEntries[msg.sender].push(entryId);
        profiles[msg.sender].totalEntries++;

        stakeVault.lock{value: msg.value}(msg.sender, msg.value);

        emit EntrySubmitted(entryId, msg.sender, msg.value);
    }

    /// @notice Activate entry after challenge window — mints ERC-7857 iNFT.
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
        uint256 tokenId = inftContract.mint(iData, e.submitter, e.storageRef);
        e.inftTokenId = tokenId;

        emit EntryActivated(entryId, tokenId);
    }

    /// @notice Burn an entry. Called by keeper / ChallengeManager.
    function burnEntry(bytes32 entryId, string calldata reason) external onlyAuthorized entryExists(entryId) {
        Entry storage e = entries[entryId];
        if (e.status == EntryStatus.burned) revert NotActive();

        e.status = EntryStatus.burned;

        if (e.inftTokenId != 0) {
            inftContract.burn(e.inftTokenId);
        }

        emit EntryBurned(entryId, reason);
    }

    /// @notice Mark entry as contested.
    function markContested(bytes32 entryId, uint256 challengeCount) external onlyAuthorized entryExists(entryId) {
        Entry storage e = entries[entryId];
        if (e.status != EntryStatus.active) revert NotActive();
        e.status = EntryStatus.contested;
        emit EntryContested(entryId, challengeCount);
    }

    /// @notice Record a query hit — updates per-entry and per-user stats.
    function recordQuery(bytes32 entryId, uint256 royaltyAmount) external onlyAuthorized entryExists(entryId) {
        Entry storage e = entries[entryId];
        e.queryCount++;
        e.royaltiesEarned += royaltyAmount;
        e.lastQueriedAt    = block.timestamp;

        // Aggregate stats on the submitter's profile
        UserProfile storage p = profiles[e.submitter];
        p.totalQueries++;
        p.totalRoyalties += royaltyAmount;

        emit QueryRecorded(entryId, royaltyAmount);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getEntry(bytes32 entryId) external view returns (Entry memory) {
        return entries[entryId];
    }

    function getProfile(address user) external view returns (UserProfile memory) {
        return profiles[user];
    }

    /// @notice All entry IDs ever submitted — for frontend enumeration.
    function getAllEntries(uint256 offset, uint256 limit) external view returns (bytes32[] memory) {
        uint256 total  = _allEntries.length;
        if (offset >= total) return new bytes32[](0);
        uint256 end    = offset + limit > total ? total : offset + limit;
        bytes32[] memory page = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _allEntries[i];
        }
        return page;
    }

    function getTotalEntryCount() external view returns (uint256) {
        return _allEntries.length;
    }

    /// @notice Entry IDs submitted by a specific address — for user profile pages.
    function getSubmitterEntries(address submitter) external view returns (bytes32[] memory) {
        return _submitterEntries[submitter];
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _domainString(EntryDomain d) internal pure returns (string memory) {
        if (d == EntryDomain.factual)          return "factual";
        if (d == EntryDomain.labeled_example)  return "labeled_example";
        if (d == EntryDomain.structured_data)  return "structured_data";
        if (d == EntryDomain.observation)      return "observation";
        return "correction";
    }
}
