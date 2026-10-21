// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ClubMembershipNFT
 * @dev Tiêu chí 4: NFT (Membership Card) dùng để định danh thành viên chính thức.
 * Chỉ những ví sở hữu NFT này mới có quyền tạo đề xuất (propose) trong DAO.
 */
contract ClubMembershipNFT is ERC721Enumerable, Ownable {
    uint256 private _nextTokenId = 1;
    string private _baseTokenURI;

    // Mapping luu metadata role cua thanh vien (vi du: "Ban Chu Nhiem", "Thanh Vien Ky Thuat", ...)
    mapping(uint256 => string) public memberRoles;

    event MembershipMinted(address indexed to, uint256 indexed tokenId, string role);

    constructor(
        string memory name,
        string memory symbol,
        string memory baseURI
    ) ERC721(name, symbol) Ownable(msg.sender) {
        _baseTokenURI = baseURI;
    }

    /**
     * @dev Cap the thanh vien NFT cho thanh vien moi gia nhap to chuc
     */
    function mintMemberCard(address to, string memory role) external onlyOwner returns (uint256) {
        require(balanceOf(to) == 0, "Member already owns an NFT card");
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        memberRoles[tokenId] = role;

        emit MembershipMinted(to, tokenId, role);
        return tokenId;
    }

    /**
     * @dev Kiem tra nhanh mot dia chi vi co phai thanh vien so huu NFT khong
     */
    function isMember(address user) external view returns (bool) {
        return balanceOf(user) > 0;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }
}
