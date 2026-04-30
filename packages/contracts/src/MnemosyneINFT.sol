// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC7857.sol";

/// @title MnemosyneINFT — ERC-7857 iNFT: encrypted metadata + authorized usage without ownership transfer
contract MnemosyneINFT is ERC721, Ownable, IERC7857 {
    uint256 private _nextTokenId;

    mapping(uint256 => IntelligentData[]) private _intelligentData;

    /// @dev AES-256-GCM encrypted 0G Storage URI — only the key-holder can decrypt
    mapping(uint256 => string) private _encryptedURIs;

    /// @dev Usage authorizations: tokenId → executor → ABI-encoded permissions
    mapping(uint256 => mapping(address => bytes)) private _authorizations;

    // Authorized minters/burners (MnemosyneRegistry)
    mapping(address => bool) public authorized;

    error Unauthorized();
    error NotOwner();

    modifier onlyAuthorized() {
        if (!authorized[msg.sender] && msg.sender != owner()) revert Unauthorized();
        _;
    }

    constructor() ERC721("Mnemosyne iNFT", "MEM-iNFT") Ownable(msg.sender) {}

    function setAuthorized(address account, bool status) external onlyOwner {
        authorized[account] = status;
    }

    /// @notice Mint an iNFT with encrypted metadata URI.
    /// @param data       Intelligent data descriptors (description + hash).
    /// @param to         Token recipient (entry submitter).
    /// @param encryptedURI AES-256-GCM encrypted 0G Storage reference.
    function mint(
        IntelligentData[] calldata data,
        address to,
        string calldata encryptedURI
    ) external onlyAuthorized returns (uint256 tokenId) {
        tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);

        for (uint256 i = 0; i < data.length; i++) {
            _intelligentData[tokenId].push(data[i]);
        }
        _encryptedURIs[tokenId] = encryptedURI;

        emit IntelligentDataMinted(tokenId, to, data);
    }

    /// @notice Grant usage rights to an executor without transferring ownership.
    ///         Implements the AIaaS pattern from ERC-7857.
    /// @param tokenId     The iNFT token.
    /// @param executor    Address being authorized (e.g. querying agent).
    /// @param permissions ABI-encoded authorization metadata (expiry, rate limit, etc).
    function authorizeUsage(
        uint256 tokenId,
        address executor,
        bytes calldata permissions
    ) external {
        if (ownerOf(tokenId) != msg.sender && !authorized[msg.sender] && msg.sender != owner()) revert NotOwner();
        _authorizations[tokenId][executor] = permissions;
        emit UsageAuthorized(tokenId, executor);
    }

    function burn(uint256 tokenId) external onlyAuthorized {
        _burn(tokenId);
        delete _intelligentData[tokenId];
        delete _encryptedURIs[tokenId];
        emit IntelligentDataBurned(tokenId);
    }

    function getIntelligentData(uint256 tokenId) external view returns (IntelligentData[] memory) {
        return _intelligentData[tokenId];
    }

    function getEncryptedURI(uint256 tokenId) external view returns (string memory) {
        return _encryptedURIs[tokenId];
    }

    function getAuthorization(uint256 tokenId, address executor) external view returns (bytes memory) {
        return _authorizations[tokenId][executor];
    }
}
