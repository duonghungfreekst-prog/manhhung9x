"""
DMH_Tools - Nội Soi AI 4K
Module D: Quản lý Database SQLite & Cấu trúc thư mục lưu trữ
"""

import sqlite3
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any


# ── Cấu hình đường dẫn gốc lưu ảnh ──────────────────────────────────────────
DEFAULT_STORAGE_ROOT = Path(os.path.expanduser("~")) / "DMH_NoiSoi_Data"
DB_PATH = DEFAULT_STORAGE_ROOT / "patients.db"


# ── Khởi tạo Database ─────────────────────────────────────────────────────────
def init_database(db_path: Path = DB_PATH) -> sqlite3.Connection:
    """Tạo database và các bảng nếu chưa tồn tại."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row  # Trả về dict-like rows
    _create_tables(conn)
    return conn


def _create_tables(conn: sqlite3.Connection):
    cursor = conn.cursor()

    # Bảng Bệnh Nhân
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS patients (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name   TEXT NOT NULL,
            birth_year  TEXT,
            gender      TEXT CHECK(gender IN ('Nam', 'Nữ', 'Khác')),
            patient_code TEXT UNIQUE,
            phone       TEXT,
            note        TEXT,
            created_at  TEXT DEFAULT (datetime('now', 'localtime'))
        )
    """)

    # Bảng Phiên Khám (mỗi lần nội soi là một phiên)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id      INTEGER NOT NULL,
            exam_date       TEXT DEFAULT (date('now', 'localtime')),
            exam_type       TEXT,   -- 'Nội soi mũi', 'Nội soi tai', 'Nội soi họng'...
            doctor_name     TEXT,
            diagnosis       TEXT,
            note            TEXT,
            folder_path     TEXT,   -- Đường dẫn thư mục chứa ảnh của phiên này
            created_at      TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        )
    """)

    # Bảng Hình Ảnh
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS images (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      INTEGER NOT NULL,
            original_path   TEXT,   -- Đường dẫn ảnh gốc 1080p
            processed_path  TEXT,   -- Đường dẫn ảnh đã xử lý AI 4K
            thumbnail_path  TEXT,   -- Thumbnail nhỏ cho Gallery
            file_size_kb    INTEGER,
            resolution      TEXT,   -- VD: '3840x2160'
            trigger_type    TEXT,   -- 'keyboard', 'audio', 'image', 'serial'
            is_favorite     INTEGER DEFAULT 0,  -- Đánh dấu ảnh đẹp nhất (0/1)
            captured_at     TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
    """)

    conn.commit()


# ── Patient CRUD ──────────────────────────────────────────────────────────────
def add_patient(conn: sqlite3.Connection, full_name: str, birth_year: str = "",
                gender: str = "Nam", patient_code: str = "", phone: str = "") -> int:
    """Thêm bệnh nhân mới. Trả về ID bệnh nhân vừa tạo."""
    if not patient_code:
        patient_code = f"BN{datetime.now().strftime('%Y%m%d%H%M%S')}"
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO patients (full_name, birth_year, gender, patient_code, phone)
        VALUES (?, ?, ?, ?, ?)
    """, (full_name, birth_year, gender, patient_code, phone))
    conn.commit()
    return cursor.lastrowid


def get_patient(conn: sqlite3.Connection, patient_id: int) -> Optional[Dict]:
    cursor = conn.cursor()
    row = cursor.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    return dict(row) if row else None


def search_patients(conn: sqlite3.Connection, query: str) -> List[Dict]:
    """Tìm kiếm bệnh nhân theo tên hoặc mã."""
    cursor = conn.cursor()
    rows = cursor.execute("""
        SELECT * FROM patients
        WHERE full_name LIKE ? OR patient_code LIKE ?
        ORDER BY created_at DESC
    """, (f"%{query}%", f"%{query}%")).fetchall()
    return [dict(r) for r in rows]


def list_all_patients(conn: sqlite3.Connection) -> List[Dict]:
    cursor = conn.cursor()
    rows = cursor.execute("SELECT * FROM patients ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


# ── Session CRUD ──────────────────────────────────────────────────────────────
def create_session(conn: sqlite3.Connection, patient_id: int,
                   exam_type: str = "Nội soi mũi", doctor_name: str = "") -> int:
    """Tạo phiên khám mới và thư mục lưu ảnh tương ứng."""
    patient = get_patient(conn, patient_id)
    if not patient:
        raise ValueError(f"Không tìm thấy bệnh nhân ID={patient_id}")

    folder = _make_session_folder(patient["full_name"], patient["patient_code"])

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO sessions (patient_id, exam_type, doctor_name, folder_path)
        VALUES (?, ?, ?, ?)
    """, (patient_id, exam_type, doctor_name, str(folder)))
    conn.commit()
    return cursor.lastrowid


def get_session(conn: sqlite3.Connection, session_id: int) -> Optional[Dict]:
    cursor = conn.cursor()
    row = cursor.execute("""
        SELECT s.*, p.full_name, p.patient_code
        FROM sessions s JOIN patients p ON s.patient_id = p.id
        WHERE s.id = ?
    """, (session_id,)).fetchone()
    return dict(row) if row else None


def list_sessions_for_patient(conn: sqlite3.Connection, patient_id: int) -> List[Dict]:
    cursor = conn.cursor()
    rows = cursor.execute("""
        SELECT s.*, COUNT(i.id) as image_count
        FROM sessions s
        LEFT JOIN images i ON i.session_id = s.id
        WHERE s.patient_id = ?
        GROUP BY s.id
        ORDER BY s.created_at DESC
    """, (patient_id,)).fetchall()
    return [dict(r) for r in rows]


# ── Image CRUD ────────────────────────────────────────────────────────────────
def save_image_record(conn: sqlite3.Connection, session_id: int,
                      original_path: str, processed_path: str,
                      thumbnail_path: str, resolution: str = "3840x2160",
                      trigger_type: str = "keyboard") -> int:
    """Lưu thông tin ảnh vào database sau khi xử lý AI xong."""
    file_size = 0
    if os.path.exists(processed_path):
        file_size = os.path.getsize(processed_path) // 1024  # KB

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO images (session_id, original_path, processed_path,
                            thumbnail_path, file_size_kb, resolution, trigger_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (session_id, original_path, processed_path, thumbnail_path,
          file_size, resolution, trigger_type))
    conn.commit()
    return cursor.lastrowid


def get_images_for_session(conn: sqlite3.Connection, session_id: int) -> List[Dict]:
    cursor = conn.cursor()
    rows = cursor.execute("""
        SELECT * FROM images WHERE session_id = ? ORDER BY captured_at DESC
    """, (session_id,)).fetchall()
    return [dict(r) for r in rows]


def get_favorite_images(conn: sqlite3.Connection, session_id: int, limit: int = 4) -> List[Dict]:
    """Lấy ảnh đẹp nhất (đánh dấu favorite) để xuất báo cáo."""
    cursor = conn.cursor()
    rows = cursor.execute("""
        SELECT * FROM images
        WHERE session_id = ? AND is_favorite = 1
        ORDER BY captured_at DESC LIMIT ?
    """, (session_id, limit)).fetchall()
    # Nếu ít hơn limit ảnh favorite, bổ sung thêm ảnh mới nhất
    if len(rows) < limit:
        existing_ids = [r["id"] for r in rows]
        placeholders = ",".join("?" * len(existing_ids)) if existing_ids else "0"
        extra_rows = cursor.execute(f"""
            SELECT * FROM images
            WHERE session_id = ? AND id NOT IN ({placeholders})
            ORDER BY captured_at DESC LIMIT ?
        """, (session_id, *existing_ids, limit - len(rows))).fetchall()
        rows = list(rows) + list(extra_rows)
    return [dict(r) for r in rows]


def toggle_favorite(conn: sqlite3.Connection, image_id: int) -> bool:
    """Đổi trạng thái yêu thích của ảnh. Trả về trạng thái mới."""
    cursor = conn.cursor()
    cursor.execute("UPDATE images SET is_favorite = 1 - is_favorite WHERE id = ?", (image_id,))
    conn.commit()
    row = cursor.execute("SELECT is_favorite FROM images WHERE id = ?", (image_id,)).fetchone()
    return bool(row["is_favorite"]) if row else False


# ── Cấu trúc thư mục ─────────────────────────────────────────────────────────
def _make_session_folder(patient_name: str, patient_code: str,
                         root: Path = DEFAULT_STORAGE_ROOT) -> Path:
    """
    Tạo cấu trúc: ROOT/Năm/Tháng/Ngày/MãBN_TênBN/
    VD: ~/DMH_NoiSoi_Data/2026/05/11/BN202605110001_NguyenVanA/
    """
    now = datetime.now()
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in patient_name)
    folder = root / str(now.year) / f"{now.month:02d}" / f"{now.day:02d}" / f"{patient_code}_{safe_name}"
    folder.mkdir(parents=True, exist_ok=True)

    # Tạo thư mục con
    (folder / "originals").mkdir(exist_ok=True)    # Ảnh gốc 1080p
    (folder / "processed_4k").mkdir(exist_ok=True) # Ảnh AI 4K
    (folder / "thumbnails").mkdir(exist_ok=True)   # Thumbnail Gallery
    (folder / "reports").mkdir(exist_ok=True)      # File Word/PDF xuất báo cáo

    return folder


def get_image_paths(session_folder: str, filename_base: str) -> Dict[str, str]:
    """Trả về đường dẫn đầy đủ cho original, processed, thumbnail."""
    folder = Path(session_folder)
    return {
        "original":  str(folder / "originals"    / f"{filename_base}_orig.jpg"),
        "processed": str(folder / "processed_4k" / f"{filename_base}_4k.png"),
        "thumbnail": str(folder / "thumbnails"   / f"{filename_base}_thumb.jpg"),
        "report":    str(folder / "reports"),
    }


# ── Thống kê ─────────────────────────────────────────────────────────────────
def get_stats(conn: sqlite3.Connection) -> Dict[str, Any]:
    cursor = conn.cursor()
    return {
        "total_patients": cursor.execute("SELECT COUNT(*) FROM patients").fetchone()[0],
        "total_sessions":  cursor.execute("SELECT COUNT(*) FROM sessions").fetchone()[0],
        "total_images":    cursor.execute("SELECT COUNT(*) FROM images").fetchone()[0],
        "total_size_mb":   (cursor.execute("SELECT SUM(file_size_kb) FROM images").fetchone()[0] or 0) // 1024,
    }


# ── Test nhanh ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    conn = init_database()
    pid = add_patient(conn, "Nguyễn Văn An", "1985", "Nam")
    sid = create_session(conn, pid, "Nội soi mũi", "BS. Trần Minh")
    session = get_session(conn, sid)
    print(f"✅ Tạo phiên khám: {session}")
    print(f"📁 Thư mục lưu ảnh: {session['folder_path']}")
    print(f"📊 Thống kê: {get_stats(conn)}")
    conn.close()
