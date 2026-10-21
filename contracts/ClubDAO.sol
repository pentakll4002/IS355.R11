// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ClubMembershipNFT.sol";
import "./ClubGovToken.sol";

/**
 * @title ClubDAO
 * @dev Tiêu chí 1: Xây dựng & Triển khai Hợp đồng thông minh Quản trị DAO.
 * Giải quyết bài toán "Principal-Agent Problem":
 * - Ngân quỹ nằm trong hợp đồng thông minh (Treasury).
 * - Mọi đề xuất chi tiêu phải được bỏ phiếu minh bạch.
 * - Tự động giải ngân qua hàm execute() khi đủ Quorum & đa số tán thành, không cần Admin duyệt.
 */
contract ClubDAO is ReentrancyGuard {
    enum ProposalState {
        Pending,
        Active,
        Defeated,
        Succeeded,
        Executed
    }

    enum VoteType {
        Against, // 0: Phan doi
        For      // 1: Tan thanh
    }

    struct Proposal {
        uint256 id;
        address proposer;
        address payable recipient;
        uint256 amount;
        string title;
        string ipfsCid;        // CID IPFS chua tai lieu, ke hoach, bao cao tai chinh
        uint256 forVotes;      // Tong so phieu tan thanh (tinh theo token weight)
        uint256 againstVotes;  // Tong so phieu phan doi (tinh theo token weight)
        uint256 startTime;     // Thoi diem bat dau bo phieu
        uint256 endTime;       // Thoi diem ket thuc bo phieu
        bool executed;         // Da giai ngan/thuc thi chua
        mapping(address => bool) hasVoted; // Chong Double Voting
    }

    ClubMembershipNFT public immutable membershipNFT;
    ClubGovToken public immutable govToken;

    uint256 public proposalCount;
    uint256 public votingDuration;      // Thoi gian bieu quyet (tinh bang giay)
    uint256 public quorumPercentage;    // Ty le Quorum toi thieu (vi du: 20%)

    mapping(uint256 => Proposal) private _proposals;

    // Events
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address indexed recipient,
        uint256 amount,
        string title,
        string ipfsCid,
        uint256 startTime,
        uint256 endTime
    );

    event Voted(
        uint256 indexed proposalId,
        address indexed voter,
        uint8 support,
        uint256 weight
    );

    event ProposalExecuted(
        uint256 indexed proposalId,
        address indexed recipient,
        uint256 amount
    );

    event TreasuryDeposited(address indexed sender, uint256 amount);

    constructor(
        address _membershipNFTAddress,
        address _govTokenAddress,
        uint256 _votingDurationInSeconds,
        uint256 _quorumPercentage
    ) {
        require(_quorumPercentage > 0 && _quorumPercentage <= 100, "DAO: Quorum percentage must be 1-100");
        membershipNFT = ClubMembershipNFT(_membershipNFTAddress);
        govToken = ClubGovToken(_govTokenAddress);
        votingDuration = _votingDurationInSeconds;
        quorumPercentage = _quorumPercentage;
    }

    // Nhan ETH dong gop vao quy Treasury
    receive() external payable {
        emit TreasuryDeposited(msg.sender, msg.value);
    }

    fallback() external payable {
        emit TreasuryDeposited(msg.sender, msg.value);
    }

    /**
     * @dev 1. Nghiệp vụ propose():
     * RÀNG BUỘC ĐỊNH DANH (Tiêu chí 4): Chỉ ví sở hữu Membership NFT mới được tạo đề xuất.
     * @param recipient Dia chi nhan giai ngan (nguoi ban thiet bi, nha cung cap, thanh vien to chuc)
     * @param amount So luong ETH can giai ngan
     * @param title Tieu de de xuat
     * @param ipfsCid Ma CID tren IPFS chua tai lieu chi tiet, ke hoach & bao cao tai chinh
     */
    function propose(
        address payable recipient,
        uint256 amount,
        string calldata title,
        string calldata ipfsCid
    ) external returns (uint256) {
        // Rang buoc thanh vien chinh thuc (NFT)
        require(
            membershipNFT.balanceOf(msg.sender) > 0,
            "DAO: Must hold a Membership Card NFT to propose"
        );
        require(recipient != address(0), "DAO: Invalid recipient address");
        require(amount <= address(this).balance, "DAO: Treasury does not have enough ETH");
        require(bytes(ipfsCid).length > 0, "DAO: IPFS CID cannot be empty");

        proposalCount++;
        uint256 proposalId = proposalCount;

        Proposal storage newProp = _proposals[proposalId];
        newProp.id = proposalId;
        newProp.proposer = msg.sender;
        newProp.recipient = recipient;
        newProp.amount = amount;
        newProp.title = title;
        newProp.ipfsCid = ipfsCid;
        newProp.startTime = block.timestamp;
        newProp.endTime = block.timestamp + votingDuration;
        newProp.executed = false;

        emit ProposalCreated(
            proposalId,
            msg.sender,
            recipient,
            amount,
            title,
            ipfsCid,
            newProp.startTime,
            newProp.endTime
        );

        return proposalId;
    }

    /**
     * @dev 2. Nghiệp vụ vote():
     * Cho phep thanh vien bo phieu dua tren so luong Token ERC-20 so huu (Weighted Voting).
     * @param proposalId ID cua de xuat
     * @param support 0 = Against (Phan doi), 1 = For (Tan thanh)
     */
    function vote(uint256 proposalId, uint8 support) external {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: Invalid proposal ID");
        Proposal storage prop = _proposals[proposalId];

        // RANG BUOC THOI GIAN: Chi duoc vote trong khoang thoi gian bieu quyet
        require(block.timestamp >= prop.startTime, "DAO: Voting has not started");
        require(block.timestamp <= prop.endTime, "DAO: Voting period has ended");

        // RANG BUOC CHONG DOUBLE VOTING
        require(!prop.hasVoted[msg.sender], "DAO: You have already voted on this proposal");

        // RANG BUOC SUC NANG PHIEU BAU (Weighted voting bang ERC-20 token)
        uint256 voterWeight = govToken.balanceOf(msg.sender);
        require(voterWeight > 0, "DAO: Must hold governance tokens to vote");

        require(support == uint8(VoteType.Against) || support == uint8(VoteType.For), "DAO: Invalid vote type");

        prop.hasVoted[msg.sender] = true;

        if (support == uint8(VoteType.For)) {
            prop.forVotes += voterWeight;
        } else {
            prop.againstVotes += voterWeight;
        }

        emit Voted(proposalId, msg.sender, support, voterWeight);
    }

    /**
     * @dev 3. Nghiệp vụ execute():
     * Tu dong giai ngan neu de xuat dat du dieu kien (Quorum & Da so tan thanh sau khi het han).
     * Bat ky ai cung co the goi ham nay de trigger he thong ("Code is Law", khong phu thuoc admin).
     * @param proposalId ID cua de xuat
     */
    function execute(uint256 proposalId) external nonReentrant {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: Invalid proposal ID");
        Proposal storage prop = _proposals[proposalId];

        // RANG BUOC THOI GIAN: Khong duoc thuc thi som hon thoi gian quy dinh
        require(block.timestamp > prop.endTime, "DAO: Voting period is still active");
        require(!prop.executed, "DAO: Proposal has already been executed");

        // RANG BUOC QUORUM: Tong so phieu bau phai dat toi thieu X% tong token luu hanh
        uint256 totalVotes = prop.forVotes + prop.againstVotes;
        uint256 totalTokenSupply = govToken.totalSupply();
        uint256 requiredQuorum = (totalTokenSupply * quorumPercentage) / 100;

        require(totalVotes >= requiredQuorum, "DAO: Quorum not reached");

        // RANG BUOC DA SO: So phieu Tan thanh phai lon hon Phan doi
        require(prop.forVotes > prop.againstVotes, "DAO: Proposal was defeated (For <= Against)");

        // Kiem tra so du Treasury
        require(address(this).balance >= prop.amount, "DAO: Insufficient treasury balance");

        // Danh dau da thuc thi truoc khi chuyen tien (chong re-entrancy)
        prop.executed = true;

        // TU DONG GIAI NGAN TIEN
        (bool success, ) = prop.recipient.call{value: prop.amount}("");
        require(success, "DAO: Treasury ETH transfer failed");

        emit ProposalExecuted(proposalId, prop.recipient, prop.amount);
    }

    /**
     * @dev Lay trang thai hien tai cua Proposal
     */
    function state(uint256 proposalId) public view returns (ProposalState) {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: Invalid proposal ID");
        Proposal storage prop = _proposals[proposalId];

        if (prop.executed) {
            return ProposalState.Executed;
        }

        if (block.timestamp <= prop.endTime) {
            return ProposalState.Active;
        }

        uint256 totalVotes = prop.forVotes + prop.againstVotes;
        uint256 totalTokenSupply = govToken.totalSupply();
        uint256 requiredQuorum = (totalTokenSupply * quorumPercentage) / 100;

        if (totalVotes < requiredQuorum || prop.forVotes <= prop.againstVotes) {
            return ProposalState.Defeated;
        }

        return ProposalState.Succeeded;
    }

    /**
     * @dev Doc thong tin chi tiet cua Proposal
     */
    function getProposal(uint256 proposalId) external view returns (
        uint256 id,
        address proposer,
        address payable recipient,
        uint256 amount,
        string memory title,
        string memory ipfsCid,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 startTime,
        uint256 endTime,
        bool executed,
        ProposalState currentState
    ) {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: Invalid proposal ID");
        Proposal storage prop = _proposals[proposalId];

        return (
            prop.id,
            prop.proposer,
            prop.recipient,
            prop.amount,
            prop.title,
            prop.ipfsCid,
            prop.forVotes,
            prop.againstVotes,
            prop.startTime,
            prop.endTime,
            prop.executed,
            state(proposalId)
        );
    }

    /**
     * @dev Kiem tra xem mot dia chi da bo phieu cho de xuat chua
     */
    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: Invalid proposal ID");
        return _proposals[proposalId].hasVoted[voter];
    }

    /**
     * @dev Lay so du quy Treasury cua DAO
     */
    function getTreasuryBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
