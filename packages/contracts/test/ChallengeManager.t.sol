// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/StakeVault.sol";
import "../src/MnemosyneINFT.sol";
import "../src/MnemosyneRegistry.sol";
import "../src/ValidatorRegistry.sol";
import "../src/ChallengeManager.sol";

contract ChallengeManagerTest is Test {
    StakeVault vault;
    MnemosyneINFT inft;
    MnemosyneRegistry registry;
    ValidatorRegistry validatorReg;
    ChallengeManager challenger;

    address alice = makeAddr("alice");       // contributor
    address bob = makeAddr("bob");           // challenger
    address val1 = makeAddr("val1");
    address val2 = makeAddr("val2");
    address val3 = makeAddr("val3");
    address keeper = makeAddr("keeper");

    bytes32 entryId;

    function setUp() public {
        vault = new StakeVault();
        inft = new MnemosyneINFT();
        registry = new MnemosyneRegistry(address(vault), address(inft));
        validatorReg = new ValidatorRegistry();
        challenger = new ChallengeManager(address(vault), address(registry), address(validatorReg));

        vault.setAuthorized(address(registry), true);
        vault.setAuthorized(address(challenger), true);
        inft.setAuthorized(address(registry), true);
        registry.setAuthorized(address(challenger), true);
        registry.setAuthorized(keeper, true);
        validatorReg.setAuthorized(address(challenger), true);
        challenger.setAuthorized(keeper, true);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(val1, 1 ether);
        vm.deal(val2, 1 ether);
        vm.deal(val3, 1 ether);

        // Register validators
        vm.prank(val1); validatorReg.register("val1.mnemosyne.eth");
        vm.prank(val2); validatorReg.register("val2.mnemosyne.eth");
        vm.prank(val3); validatorReg.register("val3.mnemosyne.eth");

        // Alice submits an entry
        vm.prank(alice);
        string[] memory tags = new string[](0);
        entryId = registry.submit{value: 0.01 ether}(
            "0g://entry1",
            "0g://embedding1",
            tags,
            MnemosyneRegistry.EntryDomain.factual
        );
    }

    function test_openChallenge() public {
        vm.prank(bob);
        bytes32 cId = challenger.openChallenge{value: 0.01 ether}(
            entryId, "This is wrong", ""
        );
        ChallengeManager.Challenge memory c = challenger.getChallenge(cId);
        assertEq(c.challenger, bob);
        assertEq(c.entryId, entryId);
        assertEq(uint256(c.status), uint256(ChallengeManager.ChallengeStatus.open));
    }

    function test_resolveChallenge_upheld() public {
        vm.prank(bob);
        bytes32 cId = challenger.openChallenge{value: 0.01 ether}(
            entryId, "Disputing this", ""
        );

        ChallengeManager.Challenge memory c = challenger.getChallenge(cId);

        // Panel votes to uphold (entry is correct, challenger loses)
        for (uint256 i = 0; i < c.validatorPanel.length; i++) {
            vm.prank(c.validatorPanel[i]);
            challenger.castVote(cId, ChallengeManager.VoteChoice.uphold);
        }

        uint256 bobBefore = bob.balance;
        uint256 aliceBefore = alice.balance;

        vm.prank(keeper);
        challenger.resolveChallenge(cId);

        c = challenger.getChallenge(cId);
        assertEq(uint256(c.status), uint256(ChallengeManager.ChallengeStatus.resolved_upheld));
        // Alice (contributor) got bob's stake
        assertGt(alice.balance, aliceBefore);
    }

    function test_resolveChallenge_overturned() public {
        // First activate the entry so it can be burned
        vm.warp(block.timestamp + 49 hours);
        vm.prank(keeper);
        registry.activateEntry(entryId);

        vm.prank(bob);
        bytes32 cId = challenger.openChallenge{value: 0.01 ether}(
            entryId, "Entry is incorrect", ""
        );

        ChallengeManager.Challenge memory c = challenger.getChallenge(cId);

        // Panel votes to overturn (entry is wrong, contributor loses)
        for (uint256 i = 0; i < c.validatorPanel.length; i++) {
            vm.prank(c.validatorPanel[i]);
            challenger.castVote(cId, ChallengeManager.VoteChoice.overturn);
        }

        vm.prank(keeper);
        challenger.resolveChallenge(cId);

        c = challenger.getChallenge(cId);
        assertEq(uint256(c.status), uint256(ChallengeManager.ChallengeStatus.resolved_overturned));

        MnemosyneRegistry.Entry memory e = registry.getEntry(entryId);
        assertEq(uint256(e.status), uint256(MnemosyneRegistry.EntryStatus.burned));
    }

    function test_resolveChallenge_atDeadline_noQuorum() public {
        vm.prank(bob);
        bytes32 cId = challenger.openChallenge{value: 0.01 ether}(
            entryId, "Disputing", ""
        );

        // Only 1 vote (not quorum) — but deadline passes
        ChallengeManager.Challenge memory c = challenger.getChallenge(cId);
        vm.prank(c.validatorPanel[0]);
        challenger.castVote(cId, ChallengeManager.VoteChoice.uphold);

        vm.warp(block.timestamp + 13 hours);

        // Should resolve (upheld since upholdVotes >= overturnVotes)
        vm.prank(keeper);
        challenger.resolveChallenge(cId);

        c = challenger.getChallenge(cId);
        assertEq(uint256(c.status), uint256(ChallengeManager.ChallengeStatus.resolved_upheld));
    }
}
