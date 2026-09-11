"""
DMH_Tools - Nội Soi AI 4K
Module C: AI Image Processing Pipeline
- Denoise: fastNlMeansDenoisingColored
- Upscale 4K: Real-ESRGAN (CUDA) với fallback bicubic
- Cân bằng sáng: CLAHE
- Sharpen: Unsharp Mask
"""

import cv2
import numpy as np
import gc
import time
import logging
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


def check_cuda() -> dict:
    info = {"available": False, "device_name": "CPU only", "vram_mb": 0}
    try:
        import torch
        if torch.cuda.is_available():
            info["available"] = True
            info["device_name"] = torch.cuda.get_device_name(0)
            info["vram_mb"] = torch.cuda.get_device_properties(0).total_memory // (1024 ** 2)
            logger.info(f"[AI] GPU: {info['device_name']} | VRAM: {info['vram_mb']}MB")
        else:
            logger.warning("[AI] Không tìm thấy CUDA GPU. Chạy chế độ CPU.")
    except ImportError:
        logger.warning("[AI] PyTorch chưa cài đặt.")
    return info


def load_realesrgan_model(scale: int = 4, use_gpu: bool = True) -> Optional[object]:
    """Tải Real-ESRGAN model. Weights đặt tại python_core/weights/."""
    try:
        import torch
        from realesrgan import RealESRGANer
        from basicsr.archs.rrdbnet_arch import RRDBNet

        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64,
                        num_block=23, num_grow_ch=32, scale=scale)
        weights_name = "RealESRGAN_x4plus.pth" if scale == 4 else "RealESRGAN_x2plus.pth"
        weights_path = Path(__file__).parent / "weights" / weights_name
        device = "cuda" if (use_gpu and torch.cuda.is_available()) else "cpu"

        upsampler = RealESRGANer(
            scale=scale, model_path=str(weights_path), model=model,
            tile=512, tile_pad=10, pre_pad=0,
            half=(device == "cuda"), device=device,
        )
        logger.info(f"[AI] Real-ESRGAN x{scale} loaded on {device.upper()}")
        return upsampler
    except ImportError as e:
        logger.warning(f"[AI] Real-ESRGAN chưa cài: {e}")
        return None
    except FileNotFoundError:
        logger.warning("[AI] Thiếu weights. Tải tại: https://github.com/xinntao/Real-ESRGAN/releases")
        return None
    except Exception as e:
        logger.error(f"[AI] Lỗi load model: {e}")
        return None


class AIImagePipeline:
    """Pipeline: Denoise → Upscale 4K → CLAHE → Sharpen"""

    def __init__(self, upscaler=None, enable_denoise=True,
                 enable_upscale=True, enable_clahe=True, enable_sharpen=True):
        self.upscaler = upscaler
        self.enable_denoise  = enable_denoise
        self.enable_upscale  = enable_upscale
        self.enable_clahe    = enable_clahe
        self.enable_sharpen  = enable_sharpen
        self._clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))

    def process(self, frame: np.ndarray) -> Tuple[np.ndarray, dict]:
        meta = {"steps": [], "time_ms": {}, "final_resolution": ""}
        t_total = time.time()
        img = frame.copy()
        h_orig, w_orig = img.shape[:2]

        # 1. Denoise
        if self.enable_denoise:
            t = time.time()
            img = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)
            meta["steps"].append("denoise")
            meta["time_ms"]["denoise"] = round((time.time() - t) * 1000)

        # 2. AI Upscale 4K
        if self.enable_upscale:
            t = time.time()
            if self.upscaler is not None:
                try:
                    img, _ = self.upscaler.enhance(img, outscale=4)
                    meta["steps"].append("real_esrgan_x4")
                except RuntimeError as e:
                    if "out of memory" in str(e).lower():
                        import torch; torch.cuda.empty_cache()
                        self.upscaler.tile = max(128, self.upscaler.tile // 2)
                        img, _ = self.upscaler.enhance(img, outscale=4)
                    else:
                        raise
            else:
                # Fallback bicubic (không phải AI)
                img = cv2.resize(img, (w_orig * 4, h_orig * 4), interpolation=cv2.INTER_CUBIC)
                meta["steps"].append("bicubic_fallback_x4")
            meta["time_ms"]["upscale"] = round((time.time() - t) * 1000)

        # 3. CLAHE
        if self.enable_clahe:
            t = time.time()
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b_ch = cv2.split(lab)
            l_clahe = self._clahe.apply(l)
            img = cv2.cvtColor(cv2.merge([l_clahe, a, b_ch]), cv2.COLOR_LAB2BGR)
            meta["steps"].append("clahe")
            meta["time_ms"]["clahe"] = round((time.time() - t) * 1000)

        # 4. Sharpen (Unsharp Mask)
        if self.enable_sharpen:
            t = time.time()
            blurred = cv2.GaussianBlur(img, (0, 0), sigmaX=3)
            img = cv2.addWeighted(img, 1.5, blurred, -0.5, 0)
            meta["steps"].append("sharpen")
            meta["time_ms"]["sharpen"] = round((time.time() - t) * 1000)

        h_f, w_f = img.shape[:2]
        meta["final_resolution"] = f"{w_f}x{h_f}"
        meta["time_ms"]["total"] = round((time.time() - t_total) * 1000)
        logger.info(f"[AI] Done: {meta['steps']} | {meta['time_ms']}")
        return img, meta

    def make_thumbnail(self, img: np.ndarray, max_size: int = 400) -> np.ndarray:
        h, w = img.shape[:2]
        ratio = min(max_size / w, max_size / h)
        return cv2.resize(img, (int(w * ratio), int(h * ratio)), interpolation=cv2.INTER_AREA)


def save_frame(img: np.ndarray, path: str, quality: int = 95) -> bool:
    try:
        ext = Path(path).suffix.lower()
        if ext == ".png":
            cv2.imwrite(path, img, [cv2.IMWRITE_PNG_COMPRESSION, 1])
        else:
            cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return True
    except Exception as e:
        logger.error(f"[AI] Lưu ảnh thất bại: {e}")
        return False


def release_memory(img: np.ndarray):
    """Giải phóng bộ nhớ sau xử lý AI - quan trọng khi chạy 4-8h liên tục."""
    del img
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    gpu = check_cuda()
    upscaler = load_realesrgan_model(scale=4, use_gpu=gpu["available"])
    pipeline = AIImagePipeline(upscaler=upscaler)
    test = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
    result, meta = pipeline.process(test)
    print(f"Kết quả: {meta}")
    release_memory(test)
    release_memory(result)
