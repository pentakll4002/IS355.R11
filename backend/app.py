import os
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from web3 import Web3
from ipfs_service import IPFSService

app = FastAPI(
    title="DAO Governance API (IS355)",
    description="Backend Web3.py kết nối Smart Contract và IPFS theo Tiêu chí 2 & 3",
    version="1.0.0"
)

# Cho phép CORS để Frontend React gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Khởi tạo dịch vụ IPFS
ipfs_service = IPFSService()

# Kết nối Web3 Provider (Mặc định là Local Hardhat Node)
RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# Đường dẫn đến file config và ABIs
CONTRACTS_DIR = Path(__file__).parent / "contracts"

def load_contract_data(contract_name: str):
    config_file = CONTRACTS_DIR / "config.json"
    abi_file = CONTRACTS_DIR / f"{contract_name}.json"

    if not config_file.exists() or not abi_file.exists():
        return None, None

    config = json.loads(config_file.read_text(encoding="utf-8"))
    abi = json.loads(abi_file.read_text(encoding="utf-8"))
    address = config.get(contract_name)
    return address, abi

def get_contracts():
    nft_addr, nft_abi = load_contract_data("ClubMembershipNFT")
    token_addr, token_abi = load_contract_data("ClubGovToken")
    dao_addr, dao_abi = load_contract_data("ClubDAO")

    nft_contract = w3.eth.contract(address=nft_addr, abi=nft_abi) if nft_addr else None
    token_contract = w3.eth.contract(address=token_addr, abi=token_abi) if token_addr else None
    dao_contract = w3.eth.contract(address=dao_addr, abi=dao_abi) if dao_addr else None

    return nft_contract, token_contract, dao_contract

class ProposalUploadRequest(BaseModel):
    title: str
    description: str
    financialDetails: dict = {}
    governanceCategory: str = "Chi tiêu ngân quỹ"

@app.get("/")
def root():
    connected = w3.is_connected()
    block_num = 0
    if connected:
        try:
            block_num = w3.eth.block_number
        except Exception:
            pass
    return {
        "status": "online",
        "service": "UIT DAO Web3.py Backend",
        "web3_connected": connected,
        "provider": RPC_URL,
        "block_number": block_num
    }

@app.get("/api/contracts-config")
def get_config():
    config_file = CONTRACTS_DIR / "config.json"
    if not config_file.exists():
        raise HTTPException(status_code=404, detail="Chưa deploy hợp đồng. Hãy chạy scripts/deploy.js")
    return json.loads(config_file.read_text(encoding="utf-8"))

# ====================================================================
# TIÊU CHÍ 2: KIỂM TRA SỐ DƯ VÀ TÍNH CÔNG BẰNG BẰNG WEB3.PY
# ====================================================================
@app.get("/api/voter-status/{wallet_address}")
def check_voter_status(wallet_address: str):
    """
    Sử dụng Web3.py để kiểm tra số dư token của người dùng trước khi cho phép họ bỏ phiếu,
    đảm bảo tính công bằng (1 token = 1 phiếu) và kiểm tra thẻ thành viên NFT (quyền propose).
    """
    if not w3.is_connected():
        raise HTTPException(status_code=503, detail="Không thể kết nối đến mạng lưới Blockchain")

    try:
        checksum_address = Web3.to_checksum_address(wallet_address)
    except Exception:
        raise HTTPException(status_code=400, detail="Địa chỉ ví không hợp lệ")

    nft_contract, token_contract, dao_contract = get_contracts()
    if not token_contract or not nft_contract:
        raise HTTPException(status_code=500, detail="Smart contracts chưa được khởi tạo")

    # Đọc số dư ETH
    eth_balance = w3.eth.get_balance(checksum_address)
    eth_balance_formatted = w3.from_wei(eth_balance, "ether")

    # Đọc số dư Governance Token ERC-20 (Trọng số biểu quyết)
    gov_token_balance = token_contract.functions.balanceOf(checksum_address).call()
    gov_token_formatted = w3.from_wei(gov_token_balance, "ether")

    # Đọc số dư NFT Membership Card (Quyền tạo đề xuất)
    nft_balance = nft_contract.functions.balanceOf(checksum_address).call()
    has_membership_card = nft_balance > 0

    return {
        "walletAddress": checksum_address,
        "ethBalance": float(eth_balance_formatted),
        "governanceTokenBalance": float(gov_token_formatted),
        "votingWeight": float(gov_token_formatted), # 1 Token = 1 Vote
        "hasNFTMembership": has_membership_card,
        "permissions": {
            "canPropose": has_membership_card,
            "canVote": gov_token_balance > 0,
        },
        "verifiedBy": "Web3.py Security Verifier"
    }

# ====================================================================
# TIÊU CHÍ 3: TÍCH HỢP IPFS (UPLOAD & RETRIEVE)
# ====================================================================
@app.post("/api/ipfs/upload-proposal")
def upload_proposal_metadata(req: ProposalUploadRequest):
    """Upload toàn bộ thông tin đề xuất (Markdown, Financials, Rules) lên IPFS"""
    block_ts = 0
    if w3.is_connected():
        try:
            block = w3.eth.get_block("latest")
            block_ts = block.get("timestamp", 0) if isinstance(block, dict) else getattr(block, "timestamp", 0)
        except Exception:
            pass

    metadata = {
        "title": req.title,
        "description": req.description,
        "financialDetails": req.financialDetails,
        "category": req.governanceCategory,
        "createdAt": block_ts
    }
    cid = ipfs_service.upload_json(metadata, name=f"proposal_{req.title[:20]}.json")
    return {
        "success": True,
        "cid": cid,
        "ipfsUrl": f"ipfs://{cid}",
        "gatewayUrl": f"https://gateway.pinata.cloud/ipfs/{cid}"
    }

@app.get("/api/ipfs/{cid}")
def retrieve_ipfs(cid: str):
    """Lấy nội dung tài liệu từ IPFS để hiển thị chi tiết trên Proposal Board"""
    data = ipfs_service.retrieve(cid)
    return data

# ====================================================================
# TIÊU CHÍ 1 & 2: TRUY XUẤT PROPOSALS ON-CHAIN QUA WEB3.PY
# ====================================================================
@app.get("/api/proposals")
def get_all_proposals():
    """Lấy toàn bộ danh sách proposal trực tiếp từ smart contract thông qua Web3.py"""
    _, _, dao_contract = get_contracts()
    if not dao_contract:
        raise HTTPException(status_code=500, detail="DAO Contract chưa cấu hình")

    proposal_count = dao_contract.functions.proposalCount().call()
    treasury_wei = dao_contract.functions.getTreasuryBalance().call()
    proposals = []

    for prop_id in range(1, proposal_count + 1):
        prop_data = dao_contract.functions.getProposal(prop_id).call()
        proposals.append({
            "id": prop_data[0],
            "proposer": prop_data[1],
            "recipient": prop_data[2],
            "amount": float(w3.from_wei(prop_data[3], "ether")),
            "title": prop_data[4],
            "ipfsCid": prop_data[5],
            "forVotes": float(w3.from_wei(prop_data[6], "ether")),
            "againstVotes": float(w3.from_wei(prop_data[7], "ether")),
            "startTime": prop_data[8],
            "endTime": prop_data[9],
            "executed": prop_data[10],
            "state": prop_data[11]
        })

    return {
        "proposalCount": proposal_count,
        "treasuryBalanceETH": float(w3.from_wei(treasury_wei, "ether")),
        "proposals": proposals
    }

# ====================================================================
# TỰ ĐỘNG THỰC THI (AUTOMATION BOT QUA WEB3.PY) & TIỆN ÍCH TUA THỜI GIAN
# ====================================================================
@app.post("/api/time/advance")
def advance_blockchain_time(seconds: int = Body(360, embed=True)):
    """
    Tua thời gian blockchain (Hardhat EVM increaseTime) để test hàm execute()
    ngay lập tức khi thời gian biểu quyết kết thúc.
    """
    if not w3.is_connected():
        raise HTTPException(status_code=503, detail="Mạng Blockchain chưa kết nối")
    try:
        w3.provider.make_request("evm_increaseTime", [seconds])
        w3.provider.make_request("evm_mine", [])
        return {
            "success": True,
            "advancedSeconds": seconds,
            "currentBlock": w3.eth.block_number,
            "message": f"Đã tua nhanh {seconds} giây trên Blockchain!"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/bot/auto-execute")
def auto_execute_eligible_proposals(execute_now: bool = Body(False, embed=True)):
    """
    Bot tự động quét các đề xuất đã hết hạn. Nếu đạt Quorum và For > Against,
    có thể gọi hàm execute() để giải ngân tự động ("Code is Law").
    """
    _, _, dao_contract = get_contracts()
    if not dao_contract:
        raise HTTPException(status_code=500, detail="DAO Contract chưa cấu hình")

    proposal_count = dao_contract.functions.proposalCount().call()
    ready_list = []
    executed_results = []

    for prop_id in range(1, proposal_count + 1):
        prop_data = dao_contract.functions.getProposal(prop_id).call()
        is_executed = prop_data[10]
        state = prop_data[11] # 3: Succeeded

        if not is_executed and state == 3:
            ready_list.append({
                "proposalId": prop_id,
                "title": prop_data[4],
                "recipient": prop_data[2],
                "amount": float(w3.from_wei(prop_data[3], "ether")),
                "readyForExecution": True
            })

            # Nếu yêu cầu thực thi ngay từ bot
            if execute_now:
                try:
                    # Dùng tài khoản đầu tiên của local node để ký
                    account = w3.eth.accounts[0]
                    tx_hash = dao_contract.functions.execute(prop_id).transact({"from": account})
                    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
                    executed_results.append({
                        "proposalId": prop_id,
                        "txHash": receipt.transactionHash.hex(),
                        "status": "Executed by Bot"
                    })
                except Exception as ex:
                    executed_results.append({
                        "proposalId": prop_id,
                        "error": str(ex)
                    })

    return {
        "scannedProposals": proposal_count,
        "readyToExecute": ready_list,
        "executedResults": executed_results
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("app:app", host=host, port=port, reload=True)
