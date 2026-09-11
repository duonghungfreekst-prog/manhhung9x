"""
DMH_Tools - Nội Soi AI 4K
Module B: Hệ thống Trigger đa kênh
- B1: Bàn đạp / Phím tắt (pynput)
- B2: Nhận diện hình ảnh (Template Matching + Frame Diff)
- B3: Âm thanh tiếng bíp (sounddevice + FFT)
- B4: Cổng COM / Serial (pyserial)
"""

import cv2
import numpy as np
import threading
import time
import logging
from typing import Callable, Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# B1: Trigger bằng Bàn đạp / Phím tắt (pynput)
# ─────────────────────────────────────────────────────────────────────────────
class KeyboardTrigger:
    """Lắng nghe sự kiện nhấn phím / bàn đạp USB (giả lập phím F12, Space...)."""

    def __init__(self, on_trigger: Callable, trigger_keys: list = None):
        self.on_trigger = on_trigger
        self.trigger_keys = trigger_keys or ['f12', 'f10', 'space']
        self._listener = None
        self._active = False

    def start(self):
        try:
            from pynput import keyboard

            def on_press(key):
                if not self._active:
                    return
                try:
                    key_name = key.name if hasattr(key, 'name') else str(key.char)
                    if key_name.lower() in self.trigger_keys:
                        logger.info(f"[B1] Keyboard trigger: {key_name}")
                        self.on_trigger(trigger_type='keyboard', key=key_name)
                except AttributeError:
                    pass

            self._active = True
            self._listener = keyboard.Listener(on_press=on_press)
            self._listener.start()
            logger.info(f"[B1] Keyboard trigger đang lắng nghe: {self.trigger_keys}")
        except ImportError:
            logger.warning("[B1] pynput chưa cài đặt. Chạy: pip install pynput")

    def stop(self):
        self._active = False
        if self._listener:
            self._listener.stop()


# ─────────────────────────────────────────────────────────────────────────────
# B2: Trigger bằng Nhận diện Hình Ảnh
# ─────────────────────────────────────────────────────────────────────────────
class ImageTrigger:
    """
    Hai chế độ:
    1. Template Matching: Nhận diện icon máy ảnh xuất hiện trên màn hình video
    2. Frame Diff / Freeze Detection: Phát hiện khi máy nội soi đứng hình (chụp)
    """

    def __init__(self, on_trigger: Callable,
                 template_path: Optional[str] = None,
                 freeze_threshold: float = 0.98,
                 diff_threshold: float = 5.0):
        self.on_trigger = on_trigger
        self.template_path = template_path
        self.freeze_threshold = freeze_threshold  # Tương đồng > 98% → freeze
        self.diff_threshold = diff_threshold      # Diff trung bình < 5 → freeze
        self.template = None
        self._prev_frame = None
        self._freeze_count = 0
        self._freeze_required = 5   # Số frame liên tiếp freeze để trigger
        self._cooldown_sec = 2.0
        self._last_trigger = 0.0
        self._active = False

        if template_path and cv2.imread(template_path) is not None:
            self.template = cv2.cvtColor(cv2.imread(template_path), cv2.COLOR_BGR2GRAY)
            logger.info(f"[B2] Template loaded: {template_path}")

    def start(self):
        self._active = True
        logger.info("[B2] Image trigger đã kích hoạt")

    def stop(self):
        self._active = False

    def process_frame(self, frame: np.ndarray):
        """Gọi hàm này mỗi frame từ liveview thread."""
        if not self._active:
            return
        now = time.time()
        if now - self._last_trigger < self._cooldown_sec:
            return

        # Chế độ 1: Template Matching
        if self.template is not None:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            result = cv2.matchTemplate(gray, self.template, cv2.TM_CCOEFF_NORMED)
            _, max_val, _, max_loc = cv2.minMaxLoc(result)
            if max_val > 0.80:
                logger.info(f"[B2] Template match: confidence={max_val:.2f}")
                self._fire_trigger('image_template')
                return

        # Chế độ 2: Freeze Detection (Frame Difference)
        if self._prev_frame is not None:
            diff = cv2.absdiff(frame, self._prev_frame)
            mean_diff = np.mean(diff)
            if mean_diff < self.diff_threshold:
                self._freeze_count += 1
                if self._freeze_count >= self._freeze_required:
                    logger.info(f"[B2] Freeze detected! mean_diff={mean_diff:.3f}")
                    self._fire_trigger('image_freeze')
            else:
                self._freeze_count = 0

        self._prev_frame = frame.copy()

    def _fire_trigger(self, trigger_type: str):
        self._last_trigger = time.time()
        self._freeze_count = 0
        self.on_trigger(trigger_type=trigger_type)


# ─────────────────────────────────────────────────────────────────────────────
# B3: Trigger bằng Âm thanh (Tiếng Bíp - FFT)
# ─────────────────────────────────────────────────────────────────────────────
class AudioTrigger:
    """
    Lắng nghe Microphone từ USB Capture Card.
    Phân tích FFT để nhận diện tiếng bíp đặc trưng của máy nội soi.
    """

    def __init__(self, on_trigger: Callable,
                 target_freq_hz: float = 1000.0,
                 freq_tolerance_hz: float = 200.0,
                 amplitude_threshold: float = 0.3,
                 device_index: Optional[int] = None,
                 sample_rate: int = 44100,
                 block_size: int = 2048):
        self.on_trigger = on_trigger
        self.target_freq = target_freq_hz          # Tần số tiếng bíp cần nhận diện (Hz)
        self.freq_tolerance = freq_tolerance_hz    # Biên độ cho phép
        self.amplitude_threshold = amplitude_threshold
        self.device_index = device_index
        self.sample_rate = sample_rate
        self.block_size = block_size
        self._active = False
        self._cooldown_sec = 1.5
        self._last_trigger = 0.0
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._active = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()
        logger.info(f"[B3] Audio trigger đang lắng nghe tần số {self.target_freq}Hz ±{self.freq_tolerance}Hz")

    def stop(self):
        self._active = False

    def _listen_loop(self):
        try:
            import sounddevice as sd
            from scipy.fft import rfft, rfftfreq

            def audio_callback(indata, frames, t, status):
                if not self._active:
                    return
                if time.time() - self._last_trigger < self._cooldown_sec:
                    return

                mono = indata[:, 0] if indata.ndim > 1 else indata.flatten()
                rms = np.sqrt(np.mean(mono ** 2))
                if rms < 0.01:   # Quá yên tĩnh, bỏ qua
                    return

                # FFT phân tích tần số
                spectrum = np.abs(rfft(mono))
                freqs = rfftfreq(len(mono), 1.0 / self.sample_rate)

                # Tìm tần số có biên độ cao nhất trong dải mục tiêu
                mask = (freqs >= self.target_freq - self.freq_tolerance) & \
                       (freqs <= self.target_freq + self.freq_tolerance)
                if not np.any(mask):
                    return

                peak_amplitude = np.max(spectrum[mask])
                global_max = np.max(spectrum)
                if global_max == 0:
                    return

                ratio = peak_amplitude / global_max
                if ratio > self.amplitude_threshold:
                    logger.info(f"[B3] Tiếng bíp nhận diện: {self.target_freq}Hz, ratio={ratio:.2f}")
                    self._last_trigger = time.time()
                    self.on_trigger(trigger_type='audio', frequency=self.target_freq)

            kwargs = {"callback": audio_callback, "channels": 1,
                      "samplerate": self.sample_rate, "blocksize": self.block_size}
            if self.device_index is not None:
                kwargs["device"] = self.device_index

            with sd.InputStream(**kwargs):
                while self._active:
                    sd.sleep(100)

        except ImportError:
            logger.warning("[B3] sounddevice hoặc scipy chưa cài đặt.")
        except Exception as e:
            logger.error(f"[B3] Lỗi audio trigger: {e}")

    @staticmethod
    def list_audio_devices() -> list:
        """Liệt kê tất cả thiết bị âm thanh để người dùng chọn."""
        try:
            import sounddevice as sd
            devices = sd.query_devices()
            return [{"index": i, "name": d["name"], "inputs": d["max_input_channels"]}
                    for i, d in enumerate(devices) if d["max_input_channels"] > 0]
        except ImportError:
            return []


# ─────────────────────────────────────────────────────────────────────────────
# B4: Trigger bằng Cổng COM / Serial
# ─────────────────────────────────────────────────────────────────────────────
class SerialTrigger:
    """
    Mở kết nối Serial để nhận mã điều khiển từ bộ xử lý nội soi.
    Thường là chuỗi ký tự đặc biệt khi nhấn nút chụp trên thiết bị.
    """

    def __init__(self, on_trigger: Callable,
                 port: str = "COM3",
                 baudrate: int = 9600,
                 trigger_strings: list = None):
        self.on_trigger = on_trigger
        self.port = port
        self.baudrate = baudrate
        self.trigger_strings = trigger_strings or ["CAPTURE", "SNAP", "PHOTO", "01"]
        self._active = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._active = True
        self._thread = threading.Thread(target=self._serial_loop, daemon=True)
        self._thread.start()
        logger.info(f"[B4] Serial trigger: {self.port} @ {self.baudrate}baud")

    def stop(self):
        self._active = False

    def _serial_loop(self):
        try:
            import serial
            with serial.Serial(self.port, self.baudrate, timeout=1) as ser:
                logger.info(f"[B4] Đã mở cổng {self.port}")
                while self._active:
                    try:
                        line = ser.readline().decode('utf-8', errors='ignore').strip()
                        if not line:
                            continue
                        logger.debug(f"[B4] Serial nhận: {line!r}")
                        for trigger_str in self.trigger_strings:
                            if trigger_str.upper() in line.upper():
                                logger.info(f"[B4] Serial trigger: '{line}'")
                                self.on_trigger(trigger_type='serial', data=line)
                                break
                    except Exception as e:
                        logger.warning(f"[B4] Serial read error: {e}")
                        time.sleep(0.1)
        except ImportError:
            logger.warning("[B4] pyserial chưa cài đặt. Chạy: pip install pyserial")
        except Exception as e:
            logger.error(f"[B4] Không thể mở cổng {self.port}: {e}")

    @staticmethod
    def list_com_ports() -> list:
        """Liệt kê tất cả cổng COM đang có trên máy."""
        try:
            import serial.tools.list_ports
            return [{"port": p.device, "description": p.description}
                    for p in serial.tools.list_ports.comports()]
        except ImportError:
            return []


# ─────────────────────────────────────────────────────────────────────────────
# Manager tổng hợp tất cả Trigger
# ─────────────────────────────────────────────────────────────────────────────
class TriggerManager:
    """Quản lý và điều phối tất cả các trigger."""

    def __init__(self, on_trigger: Callable):
        self.on_trigger = on_trigger
        self.keyboard = KeyboardTrigger(on_trigger=self._dispatch, trigger_keys=['f12', 'f10', 'space'])
        self.image    = ImageTrigger(on_trigger=self._dispatch)
        self.audio    = AudioTrigger(on_trigger=self._dispatch, target_freq_hz=1000.0)
        self.serial   = SerialTrigger(on_trigger=self._dispatch)
        self._enabled = {"keyboard": True, "image": True, "audio": False, "serial": False}

    def _dispatch(self, trigger_type: str = "unknown", **kwargs):
        logger.info(f"[TRIGGER] Fired: type={trigger_type}, args={kwargs}")
        self.on_trigger(trigger_type=trigger_type, **kwargs)

    def configure(self, keyboard=True, image=True, audio=False, serial=False,
                  audio_freq=1000.0, serial_port="COM3", template_path=None):
        self._enabled = {"keyboard": keyboard, "image": image, "audio": audio, "serial": serial}
        self.audio.target_freq = audio_freq
        self.serial.port = serial_port
        if template_path:
            self.image.template_path = template_path

    def start_all(self):
        if self._enabled["keyboard"]:
            self.keyboard.start()
        if self._enabled["image"]:
            self.image.start()
        if self._enabled["audio"]:
            self.audio.start()
        if self._enabled["serial"]:
            self.serial.start()

    def stop_all(self):
        self.keyboard.stop()
        self.image.stop()
        self.audio.stop()
        self.serial.stop()

    def process_frame(self, frame: np.ndarray):
        """Phải được gọi từ liveview thread mỗi frame."""
        if self._enabled["image"]:
            self.image.process_frame(frame)
