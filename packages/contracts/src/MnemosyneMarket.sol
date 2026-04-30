// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MnemosyneMarket — simple escrow for iNFT trading on 0G
/// @notice Sellers list iNFTs at a fixed A0GI price. The escrow holds the iNFT
///         until a buyer pays, then atomically transfers both sides.
///         Supports an authorized operator (the API relayer) to list/buy on behalf of users.
contract MnemosyneMarket is Ownable {
    struct Listing {
        address seller;
        uint256 price; // in wei (A0GI)
        bool    active;
    }

    IERC721 public immutable inft;

    mapping(uint256 => Listing) public listings;
    uint256[] private _listedTokenIds;

    mapping(address => bool) public authorized;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Sold(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event PriceUpdated(uint256 indexed tokenId, uint256 newPrice);

    modifier onlyAuthorized() {
        require(authorized[msg.sender] || msg.sender == owner(), "not authorized");
        _;
    }

    constructor(address inftAddress) Ownable(msg.sender) {
        inft = IERC721(inftAddress);
    }

    function setAuthorized(address account, bool status) external onlyOwner {
        authorized[account] = status;
    }

    /// @notice List an iNFT for sale. Caller must own the token and approve this contract first.
    function list(uint256 tokenId, uint256 price) external {
        require(inft.ownerOf(tokenId) == msg.sender, "not owner");
        require(price > 0, "price must be > 0");
        inft.transferFrom(msg.sender, address(this), tokenId);
        _addListing(tokenId, msg.sender, price);
    }

    /// @notice Operator lists on behalf of a seller (API relayer pattern).
    function listFor(uint256 tokenId, address seller, uint256 price) external onlyAuthorized {
        require(inft.ownerOf(tokenId) == address(this) || inft.ownerOf(tokenId) == seller, "not owned");
        if (inft.ownerOf(tokenId) == seller) {
            inft.transferFrom(seller, address(this), tokenId);
        }
        require(price > 0, "price must be > 0");
        _addListing(tokenId, seller, price);
    }

    function _addListing(uint256 tokenId, address seller, uint256 price) internal {
        if (!listings[tokenId].active) {
            _listedTokenIds.push(tokenId);
        }
        listings[tokenId] = Listing(seller, price, true);
        emit Listed(tokenId, seller, price);
    }

    /// @notice Buy a listed iNFT. Send exactly the listing price in A0GI.
    function buy(uint256 tokenId) external payable {
        _executeBuy(tokenId, msg.sender);
    }

    /// @notice Operator buys on behalf of a recipient (API relayer pattern).
    function buyFor(uint256 tokenId, address recipient) external payable onlyAuthorized {
        _executeBuy(tokenId, recipient);
    }

    function _executeBuy(uint256 tokenId, address recipient) internal {
        Listing storage l = listings[tokenId];
        require(l.active, "not listed");
        require(msg.value >= l.price, "insufficient payment");

        address seller = l.seller;
        uint256 price  = l.price;
        l.active = false;

        inft.transferFrom(address(this), recipient, tokenId);
        payable(seller).transfer(price);

        // Refund overpayment
        if (msg.value > price) {
            payable(msg.sender).transfer(msg.value - price);
        }

        emit Sold(tokenId, recipient, seller, price);
    }

    /// @notice Update the price of an active listing.
    function updatePrice(uint256 tokenId, uint256 newPrice) external {
        Listing storage l = listings[tokenId];
        require(l.active, "not listed");
        require(l.seller == msg.sender || authorized[msg.sender] || msg.sender == owner(), "not seller");
        require(newPrice > 0, "price must be > 0");
        l.price = newPrice;
        emit PriceUpdated(tokenId, newPrice);
    }

    /// @notice Cancel a listing and return the iNFT to the seller.
    function cancel(uint256 tokenId) external {
        Listing storage l = listings[tokenId];
        require(l.active, "not listed");
        require(l.seller == msg.sender || authorized[msg.sender] || msg.sender == owner(), "not seller");
        address seller = l.seller;
        l.active = false;
        inft.transferFrom(address(this), seller, tokenId);
        emit Cancelled(tokenId, seller);
    }

    /// @notice Returns all currently active listings.
    function getActiveListings() external view returns (uint256[] memory tokenIds, Listing[] memory lst) {
        uint256 count = 0;
        for (uint256 i = 0; i < _listedTokenIds.length; i++) {
            if (listings[_listedTokenIds[i]].active) count++;
        }
        tokenIds = new uint256[](count);
        lst      = new Listing[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < _listedTokenIds.length; i++) {
            uint256 tid = _listedTokenIds[i];
            if (listings[tid].active) {
                tokenIds[j] = tid;
                lst[j]      = listings[tid];
                j++;
            }
        }
    }
}
