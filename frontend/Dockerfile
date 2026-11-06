FROM node:20-alpine AS builder

WORKDIR /app

# Install frontend deps
COPY frontend/package.json ./
RUN npm install

# Copy frontend source
COPY frontend/ ./

# Copy pre-existing contract JSONs (from local build artifacts or placeholder)
# In Docker, these will be overridden by the volume at runtime.
# For now we copy whatever exists (placeholder is fine since
# MetaMask signs transactions directly against the local hardhat node).
RUN mkdir -p src/contracts && \
    echo '{"ClubDAO":"0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0","ClubGovToken":"0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","ClubMembershipNFT":"0x5FbDB2315678afecb367f032d93F642f64180aa3","quorumPercentage":20,"votingDuration":300,"chainId":31337,"sampleAccounts":{"deployer":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","proposer":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","voter1":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","voter2":"0x90F79bf6EB2c4f870365E785982E1f101E93b906","vendor":"0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"}}' \
    > src/contracts/config.json

# Build for production
RUN npm run build

# ─── Serve stage ───
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
