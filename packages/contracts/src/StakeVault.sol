// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StakeVault — holds all staked ETH; executes locks, slashes, and releases
contract StakeVault is Ownable, ReentrancyGuard {
    mapping(address => uint256) public balanceOf;

    // Authorized callers (Registry + ChallengeManager)
    mapping(address => bool) public authorized;

    event Locked(address indexed staker, uint256 amount);
    event Slashed(address indexed staker, address indexed recipient, uint256 amount);
    event Released(address indexed staker, uint256 amount);

    error Unauthorized();
    error InsufficientBalance();

    modifier onlyAuthorized() {
        if (!authorized[msg.sender]) revert Unauthorized();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setAuthorized(address account, bool status) external onlyOwner {
        authorized[account] = status;
    }

    /// @notice Lock ETH for a staker. Caller must send ETH with this call.
    function lock(address staker, uint256 amount) external payable onlyAuthorized {
        require(msg.value == amount, "StakeVault: value mismatch");
        balanceOf[staker] += amount;
        emit Locked(staker, amount);
    }

    /// @notice Slash `amount` from staker and send to recipient.
    function slash(address staker, address recipient, uint256 amount) external onlyAuthorized nonReentrant {
        if (balanceOf[staker] < amount) revert InsufficientBalance();
        balanceOf[staker] -= amount;
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "StakeVault: transfer failed");
        emit Slashed(staker, recipient, amount);
    }

    /// @notice Release `amount` back to staker.
    function release(address staker, uint256 amount) external onlyAuthorized nonReentrant {
        if (balanceOf[staker] < amount) revert InsufficientBalance();
        balanceOf[staker] -= amount;
        (bool ok,) = staker.call{value: amount}("");
        require(ok, "StakeVault: transfer failed");
        emit Released(staker, amount);
    }
}
