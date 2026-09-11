from __future__ import annotations

import base64
import hashlib
from pathlib import Path
from typing import Any, Dict, Optional

import requests


class Bhyt3176Client:
    TOKEN_URL = "https://egw.baohiemxahoi.gov.vn/api/token/take"
    SEND_XML_URL = "https://egw.baohiemxahoi.gov.vn/api/qd130/guiHoSoXmlQD3176"
    CHECKIN_URL = "https://egw.baohiemxahoi.gov.vn/api/qd130/checkInKcbQd3176"

    def __init__(self, username: str, password: str, timeout: int = 60):
        self.username = username
        self.password_plain = password
        self.password_hash = self.md5_upper(password)
        self.timeout = timeout
        self.access_token = ""
        self.id_token = ""

    @staticmethod
    def md5_upper(value: str) -> str:
        return hashlib.md5(value.encode("utf-8")).hexdigest().upper()

    def take_token(self) -> Dict[str, Any]:
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {"username": self.username, "password": self.password_hash}
        r = requests.post(self.TOKEN_URL, headers=headers, data=data, timeout=self.timeout)
        r.raise_for_status()
        payload = r.json()
        api_key = payload.get("APIKey") or payload.get("apiKey") or {}
        self.access_token = api_key.get("access_token", "")
        self.id_token = api_key.get("id_token", "")
        return payload

    def _auth_headers(self) -> Dict[str, str]:
        if not self.access_token or not self.id_token:
            self.take_token()
        return {
            "Content-Type": "application/x-www-form-urlencoded",
            "accessToken": self.access_token,
            "tokenId": self.id_token,
            "passwordHash": self.password_hash,
        }

    def test_connect(self) -> Dict[str, Any]:
        """Lấy token để kiểm tra tài khoản/mật khẩu/cấu hình API."""
        return self.take_token()

    def send_xml_3176(self, xml_path: str | Path, ma_tinh: str, ma_cskcb: str, loai_hoso: str = "130") -> Dict[str, Any]:
        xml_path = Path(xml_path)
        file_b64 = base64.b64encode(xml_path.read_bytes()).decode("ascii")
        data = {
            "username": self.username,
            "loaiHoSo": loai_hoso,
            "maTinh": ma_tinh,
            "maCSKCB": ma_cskcb,
            "fileHSBase64": file_b64,
        }
        r = requests.post(self.SEND_XML_URL, headers=self._auth_headers(), data=data, timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def send_checkin(self, xml0_path: str | Path, ma_tinh: str, ma_cskcb: str, loai_hoso: str = "0") -> Dict[str, Any]:
        xml0_path = Path(xml0_path)
        file_b64 = base64.b64encode(xml0_path.read_bytes()).decode("ascii")
        data = {
            "username": self.username,
            "loaiHoSo": loai_hoso,
            "maTinh": ma_tinh,
            "maCSKCB": ma_cskcb,
            "fileHSBase64": file_b64,
        }
        r = requests.post(self.CHECKIN_URL, headers=self._auth_headers(), data=data, timeout=self.timeout)
        r.raise_for_status()
        return r.json()
