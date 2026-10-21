import os
import json
import hashlib
import requests
from pathlib import Path

# Cấu hình Pinata IPFS (Nếu có API key)
PINATA_API_KEY = os.getenv("PINATA_API_KEY", "")
PINATA_SECRET_KEY = os.getenv("PINATA_SECRET_KEY", "")
PINATA_JWT = os.getenv("PINATA_JWT", "")
IPFS_GATEWAY = os.getenv("IPFS_GATEWAY", "https://gateway.pinata.cloud/ipfs/")

# Thư mục lưu trữ tài liệu IPFS cục bộ (fallback / cache)
DATA_DIR = Path(__file__).parent.parent / "ipfs_data"
CACHE_DIR = Path(__file__).parent / "ipfs_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

class IPFSService:
    def __init__(self):
        self._seed_sample_files()

    def _seed_sample_files(self):
        """Khởi tạo trước các mã CID cho tài liệu mẫu trong ipfs_data"""
        if DATA_DIR.exists():
            for file_path in DATA_DIR.glob("*.*"):
                try:
                    content = file_path.read_text(encoding="utf-8")
                    cid = self._compute_cid(content)
                    cache_file = CACHE_DIR / f"{cid}.json"
                    cache_file.write_text(json.dumps({
                        "filename": file_path.name,
                        "content": content,
                        "cid": cid
                    }, ensure_ascii=False, indent=2), encoding="utf-8")
                except Exception as e:
                    print(f"Lỗi khi seed file {file_path}: {e}")

    def _compute_cid(self, content: str) -> str:
        """Tạo mã CID giả lập chuẩn định dạng IPFS v0 (Qm...) dựa trên SHA-256"""
        sha256 = hashlib.sha256(content.encode("utf-8")).hexdigest()
        # Biến đổi thành chuỗi Qm đại diện cho IPFS CIDv0
        return f"Qm{sha256[:44]}"

    def upload_json(self, data: dict, name: str = "metadata.json") -> str:
        """Đẩy dữ liệu JSON lên IPFS"""
        content_str = json.dumps(data, ensure_ascii=False, indent=2)

        # Nếu có cấu hình Pinata JWT
        if PINATA_JWT:
            try:
                url = "https://api.pinata.cloud/pinning/pinJSONToIPFS"
                headers = {
                    "Authorization": f"Bearer {PINATA_JWT}",
                    "Content-Type": "application/json"
                }
                body = {
                    "pinataContent": data,
                    "pinataMetadata": {"name": name}
                }
                resp = requests.post(url, headers=headers, json=body, timeout=10)
                if resp.status_code == 200:
                    real_cid = resp.json().get("IpfsHash")
                    return real_cid
            except Exception as e:
                print(f"[IPFS Pinata] Gặp lỗi khi upload, chuyển sang cache local: {e}")

        # Local fallback
        cid = self._compute_cid(content_str)
        cache_file = CACHE_DIR / f"{cid}.json"
        cache_file.write_text(json.dumps({
            "filename": name,
            "content": content_str,
            "cid": cid
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        return cid

    def upload_text(self, text: str, filename: str = "document.md") -> str:
        """Đẩy văn bản / Markdown lên IPFS"""
        if PINATA_JWT:
            try:
                url = "https://api.pinata.cloud/pinning/pinFileToIPFS"
                headers = {"Authorization": f"Bearer {PINATA_JWT}"}
                files = {"file": (filename, text.encode("utf-8"))}
                resp = requests.post(url, headers=headers, files=files, timeout=10)
                if resp.status_code == 200:
                    return resp.json().get("IpfsHash")
            except Exception as e:
                print(f"[IPFS Pinata] Lỗi upload file: {e}")

        cid = self._compute_cid(text)
        cache_file = CACHE_DIR / f"{cid}.json"
        cache_file.write_text(json.dumps({
            "filename": filename,
            "content": text,
            "cid": cid
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        return cid

    def retrieve(self, cid: str) -> dict:
        """Lấy dữ liệu từ IPFS bằng CID"""
        # 1. Kiểm tra cache local trước
        cache_file = CACHE_DIR / f"{cid}.json"
        if cache_file.exists():
            try:
                return json.loads(cache_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        # 2. Thử fetch từ IPFS Gateway công khai
        for gateway in [IPFS_GATEWAY, "https://ipfs.io/ipfs/", "https://cloudflare-ipfs.com/ipfs/"]:
            try:
                resp = requests.get(f"{gateway}{cid}", timeout=5)
                if resp.status_code == 200:
                    text_data = resp.text
                    try:
                        parsed_json = json.loads(text_data)
                        return {"cid": cid, "content": text_data, "parsed": parsed_json}
                    except Exception:
                        return {"cid": cid, "content": text_data}
            except Exception:
                continue

        return {"cid": cid, "content": "Tài liệu đang được đồng bộ trên mạng lưới IPFS...", "status": "pending"}
