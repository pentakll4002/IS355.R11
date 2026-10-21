# HƯỚNG DẪN THỰC THI & DEMO ĐỒ ÁN DAO (IS355)
**Đề tài:** Xây dựng Mô hình Quản trị Phi tập trung (DAO) & Quỹ Sinh viên UIT  
**Môn học:** Công nghệ Blockchain - IS355.R11

---

## I. CẤU TRÚC THƯ MỤC DỰ ÁN

```text
IS355.R11/
├── contracts/                  # 1. SMART CONTRACTS (Tiêu chí 1 & 4)
│   ├── ClubMembershipNFT.sol   # ERC-721: Thẻ thành viên (gatekeeper cho propose)
│   ├── ClubGovToken.sol        # ERC-20: Token quản trị (weighted voting)
│   └── ClubDAO.sol             # Core DAO: Quorum 20%, propose, vote, execute, Treasury
├── test/
│   └── ClubDAO.test.js         # Bộ Unit Test Hardhat kiểm tra 100% case nghiệp vụ
├── scripts/
│   ├── deploy.js               # Script deploy toàn bộ hệ thống & phân phối token ban đầu
│   └── simulate_dao.js         # Kịch bản mô phỏng toàn bộ vòng đời DAO 3 ví qua dòng lệnh
├── backend/                    # 2. BACKEND WEB3.PY & IPFS (Tiêu chí 2 & 3)
│   ├── requirements.txt        # web3, fastapi, uvicorn, requests
│   ├── app.py                  # API kiểm tra số dư cử tri, upload IPFS, auto-execute bot
│   └── ipfs_service.py         # Module tích hợp Pinata IPFS & local cache
├── frontend/                   # 3. GIAO DIỆN WEB3 DAPP (Tiêu chí 2)
│   ├── src/
│   │   ├── App.jsx             # Proposal Board, Voting Portal, Connect MetaMask
│   │   └── App.css             # Giao diện Glassmorphism Web3 hiện đại
│   └── package.json
├── ipfs_data/                  # 4. TÀI LIỆU QUẢN TRỊ IPFS (Tiêu chí 3)
│   ├── constitution.json       # Governance Rules (Hiến pháp DAO)
│   ├── proposal_equipments.md  # Proposal Documentation (Đề xuất mua sắm phòng Lab)
│   └── financial_report_q1.json# Financial Reports (Báo cáo dự toán chi phí)
└── hardhat.config.js           # Cấu hình Hardhat compiler & mạng lưới
```

---

## II. HƯỚNG DẪN CÀI ĐẶT MÔI TRƯỜNG

### 1. Cài đặt thư viện Smart Contract & Hardhat (Root)
Mở terminal tại thư mục gốc `IS355.R11`:
```bash
npm install
```

### 2. Cài đặt Frontend React Web3
```bash
cd frontend
npm install
cd ..
```

### 3. Cài đặt Backend Python Web3.py
```bash
cd backend
pip install -r requirements.txt
cd ..
```

---

## III. QUY TRÌNH CHẠY & KIỂM THỬ ĐỒ ÁN (DEMO WORKFLOW)

### Bước 1: Chạy Unit Test kiểm tra Smart Contract (Tiêu chí 1 & 4)
Chạy lệnh kiểm thử tự động toàn bộ điều kiện:
```bash
npx hardhat test
```
*Kết quả sẽ hiển thị:*
- ✅ Ràng buộc NFT: Ví không có NFT thẻ thành viên sẽ bị chặn khi `propose()`.
- ✅ Ràng buộc Thời gian: Không được phép `vote()` ngoài giờ hoặc `execute()` trước hạn.
- ✅ Ràng buộc Double Voting: 1 ví chỉ được bỏ phiếu 1 lần.
- ✅ Sức nặng phiếu bầu (Weighted Voting): Tính chính xác theo số dư ERC-20.
- ✅ Ràng buộc Quorum: Tối thiểu 20% tổng cung mới hợp lệ.
- ✅ Tự động chuyển ETH từ Treasury cho Vendor khi `execute()`.

---

### Bước 2: Khởi động Mạng Blockchain Local (Hardhat Node)
Mở **Terminal 1**:
```bash
npx hardhat node
```
*Node sẽ tạo 20 ví test có sẵn 10,000 ETH và mở cổng RPC tại `http://127.0.0.1:8545`.*

---

### Bước 3: Triển khai Contracts & Nạp Quỹ Treasury
Mở **Terminal 2**:
```bash
npm run deploy:local
```
Script sẽ tự động:
1. Triển khai `ClubMembershipNFT`, `ClubGovToken`, `ClubDAO`.
2. Nạp sẵn **3.0 ETH** vào Quỹ Treasury.
3. Mint Thẻ thành viên NFT cho ví Người đề xuất.
4. Phân phối Token: 1,000 CGT (Proposer), 3,000 CGT (Voter 1), 1,500 CGT (Voter 2).
5. Xuất tự động địa chỉ và ABI sang Frontend và Backend.

---

### Bước 4: Khởi động Backend Web3.py (Tiêu chí 2 & 3)
Tiếp tục tại **Terminal 2**:
```bash
cd backend
python app.py
```
*Backend chạy tại `http://localhost:8000`: sẵn sàng phục vụ API kiểm tra số dư ví và lưu trữ IPFS.*

---

### Bước 5: Khởi động Giao diện Web DApp (Tiêu chí 2)
Mở **Terminal 3**:
```bash
cd frontend
npm run dev
```
*Mở trình duyệt truy cập: `http://localhost:3000`.*

---

## IV. KỊCH BẢN DEMO BẰNG 3 VÍ METAMASK (LIVE PRESENTATION)

1. **Cấu hình MetaMask kết nối mạng Local:**
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency Symbol: `ETH`

2. **Nhập (Import) 3 Private Key từ Hardhat Node vào MetaMask:**
   - **Ví 1 (Chủ nhiệm / Proposer):** Có NFT Thẻ thành viên + 1,000 CGT.
   - **Ví 2 (Cử tri A):** Không có NFT + 3,000 CGT.
   - **Ví 3 (Cử tri B):** Không có NFT + 1,500 CGT.

3. **Thực hiện kịch bản mẫu trước Giảng viên:**
   * **Bước 1:** Kết nối Ví 1 vào Web. Vào tab **"Tạo Đề Xuất Mới"** $\rightarrow$ Nhập số tiền `0.5 ETH`, điền địa chỉ ví người bán (Vendor), đính kèm lý do $\rightarrow$ Bấm tạo. Web sẽ đẩy tài liệu lên IPFS, lấy mã CID và gọi hàm `propose()` on-chain.
   * **Bước 2:** Chuyển sang Ví 2 $\rightarrow$ Bấm xem chi tiết tài liệu IPFS trên Proposal Board $\rightarrow$ Bấm **Tán thành (For)**. Tiến độ tăng thêm 3,000 phiếu (vượt mốc Quorum 20%).
   * **Bước 3:** Chuyển sang Ví 3 $\rightarrow$ Bấm **Phản đối (Against)**. Tiến độ tăng thêm 1,500 phiếu.
   * **Bước 4:** Chờ hết thời gian biểu quyết (hoặc dùng hàm tua thời gian). Nút **"Kích hoạt Tự động Giải ngân (execute)"** sáng lên $\rightarrow$ Bất kỳ ví nào bấm vào, Smart Contract sẽ tự trừ 0.5 ETH từ Treasury và chuyển thẳng vào ví Vendor mà không cần Admin phê duyệt!
