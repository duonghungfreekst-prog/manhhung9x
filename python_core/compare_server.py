"""
DMH_Tools - Compare Server (HTTP REST API)
Đối chiếu hồ sơ BHYT: File 01BH (nội bộ) vs File Cổng Giám Định
Port: 27185
"""
import sys, os, re, json, logging, traceback, tempfile, base64, time, threading, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from http.server import BaseHTTPRequestHandler, HTTPServer
from io import BytesIO

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("CompareServer")

PORT = 27185

# ─── Helpers ─────────────────────────────────────────────────────────────────

def remove_accents(s: str) -> str:
    """Bỏ dấu tiếng Việt: 'Mã thẻ' -> 'ma the'"""
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    ).replace('đ', 'd').replace('Đ', 'd')

def norm(v):
    """Chuẩn hóa: lowercase + bỏ dấu + collapse spaces"""
    if v is None: return ''
    s = str(v).strip().lower()
    s = re.sub(r'[\n\r]', ' ', s)
    s = remove_accents(s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def norm_key(v):
    return norm(v).replace(' ', '').replace('_', '')

def parse_date(v):
    if not v or str(v).strip() == '': return ''
    s = str(v).strip()
    m = re.match(r'^(\d{4})(\d{2})(\d{2})', s)
    if m: return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    m = re.match(r'^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', s)
    if m: return f"{m.group(1).zfill(2)}/{m.group(2).zfill(2)}/{m.group(3)}"
    return s

def parse_num(v):
    if v is None or str(v).strip() == '': return 0.0
    try: return float(re.sub(r'[,\s]', '', str(v)))
    except: return 0.0

def fmt_num(v):
    return f"{v:,.0f}" if v else "0"

# ─── Đọc Excel ────────────────────────────────────────────────────────────────

def read_excel_bytes(data: bytes):
    try:
        import openpyxl
        wb = openpyxl.load_workbook(BytesIO(data), data_only=True)
        ws = wb.active
        rows = list(ws.values)
    except Exception:
        # fallback xlrd/xlwt nếu file .xls
        raise

    # Tìm header row: row có nhiều ô có giá trị nhất trong 10 dòng đầu
    best_i, best_score = 0, 0
    for i, r in enumerate(rows[:10]):
        score = sum(1 for c in r if c is not None and str(c).strip())
        if score > best_score:
            best_score = score; best_i = i

    headers = [norm(v) for v in rows[best_i]]
    data_rows = []
    for r in rows[best_i + 1:]:
        if all(v is None or str(v).strip() == '' for v in r): continue
        data_rows.append(r)
    return headers, data_rows

# ─── Mapping cột - dùng tên KHÔNG DẤU (vì norm() đã bỏ dấu) ─────────────────
# File Cổng GĐ thực tế: STT, Mã liên kết, Mã thẻ, Mã BN, Họ tên, Ngày sinh,
#   Giới tính, Ngày vào, Ngày ra, Chẩn đoán, Tổng chi, Bệnh nhân TT,
#   Bệnh nhân CCT, Bảo hiểm TT, Ngày TT, Ngày gửi HS, Ngày đề nghị TT,
#   Trạng thái HS, Trạng thái TT, Loại HS, Mã lỗi, Miêu tả
# File 01BH thực tế: STT, HO_TEN, NGAY_SINH, GIOI_TINH, MA_THE_BHYT,
#   MA_BENH_CHINH, NGAY_VAO, NGAY_VAO_NOI_TRU, NGAY_RA, SO_NGAY_DTRI,
#   MA_LOAI_KCB, T_TONGCHI_BV, T_TONGCHI_BH, T_BHTT, T_BNCCT, T_BNTT,
#   T_NGUONKHAC, MA_CSKCB, NAM_QT, THANG_QT

PORTAL_MAP = {
    'name':        ['ho ten', 'ho va ten', 'ten benh nhan', 'ten bn', 'ho_ten', 'hovaten', 'ten'],
    'mathe':       ['ma the', 'ma the bhyt', 'so the', 'the bhyt', 'ma_the', 'so bhyt', 'ma so bhxh', 'maso bhxh', 'mathe', 'ma_the_bhyt'],
    'dob':         ['ngay sinh', 'ngaysinh', 'sinh', 'dob', 'nam sinh'],
    'gender':      ['gioi tinh', 'gioitinh', 'gt', 'sex'],
    'date_in':     ['ngay vao', 'ngayvaovien', 'ngay_vao', 'ngay kham', 'ngay nhap'],
    'date_out':    ['ngay ra', 'ngayravien', 'ngay_ra', 'ngay thanh toan', 'ngay tt'],
    'total':       ['tong chi', 'tongchi', 'tongchiphi', 'tong cp', 'tong', 'total cost', 'tong chi phi'],
    'bhyt_pay':    ['bao hiem tt', 'bhyttt', 'quybhyt', 'bhyt tra', 'bhyt thanh toan', 'quy_bhyt'],
    'bn_pay':      ['benh nhan cct', 'nguoi benh cct', 'benh nhan cung chi tra', 'benh nhan tt', 'bn tra', 'bntt'],
    'diagnosis':   ['chan doan', 'ma chan doan', 'icd', 'ma benh', 'ma_cd', 'ma_benh'],
    'ma_lk':       ['ma lien ket', 'so lan', 'lan_vao', 'solankham'],
    'ma_bn':       ['ma bn', 'ma benh nhan'],
    'trang_thai':  ['trang thai hs', 'phan loai benh', 'phan_loai_benh'],
    'bhyt_pct':    ['ty le', 'tylebhyt', 'ty_le', 'muc_huong'],
    'so_ngay':     ['so ngay dieu tri', 'so ngay dt', 'so ngay', 'so_ngay_dtri', 'songay'],
}

INTERNAL_MAP = {
    'name':        ['ho_ten', 'ho ten', 'ho va ten', 'hovaten', 'ten', 'name', 'ten benh nhan', 'ten bn'],
    'mathe':       ['ma_the_bhyt', 'ma_the', 'ma the bhyt', 'ma the', 'mathe', 'so the', 'ma bhyt', 'ma so bhxh', 'maso bhxh', 'the bhyt'],
    'dob':         ['ngay_sinh', 'ngay sinh', 'sinh', 'dob', 'nam sinh'],
    'gender':      ['gioi_tinh', 'gioi tinh', 'gt', 'gioitinh'],
    'date_in':     ['ngay_vao', 'ngay_vao_noi_tru', 'ngay vao', 'ngayvao', 'vao', 'nhap vien', 'ngay nhap'],
    'date_out':    ['ngay_ra', 'ngay ra', 'ngayra', 'ra vien', 'xuat vien', 'ngay xuat'],
    'total':       ['t_tongchi_bv', 't_tong_chi_bv', 't_tongchi_bh', 't_tong_chi_bh', 'tong chi phi', 'tongchiphi', 'tong chi', 'tong', 'total cost'],
    'bhyt_pay':    ['t_bhtt', 't_tongchi_bh', 't_tong_chi_bh', 't_bhyt', 'bao hiem', 'bhyt chi tra', 'quybhyt'],
    'bn_pay':      ['t_bncct', 't_bntt', 't_nguoi_benh', 'bntt', 'benh nhan', 'bn', 'nguoibenh'],
    'diagnosis':   ['ma_benh_chinh', 'ma_benh', 'ma benh', 'icd', 'ma cd', 'ma chan doan'],
    'loai_kcb':    ['ma_loai_kcb', 'ma loai kcb', 'loaihinh', 'loai hinh', 'loai kcb'],
    'ma_cskcb':    ['ma_cskcb', 'ma co so', 'macskcb', 'ma bv'],
    'bhyt_pct':    ['muc_huong', 'ty le', 'tylebhyt'],
    'so_ngay':     ['so_ngay_dtri', 'so ngay dieu tri', 'so ngay dt', 'so ngay'],
}

def build_mapping(headers, data_rows, field_map):
    mapping = {}
    for field, cands in field_map.items():
        matched_idx = None
        fallback_idx = None
        
        # 1. Thu thập TẤT CẢ các index khớp chính xác trước
        exact_matches = []
        for c in cands:
            indices = [i for i, h in enumerate(headers) if norm(h) == norm(c)]
            exact_matches.extend(indices)
            
        for idx in exact_matches:
            if fallback_idx is None: fallback_idx = idx
            if any(r[idx] is not None and str(r[idx]).strip() for r in data_rows[:100] if idx < len(r)):
                matched_idx = idx
                break
                
        # 2. Nếu không có cột nào có dữ liệu khớp chính xác, tìm tương đối
        if matched_idx is None:
            partial_matches = []
            for c in cands:
                indices = [i for i, h in enumerate(headers) if norm(c) in norm(h) or norm(h) in norm(c)]
                partial_matches.extend(indices)
                
            for idx in partial_matches:
                if fallback_idx is None: fallback_idx = idx
                if any(r[idx] is not None and str(r[idx]).strip() for r in data_rows[:100] if idx < len(r)):
                    matched_idx = idx
                    break
                    
        mapping[field] = matched_idx if matched_idx is not None else fallback_idx
    return mapping

def apply_map(r, mapping):
    return {f: (r[idx] if idx is not None and idx < len(r) else None) for f, idx in mapping.items()}

# ─── So sánh cặp ─────────────────────────────────────────────────────────────

FIELD_CONFIG = [
    # (field_key, label, is_num, severity, threshold)
    ('gender',    'Giới tính',         False, 'low',    None),
    ('dob',       'Ngày sinh',         False, 'medium', None),
    ('date_in',   'Ngày vào viện',     False, 'medium', None),
    ('date_out',  'Ngày ra viện',      False, 'medium', None),
    ('so_ngay',   'Số ngày điều trị',  True,  'medium', 0.1),
    ('total',     'Tổng chi phí',      True,  'high',   1.0),
    ('bhyt_pay',  'BHYT chi trả',      True,  'high',   1.0),
    ('bn_pay',    'BN chi trả',        True,  'high',   1.0),
    ('diagnosis', 'Mã chẩn đoán',      False, 'high',   None),
    ('bhyt_pct',  'Tỷ lệ BHYT (%)',    True,  'medium', 0.1),
]

def norm_gender(v):
    """Chuẩn hóa giới tính: 1→Nam, 2→Nữ, giữ nguyên nếu đã là chữ"""
    s = str(v).strip()
    if s == '1': return 'nam'
    if s == '2': return 'nu'
    return norm(s)

def compare_pair(portal, internal):
    diffs = []
    for (fkey, label, is_num, severity, threshold) in FIELD_CONFIG:
        pv = portal.get(fkey)
        iv = internal.get(fkey)
        pv_s = str(pv).strip() if pv is not None else ''
        iv_s = str(iv).strip() if iv is not None else ''
        if not pv_s or not iv_s: continue
        if is_num:
            pn, ivn = parse_num(pv), parse_num(iv)
            if abs(pn - ivn) > (threshold or 0.01):
                diffs.append({'field': label, 'portal': fmt_num(pn), 'internal': fmt_num(ivn), 'severity': severity})
        else:
            # Chuẩn hóa giới tính trước
            if fkey == 'gender':
                pv_n = norm_gender(pv_s)
                iv_n = norm_gender(iv_s)
                if pv_n != iv_n:
                    diffs.append({'field': label, 'portal': pv_s, 'internal': iv_s, 'severity': severity})
                continue
            # Chuẩn hóa ngày trước khi so
            if 'ngày' in label.lower() or 'date' in label.lower():
                pv_s = parse_date(pv_s)
                iv_s = parse_date(iv_s)
            if norm(pv_s) != norm(iv_s):
                diffs.append({'field': label, 'portal': pv_s, 'internal': iv_s, 'severity': severity})
    return diffs

def parse_date_obj(v):
    """Trả về (day, month, year) int hoặc None"""
    if not v or str(v).strip() == '': return None
    s = str(v).strip()
    m = re.match(r'^(\d{4})(\d{2})(\d{2})', s)
    if m: return (int(m.group(3)), int(m.group(2)), int(m.group(1)))
    m = re.match(r'^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', s)
    if m: return (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None

def dates_close(a, b, tolerance_days=1):
    """Hai ngày có cách nhau <= tolerance_days không?"""
    if a is None or b is None: return True  # Không có ngày → bỏ qua
    try:
        da = datetime(a[2], a[1], a[0])
        db = datetime(b[2], b[1], b[0])
        return abs((da - db).days) <= tolerance_days
    except: return True

# ─── Core compare function ────────────────────────────────────────────────────

def run_compare(portal_bytes: bytes, internal_bytes: bytes) -> dict:
    portal_headers, rows_portal   = read_excel_bytes(portal_bytes)
    internal_headers, rows_internal = read_excel_bytes(internal_bytes)

    p_map = build_mapping(portal_headers, rows_portal, PORTAL_MAP)
    i_map = build_mapping(internal_headers, rows_internal, INTERNAL_MAP)

    mapped_portal   = [apply_map(r, p_map)   for r in rows_portal]
    mapped_internal = [apply_map(r, i_map) for r in rows_internal]

    # Build index 01BH theo mã thẻ → list (có thể nhiều lần vào viện)
    internal_idx = {}  # mathe → [row, row, ...]
    for r in mapped_internal:
        code = norm_key(r.get('mathe') or '')
        if code:
            internal_idx.setdefault(code, []).append(r)

    portal_codes = set()
    matched_internal_keys = set()  # (mathe, idx) đã ghép
    results = []

    for p in mapped_portal:
        code   = norm_key(p.get('mathe') or '')
        name   = str(p.get('name') or '').strip()
        mathe  = str(p.get('mathe') or '').strip()
        din_p  = parse_date(p.get('date_in') or '')
        dout_p = parse_date(p.get('date_out') or '')
        time_range = f"{din_p} → {dout_p}" if din_p else '—'

        if code: portal_codes.add(code)

        candidates = internal_idx.get(code, [])
        if not candidates:
            results.append({
                'status': 'KHÔNG THẤY',
                'name': name, 'mathe': mathe, 'timeRange': time_range,
                'differences': [{'field': 'Trạng thái', 'portal': 'Có Cổng GĐ', 'internal': 'Không có 01/BH', 'severity': 'high'}],
                'portalData': {k: str(v) if v is not None else '' for k, v in p.items()}
            })
            continue

        # Tìm candidate khớp nhất theo ngày vào — lấy ca CÓ NGÀY GẦN NHẤT chưa bị ghép
        din_p_obj = parse_date_obj(p.get('date_in') or '')
        best = None
        best_idx_key = None
        best_diff = 9999

        for ci, cand in enumerate(candidates):
            ikey = (code, ci)
            if ikey in matched_internal_keys: continue
            din_c_obj = parse_date_obj(cand.get('date_in') or '')
            if din_p_obj is None or din_c_obj is None:
                # Không có ngày → lấy ca đầu chưa ghép
                if best is None:
                    best = cand; best_idx_key = ikey; best_diff = 9999
            else:
                try:
                    from datetime import datetime as _dt
                    diff = abs((_dt(din_p_obj[2], din_p_obj[1], din_p_obj[0]) -
                                _dt(din_c_obj[2], din_c_obj[1], din_c_obj[0])).days)
                    if diff < best_diff:
                        best_diff = diff; best = cand; best_idx_key = ikey
                except: pass

        if best is None:
            # Tất cả đã bị ghép — bệnh nhân Cổng GĐ dư
            results.append({
                'status': 'KHÔNG THẤY',
                'name': name, 'mathe': mathe, 'timeRange': time_range,
                'differences': [{'field': 'Trạng thái', 'portal': 'Có Cổng GĐ (thêm lần KCB)', 'internal': 'Không có 01/BH tương ứng', 'severity': 'high'}],
            })
            continue

        matched_internal_keys.add(best_idx_key)
        diffs = compare_pair(p, best)
        results.append({
            'status': 'KHỚP' if not diffs else 'LỆCH',
            'name': name, 'mathe': mathe, 'timeRange': time_range,
            'differences': diffs,
            'portalData':   {k: str(v) if v is not None else '' for k, v in p.items()},
            'internalData': {k: str(v) if v is not None else '' for k, v in best.items()},
        })

    # Bệnh nhân có trong 01BH nhưng không có Cổng GĐ
    for code, rows in internal_idx.items():
        for ci, r in enumerate(rows):
            if (code, ci) not in matched_internal_keys:
                name  = str(r.get('name') or '').strip()
                mathe = str(r.get('mathe') or '').strip()
                din   = parse_date(r.get('date_in') or '')
                dout  = parse_date(r.get('date_out') or '')
                results.append({
                    'status': 'KHÔNG THẤY',
                    'name': name, 'mathe': mathe,
                    'timeRange': f"{din} → {dout}" if din else '—',
                    'differences': [{'field': 'Trạng thái', 'portal': 'Không có Cổng GĐ', 'internal': 'Có 01/BH', 'severity': 'high'}],
                    'internalData': {k: str(v) if v is not None else '' for k, v in r.items()}
                })

    khop        = sum(1 for r in results if r['status'] == 'KHỚP')
    lech        = sum(1 for r in results if r['status'] == 'LỆCH')
    khong_thay  = sum(1 for r in results if r['status'] == 'KHÔNG THẤY')

    return {
        'ok': True,
        'total': len(results),
        'khop': khop,
        'lech': lech,
        'khongThay': khong_thay,
        'results': results,
        'portalCount': len(rows_portal),
        'internalCount': len(rows_internal),
    }

# ─── HTTP Server ──────────────────────────────────────────────────────────────

def _send_json(handler, code, obj):
    body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
    handler.send_response(code)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(body)))
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.end_headers()
    handler.wfile.write(body)

class CompareHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        logger.info(fmt % args)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            _send_json(self, 200, {'ok': True, 'service': 'compare_server', 'port': PORT})
        elif self.path == '/quit':
            _send_json(self, 200, {'ok': True, 'msg': 'Shutting down'})
            logger.info("Received /quit command, shutting down server...")
            def kill_me():
                time.sleep(0.5)
                os._exit(0)
            threading.Thread(target=kill_me).start()
        else:
            _send_json(self, 404, {'ok': False, 'error': 'Not found'})

    def do_POST(self):
        if self.path == '/compare':
            try:
                length = int(self.headers.get('Content-Length', 0))
                raw = self.rfile.read(length)
                body = json.loads(raw.decode('utf-8'))

                portal_b64   = body.get('portalFile', '')
                internal_b64 = body.get('internalFile', '')

                if not portal_b64 or not internal_b64:
                    _send_json(self, 400, {'ok': False, 'error': 'Thiếu portalFile hoặc internalFile'})
                    return

                portal_bytes   = base64.b64decode(portal_b64)
                internal_bytes = base64.b64decode(internal_b64)

                result = run_compare(portal_bytes, internal_bytes)
                _send_json(self, 200, result)

            except Exception as e:
                logger.error(traceback.format_exc())
                _send_json(self, 500, {'ok': False, 'error': str(e)})
        else:
            _send_json(self, 404, {'ok': False, 'error': 'Not found'})

def main():
    server = HTTPServer(('127.0.0.1', PORT), CompareHandler)
    logger.info(f"[CompareServer] Khởi động tại http://127.0.0.1:{PORT}")
    logger.info(f"[CompareServer] Endpoint: POST /compare  |  GET /health")
    server.serve_forever()

if __name__ == '__main__':
    main()
