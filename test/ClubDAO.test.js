const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Mô hình Quản trị Phi tập trung - ClubDAO Test Suite", function () {
  let ClubMembershipNFT, membershipNFT;
  let ClubGovToken, govToken;
  let ClubDAO, dao;
  let owner, memberProposer, voter1, voter2, nonMember, vendor;

  const VOTING_DURATION = 3600; // 1 gio (3600s)
  const QUORUM_PERCENT = 20;    // 20% quorum
  const TREASURY_DEPOSIT = ethers.parseEther("5.0"); // 5 ETH vao quy

  beforeEach(async function () {
    [owner, memberProposer, voter1, voter2, nonMember, vendor] = await ethers.getSigners();

    // 1. Deploy Membership NFT (ERC-721)
    ClubMembershipNFT = await ethers.getContractFactory("ClubMembershipNFT");
    membershipNFT = await ClubMembershipNFT.deploy("Club Member Card", "CMEMBER", "ipfs://base-uri/");
    await membershipNFT.waitForDeployment();

    // 2. Deploy Governance Token (ERC-20)
    ClubGovToken = await ethers.getContractFactory("ClubGovToken");
    govToken = await ClubGovToken.deploy("Club Gov Token", "CGT", 0);
    await govToken.waitForDeployment();

    // 3. Deploy ClubDAO Contract
    ClubDAO = await ethers.getContractFactory("ClubDAO");
    dao = await ClubDAO.deploy(
      await membershipNFT.getAddress(),
      await govToken.getAddress(),
      VOTING_DURATION,
      QUORUM_PERCENT
    );
    await dao.waitForDeployment();

    // 4. Nap 5 ETH vao Treasury cua DAO
    await owner.sendTransaction({
      to: await dao.getAddress(),
      value: TREASURY_DEPOSIT,
    });

    // 5. Cấp Membership NFT cho memberProposer (Tiêu chí 4: Minting)
    await membershipNFT.mintMemberCard(memberProposer.address, "Ban Ky Thuat");

    // 6. Cấp Governance Token cho các thành viên (Weighted voting)
    // Tong supply: 10,000 Token. Quorum 20% = 2,000 Token.
    await govToken.mint(memberProposer.address, ethers.parseEther("1000"), "Founder reward");
    await govToken.mint(voter1.address, ethers.parseEther("3000"), "Core contributor");
    await govToken.mint(voter2.address, ethers.parseEther("1000"), "Active member");
    await govToken.mint(owner.address, ethers.parseEther("5000"), "Reserve");
  });

  describe("Tiêu chí 4: Tokenomics & Phân quyền (ERC-20 / NFT)", function () {
    it("Ví có NFT mới được xác nhận là thành viên chính thức", async function () {
      expect(await membershipNFT.isMember(memberProposer.address)).to.equal(true);
      expect(await membershipNFT.isMember(nonMember.address)).to.equal(false);
    });

    it("Số dư ERC-20 được phân bổ chính xác cho các cử tri", async function () {
      expect(await govToken.balanceOf(voter1.address)).to.equal(ethers.parseEther("3000"));
      expect(await govToken.balanceOf(voter2.address)).to.equal(ethers.parseEther("1000"));
      expect(await govToken.totalSupply()).to.equal(ethers.parseEther("10000"));
    });
  });

  describe("Tiêu chí 1: Nghiệp vụ propose() & Ràng buộc", function () {
    const proposalAmount = ethers.parseEther("0.5");
    const ipfsCid = "QmTestIPFSHashProposalEquipments123456789";

    it("Thành viên KHÔNG có NFT thẻ thành viên sẽ BỊ CHẶN khi tạo đề xuất", async function () {
      await expect(
        dao.connect(nonMember).propose(vendor.address, proposalAmount, "Mua may in", ipfsCid)
      ).to.be.revertedWith("DAO: Must hold a Membership Card NFT to propose");
    });

    it("Thành viên CÓ NFT thẻ thành viên tạo đề xuất thành công", async function () {
      await expect(
        dao.connect(memberProposer).propose(vendor.address, proposalAmount, "Mua may chieu", ipfsCid)
      )
        .to.emit(dao, "ProposalCreated")
        .withArgs(1, memberProposer.address, vendor.address, proposalAmount, "Mua may chieu", ipfsCid, await time.latest() + 1, (await time.latest() + 1) + VOTING_DURATION);

      const prop = await dao.getProposal(1);
      expect(prop.title).to.equal("Mua may chieu");
      expect(prop.amount).to.equal(proposalAmount);
      expect(prop.ipfsCid).to.equal(ipfsCid);
      expect(prop.executed).to.equal(false);
    });

    it("Không thể đề xuất rút vượt quá số dư trong Treasury", async function () {
      const excessiveAmount = ethers.parseEther("100.0");
      await expect(
        dao.connect(memberProposer).propose(vendor.address, excessiveAmount, "Rut het quy", ipfsCid)
      ).to.be.revertedWith("DAO: Treasury does not have enough ETH");
    });
  });

  describe("Tiêu chí 1: Nghiệp vụ vote() & Sức nặng phiếu bầu (Weighted Voting)", function () {
    const proposalAmount = ethers.parseEther("0.5");
    const ipfsCid = "QmTestIPFSHashProposalEquipments123456789";

    beforeEach(async function () {
      await dao.connect(memberProposer).propose(vendor.address, proposalAmount, "Mua may chieu", ipfsCid);
    });

    it("Tính toán chính xác sức nặng phiếu bầu dựa trên số dư ERC-20", async function () {
      // voter1 bo phieu Tan thanh (1) -> 3000 phieu
      await dao.connect(voter1).vote(1, 1);
      let prop = await dao.getProposal(1);
      expect(prop.forVotes).to.equal(ethers.parseEther("3000"));
      expect(prop.againstVotes).to.equal(0);

      // voter2 bo phieu Phan doi (0) -> 1000 phieu
      await dao.connect(voter2).vote(1, 0);
      prop = await dao.getProposal(1);
      expect(prop.forVotes).to.equal(ethers.parseEther("3000"));
      expect(prop.againstVotes).to.equal(ethers.parseEther("1000"));
    });

    it("Ngăn chặn gian lận bỏ phiếu 2 lần (Double Voting)", async function () {
      await dao.connect(voter1).vote(1, 1);
      await expect(dao.connect(voter1).vote(1, 1)).to.be.revertedWith(
        "DAO: You have already voted on this proposal"
      );
    });

    it("Ví không có token quản trị không được phép bỏ phiếu", async function () {
      await expect(dao.connect(nonMember).vote(1, 1)).to.be.revertedWith(
        "DAO: Must hold governance tokens to vote"
      );
    });
  });

  describe("Tiêu chí 1: Nghiệp vụ execute() & Ràng buộc Quorum / Thời gian", function () {
    const proposalAmount = ethers.parseEther("1.0");
    const ipfsCid = "QmTestIPFSHashProposalEquipments123456789";

    beforeEach(async function () {
      await dao.connect(memberProposer).propose(vendor.address, proposalAmount, "Mua Laptop AI Lab", ipfsCid);
    });

    it("Không thể execute() khi thời gian biểu quyết chưa kết thúc", async function () {
      await dao.connect(voter1).vote(1, 1);
      await expect(dao.execute(1)).to.be.revertedWith("DAO: Voting period is still active");
    });

    it("Không thể execute() nếu KHÔNG đạt tỷ lệ tối thiểu Quorum", async function () {
      // Tong supply: 10,000. Quorum 20% = 2,000 Token.
      // Chỉ voter2 vote (1,000 Token) < 2,000 Quorum
      await dao.connect(voter2).vote(1, 1);

      // Tua nhanh thoi gian qua thoi han bieu quyet
      await time.increase(VOTING_DURATION + 1);

      await expect(dao.execute(1)).to.be.revertedWith("DAO: Quorum not reached");
    });

    it("Tự động giải ngân ETH cho người nhận khi đạt đủ Quorum và Tán thành > Phản đối", async function () {
      // voter1 vote Tan thanh: 3,000 Token (đã đạt Quorum 2,000 và > Against)
      await dao.connect(voter1).vote(1, 1);
      // voter2 vote Phan doi: 1,000 Token
      await dao.connect(voter2).vote(1, 0);

      // Tua nhanh thoi gian qua han bieu quyet
      await time.increase(VOTING_DURATION + 1);

      const vendorInitialBalance = await ethers.provider.getBalance(vendor.address);

      // Bat ky ai cung co the goi execute() de trigger he thong ("Code is Law")
      await expect(dao.connect(nonMember).execute(1))
        .to.emit(dao, "ProposalExecuted")
        .withArgs(1, vendor.address, proposalAmount);

      // Kiem tra so du cua vendor tang dung 1 ETH
      const vendorFinalBalance = await ethers.provider.getBalance(vendor.address);
      expect(vendorFinalBalance - vendorInitialBalance).to.equal(proposalAmount);

      // Kiem tra trang thai da doi sang Executed
      const prop = await dao.getProposal(1);
      expect(prop.executed).to.equal(true);
    });

    it("Không thể execute() 2 lần trên cùng một đề xuất", async function () {
      await dao.connect(voter1).vote(1, 1);
      await time.increase(VOTING_DURATION + 1);
      await dao.execute(1);

      await expect(dao.execute(1)).to.be.revertedWith("DAO: Proposal has already been executed");
    });
  });
});
