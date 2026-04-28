// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC7857 — Intelligent NFT interface (0G iNFT standard)
interface IERC7857 {
    struct IntelligentData {
        string dataDescription; // e.g. "factual", "labeled_example"
        bytes32 dataHash;       // keccak256(storageRef)
    }

    event IntelligentDataMinted(uint256 indexed tokenId, address indexed to, IntelligentData[] data);
    event IntelligentDataBurned(uint256 indexed tokenId);

    function mint(IntelligentData[] calldata data, address to) external returns (uint256 tokenId);
    function burn(uint256 tokenId) external;
    function getIntelligentData(uint256 tokenId) external view returns (IntelligentData[] memory);
}
