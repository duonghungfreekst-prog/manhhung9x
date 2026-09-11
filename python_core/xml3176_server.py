"""
DMH_Tools - XML3176 Toolkit HTTP Server (REST API)
Integration of DoiChieu01BH_V317 into DMH_Tools
Port: 27183 (default)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json
import logging
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from io import BytesIO
import base64
import tempfile
import shutil

from xml3176_toolkit.parser import Xml3176Parser
from xml3176_toolkit.excel_io import Xml3176ExcelIO
from xml3176_toolkit.signing import XmlSigner
from xml3176_toolkit.api_client import Bhyt3176Client
from xml3176_toolkit.config import AppConfig
from xml3176_toolkit.schema import XML_STRUCTURE, DEFAULT_ORDER

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("Xml3176Server")

PORT = 27183

# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_body(rfile, headers) -> dict:
    length = int(headers.get("Content-Length", 0))
    if length == 0:
        return {}
    raw = rfile.read(length)
    ct = headers.get("Content-Type", "").lower()
    if "multipart/form-data" in ct:
        # simple multipart parse
        boundary = ct.split("boundary=")[-1].strip()
        parts = raw.split(boundary.encode())
        result = {}
        for part in parts:
            if b"filename=" in part:
                # file upload
                header_end = part.find(b"\r\n\r\n")
                if header_end > 0:
                    disp = part[:header_end].decode("utf-8", errors="ignore")
                    fname = ""
                    if "filename=\"" in disp:
                        fname = disp.split('filename="')[1].split('"')[0]
                    content = part[header_end + 4:]
                    content = content.rstrip(b"\r\n--")
                    result["_file_name"] = fname
                    result["_file_data"] = base64.b64encode(content).decode("ascii")
            elif b'name="' in part:
                header_end = part.find(b"\r\n\r\n")
                if header_end > 0:
                    disp = part[:header_end].decode("utf-8", errors="ignore")
                    name = disp.split('name="')[1].split('"')[0]
                    value = part[header_end + 4:]
                    value = value.split(b"\r\n")[0]
                    result[name] = value.decode("utf-8", errors="ignore")
        return result
    try:
        return json.loads(raw.decode("utf-8"))
    except:
        return {}

def _json_resp(handler, data: dict, status: int = 200):
    body = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)

def _read_file_from_body(body) -> tuple[str, bytes]:
    """Return (filename, file_bytes) from body."""
    if body.get("_file_data"):
        fname = body.get("_file_name", "upload.xml")
        data = base64.b64decode(body["_file_data"])
        return fname, data
    if body.get("xml_base64"):
        fname = body.get("filename", "upload.xml")
        data = base64.b64decode(body["xml_base64"])
        return fname, data
    if body.get("xml"):
        fname = body.get("filename", "upload.xml")
        data = body["xml"].encode("utf-8")
        return fname, data
    return "", b""

# ── HTTP Handler ───────────────────────────────────────────────────────────────

class Xml3176Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # suppress default logs

    def _read_body(self) -> dict:
        return _parse_body(self.rfile, self.headers)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        try:
            self._route("GET", self.path)
        except Exception as e:
            logger.error(f"GET {self.path}: {e}\n{traceback.format_exc()}")
            _json_resp(self, {"ok": False, "error": str(e)}, 500)

    def do_POST(self):
        try:
            self._route("POST", self.path)
        except Exception as e:
            logger.error(f"POST {self.path}: {e}\n{traceback.format_exc()}")
            _json_resp(self, {"ok": False, "error": str(e)}, 500)

    def _route(self, method: str, path: str):
        parsed = urlparse(path)
        route = parsed.path.rstrip("/")
        qs = parse_qs(parsed.query)

        # ── POST /api/xml3176/read ──────────────────────────────────────────
        if route == "/api/xml3176/read" and method == "POST":
            body = self._read_body()
            fname, data = _read_file_from_body(body)
            if not data:
                _json_resp(self, {"ok": False, "error": "Không có file XML"}, 400)
                return
            try:
                with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                    tmp.write(data)
                    tmp_path = tmp.name
                # write original filename for reference
                doc = Xml3176Parser.read(tmp_path)
                patients = Xml3176Parser.patient_rows(doc)
                sheets_info = []
                for loai in doc.sheet_names():
                    sheet = doc.sheets[loai]
                    sheets_info.append({
                        "loai": loai,
                        "root_tag": sheet.root_tag,
                        "list_tag": sheet.list_tag,
                        "record_tag": sheet.record_tag,
                        "columns": [c for c in sheet.columns if not c.startswith("__")],
                        "row_count": len(sheet.rows),
                    })
                os.unlink(tmp_path)
                _json_resp(self, {
                    "ok": True,
                    "filename": fname,
                    "macskcb": doc.macskcb,
                    "ngaylap": doc.ngaylap,
                    "patients": patients,
                    "sheet_count": len(sheets_info),
                    "sheets": sheets_info,
                })
            except Exception as e:
                _json_resp(self, {"ok": False, "error": str(e)}, 400)

        # ── POST /api/xml3176/to-excel ──────────────────────────────────────
        elif route == "/api/xml3176/to-excel" and method == "POST":
            body = self._read_body()
            _, data = _read_file_from_body(body)
            if not data:
                _json_resp(self, {"ok": False, "error": "Không có file XML"}, 400)
                return
            try:
                with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                    tmp.write(data)
                    tmp_xml = tmp.name
                doc = Xml3176Parser.read(tmp_xml)
                tmp_xlsx = Path(tempfile.mktemp(suffix=".xlsx"))
                Xml3176ExcelIO.export_excel(doc, str(tmp_xlsx))
                xlsx_data = tmp_xlsx.read_bytes()
                os.unlink(tmp_xml)
                os.unlink(str(tmp_xlsx))
                _json_resp(self, {
                    "ok": True,
                    "excel_base64": base64.b64encode(xlsx_data).decode("ascii"),
                    "filename": Path(fname).with_suffix(".xlsx").name,
                })
            except Exception as e:
                _json_resp(self, {"ok": False, "error": str(e)}, 400)

        # ── POST /api/xml3176/from-excel ────────────────────────────────────
        elif route == "/api/xml3176/from-excel" and method == "POST":
            body = self._read_body()
            _, data = _read_file_from_body(body)
            if not data:
                _json_resp(self, {"ok": False, "error": "Không có file Excel"}, 400)
                return
            try:
                tmp_xlsx = Path(tempfile.mktemp(suffix=".xlsx"))
                tmp_xlsx.write_bytes(data)
                macskcb = body.get("macskcb", "")
                ngaylap = body.get("ngaylap", "")
                doc = Xml3176ExcelIO.import_excel(str(tmp_xlsx), macskcb=macskcb, ngaylap=ngaylap)
                tmp_xml = Path(tempfile.mktemp(suffix=".xml"))
                Xml3176Parser.write(doc, str(tmp_xml))
                xml_data = tmp_xml.read_bytes()
                os.unlink(str(tmp_xlsx))
                os.unlink(str(tmp_xml))
                _json_resp(self, {
                    "ok": True,
                    "xml_base64": base64.b64encode(xml_data).decode("ascii"),
                    "patients": Xml3176Parser.patient_rows(doc),
                })
            except Exception as e:
                _json_resp(self, {"ok": False, "error": str(e)}, 400)

        # ── POST /api/xml3176/sign ──────────────────────────────────────────
        elif route == "/api/xml3176/sign" and method == "POST":
            body = self._read_body()
            _, data = _read_file_from_body(body)
            if not data:
                _json_resp(self, {"ok": False, "error": "Không có file XML"}, 400)
                return
            try:
                with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                    tmp.write(data)
                    tmp_xml = tmp.name
                out_xml = Path(tempfile.mktemp(suffix="_signed.xml"))
                XmlSigner.prepare_fresh_signed_for_send(tmp_xml, str(out_xml))
                signed_data = out_xml.read_bytes()
                has_sig = XmlSigner.is_already_signed(str(out_xml))
                os.unlink(tmp_xml)
                os.unlink(str(out_xml))
                _json_resp(self, {
                    "ok": True,
                    "signed_xml_base64": base64.b64encode(signed_data).decode("ascii"),
                    "has_signature": has_sig,
                })
            except ImportError:
                # no signing_service, try sign_with_exe fallback
                try:
                    signer = XmlSigner.find_default_signer()
                    if not signer:
                        _json_resp(self, {"ok": False, "error": "Không tìm thấy SignXml01BH.exe trong thư mục Signer/"}, 400)
                        return
                    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                        tmp.write(data)
                        tmp_xml = tmp.name
                    out_xml = Path(tempfile.mktemp(suffix="_signed.xml"))
                    XmlSigner.sign_with_exe(tmp_xml, str(out_xml), signer, timeout=180)
                    signed_data = out_xml.read_bytes()
                    os.unlink(tmp_xml)
                    os.unlink(str(out_xml))
                    _json_resp(self, {
                        "ok": True,
                        "signed_xml_base64": base64.b64encode(signed_data).decode("ascii"),
                    })
                except Exception as e2:
                    _json_resp(self, {"ok": False, "error": str(e2)}, 400)
            except Exception as e:
                _json_resp(self, {"ok": False, "error": str(e)}, 400)

        # ── POST /api/xml3176/send ──────────────────────────────────────────
        elif route == "/api/xml3176/send" and method == "POST":
            body = self._read_body()
            _, data = _read_file_from_body(body)
            username = body.get("username", "")
            password = body.get("password", "")
            ma_tinh = body.get("ma_tinh", "")
            ma_cskcb = body.get("ma_cskcb", "")
            loai_hoso = body.get("loai_hoso", "130")
            if not data:
                _json_resp(self, {"ok": False, "error": "Không có file XML"}, 400)
                return
            if not username or not password:
                _json_resp(self, {"ok": False, "error": "Thiếu tài khoản/mật khẩu cổng BH"}, 400)
                return
            try:
                with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                    tmp.write(data)
                    tmp_xml = tmp.name
                client = Bhyt3176Client(username, password, timeout=int(body.get("timeout", "60")))
                result = client.send_xml_3176(tmp_xml, ma_tinh, ma_cskcb, loai_hoso)
                os.unlink(tmp_xml)
                _json_resp(self, {"ok": True, "result": result})
            except Exception as e:
                _json_resp(self, {"ok": False, "error": str(e)}, 400)

        # ── POST /api/xml3176/split ─────────────────────────────────────────
        elif route == "/api/xml3176/split" and method == "POST":
            body = self._read_body()
            _, data = _read_file_from_body(body)
            if not data:
                _json_resp(self, {"ok": False, "error": "Không có file XML"}, 400)
                return
            try:
                with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                    tmp.write(data)
                    tmp_xml = tmp.name
                doc = Xml3176Parser.read(tmp_xml)
                patients = Xml3176Parser.patient_rows(doc)
                import shutil
                out_dir = Path(tempfile.mkdtemp())
                for p in patients:
                    idx = int(p.get("__HOSO_INDEX", 1))
                    from xml3176_toolkit.parser import Xml3176Parser
                    out = out_dir / f"hoso_{idx:04d}_{p.get('HO_TEN','').replace(' ','_')[:30]}.xml"
                    Xml3176Parser.write(doc, str(out), hoso_indexes=[idx])
                # zip results
                zip_path = Path(tempfile.mktemp(suffix=".zip"))
                shutil.make_archive(str(zip_path.with_suffix("")), 'zip', str(out_dir))
                zip_data = zip_path.read_bytes()
                shutil.rmtree(out_dir)
                os.unlink(tmp_xml)
                os.unlink(str(zip_path))
                _json_resp(self, {
                    "ok": True,
                    "zip_base64": base64.b64encode(zip_data).decode("ascii"),
                    "patient_count": len(patients),
                    "patients": patients,
                })
            except Exception as e:
                _json_resp(self, {"ok": False, "error": str(e)}, 400)

        # ── POST /api/xml3176/test-connect ──────────────────────────────────
        elif route == "/api/xml3176/test-connect" and method == "POST":
            body = self._read_body()
            username = body.get("username", "")
            password = body.get("password", "")
            timeout = int(body.get("timeout", "60"))
            if not username or not password:
                _json_resp(self, {"ok": False, "error": "Thiếu tài khoản/mật khẩu"}, 400)
                return
            try:
                client = Bhyt3176Client(username, password, timeout)
                result = client.take_token()
                ok = str(result.get("maKetQua", "")).strip() == "200" and bool(result.get("APIKey") or result.get("apiKey"))
                _json_resp(self, {"ok": ok, "result": result})
            except Exception as e:
                _json_resp(self, {"ok": False, "error": str(e)}, 400)

        # ── GET /api/xml3176/signer-status ──────────────────────────────────
        elif route == "/api/xml3176/signer-status" and method == "GET":
            try:
                helper = XmlSigner.find_default_signer()
                has_helper = bool(helper and os.path.exists(helper))
                # check signing_service config
                has_config = False
                try:
                    from signing_service import load_sign_config
                    cfg = load_sign_config()
                    provider = str(cfg.get("provider", "") or "").strip()
                    has_config = bool(provider)
                except:
                    pass
                _json_resp(self, {
                    "ok": True,
                    "has_signer_exe": has_helper,
                    "signer_path": helper or "",
                    "has_sign_config": has_config,
                })
            except Exception as e:
                _json_resp(self, {"ok": False, "error": str(e)}, 400)

        # ── GET /api/xml3176/config ─────────────────────────────────────────
        elif route == "/api/xml3176/config" and method == "GET":
            cfg = AppConfig.load()
            _json_resp(self, {
                "ok": True,
                "config": {
                    "ma_cskcb": cfg.ma_cskcb,
                    "username": cfg.username,
                    "ma_tinh": cfg.ma_tinh,
                    "timeout": cfg.timeout,
                    "signer_exe": cfg.signer_exe,
                    "folder_pending": cfg.folder_pending,
                    "folder_sent": cfg.folder_sent,
                    "folder_error": cfg.folder_error,
                    "move_after_send": cfg.move_after_send,
                    "auto_sign_on_export": cfg.auto_sign_on_export,
                }
            })

        # ── POST /api/xml3176/config ───────────────────────────────────────
        elif route == "/api/xml3176/config" and method == "POST":
            body = self._read_body()
            cfg = AppConfig.load()
            for key in ("username", "password", "ma_tinh", "ma_cskcb", "signer_exe",
                        "folder_pending", "folder_sent", "folder_error"):
                if key in body:
                    setattr(cfg, key, body[key])
            if "timeout" in body:
                try: cfg.timeout = int(body["timeout"])
                except: pass
            if "move_after_send" in body:
                cfg.move_after_send = bool(body["move_after_send"])
            if "auto_sign_on_export" in body:
                cfg.auto_sign_on_export = bool(body["auto_sign_on_export"])
            cfg.save()
            _json_resp(self, {"ok": True})

        # ── GET /api/ping ───────────────────────────────────────────────────
        elif route == "/api/ping" and method == "GET":
            _json_resp(self, {"pong": True})

        else:
            _json_resp(self, {"ok": False, "error": f"Route {method} {route} not found"}, 404)


# ── Server entrypoint ──────────────────────────────────────────────────────────

def run_server(port: int = PORT):
    server = HTTPServer(("127.0.0.1", port), Xml3176Handler)
    logger.info(f"[XML3176] HTTP Server khởi động tại http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("[XML3176] Đã dừng.")
    finally:
        server.server_close()


if __name__ == "__main__":
    port_arg = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(port_arg)
