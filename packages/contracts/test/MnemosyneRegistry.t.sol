// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/StakeVault.sol";
import "../src/MnemosyneINFT.sol";
import "../src/MnemosyneRegistry.sol";

contract MnemosyneRegistryTest is Test {
    StakeVault vault;
    MnemosyneINFT inft;
    MnemosyneRegistry registry;

    address alice = makeAddr("alice");
    address keeper = makeAddr("keeper");

    function setUp() public {
        vault = new StakeVault();
        inft = new MnemosyneINFT();
        registry = new MnemosyneRegistry(address(vault), address(inft));

        // Authorize registry in vault and inft
        vault.setAuthorized(address(registry), true);
        inft.setAuthorized(address(registry), true);

        // Authorize keeper in registry
        registry.setAuthorized(keeper, true);

        vm.deal(alice, 10 ether);
    }

    function test_submit_createsEntry() public {
        vm.prank(alice);
        string[] memory tags = new string[](2);
        tags[0] = "ethereum";
        tags[1] = "history";

        bytes32 entryId = registry.submit{value: 0.01 ether}(
            "0g://storageRef1",
            "0g://embeddingRef1",
            tags,
            MnemosyneRegistry.EntryDomain.factual
        );

        MnemosyneRegistry.Entry memory e = registry.getEntry(entryId);
        assertEq(e.submitter, alice);
        assertEq(uint256(e.status), uint256(MnemosyneRegistry.EntryStatus.pending));
        assertEq(e.stakeAmount, 0.01 ether);
        assertEq(vault.balanceOf(alice), 0.01 ether);
    }

    function test_submit_revertsIfBelowMinStake() public {
        vm.prank(alice);
        string[] memory tags = new string[](0);
        vm.expectRevert(MnemosyneRegistry.InsufficientStake.selector);
        registry.submit{value: 0.001 ether}(
            "0g://storageRef2",
            "0g://embeddingRef2",
            tags,
            MnemosyneRegistry.EntryDomain.factual
        );
    }

    function test_activateEntry_mintsINFT() public {
        vm.prank(alice);
        string[] memory tags = new string[](0);
        bytes32 entryId = registry.submit{value: 0.01 ether}(
            "0g://storageRef3",
            "0g://embeddingRef3",
            tags,
            MnemosyneRegistry.EntryDomain.factual
        );

        // Fast-forward past challenge window
        vm.warp(block.timestamp + 49 hours);

        vm.prank(keeper);
        registry.activateEntry(entryId);

        MnemosyneRegistry.Entry memory e = registry.getEntry(entryId);
        assertEq(uint256(e.status), uint256(MnemosyneRegistry.EntryStatus.active));
        assertTrue(e.inftTokenId > 0, "iNFT should have been minted");
        assertEq(inft.ownerOf(e.inftTokenId), alice);
    }

    function test_activateEntry_revertsBeforeChallengeWindow() public {
        vm.prank(alice);
        string[] memory tags = new string[](0);
        bytes32 entryId = registry.submit{value: 0.01 ether}(
            "0g://storageRef4",
            "0g://embeddingRef4",
            tags,
            MnemosyneRegistry.EntryDomain.factual
        );

        vm.prank(keeper);
        vm.expectRevert(MnemosyneRegistry.ChallengeWindowOpen.selector);
        registry.activateEntry(entryId);
    }

    function test_burnEntry_burnsINFT() public {
        vm.prank(alice);
        string[] memory tags = new string[](0);
        bytes32 entryId = registry.submit{value: 0.01 ether}(
            "0g://storageRef5",
            "0g://embeddingRef5",
            tags,
            MnemosyneRegistry.EntryDomain.observation
        );

        vm.warp(block.timestamp + 49 hours);
        vm.prank(keeper);
        registry.activateEntry(entryId);

        MnemosyneRegistry.Entry memory e = registry.getEntry(entryId);
        uint256 tokenId = e.inftTokenId;
        assertEq(inft.ownerOf(tokenId), alice);

        vm.prank(keeper);
        registry.burnEntry(entryId, "overturned");

        e = registry.getEntry(entryId);
        assertEq(uint256(e.status), uint256(MnemosyneRegistry.EntryStatus.burned));
        vm.expectRevert();
        inft.ownerOf(tokenId);
    }

    function test_recordQuery_tracksCount() public {
        vm.prank(alice);
        string[] memory tags = new string[](0);
        bytes32 entryId = registry.submit{value: 0.01 ether}(
            "0g://storageRef6",
            "0g://embeddingRef6",
            tags,
            MnemosyneRegistry.EntryDomain.factual
        );

        vm.prank(keeper);
        registry.recordQuery(entryId, 0.001 ether);

        MnemosyneRegistry.Entry memory e = registry.getEntry(entryId);
        assertEq(e.queryCount, 1);
        assertEq(e.royaltiesEarned, 0.001 ether);
    }
}
