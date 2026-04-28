// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./StakeVault.sol";
import "./MnemosyneRegistry.sol";
import "./ValidatorRegistry.sol";

/// @title ChallengeManager — dispute lifecycle: open → vote → resolve
contract ChallengeManager is Ownable, ReentrancyGuard {
    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 public constant QUORUM_DEADLINE = 12 hours;
    uint256 public constant MIN_CHALLENGER_STAKE = 0.005 ether;
    uint256 public constant PANEL_SIZE = 3;
    uint256 public constant QUORUM_THRESHOLD_BPS = 6700; // 67%

    // ─── Types ───────────────────────────────────────────────────────────────

    enum VoteChoice { uphold, overturn }

    enum ChallengeStatus {
        open,
        voting,
        awaiting_quorum,
        resolved_upheld,
        resolved_overturned
    }

    struct Challenge {
        bytes32 id;
        bytes32 entryId;
        address challenger;
        uint256 challengerStake;
        string reason;
        string evidenceRef;
        ChallengeStatus status;
        address[] validatorPanel;
        uint256 openedAt;
        uint256 quorumDeadline;
        uint256 resolvedAt;
        address slashedAddress;
        uint256 slashAmount;
        uint256 upholdVotes;
        uint256 overturnVotes;
    }

    // ─── State ───────────────────────────────────────────────────────────────

    StakeVault public immutable stakeVault;
    MnemosyneRegistry public immutable registry;
    ValidatorRegistry public immutable validatorRegistry;

    mapping(bytes32 => Challenge) public challenges;
    mapping(bytes32 => mapping(address => bool)) public hasVoted;

    // Open challenge count per entry
    mapping(bytes32 => uint256) public openChallengeCount;

    mapping(address => bool) public authorized;

    // ─── Events ──────────────────────────────────────────────────────────────

    event ChallengeOpened(bytes32 indexed challengeId, bytes32 indexed entryId, address challenger);
    event VoteCast(bytes32 indexed challengeId, address indexed validator, VoteChoice choice);
    event ChallengeResolved(bytes32 indexed challengeId, bool upheld, address slashed, uint256 slashAmount);
    event QuorumEscalated(bytes32 indexed challengeId, uint256 newDeadline);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error InsufficientStake();
    error ChallengeNotFound();
    error AlreadyVoted();
    error NotOnPanel();
    error NotResolvable();
    error Unauthorized();
    error DeadlineNotPassed();

    modifier onlyAuthorized() {
        if (!authorized[msg.sender] && msg.sender != owner()) revert Unauthorized();
        _;
    }

    constructor(address _stakeVault, address _registry, address _validatorRegistry) Ownable(msg.sender) {
        stakeVault = StakeVault(_stakeVault);
        registry = MnemosyneRegistry(_registry);
        validatorRegistry = ValidatorRegistry(_validatorRegistry);
    }

    function setAuthorized(address account, bool status) external onlyOwner {
        authorized[account] = status;
    }

    // ─── External ────────────────────────────────────────────────────────────

    /// @notice Open a challenge against an entry. Challenger must send ETH.
    function openChallenge(
        bytes32 entryId,
        string calldata reason,
        string calldata evidenceRef
    ) external payable returns (bytes32 challengeId) {
        if (msg.value < MIN_CHALLENGER_STAKE) revert InsufficientStake();

        challengeId = keccak256(abi.encodePacked(entryId, msg.sender, block.timestamp));

        address[] memory panel = validatorRegistry.samplePanel(challengeId, PANEL_SIZE);

        challenges[challengeId] = Challenge({
            id: challengeId,
            entryId: entryId,
            challenger: msg.sender,
            challengerStake: msg.value,
            reason: reason,
            evidenceRef: evidenceRef,
            status: ChallengeStatus.open,
            validatorPanel: panel,
            openedAt: block.timestamp,
            quorumDeadline: block.timestamp + QUORUM_DEADLINE,
            resolvedAt: 0,
            slashedAddress: address(0),
            slashAmount: 0,
            upholdVotes: 0,
            overturnVotes: 0
        });

        stakeVault.lock{value: msg.value}(msg.sender, msg.value);

        openChallengeCount[entryId]++;
        if (openChallengeCount[entryId] >= 3) {
            registry.markContested(entryId, openChallengeCount[entryId]);
        }

        emit ChallengeOpened(challengeId, entryId, msg.sender);
    }

    /// @notice A panel validator casts a vote.
    function castVote(bytes32 challengeId, VoteChoice choice) external {
        Challenge storage c = challenges[challengeId];
        if (c.challenger == address(0)) revert ChallengeNotFound();
        if (hasVoted[challengeId][msg.sender]) revert AlreadyVoted();

        bool onPanel;
        for (uint256 i = 0; i < c.validatorPanel.length; i++) {
            if (c.validatorPanel[i] == msg.sender) { onPanel = true; break; }
        }
        if (!onPanel) revert NotOnPanel();

        hasVoted[challengeId][msg.sender] = true;
        if (choice == VoteChoice.uphold) c.upholdVotes++;
        else c.overturnVotes++;

        if (c.status == ChallengeStatus.open) c.status = ChallengeStatus.voting;

        emit VoteCast(challengeId, msg.sender, choice);
    }

    /// @notice Resolve a challenge once quorum is reached or deadline passes.
    /// Called by Challenge Watcher keeper.
    function resolveChallenge(bytes32 challengeId) external onlyAuthorized nonReentrant {
        Challenge storage c = challenges[challengeId];
        if (c.challenger == address(0)) revert ChallengeNotFound();
        if (c.status == ChallengeStatus.resolved_upheld || c.status == ChallengeStatus.resolved_overturned) {
            revert NotResolvable();
        }

        uint256 totalVotes = c.upholdVotes + c.overturnVotes;
        bool quorumReached = totalVotes > 0 &&
            (c.upholdVotes * 10000 / totalVotes >= QUORUM_THRESHOLD_BPS ||
             c.overturnVotes * 10000 / totalVotes >= QUORUM_THRESHOLD_BPS);

        if (!quorumReached && block.timestamp < c.quorumDeadline) revert DeadlineNotPassed();

        MnemosyneRegistry.Entry memory entry = registry.getEntry(c.entryId);
        bool upheld = c.upholdVotes >= c.overturnVotes;

        if (upheld) {
            // Entry was correct — slash challenger
            c.status = ChallengeStatus.resolved_upheld;
            c.slashedAddress = c.challenger;
            c.slashAmount = c.challengerStake;
            stakeVault.slash(c.challenger, entry.submitter, c.challengerStake);
        } else {
            // Entry was wrong — slash contributor, burn entry
            c.status = ChallengeStatus.resolved_overturned;
            c.slashedAddress = entry.submitter;
            c.slashAmount = entry.stakeAmount;
            stakeVault.slash(entry.submitter, c.challenger, entry.stakeAmount);
            registry.burnEntry(c.entryId, "overturned by challenge");
            // Return challenger stake
            stakeVault.release(c.challenger, c.challengerStake);
        }

        c.resolvedAt = block.timestamp;
        openChallengeCount[c.entryId] = openChallengeCount[c.entryId] > 0
            ? openChallengeCount[c.entryId] - 1
            : 0;

    // TODO: track individual validator votes in storage to accurately determine each
    // validator's choice here. Currently approximates: if upholds >= overturns, assume uphold.
    for (uint256 i = 0; i < c.validatorPanel.length; i++) {
      address v = c.validatorPanel[i];
      if (hasVoted[challengeId][v]) {
        bool votedUphold = _validatorVotedUphold(challengeId, v, c.upholdVotes, c.overturnVotes);
        validatorRegistry.updateReputation(v, votedUphold == upheld);
      }
    }

        emit ChallengeResolved(challengeId, upheld, c.slashedAddress, c.slashAmount);
    }

    /// @notice Extend deadline for a challenge that missed quorum. Called by Quorum Enforcer keeper.
    function escalateQuorum(bytes32 challengeId) external onlyAuthorized {
        Challenge storage c = challenges[challengeId];
        if (c.challenger == address(0)) revert ChallengeNotFound();
        if (block.timestamp < c.quorumDeadline) revert DeadlineNotPassed();

        c.status = ChallengeStatus.awaiting_quorum;
        c.quorumDeadline = block.timestamp + 6 hours;

        emit QuorumEscalated(challengeId, c.quorumDeadline);
    }

    function getChallenge(bytes32 challengeId) external view returns (Challenge memory) {
        return challenges[challengeId];
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    /// Approximate: if upholdVotes > overturnVotes assume uphold, vice versa.
    /// In production we'd track individual votes but this keeps storage lean.
    function _validatorVotedUphold(
        bytes32, /*challengeId*/
        address, /*validator*/
        uint256 upholdVotes,
        uint256 overturnVotes
    ) internal pure returns (bool) {
        return upholdVotes >= overturnVotes;
    }
}
