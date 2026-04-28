// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RoyaltyVault — accumulates query fees and distributes royalties to contributors
// TODO: wire Uniswap SwapRouter02 — read payment.token from ENS per contributor,
//       swap ETH → preferred token before sending (packages/payments, Phase 9)
contract RoyaltyVault is Ownable, ReentrancyGuard {
    uint256 public constant DISTRIBUTION_THRESHOLD = 0.1 ether;

    // claimable[contributor] = pending wei
    mapping(address => uint256) public claimable;
    uint256 public totalPending;

    mapping(address => bool) public authorized;

    event FeesDeposited(uint256 amount, bytes32[] entryIds);
    event RoyaltiesDistributed(uint256 totalAmount, uint256 recipientCount);
    event Claimed(address indexed contributor, uint256 amount);

    error Unauthorized();
    error BelowThreshold();
    error NothingToClaim();

    modifier onlyAuthorized() {
        if (!authorized[msg.sender] && msg.sender != owner()) revert Unauthorized();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setAuthorized(address account, bool status) external onlyOwner {
        authorized[account] = status;
    }

    /// @notice Deposit query fees split proportionally across matched entries.
    /// @param contributors Contributor addresses for matched entries.
    /// @param shares       Proportional shares in basis points (must sum to 10000).
    function depositQueryFee(
        address[] calldata contributors,
        uint256[] calldata shares
    ) external payable onlyAuthorized {
        require(contributors.length == shares.length, "RoyaltyVault: length mismatch");
        uint256 total = msg.value;
        uint256 distributed;

        bytes32[] memory ids = new bytes32[](contributors.length);

        for (uint256 i = 0; i < contributors.length; i++) {
            uint256 amount = i == contributors.length - 1
                ? total - distributed  // remainder to last to avoid dust
                : (total * shares[i]) / 10000;
            claimable[contributors[i]] += amount;
            distributed += amount;
            ids[i] = bytes32(uint256(uint160(contributors[i])));
        }

        totalPending += total;
        emit FeesDeposited(total, ids);
    }

    /// @notice Flush all claimable balances above threshold. Called by Royalty Distributor keeper.
    /// @param recipients List of contributors to pay out.
    function distribute(address[] calldata recipients) external onlyAuthorized nonReentrant {
        if (address(this).balance < DISTRIBUTION_THRESHOLD) revert BelowThreshold();

        uint256 count;
        uint256 totalOut;

        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 amount = claimable[recipients[i]];
            if (amount == 0) continue;
            claimable[recipients[i]] = 0;
            totalPending -= amount;
            totalOut += amount;
            count++;
            (bool ok,) = recipients[i].call{value: amount}("");
            require(ok, "RoyaltyVault: transfer failed");
        }

        emit RoyaltiesDistributed(totalOut, count);
    }

    /// @notice Contributors can pull their own claimable balance at any time.
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        totalPending -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "RoyaltyVault: transfer failed");
        emit Claimed(msg.sender, amount);
    }

    receive() external payable {}
}
