// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ClubGovToken
 * @dev Tiêu chí 4: Governance Token (ERC-20).
 * Nguoi nam giu token nay co quyen tham gia bo phieu DAO.
 * So luong token quyet dinh suc nang phieu bau (Weighted Voting: 1 token = 1 phieu).
 */
contract ClubGovToken is ERC20, Ownable {
    event TokensMinted(address indexed to, uint256 amount, string reason);

    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) Ownable(msg.sender) {
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
        }
    }

    /**
     * @dev Cap token cho thanh vien khi dong gop cong suc/tai chinh vao to chuc
     */
    function mint(address to, uint256 amount, string memory reason) external onlyOwner {
        _mint(to, amount);
        emit TokensMinted(to, amount, reason);
    }
}
