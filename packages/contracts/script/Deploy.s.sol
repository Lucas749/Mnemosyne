// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/StakeVault.sol";
import "../src/MnemosyneINFT.sol";
import "../src/MnemosyneRegistry.sol";
import "../src/ValidatorRegistry.sol";
import "../src/ChallengeManager.sol";
import "../src/RoyaltyVault.sol";
import "../src/MnemosyneMarket.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("ZG_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // 1. Deploy vaults / registries (no constructor deps)
        StakeVault         stakeVault        = new StakeVault();
        ValidatorRegistry  validatorRegistry = new ValidatorRegistry();
        RoyaltyVault       royaltyVault      = new RoyaltyVault();
        MnemosyneINFT      inft              = new MnemosyneINFT();

        // 2. Registry depends on StakeVault + iNFT
        MnemosyneRegistry registry = new MnemosyneRegistry(
            address(stakeVault),
            address(inft)
        );

        // 3. ChallengeManager depends on StakeVault + Registry + ValidatorRegistry
        ChallengeManager challengeManager = new ChallengeManager(
            address(stakeVault),
            address(registry),
            address(validatorRegistry)
        );

        // 4. Market — escrow for iNFT trading
        MnemosyneMarket market = new MnemosyneMarket(address(inft));

        // 5. Wire authorizations
        stakeVault.setAuthorized(address(registry), true);
        stakeVault.setAuthorized(address(challengeManager), true);
        validatorRegistry.setAuthorized(address(challengeManager), true);
        royaltyVault.setAuthorized(address(registry), true);
        inft.setAuthorized(address(registry), true);
        // Market needs approval to move iNFTs on behalf of the API wallet
        inft.setAuthorized(address(market), true);
        // API wallet (deployer) is authorized to relay list/buy on behalf of users
        market.setAuthorized(vm.addr(deployerKey), true);

        vm.stopBroadcast();

        console2.log("StakeVault:        ", address(stakeVault));
        console2.log("MnemosyneINFT:     ", address(inft));
        console2.log("MnemosyneRegistry: ", address(registry));
        console2.log("ValidatorRegistry: ", address(validatorRegistry));
        console2.log("ChallengeManager:  ", address(challengeManager));
        console2.log("RoyaltyVault:      ", address(royaltyVault));
        console2.log("MnemosyneMarket:   ", address(market));
    }
}
