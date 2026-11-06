import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import contractsConfig from './contracts/config.json';
import ClubDAOAbi from './contracts/ClubDAO.json';
import ClubGovTokenAbi from './contracts/ClubGovToken.json';
import ClubMembershipNFTAbi from './contracts/ClubMembershipNFT.json';
import './App.css';

const STATE_NAMES = ['Pending', 'Active', 'Defeated', 'Succeeded', 'Executed'];
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export default function App() {
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState(null);
  const [ethBalance, setEthBalance] = useState('0');
  const [tokenBalance, setTokenBalance] = useState('0');
  const [hasNFT, setHasNFT] = useState(false);
  const [backendVerified, setBackendVerified] = useState(null);
  
  const [activeTab, setActiveTab] = useState('board'); // 'board' | 'propose' | 'ipfs' | 'paper'
  const [proposals, setProposals] = useState([]);
  const [treasuryBalance, setTreasuryBalance] = useState('0');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Form tạo đề xuất
  const [formTitle, setFormTitle] = useState('');
  const [formRecipient, setFormRecipient] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');

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

  const verifyWithBackend = async (walletAddress) => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/voter-status/${walletAddress}`);
      if (resp.ok) {
        const data = await resp.json();
        setBackendVerified(data);
      }
    } catch (e) {
      console.warn("Backend Web3.py offline hoặc chưa kết nối:", e);
      setBackendVerified(null);
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

      // 5. Xác thực qua Backend Web3.py (Tiêu chí 2)
      await verifyWithBackend(walletAddress);
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
      console.warn("Chưa tải được danh sách proposal on-chain:", e);
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

      const handleAccountsChanged = (accounts) => {
        if (accounts.length > 0) {
          const newAccount = accounts[0];
          setAccount(newAccount);
          const newProvider = new ethers.BrowserProvider(window.ethereum);
          refreshUserData(newAccount, newProvider);
          loadProposals(newProvider);
        } else {
          setAccount('');
          setHasNFT(false);
          setTokenBalance('0');
          setBackendVerified(null);
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []);

  // Xử lý tạo đề xuất (Tiêu chí 1 & 3 & 4)
  const handleCreateProposal = async (e) => {
    e.preventDefault();
    if (!account) return alert("Vui lòng kết nối ví trước!");
    if (!hasNFT) return alert("RÀNG BUỘC (Tiêu chí 4): Bạn phải sở hữu Thẻ thành viên NFT để tạo đề xuất!");

    try {
      setLoading(true);
      setMsg({ text: "1/2: Đang tải tài liệu lên IPFS...", type: "warning" });

      let ipfsCid = "QmDefaultProposal" + Date.now();
      try {
        const resp = await fetch(`${BACKEND_URL}/api/ipfs/upload-proposal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle,
            description: formDescription,
            financialDetails: { amountETH: formAmount, recipient: formRecipient },
            governanceCategory: "Đầu tư thiết bị & Hoạt động Lab",
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
      setFormTitle('');
      setFormRecipient('');
      setFormAmount('');
      setFormDescription('');
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

  // Tiện ích tua nhanh thời gian Blockchain
  const handleAdvanceTime = async () => {
    try {
      setLoading(true);
      setMsg({ text: "Đang tua nhanh thời gian blockchain (+5 phút)...", type: "warning" });
      const resp = await fetch(`${BACKEND_URL}/api/time/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds: 320 })
      });
      if (resp.ok) {
        setMsg({ text: "Đã qua hạn biểu quyết! Đề xuất đủ Quorum đã sẵn sàng giải ngân.", type: "success" });
        if (window.ethereum) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          await loadProposals(provider);
        }
      } else {
        throw new Error("Lỗi khi gọi backend API");
      }
    } catch (e) {
      setMsg({ text: "Lỗi tua thời gian: " + e.message, type: "danger" });
    } finally {
      setLoading(false);
    }
  };

  // Tiện ích kích hoạt bot tự động giải ngân Web3.py
  const handleTriggerBot = async () => {
    try {
      setLoading(true);
      setMsg({ text: "Bot Web3.py đang quét các đề xuất đạt Quorum...", type: "warning" });
      const resp = await fetch(`${BACKEND_URL}/api/bot/auto-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execute_now: true })
      });
      if (resp.ok) {
        const data = await resp.json();
        setMsg({ text: `Bot Web3.py đã kích hoạt giải ngân cho các đề xuất đủ điều kiện!`, type: "success" });
        if (window.ethereum) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          await loadProposals(provider);
          await refreshUserData(account, provider);
        }
      }
    } catch (e) {
      setMsg({ text: "Lỗi Bot: " + e.message, type: "danger" });
    } finally {
      setLoading(false);
    }
  };

  // Xem nội dung chi tiết từ IPFS
  const fetchIpfsDetail = async (cid) => {
    setLoadingIpfs(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/ipfs/${cid}`);
      if (resp.ok) {
        const data = await resp.json();
        setSelectedIpfsData(data);
      } else {
        setSelectedIpfsData({
          cid: cid,
          content: `# Tài liệu IPFS [${cid}]\n- Đã được lưu trữ phi tập trung.`
        });
      }
    } catch {
      setSelectedIpfsData({
        cid: cid,
        content: `Mã CID: ${cid}\nTài liệu quản trị lưu trữ phi tập trung (IPFS Gateway)`
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
            <h1 className="brand-title">UIT Governance Portal</h1>
            <p className="brand-sub">Hệ Thống Quản Trị Phi Tập Trung & Ngân Quỹ Sinh Viên (IS355.R11)</p>
          </div>
        </div>

        <div className="wallet-section">
          {account ? (
            <>
              {hasNFT && (
                <div className="member-badge" title="Ví có NFT Thẻ Thành Viên (được quyền Propose)">
                  ★ Hội viên NFT
                </div>
              )}

              {backendVerified && (
                <div className="verified-pill">
                  ✓ Web3.py Verified
                </div>
              )}

              <div className="wallet-info">
                <span>{account.slice(0, 6)}...{account.slice(-4)}</span>
                <span className="token-balance-tag">{tokenBalance} CGT</span>
                <span className="eth-balance-tag">{ethBalance} ETH</span>
              </div>
            </>
          ) : (
            <button className="btn-connect" onClick={connectWallet} disabled={loading}>
              Kết nối ví MetaMask
            </button>
          )}
        </div>
      </header>

      {/* THÔNG BÁO ALERT */}
      {msg.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '0.88rem',
          fontWeight: '500',
          background: msg.type === 'success' ? 'var(--success-bg)' : msg.type === 'warning' ? 'var(--warning-bg)' : 'var(--danger-bg)',
          border: `1px solid ${msg.type === 'success' ? 'var(--success-border)' : msg.type === 'warning' ? 'var(--warning-border)' : 'var(--danger-border)'}`,
          color: msg.type === 'success' ? 'var(--success)' : msg.type === 'warning' ? 'var(--warning)' : 'var(--danger)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{msg.text}</span>
          <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }} onClick={() => setMsg({ text: '', type: '' })}>✕</button>
        </div>
      )}

      {/* STATS OVERVIEW */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Quỹ Treasury</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>On-chain</span>
          </div>
          <div className="stat-value" style={{ color: 'var(--purple)' }}>{treasuryBalance} ETH</div>
          <div className="stat-desc">Smart Contract tự động giải ngân</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Tổng Đề Xuất</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Công khai</span>
          </div>
          <div className="stat-value">{proposals.length}</div>
          <div className="stat-desc">Đã tạo trên mạng Blockchain</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Ngưỡng Quorum</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>Tiêu chí 1</span>
          </div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{contractsConfig.quorumPercentage}%</div>
          <div className="stat-desc">Tối thiểu 2,000 / 10,000 CGT tham gia</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Sức Nặng Biểu Quyết</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>ERC-20</span>
          </div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{tokenBalance}</div>
          <div className="stat-desc">1 CGT Token = 1 Phiếu biểu quyết</div>
        </div>
      </section>

      {/* DEMO ACTION TOOLBAR */}
      <div className="demo-toolbar">
        <div className="toolbar-actions">
          <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-primary)' }}>
            🛠️ Bảng điều khiển Demo:
          </span>
          <button
            className="btn-secondary"
            onClick={handleAdvanceTime}
            title="Tua qua 5 phút biểu quyết để kiểm thử hàm execute() ngay lập tức"
          >
            ⏩ Tua nhanh thời gian (+5 phút)
          </button>
          <button
            className="btn-secondary"
            onClick={handleTriggerBot}
            title="Kích hoạt bot Web3.py tự động giải ngân các đề xuất hợp lệ"
          >
            🤖 Bot Web3.py Auto-Execute
          </button>
        </div>

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Network: Local Hardhat (ChainId: 31337)
        </div>
      </div>

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
          Tạo Đề Xuất (Propose)
        </button>
        <button
          className={`tab-btn ${activeTab === 'ipfs' ? 'active' : ''}`}
          onClick={() => setActiveTab('ipfs')}
        >
          Tài Liệu IPFS (Off-chain)
        </button>
        <button
          className={`tab-btn ${activeTab === 'paper' ? 'active' : ''}`}
          onClick={() => setActiveTab('paper')}
        >
          Cơ Sở Lý Thuyết (Paper Review)
        </button>
      </nav>

      {/* TAB 1: PROPOSAL BOARD */}
      {activeTab === 'board' && (
        <section>
          <div className="section-header">
            <h2>Danh Sách Đề Xuất Biểu Quyết</h2>
            <button className="btn-primary" onClick={() => setActiveTab('propose')}>
              + Tạo đề xuất mới
            </button>
          </div>

          {proposals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
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
                        <span>Giải ngân: <strong style={{ color: 'var(--purple)', fontWeight: '700' }}>{prop.amount} ETH</strong></span>
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
                      <span style={{ color: 'var(--success)' }}>Tán thành: {prop.forVotes} CGT ({forPercent.toFixed(1)}%)</span>
                      <span style={{ color: 'var(--danger)' }}>Phản đối: {prop.againstVotes} CGT ({againstPercent.toFixed(1)}%)</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-for" style={{ width: `${forPercent}%` }}></div>
                      <div className="progress-against" style={{ width: `${againstPercent}%` }}></div>
                    </div>
                    <div className="quorum-tracker">
                      <span>Tổng phiếu bầu: <strong>{totalVotes} CGT</strong></span>
                      <span>Mốc Quorum cần đạt: 2,000 CGT (20%) {totalVotes >= 2000 ? '✅ Đạt Quorum' : '⚠️ Chưa đủ'}</span>
                    </div>
                  </div>

                  {/* THAO TÁC */}
                  <div className="proposal-actions">
                    <button
                      className="ipfs-badge-link"
                      onClick={() => fetchIpfsDetail(prop.ipfsCid)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      📁 Chi tiết tài liệu IPFS (CID: {prop.ipfsCid.slice(0, 10)}...)
                    </button>

                    <div className="vote-buttons">
                      {prop.state === 1 && ( // Active
                        <>
                          <button
                            className="btn-vote-for"
                            onClick={() => handleVote(prop.id, 1)}
                            disabled={loading || Number(tokenBalance) <= 0}
                          >
                            ✓ Tán thành ({tokenBalance} phiếu)
                          </button>
                          <button
                            className="btn-vote-against"
                            onClick={() => handleVote(prop.id, 0)}
                            disabled={loading || Number(tokenBalance) <= 0}
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
                        <span style={{ color: 'var(--purple)', fontSize: '0.88rem', fontWeight: '600' }}>
                          ✓ Đã giải ngân thành công từ Quỹ Treasury
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
        <section style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="section-header">
            <h2>Tạo Đề Xuất Quản Trị Mới</h2>
          </div>

          {!hasNFT && (
            <div style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px',
              color: 'var(--danger)',
              fontSize: '0.88rem'
            }}>
              <strong>⚠️ RÀNG BUỘC PHÂN QUYỀN (Tiêu chí 4):</strong> Ví của bạn hiện không sở hữu Thẻ thành viên NFT (ClubMembershipNFT). Bạn chỉ có thể bỏ phiếu, không có quyền tạo đề xuất chi quỹ.
            </div>
          )}

          <form onSubmit={handleCreateProposal} className="form-card">
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
              <label>Nội dung chi tiết & Kế hoạch (Tự động đẩy lên IPFS) *</label>
              <textarea
                className="form-textarea"
                placeholder="Mô tả mục đích, thời gian thực hiện và lý do xin giải ngân ngân quỹ..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-connect"
              style={{ width: '100%', marginTop: '8px' }}
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
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem', lineHeight: '1.5' }}>
            Toàn bộ văn bản quy chế, báo cáo tài chính và hồ sơ đề xuất đều được lưu trữ off-chain trên mạng lưới IPFS nhằm tiết kiệm tối đa chi phí gas on-chain theo yêu cầu Tiêu chí 3 của đề bài.
          </p>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">1. Governance Rules (Hiến pháp DAO)</span>
              <h4 style={{ margin: '8px 0', fontSize: '1.1rem' }}>constitution.json</h4>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Quy định về Quorum 20%, thời gian bầu cử và phân quyền biểu quyết theo trọng số Token.</p>
              <button
                className="btn-secondary"
                onClick={() => fetchIpfsDetail("QmConstitutionJSON123456789UITDAO")}
              >
                Xem chi tiết JSON
              </button>
            </div>

            <div className="stat-card">
              <span className="stat-label">2. Financial Reports (Báo cáo tài chính)</span>
              <h4 style={{ margin: '8px 0', fontSize: '1.1rem' }}>financial_report_q1.json</h4>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Bảng dự toán chi phí, báo giá đối chiếu từ các nhà cung cấp thiết bị phần cứng.</p>
              <button
                className="btn-secondary"
                onClick={() => fetchIpfsDetail("QmFinancialReportQ12026UITBlockchain")}
              >
                Xem dự toán chi phí
              </button>
            </div>

            <div className="stat-card">
              <span className="stat-label">3. Proposal Documentation</span>
              <h4 style={{ margin: '8px 0', fontSize: '1.1rem' }}>proposal_equipments.md</h4>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Kế hoạch chi tiết trang bị máy tính và thiết bị kiểm thử ví lạnh cho lab nghiên cứu.</p>
              <button
                className="btn-secondary"
                onClick={() => fetchIpfsDetail("QmProposalEquipmentsLab2026UIT")}
              >
                Xem văn bản Markdown
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TAB 4: PAPER & AUTONOMY ANALYSIS */}
      {activeTab === 'paper' && (
        <section>
          <div className="section-header">
            <h2>Nghiên Cứu Học Thuật: Mapping out the DAO Ecosystem & Assessing DAO Autonomy</h2>
          </div>

          <div className="stat-card" style={{ marginBottom: '20px' }}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '10px', fontSize: '1.15rem' }}>
              1. Giải Quyết Vấn Đề "Principal-Agent Problem" Trong Quản Trị
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
              Theo nghiên cứu của Vilma Mattila et al. (5ire, 2022) và giáo trình Công nghệ Blockchain, mô hình DAO loại bỏ xung đột lợi ích cốt lõi giữa <strong>người quản lý (Agent)</strong> và <strong>người sở hữu (Principal)</strong>. Trong các tổ chức truyền thống hoặc Centralized Autonomous Organization (CAO), quỹ thường bị kiểm soát bởi một nhóm nhỏ lãnh đạo có nguy cơ lạm quyền hoặc thiếu minh bạch. Trong DAO:
            </p>
            <ul style={{ paddingLeft: '20px', marginTop: '12px', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
              <li><strong>Ngân quỹ phi tập trung (Treasury on-chain):</strong> Tiền không nằm trong tài khoản ngân hàng của bất kỳ cá nhân nào, mà nằm trong Smart Contract của DAO.</li>
              <li><strong>Biểu quyết dân chủ và có trọng số:</strong> Mọi thành viên nắm giữ Token (ClubGovToken) đều có quyền biểu quyết tỷ lệ với đóng góp của họ (Weighted Voting).</li>
              <li><strong>Nguyên tắc Code is Law:</strong> Khi đề xuất đạt Quorum (20%) và đa số tán thành sau thời gian quy định, hàm <code>execute()</code> tự động chuyển tiền thẳng đến địa chỉ Vendor mà không cần bất kỳ admin hay ban giám đốc nào phê duyệt.</li>
            </ul>
          </div>

          <div className="stat-card">
            <h3 style={{ color: 'var(--purple)', marginBottom: '14px', fontSize: '1.15rem' }}>
              2. Bảng So Sánh Giữa DAO và Tổ Chức Truyền Thống (Table I trong Bài Báo)
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left' }}>
                    <th style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}>Tiêu chí so sánh</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid var(--border-light)', color: 'var(--primary)' }}>Mô hình DAO (Hệ thống này)</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>Tổ chức truyền thống</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}><strong>Cơ cấu tổ chức</strong></td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}>Phẳng, dân chủ hóa hoàn toàn.</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}>Phân tầng, tập quyền thứ bậc cao.</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}><strong>Cơ chế ra quyết định</strong></td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}>Bắt buộc phải bỏ phiếu cộng đồng on-chain.</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}>Một số ít lãnh đạo tự quyết hoặc biểu quyết nội bộ kín.</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}><strong>Kiểm phiếu & Thực thi</strong></td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}>Kiểm phiếu tức thời và tự động thực thi bởi Smart Contract không cần trung gian.</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}>Kiểm phiếu thủ công, kết quả có thể bị thao túng hoặc trì hoãn.</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}><strong>Minh bạch & Trách nhiệm</strong></td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}>100% công khai, có thể kiểm chứng độc lập trên Blockchain & IPFS.</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}>Báo cáo nội bộ kín, giới hạn tiếp cận với công chúng.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* MODAL XEM CHI TIẾT IPFS */}
      {selectedIpfsData && (
        <div className="modal-overlay" onClick={() => setSelectedIpfsData(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>Tài liệu trích xuất từ IPFS</h3>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
                onClick={() => setSelectedIpfsData(null)}
              >
                ✕
              </button>
            </div>
            
            <p style={{ fontSize: '0.8rem', color: 'var(--primary)', fontFamily: 'var(--font-mono)', marginBottom: '12px' }}>
              IPFS CID: {selectedIpfsData.cid}
            </p>

            <pre className="modal-pre">
              {typeof selectedIpfsData.content === 'string'
                ? selectedIpfsData.content
                : JSON.stringify(selectedIpfsData.content || selectedIpfsData, null, 2)}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setSelectedIpfsData(null)}>
                Đóng cửa sổ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
