const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("==================================================");
  console.log(" BẮT ĐẦU TRIỂN KHAI HỆ THỐNG QUẢN TRỊ DAO (IS355)");
  console.log("==================================================");

  const [deployer, memberProposer, voter1, voter2, vendor] = await ethers.getSigners();
  console.log("Deployer Address:", deployer.address);
  console.log("Member Proposer :", memberProposer.address);
  console.log("Voter 1         :", voter1.address);
  console.log("Voter 2         :", voter2.address);
  console.log("Vendor Recipient:", vendor.address);

  // 1. Triển khai ClubMembershipNFT (ERC-721)
  console.log("\n1. Triển khai ClubMembershipNFT (ERC-721)...");
  const ClubMembershipNFT = await ethers.getContractFactory("ClubMembershipNFT");
  const membershipNFT = await ClubMembershipNFT.deploy(
    "Club Member Card",
    "CMEMBER",
    "https://ipfs.io/ipfs/"
  );
  await membershipNFT.waitForDeployment();
  const nftAddress = await membershipNFT.getAddress();
  console.log("-> ClubMembershipNFT deployed at:", nftAddress);

  // 2. Triển khai ClubGovToken (ERC-20)
  console.log("\n2. Triển khai ClubGovToken (ERC-20)...");
  const ClubGovToken = await ethers.getContractFactory("ClubGovToken");
  const govToken = await ClubGovToken.deploy("Club Gov Token", "CGT", 0);
  await govToken.waitForDeployment();
  const tokenAddress = await govToken.getAddress();
  console.log("-> ClubGovToken deployed at:", tokenAddress);

  // 3. Triển khai ClubDAO
  // Voting duration: 300 giay (5 phut) de tien demo
  // Quorum: 20%
  const VOTING_DURATION = 300;
  const QUORUM_PERCENT = 20;

  console.log("\n3. Triển khai ClubDAO Governance Contract...");
  const ClubDAO = await ethers.getContractFactory("ClubDAO");
  const dao = await ClubDAO.deploy(
    nftAddress,
    tokenAddress,
    VOTING_DURATION,
    QUORUM_PERCENT
  );
  await dao.waitForDeployment();
  const daoAddress = await dao.getAddress();
  console.log("-> ClubDAO deployed at:", daoAddress);

  // 4. Nạp tiền vào quỹ Treasury của DAO (3 ETH)
  console.log("\n4. Nạp 3.0 ETH vào Quỹ Treasury của DAO...");
  const depositTx = await deployer.sendTransaction({
    to: daoAddress,
    value: ethers.parseEther("3.0"),
  });
  await depositTx.wait();
  console.log("-> Đã nạp thành công 3.0 ETH vào Treasury!");

  // 5. Cấp Membership NFT cho MemberProposer
  console.log("\n5. Cấp Thẻ Thành Viên NFT cho Proposer...");
  const mintNftTx = await membershipNFT.mintMemberCard(memberProposer.address, "Ban Ky Thuat UIT");
  await mintNftTx.wait();
  console.log("-> Đã mint Thẻ NFT #1 cho ví:", memberProposer.address);

  // 6. Phân phối Token ERC-20 cho các cử tri
  console.log("\n6. Phân phối Governance Token ERC-20...");
  await (await govToken.mint(memberProposer.address, ethers.parseEther("1000"), "Founder reward")).wait();
  await (await govToken.mint(voter1.address, ethers.parseEther("3000"), "Core contributor")).wait();
  await (await govToken.mint(voter2.address, ethers.parseEther("1500"), "Active member")).wait();
  await (await govToken.mint(deployer.address, ethers.parseEther("4500"), "Treasury Reserve")).wait();
  console.log("-> Tổng cung token phát hành: 10,000 CGT (Quorum 20% = 2,000 CGT)");

  // 7. Xuất cấu hình và ABI sang Frontend & Backend
  console.log("\n7. Xuất Contract Addresses & ABIs cho Frontend và Backend Web3.py...");

  const contractsConfig = {
    network: "localhost",
    chainId: 31337,
    ClubMembershipNFT: nftAddress,
    ClubGovToken: tokenAddress,
    ClubDAO: daoAddress,
    votingDuration: VOTING_DURATION,
    quorumPercentage: QUORUM_PERCENT,
    sampleAccounts: {
      deployer: deployer.address,
      proposer: memberProposer.address,
      voter1: voter1.address,
      voter2: voter2.address,
      vendor: vendor.address,
    }
  };

  const getArtifactAbi = (contractName) => {
    const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", `${contractName}.sol`, `${contractName}.json`);
    if (fs.existsSync(artifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
      return artifact.abi;
    }
    return [];
  };

  // Support both local dev paths AND Docker volume mount paths
  const outputDirs = [
    path.join(__dirname, "..", "frontend", "src", "contracts"),
    path.join(__dirname, "..", "backend", "contracts"),
  ];

  // Additional Docker volume paths (may be same as above in local dev, or mounted paths)
  const extraEnvDirs = [
    process.env.FRONTEND_CONTRACTS_DIR,
    process.env.BACKEND_CONTRACTS_DIR,
  ].filter(Boolean);

  const allDirs = [...new Set([...outputDirs, ...extraEnvDirs])];

  allDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  const configJson = JSON.stringify(contractsConfig, null, 2);

  allDirs.forEach((dir) => {
    fs.writeFileSync(path.join(dir, "config.json"), configJson);

    // Copy ABI
    ["ClubDAO", "ClubGovToken", "ClubMembershipNFT"].forEach((cName) => {
      const abi = getArtifactAbi(cName);
      if (abi.length > 0) {
        fs.writeFileSync(path.join(dir, `${cName}.json`), JSON.stringify(abi, null, 2));
      }
    });
  });

  console.log("-> Đã xuất cấu hình thành công vào các thư mục:");
  allDirs.forEach(d => console.log("   ", d));
  console.log("==================================================");
  console.log(" TRIỂN KHAI HOÀN TẤT! SẴN SÀNG CHẠY FRONTEND & BACKEND");
  console.log("==================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
