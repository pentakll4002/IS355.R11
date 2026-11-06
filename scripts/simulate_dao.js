const { ethers, network } = require("hardhat");

async function main() {
  console.log("===============================================================");
  console.log(" KỊCH BẢN MÔ PHỎNG VÒNG ĐỜI DAO ĐẦY ĐỦ (DEMO WORKFLOW)");
  console.log("===============================================================");

  const [deployer, memberProposer, voter1, voter2, vendor] = await ethers.getSigners();

  // 1. Deploy
  const ClubMembershipNFT = await ethers.getContractFactory("ClubMembershipNFT");
  const membershipNFT = await ClubMembershipNFT.deploy("Club Member Card", "CMEMBER", "ipfs://");
  await membershipNFT.waitForDeployment();

  const ClubGovToken = await ethers.getContractFactory("ClubGovToken");
  const govToken = await ClubGovToken.deploy("Club Gov Token", "CGT", 0);
  await govToken.waitForDeployment();

  const VOTING_DURATION = 60; // 60s
  const QUORUM_PERCENT = 20;

  const ClubDAO = await ethers.getContractFactory("ClubDAO");
  const dao = await ClubDAO.deploy(
    await membershipNFT.getAddress(),
    await govToken.getAddress(),
    VOTING_DURATION,
    QUORUM_PERCENT
  );
  await dao.waitForDeployment();

  // Nap 5 ETH vao Treasury
  await deployer.sendTransaction({
    to: await dao.getAddress(),
    value: ethers.parseEther("5.0"),
  });

  // Mint NFT & Token
  await membershipNFT.mintMemberCard(memberProposer.address, "Ban Ky Thuat UIT");
  await govToken.mint(memberProposer.address, ethers.parseEther("1000"), "Founder");
  await govToken.mint(voter1.address, ethers.parseEther("3000"), "Contributor");
  await govToken.mint(voter2.address, ethers.parseEther("1500"), "Member");
  await govToken.mint(deployer.address, ethers.parseEther("4500"), "Reserve");

  console.log("✅ 1. Khởi tạo xong: Treasury có 5.0 ETH | Tổng cung Token: 10,000 CGT");
  console.log("   Quorum cần tối thiểu: 2,000 CGT (20%)");

  // BƯỚC 1: Propose chi 0.5 ETH
  console.log("\n---------------------------------------------------------------");
  console.log("👉 BƯỚC 1: Tạo đề xuất (propose) bởi ví có Membership NFT");
  const ipfsCid = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
  const propTx = await dao.connect(memberProposer).propose(
    vendor.address,
    ethers.parseEther("0.5"),
    "Mua sắm máy chiếu & bảng vẽ cho phòng Lab CLB",
    ipfsCid
  );
  await propTx.wait();
  console.log("✅ Đề xuất #1 được tạo thành công với IPFS CID:", ipfsCid);

  // BƯỚC 2: Bỏ phiếu
  console.log("\n---------------------------------------------------------------");
  console.log("👉 BƯỚC 2: Cử tri tham gia bỏ phiếu (Weighted Voting)");
  
  // Voter 1 vote Tán thành (1) với 3000 Token
  const vote1Tx = await dao.connect(voter1).vote(1, 1);
  await vote1Tx.wait();
  console.log("🗳️ Voter 1 (0x...%s) bỏ phiếu TÁN THÀNH (3,000 Tokens)", voter1.address.slice(-4));

  // Voter 2 vote Phản đối (0) với 1500 Token
  const vote2Tx = await dao.connect(voter2).vote(1, 0);
  await vote2Tx.wait();
  console.log("🗳️ Voter 2 (0x...%s) bỏ phiếu PHẢN ĐỐI (1,500 Tokens)", voter2.address.slice(-4));

  let propData = await dao.getProposal(1);
  console.log("📊 Kết quả hiện tại: Tán thành:", ethers.formatEther(propData.forVotes), "CGT | Phản đối:", ethers.formatEther(propData.againstVotes), "CGT");
  console.log("📊 Tổng số phiếu bầu:", ethers.formatEther(propData.forVotes + propData.againstVotes), "CGT (Đã vượt Quorum 2,000 CGT)");

  // BƯỚC 3: Tua thời gian hết hạn
  console.log("\n---------------------------------------------------------------");
  console.log("👉 BƯỚC 3: Tua thời gian blockchain qua hạn biểu quyết (+65s)...");
  await network.provider.send("evm_increaseTime", [65]);
  await network.provider.send("evm_mine");
  console.log("⏳ Thời hạn biểu quyết đã kết thúc!");

  // BƯỚC 4: Execute
  console.log("\n---------------------------------------------------------------");
  console.log("👉 BƯỚC 4: Kích hoạt tự động giải ngân quỹ (execute)");
  const vendorPreBalance = await ethers.provider.getBalance(vendor.address);
  console.log("💰 Số dư ví Vendor trước giải ngân:", ethers.formatEther(vendorPreBalance), "ETH");

  const execTx = await dao.execute(1);
  await execTx.wait();
  console.log("⚡ Hàm execute() đã chạy thành công!");

  const vendorPostBalance = await ethers.provider.getBalance(vendor.address);
  console.log("💰 Số dư ví Vendor sau giải ngân :", ethers.formatEther(vendorPostBalance), "ETH");
  console.log("🎉 Ví Vendor nhận được chính xác : +", ethers.formatEther(vendorPostBalance - vendorPreBalance), "ETH từ Quỹ DAO!");

  const finalTreasury = await dao.getTreasuryBalance();
  console.log("🏦 Số dư Quỹ DAO (Treasury) còn lại :", ethers.formatEther(finalTreasury), "ETH (5.0 - 0.5 = 4.5 ETH)");
  console.log("===============================================================");
  console.log(" MÔ PHỎNG THÀNH CÔNG 100%! HỆ THỐNG HOẠT ĐỘNG HOÀN HẢO!");
  console.log("===============================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
