"""
DMH_Tools TTS Server - Giong nu tieng Viet (da engine)
Giao tiep qua stdin/stdout JSON de Electron goi.

Thu tu uu tien:
  1. Piper TTS:        vi_VN-vivos-x_low  (offline, neural, khong can internet)
  2. edge-tts:         vi-VN-HoaiMyNeural (online, neural, dep nhat)
  3. SAPI:             Microsoft An        (offline, co san Windows)
  4. gTTS:             Google TTS          (online, fallback cuoi)
"""
import sys
import os
import io
import re
import json
import asyncio
import threading
import subprocess
import base64
import tempfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
sys.stdin  = io.TextIOWrapper(sys.stdin.buffer,  encoding='utf-8', errors='replace')

# ── Piper TTS (offline neural - uu tien cao nhat) ────────────────────────────
# Path truyen vao qua bien moi truong PIPER_EXE va PIPER_MODEL
PIPER_EXE        = os.environ.get('PIPER_EXE', '')
PIPER_MODEL      = os.environ.get('PIPER_MODEL', '')      # Giang Nam (vivos)
PIPER_MODEL_BAC  = os.environ.get('PIPER_MODEL_BAC', '')  # Giong Nu Bac (25hours)
HAS_PIPER   = bool(PIPER_EXE and os.path.isfile(PIPER_EXE)
                   and PIPER_MODEL and os.path.isfile(PIPER_MODEL))
HAS_PIPER_BAC = bool(PIPER_EXE and os.path.isfile(PIPER_EXE)
                     and PIPER_MODEL_BAC and os.path.isfile(PIPER_MODEL_BAC))

# ── edge-tts (HoaiMy Neural - online) ────────────────────────────────────────
HAS_EDGE   = False
EDGE_VOICE = 'vi-VN-HoaiMyNeural'
try:
    import edge_tts
    HAS_EDGE = True
except ImportError:
    pass

# ── Windows SAPI (Microsoft An - offline fallback) ────────────────────────────
_VI_VOICE_NAME = None
HAS_SAPI = False

def _find_vi_voice() -> str | None:
    try:
        ps = """
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.GetInstalledVoices() | ForEach-Object {
    $v = $_.VoiceInfo
    if ($v.Culture.Name -like 'vi*') { Write-Output ($v.Name) }
}
"""
        encoded = base64.b64encode(ps.encode('utf-16-le')).decode('ascii')
        result = subprocess.run(
            ['powershell', '-NonInteractive', '-NoProfile', '-EncodedCommand', encoded],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.splitlines():
            line = line.strip()
            if line:
                return line
    except Exception as e:
        sys.stderr.write(f'[TTS] find_vi_voice error: {e}\n')
    return None

_VI_VOICE_NAME = _find_vi_voice()
HAS_SAPI = _VI_VOICE_NAME is not None

# ── gTTS (fallback cuoi) ──────────────────────────────────────────────────────
HAS_GTTS = False
try:
    from gtts import gTTS
    HAS_GTTS = True
except ImportError:
    pass

# ── Lock ──────────────────────────────────────────────────────────────────────
_lock = threading.Lock()


def _ps_b64(script: str) -> str:
    return base64.b64encode(script.encode('utf-16-le')).decode('ascii')


def _play_mp3_ps(mp3_path: str) -> bool:
    """Phat file MP3/WAV qua PowerShell MediaPlayer."""
    safe = mp3_path.replace('\\', '/')
    ps = f"""
Add-Type -AssemblyName presentationCore
$p = New-Object System.Windows.Media.MediaPlayer
$p.Open([System.Uri]'{safe}')
$p.Play()
Start-Sleep -Milliseconds 400
$w = 0
while (-not $p.NaturalDuration.HasTimeSpan -and $w -lt 60) {{ Start-Sleep -Milliseconds 100; $w++ }}
if ($p.NaturalDuration.HasTimeSpan) {{
    $dur = $p.NaturalDuration.TimeSpan.TotalSeconds + 0.3
    if ($dur -gt 0.5) {{ Start-Sleep -Seconds $dur }}
}}
$p.Close()
Remove-Item '{safe}' -EA SilentlyContinue
"""
    try:
        r = subprocess.run(
            ['powershell', '-NonInteractive', '-NoProfile', '-EncodedCommand', _ps_b64(ps)],
            capture_output=True, timeout=60
        )
        return r.returncode == 0
    except Exception as e:
        sys.stderr.write(f'[PS Player] {e}\n')
        return False


# ── 1. PIPER TTS (offline neural) ───────────────────────────────────────────────
def _speak_piper(text: str, model: str = '') -> bool:
    """Phat bang Piper TTS (offline). Dung model chi dinh hoac default."""
    use_model = model if (model and os.path.isfile(model)) else PIPER_MODEL
    if not (PIPER_EXE and os.path.isfile(PIPER_EXE) and use_model and os.path.isfile(use_model)):
        return False
    tmp = None
    try:
        tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        tmp.close()
        result = subprocess.run(
            [PIPER_EXE, '--model', use_model, '--output_file', tmp.name],
            input=text.encode('utf-8'),
            capture_output=True,
            timeout=30
        )
        if result.returncode != 0:
            sys.stderr.write(f'[Piper] error: {result.stderr.decode(errors="replace")}\n')
            return False
        if not os.path.exists(tmp.name) or os.path.getsize(tmp.name) < 100:
            return False
        return _play_mp3_ps(tmp.name)
    except Exception as e:
        sys.stderr.write(f'[Piper] {e}\n')
        return False
    finally:
        if tmp:
            try:
                if os.path.exists(tmp.name):
                    os.unlink(tmp.name)
            except Exception:
                pass


# ── 2. EDGE-TTS (online HoaiMy) ───────────────────────────────────────────────
async def _edge_speak_async(text: str, mp3_path: str) -> bool:
    try:
        communicate = edge_tts.Communicate(text, EDGE_VOICE, rate='-5%', volume='+0%')
        await communicate.save(mp3_path)
        return os.path.exists(mp3_path) and os.path.getsize(mp3_path) > 500
    except Exception as e:
        sys.stderr.write(f'[edge-tts] {e}\n')
        return False


def _speak_edge(text: str) -> bool:
    tmp = None
    try:
        tmp = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
        tmp.close()
        ok = asyncio.run(_edge_speak_async(text, tmp.name))
        if not ok:
            return False
        return _play_mp3_ps(tmp.name)
    except Exception as e:
        sys.stderr.write(f'[edge] {e}\n')
        return False
    finally:
        if tmp:
            try:
                if os.path.exists(tmp.name):
                    os.unlink(tmp.name)
            except Exception:
                pass


# ── 3. SAPI (Microsoft An offline) ────────────────────────────────────────────
def _speak_sapi(text: str) -> bool:
    voice = _VI_VOICE_NAME
    safe  = text.replace("'", "\\'")
    ps = f"""
Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName presentationCore
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('{voice}')
$synth.Rate = -2
$tmp = [System.IO.Path]::GetTempFileName() -replace '\\.tmp$','.wav'
$synth.SetOutputToWaveFile($tmp)
$synth.Speak('{safe}')
$synth.Dispose()
$p = New-Object System.Windows.Media.MediaPlayer
$p.Open([System.Uri]$tmp)
$p.Play()
Start-Sleep -Milliseconds 300
$w=0
while (-not $p.NaturalDuration.HasTimeSpan -and $w -lt 50) {{ Start-Sleep -Milliseconds 100; $w++ }}
if ($p.NaturalDuration.HasTimeSpan) {{ Start-Sleep -Seconds ($p.NaturalDuration.TimeSpan.TotalSeconds + 0.3) }}
$p.Close()
Remove-Item $tmp -EA SilentlyContinue
"""
    try:
        r = subprocess.run(
            ['powershell', '-NonInteractive', '-NoProfile', '-EncodedCommand', _ps_b64(ps)],
            capture_output=True, timeout=60
        )
        return r.returncode == 0
    except Exception as e:
        sys.stderr.write(f'[SAPI] {e}\n')
        return False


# ── 4. gTTS (fallback) ────────────────────────────────────────────────────────
def _speak_gtts(text: str) -> bool:
    if not HAS_GTTS:
        return False
    tmp = None
    try:
        tmp = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
        tmp.close()
        gTTS(text=text, lang='vi', slow=False).save(tmp.name)
        return _play_mp3_ps(tmp.name)
    except Exception as e:
        sys.stderr.write(f'[gTTS] {e}\n')
        return False
    finally:
        if tmp:
            try:
                if os.path.exists(tmp.name):
                    os.unlink(tmp.name)
            except Exception:
                pass


# ── Bộ chuẩn hóa văn bản Tiếng Việt 100% cho giọng đọc ──────────────────────
DIGITS_VI = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

def _two_digits_to_vi(n: int) -> str:
    tens = n // 10
    unit = n % 10
    s = 'mười' if tens == 1 else f"{DIGITS_VI[tens]} mươi"
    if unit == 1:
        s += ' mốt' if tens > 1 else ' một'
    elif unit == 4:
        s += ' tư' if tens > 1 else ' bốn'
    elif unit == 5:
        s += ' lăm'
    elif unit > 0:
        s += f" {DIGITS_VI[unit]}"
    return s

def number_to_vietnamese_words(num: int) -> str:
    if num == 0:
        return 'không'
    num = abs(num)
    if num < 10:
        return DIGITS_VI[num]
    if num < 100:
        return _two_digits_to_vi(num)
    if num < 1000:
        hundreds = num // 100
        rem = num % 100
        s = f"{DIGITS_VI[hundreds]} trăm"
        if rem == 0:
            return s
        if rem < 10:
            s += f" linh {DIGITS_VI[rem] if rem != 4 else 'tư'}"
        else:
            s += f" {_two_digits_to_vi(rem)}"
        return s
    if num < 1000000:
        thousands = num // 1000
        rem = num % 1000
        s = f"{number_to_vietnamese_words(thousands)} nghìn"
        if rem > 0:
            s += f" {number_to_vietnamese_words(rem)}"
        return s
    if num < 1000000000:
        millions = num // 1000000
        rem = num % 1000000
        s = f"{number_to_vietnamese_words(millions)} triệu"
        if rem > 0:
            s += f" {number_to_vietnamese_words(rem)}"
        return s
    return str(num)

ABBREVIATIONS_MAP = [
    # Chức danh & Học vị
    (re.compile(r'\bBS\.?\s*CK\s*II\b', re.I), 'bác sĩ chuyên khoa hai'),
    (re.compile(r'\bBS\.?\s*CK\s*2\b', re.I), 'bác sĩ chuyên khoa hai'),
    (re.compile(r'\bBSCKII\b', re.I), 'bác sĩ chuyên khoa hai'),
    (re.compile(r'\bBSCK2\b', re.I), 'bác sĩ chuyên khoa hai'),
    (re.compile(r'\bBS\.?\s*CK\s*I\b', re.I), 'bác sĩ chuyên khoa một'),
    (re.compile(r'\bBS\.?\s*CK\s*1\b', re.I), 'bác sĩ chuyên khoa một'),
    (re.compile(r'\bBSCKI\b', re.I), 'bác sĩ chuyên khoa một'),
    (re.compile(r'\bBSCK1\b', re.I), 'bác sĩ chuyên khoa một'),
    (re.compile(r'\bCK\s*II\b', re.I), 'chuyên khoa hai'),
    (re.compile(r'\bCK\s*2\b', re.I), 'chuyên khoa hai'),
    (re.compile(r'\bCK\s*I\b', re.I), 'chuyên khoa một'),
    (re.compile(r'\bCK\s*1\b', re.I), 'chuyên khoa một'),
    (re.compile(r'\bPGS\.?\s*TS\b', re.I), 'phó giáo sư tiến sĩ'),
    (re.compile(r'\bGS\.?\s*TS\b', re.I), 'giáo sư tiến sĩ'),
    (re.compile(r'\bThS\.?\s*BS\b', re.I), 'thạc sĩ bác sĩ'),
    (re.compile(r'\bTS\.?\s*BS\b', re.I), 'tiến sĩ bác sĩ'),
    (re.compile(r'\bThS\b', re.I), 'thạc sĩ'),
    (re.compile(r'\bPGS\b', re.I), 'phó giáo sư'),
    (re.compile(r'\bGS\b', re.I), 'giáo sư'),
    (re.compile(r'\bTS\b', re.I), 'tiến sĩ'),
    (re.compile(r'\bBS\b', re.I), 'bác sĩ'),
    (re.compile(r'\bB/S\b', re.I), 'bác sĩ'),
    (re.compile(r'\bKTV\b', re.I), 'kỹ thuật viên'),
    (re.compile(r'\bĐD\b', re.I), 'điều dưỡng'),
    (re.compile(r'\bYT\b', re.I), 'y tá'),

    # Bệnh nhân, đối tượng, nghiệp vụ
    (re.compile(r'\bBN\b', re.I), 'bệnh nhân'),
    (re.compile(r'\bSTT\b', re.I), 'số thứ tự'),
    (re.compile(r'\bBHYT\b', re.I), 'bảo hiểm y tế'),
    (re.compile(r'\bKCB\b', re.I), 'khám chữa bệnh'),
    (re.compile(r'\bCLS\b', re.I), 'cận lâm sàng'),
    (re.compile(r'\bX-?Quang\b', re.I), 'ích quang'),
    (re.compile(r'\bXQ\b', re.I), 'ích quang'),
    (re.compile(r'\bX-Q\b', re.I), 'ích quang'),
    (re.compile(r'\bCT-?Scanner\b', re.I), 'chụp cắt lớp vi tính'),
    (re.compile(r'\bCT\s*Scanner\b', re.I), 'chụp cắt lớp vi tính'),
    (re.compile(r'\bMRI\b', re.I), 'cộng hưởng từ'),
    (re.compile(r'\bECG\b', re.I), 'điện tim'),
    (re.compile(r'\bEEG\b', re.I), 'điện não'),
    (re.compile(r'\bSA\b', re.I), 'siêu âm'),
    (re.compile(r'\bXN\b', re.I), 'xét nghiệm'),
    (re.compile(r'\bTMH\b', re.I), 'tai mũi họng'),
    (re.compile(r'\bRHM\b', re.I), 'răng hàm mặt'),
    (re.compile(r'\bYHCT\b', re.I), 'y học cổ truyền'),
    (re.compile(r'\bPHCN\b', re.I), 'phục hồi chức năng'),
    (re.compile(r'\bCĐHA\b', re.I), 'chẩn đoán hình ảnh'),
    (re.compile(r'\bHSTC\b', re.I), 'hồi sức tích cực'),
    (re.compile(r'\bCC\b', re.I), 'cấp cứu'),
    (re.compile(r'\bKKB\b', re.I), 'khoa khám bệnh'),
    (re.compile(r'\bKB\b', re.I), 'khám bệnh'),
    (re.compile(r'\bĐK\b', re.I), 'đăng ký'),
    (re.compile(r'\bDVKT\b', re.I), 'dịch vụ kỹ thuật'),
    (re.compile(r'\bDV\b', re.I), 'dịch vụ'),
    (re.compile(r'\bVP\b', re.I), 'viện phí'),
    (re.compile(r'\bNTP\b', re.I), 'nơi tiếp nhận'),
    (re.compile(r'\bTN\b', re.I), 'tiếp nhận'),
    (re.compile(r'\bVIP\b', re.I), 'chất lượng cao'),

    # Phòng khám & Số La Mã (từ I đến XX)
    (re.compile(r'\bPK\b', re.I), 'phòng khám'),
    (re.compile(r'\bP\.\s*', re.I), 'phòng '),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+XX\b', re.I), r'\1 hai mươi'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+XIX\b', re.I), r'\1 mười chín'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+XVIII\b', re.I), r'\1 mười tám'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+XVII\b', re.I), r'\1 mười bảy'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+XVI\b', re.I), r'\1 mười sáu'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+XV\b', re.I), r'\1 mười lăm'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+XIV\b', re.I), r'\1 mười bốn'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+XIII\b', re.I), r'\1 mười ba'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+XII\b', re.I), r'\1 mười hai'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+XI\b', re.I), r'\1 mười một'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+X\b', re.I), r'\1 mười'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+IX\b', re.I), r'\1 chín'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+VIII\b', re.I), r'\1 tám'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+VII\b', re.I), r'\1 bảy'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+VI\b', re.I), r'\1 sáu'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+V\b', re.I), r'\1 năm'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+IV\b', re.I), r'\1 bốn'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+III\b', re.I), r'\1 ba'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+II\b', re.I), r'\1 hai'),
    (re.compile(r'\b(phòng|khoa|khu|tầng)\s+I\b', re.I), r'\1 một'),

    (re.compile(r'\b(phòng|khu|cửa|bàn)\s*0+([1-9]\d*)', re.I), r'\1 \2'),
]

LETTER_SOUNDS = {
    'A': 'a', 'B': 'bê', 'C': 'xê', 'D': 'đê', 'E': 'e', 'F': 'ép',
    'G': 'gờ', 'H': 'hát', 'I': 'i', 'J': 'giê', 'K': 'ca', 'L': 'e lờ',
    'M': 'em', 'N': 'en', 'O': 'o', 'P': 'pê', 'Q': 'quy', 'R': 'e rờ',
    'S': 'ét', 'T': 'tê', 'U': 'u', 'V': 'vê', 'W': 'vê kép', 'X': 'ích',
    'Y': 'i dài', 'Z': 'dét'
}

def normalize_vietnamese_for_tts(raw_text: str) -> str:
    """Chuẩn hóa 100% tiếng Việt thuần: đổi số thành chữ, mở rộng viết tắt, phiên âm ký tự lạ."""
    if not raw_text:
        return ''
    text = raw_text.strip()
    for pat, rep in ABBREVIATIONS_MAP:
        text = pat.sub(rep, text)
    text = re.sub(r"([A-ZÀ-Ỹa-zà-ỹ])'([A-ZÀ-Ỹa-zà-ỹ])", r"\1 \2", text)
    def _sub_letter(m):
        sound = LETTER_SOUNDS.get(m.group(2).upper(), m.group(2))
        return f"{m.group(1)} {sound}"
    text = re.sub(r'(\d+)\s*([A-Za-z])\b', _sub_letter, text)
    def _sub_prefix_letter(m):
        sound = LETTER_SOUNDS.get(m.group(2).upper(), m.group(2))
        return f"{m.group(1)} {sound}"
    text = re.sub(r'\b(khu|dãy|cửa|bàn|tầng)\s+([A-Za-z])\b', _sub_prefix_letter, text, flags=re.I)
    def _sub_num(m):
        try:
            val = int(m.group(1))
            return number_to_vietnamese_words(val)
        except Exception:
            return m.group(0)
    text = re.sub(r'\b0*([1-9]\d*)\b', _sub_num, text)
    text = re.sub(r'\b0\b', 'không', text)
    text = re.sub(r'[@#$%^&*_+=\\~<>[\]{}|/]', ' ', text)
    text = re.sub(r'\s*,\s*', ', ', text)
    text = re.sub(r'\s*\.\s*', '. ', text)
    text = re.sub(r'\s*;\s*', '; ', text)
    text = re.sub(r'\s*:\s*', ': ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    if text and not text.endswith(('.', '!', '?')):
        text += '.'
    return text

# ── Main speak dispatcher ────────────────────────────────────────────────────
def speak(text: str, voice: str = 'default') -> dict:
    with _lock:
        # Chuẩn hóa 100% văn bản tiếng Việt trước khi đưa vào bất kỳ engine nào
        text = normalize_vietnamese_for_tts(text)

        # 1. Yêu cầu giọng nữ Miền Bắc (Piper 25hours)
        if voice in ('bac', 'giong_bac', 'northern', 'nu_bac', 'piper_bac') and HAS_PIPER_BAC:
            ok = _speak_piper(text, model=PIPER_MODEL_BAC)
            if ok:
                return {'ok': True, 'engine': 'piper-25hours-bac'}
            sys.stderr.write('[TTS] Piper Bac failed, fallback default\n')

        # 2. Yêu cầu Edge-TTS Hoài My (online chất lượng cao)
        if voice in ('edge', 'edge_tts', 'edge_hoaimy', 'hoaimy') and HAS_EDGE:
            ok = _speak_edge(text)
            if ok:
                return {'ok': True, 'engine': 'edge-HoaiMy'}
            sys.stderr.write('[TTS] edge-tts failed, fallback piper\n')

        # 3. Yêu cầu gTTS (Google TTS Việt Nam)
        if voice in ('gtts', 'gtts_vi', 'google') and HAS_GTTS:
            ok = _speak_gtts(text)
            if ok:
                return {'ok': True, 'engine': 'gtts'}
            sys.stderr.write('[TTS] gTTS failed, fallback piper\n')

        # 4. Piper offline mặc định (ưu tiên cao nhất - không cần internet)
        if HAS_PIPER:
            ok = _speak_piper(text)
            if ok:
                return {'ok': True, 'engine': 'piper-offline'}
            sys.stderr.write('[TTS] Piper failed, fallback edge-tts\n')

        # 5. edge-tts Hoài My
        if HAS_EDGE:
            ok = _speak_edge(text)
            if ok:
                return {'ok': True, 'engine': 'edge-HoaiMy'}
            sys.stderr.write('[TTS] edge-tts failed, fallback SAPI\n')

        # 6. Microsoft An offline (chỉ chạy nếu tìm thấy giọng Tiếng Việt trong Windows SAPI)
        if HAS_SAPI:
            ok = _speak_sapi(text)
            if ok:
                return {'ok': True, 'engine': 'sapi-An'}
            sys.stderr.write('[TTS] SAPI failed, fallback gTTS\n')

        # 7. gTTS fallback cuối
        if HAS_GTTS:
            ok = _speak_gtts(text)
            return {'ok': ok, 'engine': 'gtts'}

        return {'ok': False, 'error': 'No Vietnamese TTS engine available'}


def main():
    ready = {
        'type':  'ready',
        'piper': HAS_PIPER,
        'piper_bac': HAS_PIPER_BAC,
        'edge':  HAS_EDGE,
        'sapi':  HAS_SAPI,
        'gtts':  HAS_GTTS,
        'voice': ('piper-offline' if HAS_PIPER
                  else EDGE_VOICE if HAS_EDGE
                  else (_VI_VOICE_NAME or 'gtts')),
    }
    sys.stdout.write(json.dumps(ready) + '\n')
    sys.stdout.flush()
    sys.stderr.write(
        f'[TTS] Ready | piper={HAS_PIPER} | piper_bac={HAS_PIPER_BAC} | edge={HAS_EDGE}({EDGE_VOICE}) | '
        f'sapi={HAS_SAPI}({_VI_VOICE_NAME}) | gtts={HAS_GTTS}\n'
    )
    sys.stderr.flush()

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
        except json.JSONDecodeError:
            continue

        cmd    = req.get('cmd')
        req_id = req.get('id', 0)

        if cmd == 'speak':
            text  = str(req.get('text', '')).strip()
            voice = str(req.get('voice', 'default')).strip()
            if not text:
                resp = {'id': req_id, 'ok': False, 'error': 'empty text'}
            else:
                result = speak(text[:300], voice=voice)
                result['id'] = req_id
                resp = result
        elif cmd == 'ping':
            resp = {'id': req_id, 'ok': True, 'pong': True,
                    'engine': ready['voice']}
        elif cmd == 'status':
            resp = {'id': req_id, 'ok': True,
                    'piper': HAS_PIPER, 'piper_bac': HAS_PIPER_BAC,
                    'edge': HAS_EDGE,
                    'sapi': HAS_SAPI,  'gtts': HAS_GTTS,
                    'voice': ready['voice']}
        elif cmd == 'exit':
            break
        else:
            resp = {'id': req_id, 'ok': False, 'error': f'unknown cmd: {cmd}'}

        sys.stdout.write(json.dumps(resp) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
