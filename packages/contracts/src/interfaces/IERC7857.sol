// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC7857 — Intelligent NFT interface (0G iNFT standard)
interface IERC7857 {
    struct IntelligentData {
        string dataDescription; // e.g. "factual", "labeled_example"
        bytes32 dataHash;       // keccak256(encryptedStorageRef)
    }

    event IntelligentDataMinted(uint256 indexed tokenId, address indexed to, IntelligentData[] data);
    event IntelligentDataBurned(uint256 indexed tokenId);
    event UsageAuthorized(uint256 indexed tokenId, address indexed executor);

    function mint(IntelligentData[] calldata data, address to, string calldata encryptedURI) external returns (uint256 tokenId);
    function burn(uint256 tokenId) external;
    function getIntelligentData(uint256 tokenId) external view returns (IntelligentData[] memory);
    function authorizeUsage(uint256 tokenId, address executor, bytes calldata permissions) external;
    function getAuthorization(uint256 tokenId, address executor) external view returns (bytes memory);
    function getEncryptedURI(uint256 tokenId) external view returns (string memory);
}
