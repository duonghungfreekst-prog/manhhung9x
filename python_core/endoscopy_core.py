"""
DMH_Tools - Nội Soi AI 4K
Main Core: Tích hợp tất cả module, xử lý đa luồng, error handling
Giai đoạn 6: Error handling, memory management, robustness
"""

import cv2
import numpy as np
import threading
import queue
import time
import logging
import gc
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional, Callable

# Import các module
from database import init_database, create_session, save_image_record, get_image_paths
from trigger_system import TriggerManager
from ai_pipeline import AIImagePipeline, load_realesrgan_model, check_cuda, save_frame, release_memory
from report_generator import create_default_template

# ── Logging setup ─────────────────────────────────────────────────────────────
log_dir = Path.home() / "DMH_NoiSoi_Data" / "logs"
log_dir.mkdir(parents=True, exist_ok=True)
log_file = log_dir / f"endoscopy_{datetime.now().strftime('%Y%m%d')}.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(str(log_file), encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ]
)
logger = logging.getLogger(__name__)


class EndoscopyCore:
    """
    Core chính của hệ thống Nội Soi AI 4K.
    Quản lý 3 luồng:
      - Thread 1: Liveview (đọc & hiển thị video)
      - Thread 2: Trigger System (lắng nghe tín hiệu chụp)
      - Thread 3: AI Processing (xử lý ảnh ngầm)
    """

    def __init__(self, camera_index: int = 0, on_frame_ready: Optional[Callable] = None,
                 on_capture_done: Optional[Callable] = None, on_status: Optional[Callable] = None,
                 simulate: bool = False):
        self.camera_index = camera_index
        self.simulate     = simulate or (camera_index == 999)
        self.on_frame_ready  = on_frame_ready
        self.on_capture_done = on_capture_done
        self.on_status       = on_status

        self.cap: Optional[cv2.VideoCapture] = None
        self.is_running = False
        self._current_frame: Optional[np.ndarray] = None
        self._frame_lock = threading.Lock()
        self._ai_queue: queue.Queue = queue.Queue(maxsize=5)

        # Phiên khám hiện tại
        self.db_conn      = None
        self.patient_id   = None
        self.session_id   = None
        self.session_folder = None

        # AI
        self.gpu_info  = {}
        self.pipeline  = None
        self.upscaler  = None

        # Triggers
        self.triggers: Optional[TriggerManager] = None

    # ── Khởi động ────────────────────────────────────────────────────────────
    def start(self, patient_id: int = None, session_id: int = None):
        if self.is_running:
            logger.warning("[Core] Đã đang chạy, bỏ qua lệnh start.")
            return

        self._emit_status("⏳ Đang khởi động...")

        # Database
        try:
            self.db_conn = init_database()
            self.patient_id  = patient_id
            self.session_id  = session_id
            if session_id:
                from database import get_session
                s = get_session(self.db_conn, session_id)
                self.session_folder = s["folder_path"] if s else None
        except Exception as e:
            logger.error(f"[Core] Lỗi database: {e}")

        # Camera (bỏ qua nếu giả lập)
        if self.simulate:
            self._emit_status("🎨 Chế độ giả lập (Test Pattern Camera) — không cần camera vật lý")
        else:
            # Thử MSMF trước (tương thích tốt hơn với DV20, capture card USB)
            # sau đó mới fallback sang DSHOW
            opened = False
            for backend_id, backend_name in [
                (cv2.CAP_MSMF,  'Media Foundation'),
                (cv2.CAP_DSHOW, 'DirectShow'),
                (cv2.CAP_ANY,   'Auto'),
            ]:
                try:
                    cap_try = cv2.VideoCapture(self.camera_index, backend_id)
                    if cap_try.isOpened():
                        self.cap = cap_try
                        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1920)
                        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
                        self.cap.set(cv2.CAP_PROP_FPS, 60)
                        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        self._emit_status(f"✅ Camera đã kết nối qua {backend_name} (Full HD 60fps)")
                        opened = True
                        break
                    cap_try.release()
                except Exception:
                    pass
            if not opened:
                self._emit_status(f"❌ Không mở được camera index={self.camera_index} (thử MSMF, DSHOW, AUTO đều thất bại)")
                return

        # AI Model (background, không block UI)
        if not self.simulate:
            threading.Thread(target=self._load_ai_model, daemon=True).start()
        else:
            self.gpu_info = {"device": "Simulate", "name": "Test Pattern"}

        # Triggers
        self.triggers = TriggerManager(on_trigger=self._on_trigger_fired)
        self.triggers.start_all()

        # Template báo cáo
        create_default_template()

        self.is_running = True

        # 3 luồng chính
        if self.simulate:
            threading.Thread(target=self._simulate_liveview_thread, daemon=True, name="SimLiveview").start()
        else:
            threading.Thread(target=self._liveview_thread, daemon=True, name="Liveview").start()
        threading.Thread(target=self._ai_worker_thread, daemon=True, name="AIWorker").start()

        self._emit_status("🚀 Hệ thống nội soi AI 4K đã sẵn sàng!")

    def stop(self):
        self._emit_status("⏹ Đang dừng hệ thống...")
        self.is_running = False
        if self.triggers:
            self.triggers.stop_all()
        time.sleep(0.5)
        if self.cap:
            self.cap.release()
            self.cap = None
        if self.db_conn:
            self.db_conn.close()
            self.db_conn = None
        gc.collect()
        self._emit_status("🛑 Đã dừng hoàn toàn.")
        logger.info("[Core] Stopped.")

    # ── Thread 1: Liveview ───────────────────────────────────────────────────
    def _liveview_thread(self):
        consecutive_failures = 0
        MAX_FAILURES = 30

        while self.is_running:
            if self.cap is None or not self.cap.isOpened():
                # GĐ6: Xử lý lỗi rút cáp USB đột ngột
                consecutive_failures += 1
                if consecutive_failures == 1:
                    logger.error("[Liveview] Mất kết nối camera!")
                    self._emit_status("⚠️ Mất kết nối camera. Đang thử kết nối lại...")
                if consecutive_failures < MAX_FAILURES:
                    time.sleep(1)
                    self._try_reconnect_camera()
                    continue
                else:
                    self._emit_status("❌ Không thể kết nối lại camera sau 30 giây.")
                    self.is_running = False
                    break

            try:
                ret, frame = self.cap.read()
                if not ret:
                    consecutive_failures += 1
                    time.sleep(0.01)
                    continue

                consecutive_failures = 0

                with self._frame_lock:
                    self._current_frame = frame

                # Gửi frame cho Image Trigger
                if self.triggers:
                    self.triggers.process_frame(frame)

                # Stream frame sang UI (encode JPEG để tiết kiệm bandwidth)
                if self.on_frame_ready:
                    _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                    self.on_frame_ready(jpeg.tobytes())

            except Exception as e:
                logger.error(f"[Liveview] Lỗi đọc frame: {e}")
                time.sleep(0.1)

    def _try_reconnect_camera(self):
        try:
            if self.cap:
                self.cap.release()
            self.cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW)
            if self.cap.isOpened():
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1920)
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                logger.info("[Liveview] Kết nối lại camera thành công.")
                self._emit_status("✅ Đã kết nối lại camera.")
        except Exception as e:
            logger.error(f"[Liveview] Reconnect thất bại: {e}")

    # ── Load AI Model (background) ────────────────────────────────────────────
    def _load_ai_model(self):
        self._emit_status("⏳ Đang tải model AI (Real-ESRGAN)...")
        self.gpu_info = check_cuda()
        self.upscaler = load_realesrgan_model(scale=4, use_gpu=self.gpu_info["available"])
        self.pipeline = AIImagePipeline(upscaler=self.upscaler)
        if self.upscaler:
            self._emit_status(f"🤖 AI 4K sẵn sàng | GPU: {self.gpu_info['device_name']}")
        else:
            self._emit_status("⚠️ AI 4K chạy chế độ CPU (thiếu CUDA hoặc weights). Upscale bằng bicubic.")

    # ── Trigger Callback ──────────────────────────────────────────────────────
    def _on_trigger_fired(self, trigger_type: str = "unknown", **kwargs):
        with self._frame_lock:
            frame = self._current_frame.copy() if self._current_frame is not None else None

        if frame is None:
            logger.warning(f"[Trigger] {trigger_type} fired nhưng chưa có frame!")
            return

        if self._ai_queue.full():
            logger.warning("[Trigger] AI queue đầy! Bỏ qua frame này.")
            self._emit_status("⚠️ Hàng đợi AI đầy, bỏ qua một ảnh.")
            return

        self._ai_queue.put((frame, trigger_type))
        self._emit_status(f"📸 Đã chụp! ({trigger_type}) — Đang xử lý AI...")
        logger.info(f"[Trigger] Queued frame from trigger: {trigger_type}")

    # ── Thread 3: AI Worker ───────────────────────────────────────────────────
    def _ai_worker_thread(self):
        """Xử lý ảnh AI ngầm, không ảnh hưởng Liveview."""
        while self.is_running:
            try:
                frame, trigger_type = self._ai_queue.get(timeout=1)
            except queue.Empty:
                continue

            try:
                self._process_and_save(frame, trigger_type)
            except Exception as e:
                logger.error(f"[AIWorker] Lỗi xử lý ảnh: {e}", exc_info=True)
                self._emit_status(f"❌ Lỗi xử lý AI: {e}")
            finally:
                release_memory(frame)
                self._ai_queue.task_done()
                gc.collect()  # GĐ6: Giải phóng bộ nhớ sau mỗi lần xử lý

    def _process_and_save(self, frame: np.ndarray, trigger_type: str):
        if self.pipeline is None:
            self.pipeline = AIImagePipeline()  # Fallback không có AI model

        t0 = time.time()
        processed, meta = self.pipeline.process(frame)
        thumbnail = self.pipeline.make_thumbnail(processed)

        ts = datetime.now().strftime("%H%M%S_%f")[:10]

        if self.session_folder:
            paths = get_image_paths(self.session_folder, ts)
        else:
            # Lưu tạm vào thư mục home nếu chưa có session
            tmp = Path.home() / "DMH_NoiSoi_Data" / "unsorted"
            tmp.mkdir(parents=True, exist_ok=True)
            paths = {
                "original":  str(tmp / f"{ts}_orig.jpg"),
                "processed": str(tmp / f"{ts}_4k.png"),
                "thumbnail": str(tmp / f"{ts}_thumb.jpg"),
            }

        save_frame(frame,     paths["original"],  quality=95)
        save_frame(processed, paths["processed"], quality=95)
        save_frame(thumbnail, paths["thumbnail"], quality=80)

        # Lưu vào DB
        if self.db_conn and self.session_id:
            save_image_record(
                self.db_conn, self.session_id,
                original_path  = paths["original"],
                processed_path = paths["processed"],
                thumbnail_path = paths["thumbnail"],
                resolution     = meta["final_resolution"],
                trigger_type   = trigger_type,
            )

        elapsed = round((time.time() - t0) * 1000)
        self._emit_status(
            f"✅ Ảnh 4K hoàn tất | {meta['final_resolution']} | {elapsed}ms | {meta['steps']}"
        )

        if self.on_capture_done:
            self.on_capture_done({
                "thumbnail_path": paths["thumbnail"],
                "processed_path": paths["processed"],
                "meta": meta,
                "trigger_type": trigger_type,
            })

    # ── Tiện ích ─────────────────────────────────────────────────────────────
    def _emit_status(self, msg: str):
        logger.info(msg)
        if self.on_status:
            self.on_status(msg)

    def configure_triggers(self, **kwargs):
        if self.triggers:
            self.triggers.configure(**kwargs)

    def manual_capture(self):
        """Chụp thủ công từ UI (nút bấm)."""
        self._on_trigger_fired(trigger_type="manual")

    # ── Simulate Liveview Thread ─────────────────────────────────────────────
    def _simulate_liveview_thread(self):
        """
        Tạo frame giả lập SMPTE color bar + overlay thông tin thời gian.
        Chạy ~30fps, push frame vào _ai_queue để có thể capture.
        """
        import random
        W, H = 1280, 720
        frame_count = 0

        # SMPTE color bars (7 cột)
        colors_top = [
            (192, 192, 192), (192, 192, 0), (0, 192, 192),
            (0, 192, 0),     (192, 0, 192), (192, 0, 0),
            (0, 0, 192),
        ]

        # Tạo nền base
        base = np.zeros((H, W, 3), dtype=np.uint8)
        col_w = W // len(colors_top)
        for i, (r, g, b) in enumerate(colors_top):
            x0, x1 = i * col_w, (i + 1) * col_w
            base[:int(H*0.7), x0:x1] = (b, g, r)   # OpenCV BGR

        while self.is_running:
            frame = base.copy()
            now = datetime.now()

            # Timestamp
            ts = now.strftime("%H:%M:%S.%f")[:12]
            cv2.putText(frame, ts, (20, H - 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)

            # Frame counter
            cv2.putText(frame, f"Frame #{frame_count}", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

            # [GIA LAP] label
            cv2.putText(frame, "[GIA LAP] Test Pattern Camera",
                        (W // 2 - 240, H - 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 200, 255), 2)

            # Nhịp tim giả (sóng sin)
            phase = frame_count / 15.0
            import math
            beat_y = int(H * 0.85 + math.sin(phase * math.pi * 2) * 20)
            cv2.circle(frame, (W // 2, beat_y), 6, (0, 0, 255), -1)

            # Lưu frame hiện tại
            with self._frame_lock:
                self._current_frame = frame

            # Ghi vào trigger để image trigger hoạt động
            if self.triggers:
                self.triggers.process_frame(frame)

            frame_count += 1
            time.sleep(1 / 30)  # 30fps

        self._emit_status("⏹ Giả lập đã dừng.")

    @staticmethod
    def list_cameras() -> list:
        """
        Liệt kê tất cả camera đang kết nối (index 0-9).
        Thử cả MSMF và DSHOW — một số camera (DV20, capture card) chỉ
        khả dụng qua Media Foundation, không qua DirectShow.
        Luôn thêm camera giả lập index 999 ở cuối.
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        import threading

        dshow_names = EndoscopyCore._get_camera_names_powershell()
        if not dshow_names:
            dshow_names = EndoscopyCore._get_dshow_device_names()

        found_lock = threading.Lock()
        found = []

        backends = [
            (cv2.CAP_MSMF,  'MSMF'),   # Media Foundation — thử trước (DV20, capture card)
            (cv2.CAP_DSHOW, 'DSHOW'),  # DirectShow — fallback
        ]

        def probe(idx):
            """Kiểm tra một index camera qua tất cả backend."""
            for backend_id, backend_name in backends:
                try:
                    cap = cv2.VideoCapture(idx, backend_id)
                    if not cap.isOpened():
                        cap.release()
                        continue
                    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)  or 0)
                    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
                    cap.release()
                    name = dshow_names.get(idx) or f"Camera {idx}"
                    res_hint = f" [{w}x{h}]" if w and h else ""
                    backend_hint = f" ({backend_name})" if backend_name == 'MSMF' else ""
                    return {"index": idx, "name": f"{name}{res_hint}{backend_hint}", "backend": backend_id}
                except Exception:
                    continue
            return None

        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = {pool.submit(probe, i): i for i in range(10)}
            for future in as_completed(futures, timeout=10):
                result = future.result()
                if result is not None:
                    with found_lock:
                        found.append(result)

        found.sort(key=lambda x: x["index"])
        # Luôn thêm camera giả lập ở cuối
        found.append({"index": 999, "name": "🎨 [GIẢ LẬP] Test Pattern Camera", "backend": cv2.CAP_ANY})
        return found

    @staticmethod
    def _get_camera_names_powershell() -> dict:
        """
        Dùng PowerShell Get-PnpDevice để lấy tên camera thật.
        Trả về dict {index: tên} theo thứ tự phát hiện.
        Đây là cách đáng tin cậy nhất trên Windows.
        """
        names: dict = {}
        try:
            import subprocess
            cmd = (
                'powershell -NonInteractive -NoProfile -Command '
                '"Get-PnpDevice -Class Camera -Status OK | '
                'Select-Object -ExpandProperty FriendlyName"'
            )
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True,
                timeout=5, encoding='utf-8', errors='replace'
            )
            if result.returncode == 0:
                lines = [l.strip() for l in result.stdout.strip().splitlines() if l.strip()]
                for i, name in enumerate(lines):
                    names[i] = name
                logger.info(f"[Camera] PowerShell found {len(names)} device(s): {list(names.values())}")
        except Exception as e:
            logger.warning(f"[Camera] PowerShell probe failed: {e}")
        return names

    @staticmethod
    def _get_dshow_device_names() -> dict:
        """
        Fallback: đọc tên camera từ Windows Registry (HKLM DirectShow class).
        """
        names: dict = {}
        try:
            import winreg
            reg_paths = [
                (winreg.HKEY_LOCAL_MACHINE,
                 r"SYSTEM\CurrentControlSet\Control\Class"
                 r"\{65E8773D-8F56-11D0-A3B9-00A0C9223196}"),
            ]
            idx = 0
            for hive, path in reg_paths:
                try:
                    hkey = winreg.OpenKey(hive, path)
                    i = 0
                    while True:
                        try:
                            sub = winreg.EnumKey(hkey, i)
                            i += 1
                            if not sub.startswith("00"):
                                continue
                            try:
                                sub_key = winreg.OpenKey(hkey, sub)
                                friendly, _ = winreg.QueryValueEx(sub_key, "FriendlyName")
                                winreg.CloseKey(sub_key)
                                if friendly:
                                    names[idx] = friendly
                                    idx += 1
                            except OSError:
                                idx += 1
                        except OSError:
                            break
                    winreg.CloseKey(hkey)
                except OSError:
                    pass
        except ImportError:
            pass
        except Exception:
            pass
        return names


# ── Entry Point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    def on_status(msg): print(f"[STATUS] {msg}")

    core = EndoscopyCore(camera_index=0, on_status=on_status)
    core.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        core.stop()
