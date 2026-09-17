"""
DMH_Tools - Nội Soi AI 4K
Module E: HTTP IPC Server (REST API)
- Electron → fetch → Python server → EndoscopyCore
- Port 27182 (mặc định)
- Tất cả endpoint trả về JSON
"""

import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
import json
import logging
import threading
import base64
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# Thêm thư mục python_core vào sys.path
sys.path.insert(0, str(Path(__file__).parent))

from endoscopy_core import EndoscopyCore
from database import (
    init_database, add_patient, get_patient, search_patients,
    list_all_patients, create_session, get_session,
    list_sessions_for_patient, get_images_for_session,
    get_favorite_images, toggle_favorite, get_stats,
)
from report_generator import export_word_report

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("EndoscopyServer")

PORT = 27182

# ── Global state (dùng class để tránh lỗi Python 3.14 global declaration) ─────
class _State:
    core: EndoscopyCore = None
    db_conn = None
    status_log: list = []
    capture_log: list = []
    lock = threading.Lock()


def _on_status(msg: str):
    with _State.lock:
        _State.status_log.append(msg)
        if len(_State.status_log) > 200:
            _State.status_log.pop(0)
    logger.info(msg)


def _on_capture_done(info: dict):
    with _State.lock:
        _State.capture_log.append(info)
        if len(_State.capture_log) > 50:
            _State.capture_log.pop(0)


def _get_db():
    if _State.db_conn is None:
        _State.db_conn = init_database()
    return _State.db_conn


# ── HTTP Handler ───────────────────────────────────────────────────────────────
class EndoscopyHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # Tắt access log mặc định

    def _cors_headers(self):
        # Chỉ cho phép localhost — tuân thủ Rule 3.4 (KHONG dung wildcard *)
        self.send_header("Access-Control-Allow-Origin", "http://localhost")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def _json_response(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _route(self, method: str, path: str):
        parsed = urlparse(path)
        route  = parsed.path.rstrip("/")
        qs     = parse_qs(parsed.query)

        # ── /api/status ───────────────────────────────────────────────────────
        if route == "/api/status" and method == "GET":
            with _State.lock:
                logs = list(_State.status_log)
                caps = list(_State.capture_log)
            self._json_response({
                "running": _State.core is not None and _State.core.is_running,
                "logs": logs[-50:],
                "captures": caps,
                "gpu_info": _State.core.gpu_info if _State.core else {},
            })

        # ── /api/cameras ──────────────────────────────────────────────────────
        elif route == "/api/cameras" and method == "GET":
            cameras = EndoscopyCore.list_cameras()
            # Luôn thêm camera giả lập cuối danh sách để tiện test
            cameras.append({"index": 999, "name": "[GIA LAP] Test Pattern Camera"})
            self._json_response({"cameras": cameras})

        # ── /api/start ────────────────────────────────────────────────────────
        elif route == "/api/start" and method == "POST":
            body = self._read_body()
            camera_index = int(body.get("camera_index", 0))
            patient_id   = body.get("patient_id")
            session_id   = body.get("session_id")
            simulate     = (camera_index == 999)  # index 999 = giả lập

            if _State.core and _State.core.is_running:
                self._json_response({"ok": False, "msg": "Đang chạy"})
                return

            with _State.lock:
                _State.status_log.clear()
                _State.capture_log.clear()

            _State.core = EndoscopyCore(
                camera_index=camera_index,
                on_status=_on_status,
                on_capture_done=_on_capture_done,
                simulate=simulate,
            )
            _State.core.start(patient_id=patient_id, session_id=session_id)
            self._json_response({"ok": True, "msg": "Giả lập" if simulate else "Đã khởi động"})

        # ── /api/stop ─────────────────────────────────────────────────────────
        elif route == "/api/stop" and method == "POST":
            if _State.core:
                _State.core.stop()
            self._json_response({"ok": True, "msg": "Đã dừng"})

        # ── /api/capture ──────────────────────────────────────────────────────
        elif route == "/api/capture" and method == "POST":
            if not _State.core or not _State.core.is_running:
                self._json_response({"ok": False, "msg": "Core chưa khởi động"}, 400)
                return
            _State.core.manual_capture()
            self._json_response({"ok": True, "msg": "Đã gửi lệnh chụp"})

        # ── /api/configure ────────────────────────────────────────────────────
        elif route == "/api/configure" and method == "POST":
            body = self._read_body()
            if _State.core:
                _State.core.configure_triggers(**body)
            self._json_response({"ok": True})

        # ── /api/thumbnail ────────────────────────────────────────────────────
        # Trả về thumbnail base64 theo đường dẫn tuyệt đối
        elif route == "/api/thumbnail" and method == "GET":
            img_path = qs.get("path", [None])[0]
            if not img_path or not Path(img_path).exists():
                self._json_response({"ok": False, "data": None})
                return
            with open(img_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
            self._json_response({"ok": True, "data": b64})

        # ─────────────────────── DATABASE API ────────────────────────────────

        # ── /api/db/stats ─────────────────────────────────────────────────────
        elif route == "/api/db/stats" and method == "GET":
            stats = get_stats(_get_db())
            self._json_response(stats)

        # ── /api/db/patients ──────────────────────────────────────────────────
        elif route == "/api/db/patients" and method == "GET":
            q = qs.get("q", [None])[0]
            if q:
                rows = search_patients(_get_db(), q)
            else:
                rows = list_all_patients(_get_db())
            self._json_response({"patients": rows})

        elif route == "/api/db/patients" and method == "POST":
            body = self._read_body()
            pid = add_patient(
                _get_db(),
                full_name=body.get("full_name", ""),
                birth_year=body.get("birth_year", ""),
                gender=body.get("gender", "Nam"),
                patient_code=body.get("patient_code", ""),
                phone=body.get("phone", ""),
            )
            patient = get_patient(_get_db(), pid)
            self._json_response({"ok": True, "patient": patient})

        # ── /api/db/sessions ──────────────────────────────────────────────────
        elif route == "/api/db/sessions" and method == "GET":
            pid = qs.get("patient_id", [None])[0]
            if not pid:
                self._json_response({"error": "Thiếu patient_id"}, 400)
                return
            sessions = list_sessions_for_patient(_get_db(), int(pid))
            self._json_response({"sessions": sessions})

        elif route == "/api/db/sessions" and method == "POST":
            body = self._read_body()
            sid = create_session(
                _get_db(),
                patient_id=int(body.get("patient_id")),
                exam_type=body.get("exam_type", "Nội soi mũi"),
                doctor_name=body.get("doctor_name", ""),
            )
            session = get_session(_get_db(), sid)
            self._json_response({"ok": True, "session": session})

        # ── /api/db/images ────────────────────────────────────────────────────
        elif route == "/api/db/images" and method == "GET":
            sid = qs.get("session_id", [None])[0]
            if not sid:
                self._json_response({"error": "Thiếu session_id"}, 400)
                return
            images = get_images_for_session(_get_db(), int(sid))
            self._json_response({"images": images})

        # ── /api/db/favorite ─────────────────────────────────────────────────
        elif route == "/api/db/favorite" and method == "POST":
            body = self._read_body()
            new_state = toggle_favorite(_get_db(), int(body["image_id"]))
            self._json_response({"ok": True, "is_favorite": new_state})

        # ── /api/report/word ─────────────────────────────────────────────────
        elif route == "/api/report/word" and method == "POST":
            body = self._read_body()
            sid = int(body.get("session_id"))
            db  = _get_db()

            session = get_session(db, sid)
            if not session:
                self._json_response({"ok": False, "msg": "Session không tồn tại"}, 404)
                return

            patient = get_patient(db, session["patient_id"])
            images  = get_favorite_images(db, sid, limit=4)
            img_paths = [i["processed_path"] for i in images if Path(i["processed_path"]).exists()]

            report_folder = Path(session["folder_path"]) / "reports"
            report_folder.mkdir(parents=True, exist_ok=True)
            from datetime import datetime
            fname = f"BaoCao_{session['exam_date'].replace('/','')}_{patient['patient_code']}.docx"
            output_path = str(report_folder / fname)

            ok = export_word_report(patient, session, img_paths, output_path)
            self._json_response({"ok": ok, "path": output_path if ok else None})

        # ── /api/ping ─────────────────────────────────────────────────────────
        elif route == "/api/ping" and method == "GET":
            self._json_response({"pong": True})

        else:
            self._json_response({"error": f"Không tìm thấy route {method} {route}"}, 404)

    def do_GET(self):
        try:
            self._route("GET", self.path)
        except Exception as e:
            logger.error(f"GET {self.path} error: {e}", exc_info=True)
            self._json_response({"error": str(e)}, 500)

    def do_POST(self):
        try:
            self._route("POST", self.path)
        except Exception as e:
            logger.error(f"POST {self.path} error: {e}", exc_info=True)
            self._json_response({"error": str(e)}, 500)


# ── Server entrypoint ─────────────────────────────────────────────────────────
def run_server(port: int = PORT):
    server = HTTPServer(("127.0.0.1", port), EndoscopyHandler)
    logger.info(f"[Server] Nội Soi AI 4K IPC Server khởi động tại http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("[Server] Đã dừng.")
    finally:
        if _State.core and _State.core.is_running:
            _State.core.stop()
        if _State.db_conn:
            _State.db_conn.close()


if __name__ == "__main__":
    port_arg = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(port_arg)
