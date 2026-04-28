// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/RoyaltyVault.sol";

contract RoyaltyVaultTest is Test {
    RoyaltyVault vault;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address keeper = makeAddr("keeper");

    function setUp() public {
        vault = new RoyaltyVault();
        vault.setAuthorized(keeper, true);

        vm.deal(keeper, 10 ether);
        vm.deal(alice, 1 ether);
    }

    function test_depositAndClaim() public {
        address[] memory contributors = new address[](2);
        contributors[0] = alice;
        contributors[1] = bob;

        uint256[] memory shares = new uint256[](2);
        shares[0] = 7000; // 70%
        shares[1] = 3000; // 30%

        vm.prank(keeper);
        vault.depositQueryFee{value: 0.1 ether}(contributors, shares);

        assertEq(vault.claimable(alice), 0.07 ether);
        assertEq(vault.claimable(bob),   0.03 ether);

        uint256 before = alice.balance;
        vm.prank(alice);
        vault.claim();
        assertEq(alice.balance - before, 0.07 ether);
        assertEq(vault.claimable(alice), 0);
    }

    function test_distribute() public {
        address[] memory contributors = new address[](2);
        contributors[0] = alice;
        contributors[1] = bob;

        uint256[] memory shares = new uint256[](2);
        shares[0] = 5000;
        shares[1] = 5000;

        vm.prank(keeper);
        vault.depositQueryFee{value: 0.2 ether}(contributors, shares);

        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;

        vm.prank(keeper);
        vault.distribute(recipients);

        assertEq(alice.balance - aliceBefore, 0.1 ether);
        assertEq(bob.balance - bobBefore, 0.1 ether);
        assertEq(vault.claimable(alice), 0);
    }

    function test_distribute_revertsIfBelowThreshold() public {
        address[] memory contributors = new address[](1);
        contributors[0] = alice;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 10000;

        vm.prank(keeper);
        vault.depositQueryFee{value: 0.05 ether}(contributors, shares);

        address[] memory recipients = new address[](1);
        recipients[0] = alice;

        vm.prank(keeper);
        vm.expectRevert(RoyaltyVault.BelowThreshold.selector);
        vault.distribute(recipients);
    }

    function test_claim_revertsIfNothing() public {
        vm.prank(alice);
        vm.expectRevert(RoyaltyVault.NothingToClaim.selector);
        vault.claim();
    }
}
