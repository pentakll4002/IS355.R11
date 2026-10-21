import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import contractsConfig from './contracts/config.json';
import ClubDAOAbi from './contracts/ClubDAO.json';
import ClubGovTokenAbi from './contracts/ClubGovToken.json';
import ClubMembershipNFTAbi from './contracts/ClubMembershipNFT.json';

const STATE_NAMES = ['Pending', 'Active', 'Defeated', 'Succeeded', 'Executed'];

export default function App() {
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState(null);
  const [ethBalance, setEthBalance] = useState('0');
  const [tokenBalance, setTokenBalance] = useState('0');
  const [hasNFT, setHasNFT] = useState(false);
  
  const [activeTab, setActiveTab] = useState('board'); // 'board' | 'propose' | 'ipfs'
  const [proposals, setProposals] = useState([]);
  const [treasuryBalance, setTreasuryBalance] = useState('0');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Form tạo đề xuất
  const [formTitle, setFormTitle] = useState('');
  const [formRecipient, setFormRecipient] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('Mua sắm thiết bị Lab');

  // Modal xem IPFS
  const [selectedIpfsData, setSelectedIpfsData] = useState(null);
  const [loadingIpfs, setLoadingIpfs] = useState(false);

  // Khởi tạo kết nối ví MetaMask
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Vui lòng cài đặt ví MetaMask trên trình duyệt!");
      return;
    }
    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();
      
      const currentAccount = accounts[0];
      setAccount(currentAccount);
      setChainId(Number(network.chainId));

      await refreshUserData(currentAccount, provider);
      await loadProposals(provider);
      setMsg({ text: "Kết nối ví MetaMask thành công!", type: "success" });
    } catch (err) {
      console.error(err);
      setMsg({ text: "Lỗi kết nối ví: " + err.message, type: "danger" });
    } finally {
      setLoading(false);
    }
  };

  const refreshUserData = async (walletAddress, provider) => {
    try {
      // 1. Số dư ETH
      const balanceWei = await provider.getBalance(walletAddress);
      setEthBalance(parseFloat(ethers.formatEther(balanceWei)).toFixed(4));

      // 2. Token ERC-20
      const tokenContract = new ethers.Contract(contractsConfig.ClubGovToken, ClubGovTokenAbi, provider);
      const tBalance = await tokenContract.balanceOf(walletAddress);
      setTokenBalance(parseFloat(ethers.formatEther(tBalance)).toFixed(2));

      // 3. Thẻ thành viên NFT ERC-721
      const nftContract = new ethers.Contract(contractsConfig.ClubMembershipNFT, ClubMembershipNFTAbi, provider);
      const isMem = await nftContract.isMember(walletAddress);
      setHasNFT(isMem);

      // 4. Số dư Treasury
      const daoContract = new ethers.Contract(contractsConfig.ClubDAO, ClubDAOAbi, provider);
      const tWei = await daoContract.getTreasuryBalance();
      setTreasuryBalance(parseFloat(ethers.formatEther(tWei)).toFixed(3));
    } catch (e) {
      console.warn("Lỗi đọc dữ liệu on-chain:", e);
    }
  };

  const loadProposals = async (provider) => {
    try {
      const daoContract = new ethers.Contract(contractsConfig.ClubDAO, ClubDAOAbi, provider);
      const count = await daoContract.proposalCount();
      const list = [];

      for (let i = 1; i <= Number(count); i++) {
        const p = await daoContract.getProposal(i);
        list.push({
          id: Number(p[0]),
          proposer: p[1],
          recipient: p[2],
          amount: ethers.formatEther(p[3]),
          title: p[4],
          ipfsCid: p[5],
          forVotes: parseFloat(ethers.formatEther(p[6])),
          againstVotes: parseFloat(ethers.formatEther(p[7])),
          startTime: Number(p[8]),
          endTime: Number(p[9]),
          executed: p[10],
          state: Number(p[11]),
        });
      }
      setProposals(list);
    } catch (e) {
      console.warn("Chưa tải được danh sách proposal on-chain, dùng danh sách mẫu:", e);
      // Danh sách demo mẫu nếu chưa deploy contract
      setProposals([
        {
          id: 1,
          proposer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          recipient: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
          amount: "0.5",
          title: "Đề xuất mua sắm máy chiếu & thiết bị nghiên cứu AI/Blockchain",
          ipfsCid: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
          forVotes: 3000,
          againstVotes: 1000,
          startTime: Date.now() / 1000 - 400,
          endTime: Date.now() / 1000 - 100,
          executed: false,
          state: 3, // Succeeded
        }
      ]);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      provider.send("eth_accounts", []).then((accs) => {
        if (accs.length > 0) {
          setAccount(accs[0]);
          refreshUserData(accs[0], provider);
          loadProposals(provider);
        }
      });
    }
  }, []);

  // Xử lý tạo đề xuất (Tiêu chí 1 & 3 & 4)
  const handleCreateProposal = async (e) => {
    e.preventDefault();
    if (!account) return alert("Vui lòng kết nối ví trước!");
    if (!hasNFT) return alert("RÀNG BUỘC: Bạn phải sở hữu Thẻ thành viên NFT để tạo đề xuất!");

    try {
      setLoading(true);
      setMsg({ text: "1/2: Đang đẩy tài liệu lên IPFS...", type: "warning" });

      // Gọi Backend Web3.py để upload lên IPFS
      let ipfsCid = "QmDefaultProposal" + Date.now();
      try {
        const resp = await fetch("http://localhost:8000/api/ipfs/upload-proposal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle,
            description: formDescription,
            financialDetails: { amountETH: formAmount, recipient: formRecipient },
            governanceCategory: formCategory,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          ipfsCid = data.cid;
        }
      } catch (err) {
        console.warn("Backend IPFS offline, sử dụng mock CID:", err);
      }

      setMsg({ text: "2/2: Ký xác nhận giao dịch propose() trên MetaMask...", type: "warning" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const daoContract = new ethers.Contract(contractsConfig.ClubDAO, ClubDAOAbi, signer);

      const tx = await daoContract.propose(
        formRecipient,
        ethers.parseEther(formAmount),
        formTitle,
        ipfsCid
      );
      await tx.wait();

      setMsg({ text: "Tạo đề xuất thành công! CID: " + ipfsCid, type: "success" });
      setActiveTab('board');
      await loadProposals(provider);
    } catch (err) {
      console.error(err);
      setMsg({ text: "Lỗi tạo đề xuất: " + (err.reason || err.message), type: "danger" });
    } finally {
      setLoading(false);
    }
  };

  // Xử lý bỏ phiếu (Weighted voting)
  const handleVote = async (proposalId, support) => {
    if (!account) return alert("Vui lòng kết nối ví!");
    try {
      setLoading(true);
      setMsg({ text: "Đang ký biểu quyết trên MetaMask...", type: "warning" });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const daoContract = new ethers.Contract(contractsConfig.ClubDAO, ClubDAOAbi, signer);

      const tx = await daoContract.vote(proposalId, support);
      await tx.wait();

      setMsg({ text: `Bỏ phiếu ${support === 1 ? 'TÁN THÀNH' : 'PHẢN ĐỐI'} thành công!`, type: "success" });
      await loadProposals(provider);
      await refreshUserData(account, provider);
    } catch (err) {
      console.error(err);
      setMsg({ text: "Lỗi biểu quyết: " + (err.reason || err.message), type: "danger" });
    } finally {
      setLoading(false);
    }
  };

  // Xử lý Execute (Code is Law)
  const handleExecute = async (proposalId) => {
    try {
      setLoading(true);
      setMsg({ text: "Đang kích hoạt tự động giải ngân quỹ (execute)...", type: "warning" });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const daoContract = new ethers.Contract(contractsConfig.ClubDAO, ClubDAOAbi, signer);

      const tx = await daoContract.execute(proposalId);
      await tx.wait();

      setMsg({ text: `Đề xuất #${proposalId} đã được thực thi và giải ngân thành công!`, type: "success" });
      await loadProposals(provider);
      await refreshUserData(account, provider);
    } catch (err) {
      console.error(err);
      setMsg({ text: "Lỗi thực thi: " + (err.reason || err.message), type: "danger" });
    } finally {
      setLoading(false);
    }
  };

  // Xem nội dung chi tiết từ IPFS
  const fetchIpfsDetail = async (cid) => {
    setLoadingIpfs(true);
    try {
      const resp = await fetch(`http://localhost:8000/api/ipfs/${cid}`);
      if (resp.ok) {
        const data = await resp.json();
        setSelectedIpfsData(data);
      } else {
        setSelectedIpfsData({
          cid: cid,
          content: `# Tài liệu IPFS [${cid}]\n\n- File: proposal_equipments.md\n- Kế hoạch: Mua sắm máy trạm AI và ví lạnh Ledger phục vụ phòng Lab CLB Blockchain UIT.\n- Dự toán: 0.5 ETH\n- Đã được băm và lưu trữ phi tập trung.`
        });
      }
    } catch {
      setSelectedIpfsData({
        cid: cid,
        content: `Mã CID: ${cid}\nTài liệu quản trị lưu trữ phi tập trung (IPFS Gateway: https://gateway.pinata.cloud/ipfs/${cid})`
      });
    } finally {
      setLoadingIpfs(false);
    }
  };

  return (
    <div className="app-container">
      {/* NAVBAR */}
      <header className="navbar">
        <div className="brand-section">
          <div className="logo-badge">DAO</div>
          <div>
            <h1 className="brand-title">UIT Student Club DAO</h1>
            <p className="brand-sub">Hệ thống Quản trị Phi tập trung & Ngân quỹ Sinh viên (IS355)</p>
          </div>
        </div>

        <div className="wallet-section">
          {account ? (
            <>
              {hasNFT ? (
                <div className="member-badge">
                  <span>★</span> NFT Thẻ Thành Viên
                </div>
              ) : (
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  (Chưa có Thẻ NFT)
                </div>
              )}

              <div className="wallet-info">
                <span>{account.slice(0, 6)}...{account.slice(-4)}</span>
                <span className="token-balance-tag">{tokenBalance} CGT</span>
                <span style={{ color: '#10b981' }}>{ethBalance} ETH</span>
              </div>
            </>
          ) : (
            <button className="btn-connect" onClick={connectWallet} disabled={loading}>
              Kết nối MetaMask
            </button>
          )}
        </div>
      </header>

      {/* THÔNG BÁO ALERT */}
      {msg.text && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '12px',
          marginBottom: '20px',
          fontSize: '0.9rem',
          background: msg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : msg.type === 'warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(244, 63, 94, 0.15)',
          border: `1px solid ${msg.type === 'success' ? '#10b981' : msg.type === 'warning' ? '#f59e0b' : '#f43f5e'}`,
          color: msg.type === 'success' ? '#34d399' : msg.type === 'warning' ? '#fbbf24' : '#fda4af',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{msg.text}</span>
          <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setMsg({ text: '', type: '' })}>✕</button>
        </div>
      )}

      {/* STATS OVERVIEW */}
      <section className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Quỹ DAO (Treasury)</span>
          <span className="stat-value" style={{ color: '#a855f7' }}>{treasuryBalance} ETH</span>
          <span className="stat-desc">Tự động giải ngân qua Smart Contract</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Tổng Đề Xuất</span>
          <span className="stat-value">{proposals.length}</span>
          <span className="stat-desc">Đã tạo công khai on-chain</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Tỷ Lệ Quorum</span>
          <span className="stat-value" style={{ color: '#38bdf8' }}>{contractsConfig.quorumPercentage}%</span>
          <span className="stat-desc">Tối thiểu 2,000 / 10,000 CGT tham gia</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Sức Nặng Phiếu Của Bạn</span>
          <span className="stat-value" style={{ color: '#10b981' }}>{tokenBalance}</span>
          <span className="stat-desc">1 Token ERC-20 = 1 Phiếu bầu</span>
        </div>
      </section>

      {/* NAVIGATION TABS */}
      <nav className="nav-tabs">
        <button
          className={`tab-btn ${activeTab === 'board' ? 'active' : ''}`}
          onClick={() => setActiveTab('board')}
        >
          Bảng Đề Xuất (Proposal Board)
        </button>
        <button
          className={`tab-btn ${activeTab === 'propose' ? 'active' : ''}`}
          onClick={() => setActiveTab('propose')}
        >
          Tạo Đề Xuất Mới (Propose)
        </button>
        <button
          className={`tab-btn ${activeTab === 'ipfs' ? 'active' : ''}`}
          onClick={() => setActiveTab('ipfs')}
        >
          Tài Liệu Quản Trị IPFS
        </button>
      </nav>

      {/* TAB 1: PROPOSAL BOARD */}
      {activeTab === 'board' && (
        <section>
          <div className="section-header">
            <h2>Danh sách Đề xuất Biểu quyết</h2>
            <button className="btn-primary" onClick={() => setActiveTab('propose')}>
              + Tạo đề xuất mới
            </button>
          </div>

          {proposals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              Chưa có đề xuất nào được tạo. Hãy kết nối ví có Membership NFT để tạo đề xuất đầu tiên!
            </div>
          ) : (
            proposals.map((prop) => {
              const totalVotes = prop.forVotes + prop.againstVotes;
              const forPercent = totalVotes > 0 ? (prop.forVotes / totalVotes) * 100 : 0;
              const againstPercent = totalVotes > 0 ? (prop.againstVotes / totalVotes) * 100 : 0;
              const stateName = STATE_NAMES[prop.state] || 'Active';

              return (
                <div key={prop.id} className="proposal-card">
                  <div className="proposal-top">
                    <div>
                      <h3 className="proposal-title">#{prop.id}: {prop.title}</h3>
                      <div className="proposal-meta">
                        <span>Xin giải ngân: <strong style={{ color: '#a855f7' }}>{prop.amount} ETH</strong></span>
                        <span>Người nhận: <code>{prop.recipient.slice(0, 8)}...{prop.recipient.slice(-6)}</code></span>
                      </div>
                    </div>
                    <span className={`badge badge-${stateName.toLowerCase()}`}>
                      {stateName}
                    </span>
                  </div>

                  {/* THANH TIẾN ĐỘ VOTE */}
                  <div className="vote-progress-container">
                    <div className="vote-bar-labels">
                      <span style={{ color: '#34d399' }}>Tán thành: {prop.forVotes} CGT ({forPercent.toFixed(1)}%)</span>
                      <span style={{ color: '#fb7185' }}>Phản đối: {prop.againstVotes} CGT ({againstPercent.toFixed(1)}%)</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-for" style={{ width: `${forPercent}%` }}></div>
                      <div className="progress-against" style={{ width: `${againstPercent}%` }}></div>
                    </div>
                    <div className="quorum-tracker">
                      <span>Tổng phiếu bầu: {totalVotes} CGT</span>
                      <span>Mốc Quorum cần đạt: 2,000 CGT (20%) {totalVotes >= 2000 ? '✅ Đạt' : '⚠️ Chưa đủ'}</span>
                    </div>
                  </div>

                  {/* THAO TÁC */}
                  <div className="proposal-actions">
                    <button
                      className="ipfs-badge-link"
                      onClick={() => fetchIpfsDetail(prop.ipfsCid)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      📁 Xem tài liệu IPFS (CID: {prop.ipfsCid.slice(0, 10)}...)
                    </button>

                    <div className="vote-buttons">
                      {prop.state === 1 && ( // Active
                        <>
                          <button
                            className="btn-vote-for"
                            onClick={() => handleVote(prop.id, 1)}
                            disabled={loading}
                          >
                            ✓ Tán thành ({tokenBalance} phiếu)
                          </button>
                          <button
                            className="btn-vote-against"
                            onClick={() => handleVote(prop.id, 0)}
                            disabled={loading}
                          >
                            ✕ Phản đối ({tokenBalance} phiếu)
                          </button>
                        </>
                      )}

                      {prop.state === 3 && !prop.executed && ( // Succeeded
                        <button
                          className="btn-execute"
                          onClick={() => handleExecute(prop.id)}
                          disabled={loading}
                        >
                          ⚡ Kích hoạt Tự động Giải ngân (execute)
                        </button>
                      )}

                      {prop.executed && (
                        <span style={{ color: '#c084fc', fontSize: '0.88rem', fontWeight: '600' }}>
                          ✓ Đã giải ngân thành công
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* TAB 2: TẠO ĐỀ XUẤT */}
      {activeTab === 'propose' && (
        <section style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div className="section-header">
            <h2>Tạo Đề Xuất Quản Trị Mới</h2>
          </div>

          {!hasNFT && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid #f43f5e',
              padding: '16px',
              borderRadius: '12px',
              marginBottom: '20px',
              color: '#fda4af',
              fontSize: '0.88rem'
            }}>
              <strong>⚠️ RÀNG BUỘC PHÂN QUYỀN (Tiêu chí 4):</strong> Ví của bạn hiện không sở hữu Thẻ thành viên NFT (ClubMembershipNFT). Bạn chỉ có thể bỏ phiếu, không có quyền tạo đề xuất chi quỹ.
            </div>
          )}

          <form onSubmit={handleCreateProposal} className="stat-card" style={{ gap: '16px' }}>
            <div className="form-group">
              <label>Tiêu đề Đề xuất *</label>
              <input
                className="form-input"
                type="text"
                placeholder="Ví dụ: Mua sắm máy chiếu phòng Lab Blockchain"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Địa chỉ Người thụ hưởng (Vendor / Nhà cung cấp) *</label>
              <input
                className="form-input"
                type="text"
                placeholder="0x..."
                value={formRecipient}
                onChange={(e) => setFormRecipient(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Số tiền xin giải ngân từ Quỹ Treasury (ETH) *</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                placeholder="0.5"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Nội dung chi tiết & Kế hoạch (Sẽ được đẩy lên IPFS) *</label>
              <textarea
                className="form-textarea"
                placeholder="Mô tả chi tiết mục đích, thời gian thực hiện và lý do xin giải ngân ngân quỹ..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-connect"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={loading || !hasNFT}
            >
              {loading ? 'Đang xử lý...' : 'Đẩy lên IPFS & Gửi Đề Xuất on-chain'}
            </button>
          </form>
        </section>
      )}

      {/* TAB 3: IPFS HUB */}
      {activeTab === 'ipfs' && (
        <section>
          <div className="section-header">
            <h2>Tài Liệu Quản Trị Lưu Trữ Phi Tập Trung (IPFS)</h2>
          </div>
          <p style={{ color: '#94a3b8', marginBottom: '24px', fontSize: '0.9rem' }}>
            Toàn bộ văn bản quy chế, báo cáo tài chính và hồ sơ đề xuất đều được lưu trữ off-chain trên mạng lưới IPFS nhằm tiết kiệm tối đa chi phí gas on-chain theo yêu cầu Tiêu chí 3.
          </p>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">1. Governance Rules (Hiến pháp DAO)</span>
              <h4 style={{ margin: '8px 0' }}>constitution.json</h4>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Chứa quy định về Quorum 20%, thời gian bầu cử và phân quyền biểu quyết.</p>
              <button
                className="btn-secondary"
                style={{ marginTop: '12px', fontSize: '0.8rem' }}
                onClick={() => fetchIpfsDetail("QmConstitutionJSON123456789UITDAO")}
              >
                Xem chi tiết JSON
              </button>
            </div>

            <div className="stat-card">
              <span className="stat-label">2. Financial Reports (Báo cáo tài chính)</span>
              <h4 style={{ margin: '8px 0' }}>financial_report_q1.json</h4>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Bảng dự toán chi phí, báo giá đối chiếu từ các nhà cung cấp thiết bị.</p>
              <button
                className="btn-secondary"
                style={{ marginTop: '12px', fontSize: '0.8rem' }}
                onClick={() => fetchIpfsDetail("QmFinancialReportQ12026UITBlockchain")}
              >
                Xem dự toán chi phí
              </button>
            </div>

            <div className="stat-card">
              <span className="stat-label">3. Proposal Documentation</span>
              <h4 style={{ margin: '8px 0' }}>proposal_equipments.md</h4>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Kế hoạch chi tiết trang bị máy tính và thiết bị kiểm thử ví lạnh cho lab.</p>
              <button
                className="btn-secondary"
                style={{ marginTop: '12px', fontSize: '0.8rem' }}
                onClick={() => fetchIpfsDetail("QmProposalEquipmentsLab2026UIT")}
              >
                Xem văn bản Markdown
              </button>
            </div>
          </div>
        </section>
      )}

      {/* MODAL XEM CHI TIẾT IPFS */}
      {selectedIpfsData && (
        <div className="modal-overlay" onClick={() => setSelectedIpfsData(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3>Tài liệu trích xuất từ IPFS</h3>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
                onClick={() => setSelectedIpfsData(null)}
              >
                ✕
              </button>
            </div>
            
            <p style={{ fontSize: '0.8rem', color: '#38bdf8', fontFamily: 'monospace', marginBottom: '14px' }}>
              IPFS CID: {selectedIpfsData.cid}
            </p>

            <pre style={{
              background: 'rgba(0, 0, 0, 0.4)',
              padding: '16px',
              borderRadius: '10px',
              color: '#e2e8f0',
              fontFamily: 'monospace',
              fontSize: '0.82rem',
              maxHeight: '380px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap'
            }}>
              {typeof selectedIpfsData.content === 'string'
                ? selectedIpfsData.content
                : JSON.stringify(selectedIpfsData.content || selectedIpfsData, null, 2)}
            </pre>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setSelectedIpfsData(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
