// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC7857.sol";

/// @title MnemosyneINFT — ERC-7857 iNFT implementation backed by ERC-721
contract MnemosyneINFT is ERC721, Ownable, IERC7857 {
    uint256 private _nextTokenId;

    mapping(uint256 => IntelligentData[]) private _intelligentData;

    // Authorized minters/burners (MnemosyneRegistry)
    mapping(address => bool) public authorized;

    error Unauthorized();

    modifier onlyAuthorized() {
        if (!authorized[msg.sender] && msg.sender != owner()) revert Unauthorized();
        _;
    }

    constructor() ERC721("Mnemosyne iNFT", "MEM-iNFT") Ownable(msg.sender) {}

    function setAuthorized(address account, bool status) external onlyOwner {
        authorized[account] = status;
    }

    function mint(IntelligentData[] calldata data, address to) external onlyAuthorized returns (uint256 tokenId) {
        tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);

        for (uint256 i = 0; i < data.length; i++) {
            _intelligentData[tokenId].push(data[i]);
        }

        emit IntelligentDataMinted(tokenId, to, data);
    }

    function burn(uint256 tokenId) external onlyAuthorized {
        _burn(tokenId);
        delete _intelligentData[tokenId];
        emit IntelligentDataBurned(tokenId);
    }

    function getIntelligentData(uint256 tokenId) external view returns (IntelligentData[] memory) {
        return _intelligentData[tokenId];
    }
}
