from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PyQt6.QtCore import Qt, QObject, QThread, pyqtSignal
from PyQt6.QtGui import QColor, QTextCharFormat, QTextCursor
from PyQt6.QtWidgets import (
    QApplication, QCheckBox, QComboBox, QFileDialog, QFormLayout, QGridLayout, QGroupBox, QFrame,
    QHBoxLayout, QHeaderView, QLabel, QLineEdit, QMainWindow, QMessageBox,
    QPushButton, QPlainTextEdit, QSplitter, QTabWidget, QTableWidget,
    QTableWidgetItem, QTextEdit, QVBoxLayout, QWidget
)

from .api_client import Bhyt3176Client
from .config import AppConfig
from .excel_io import Xml3176ExcelIO
from .models import Xml3176Document, XmlSheet
from .parser import Xml3176Parser
from .schema import DEFAULT_ORDER
from .signing import XmlSigner


APP_STYLE = """
QMainWindow { background: #f4f7fb; }
QWidget#sendPage, QWidget#patientPage { background: #f4f7fb; }
QLabel#moduleTitle { color:#0f172a; font-size:20px; font-weight:900; padding:0px; margin:0px; }
QLabel#moduleSubTitle { color:#2563eb; font-size:12px; font-weight:700; padding:0px; margin:0px; }
QFrame#topBarCard, QFrame#searchCard {
    background:#ffffff; border:1px solid #d8e3f1; border-radius:16px;
}
QGroupBox {
    font-weight: 900; border: 1px solid #dbe4f1; border-radius: 14px;
    margin-top: 8px; padding: 10px 12px 9px 12px; background: #ffffff;
    color:#111827;
}
QGroupBox::title {
    subcontrol-origin: margin; left: 14px; padding: 0 8px;
    color: #111827; font-size: 14px;
}
QGroupBox#sendCard { border:2px solid #8b5cf6; background:#ffffff; }
QGroupBox#signCard { border:2px solid #e8c796; background:#fffaf4; }
QGroupBox#folderCard { border:2px solid #4aa8d8; background:#fbfeff; }
QGroupBox#logCard { border:1px solid #d8e3f1; background:#ffffff; }
QGroupBox#patientListCard, QGroupBox#detailCard, QGroupBox#previewCard {
    border:1px solid #dbe4f1; background:#ffffff; border-radius:16px;
}
QLabel#sectionHint { color:#64748b; font-size:11px; font-weight:600; padding:2px 0px; }
QLabel#summaryPill {
    background:#eef5ff; color:#2563eb; border:1px solid #bfd8ff;
    border-radius:12px; padding:5px 10px; font-weight:800;
}
QPushButton {
    border: 1px solid #1d4ed8; border-radius: 12px; padding: 7px 14px;
    background: #2563eb; color: white; font-weight: 800; min-height: 24px;
}
QPushButton:hover { background: #1d4ed8; }
QPushButton:pressed { background: #1e40af; }
QPushButton#green { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #16a34a, stop:1 #15803d); border-color:#15803d; }
QPushButton#dark { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #475569, stop:1 #334155); border-color:#334155; }
QPushButton#brown { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #0f766e, stop:1 #115e59); border-color:#115e59; }
QPushButton#orange { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #f59e0b, stop:1 #ea580c); border-color:#ea580c; }
QPushButton#purple { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #8b5cf6, stop:1 #7c3aed); border-color:#7c3aed; }
QPushButton#teal { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #0891b2, stop:1 #0f766e); border-color:#0f766e; }
QPushButton#small, QPushButton#xmlAction, QPushButton#excelAction {
    padding: 5px 10px; font-size: 12px; min-height: 22px; font-weight:800; border-radius:10px;
}
QPushButton#xmlAction {
    background:qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #eef5ff, stop:1 #dcecff);
    color:#1d4ed8; border:1px solid #93c5fd;
}
QPushButton#excelAction {
    background:qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #effcf2, stop:1 #dcfce7);
    color:#15803d; border:1px solid #86efac;
}
QPushButton#startSend { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #2ca243, stop:1 #1f8c35); border-color:#24863a; font-size: 13px; min-height: 26px; padding:4px 14px; border-radius:10px; }
QPushButton#stopSend { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #1f7ae0, stop:1 #2563eb); border-color:#1d4ed8; font-size: 13px; min-height: 26px; padding:4px 14px; border-radius:10px; }
QPushButton#clearLog { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #0b7fd0, stop:1 #0369a1); border-color:#075985; font-size: 13px; min-height: 26px; padding:4px 12px; border-radius:10px; }
QPushButton#saveConfig { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #8b5cf6, stop:1 #7c3aed); border-color:#6d28d9; font-size: 13px; min-height: 26px; border-radius:10px; }
QPushButton#testConnect { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #2ca243, stop:1 #22863a); border-color:#24863a; font-size: 13px; min-height: 28px; border-radius:11px; }
QPushButton#browseBtn { background:#f8fafc; color:#475569; border:1px solid #cbd5e1; min-width:30px; border-radius:8px; padding:1px 5px; font-size:11px; }
QPushButton#browseBtn:hover { background:#eef2ff; color:#1d4ed8; }
QLineEdit#folderPathLine {
    min-height: 22px;
    max-height: 22px;
    padding: 0px 6px;
    font-size: 11px;
    border-radius: 7px;
}
QLineEdit, QComboBox, QPlainTextEdit, QTableWidget {
    background: white; border: 1px solid #d6deea; border-radius: 10px; padding: 6px 8px;
}
QLineEdit:focus, QComboBox:focus, QPlainTextEdit:focus {
    border: 2px solid #93c5fd;
}
QTableWidget {
    gridline-color:#edf2f7; selection-background-color:#dbeafe; selection-color:#111827;
    alternate-background-color:#fafcff; border-radius:12px; padding:2px;
}
QTableWidget#patientTable {
    font-size: 11px;
}
QTableWidget#detailTable {
    font-size: 11px;
}
QHeaderView::section {
    background: #f3f7ff; font-weight: 800; color:#0f172a;
    border: 0px; border-bottom:1px solid #d6deea; padding: 4px 6px;
    font-size: 11px;
}
QTabWidget::pane { border: 1px solid #d9e2f1; background: #ffffff; border-radius:12px; }
QTabBar::tab {
    background:#eef2f7; color:#334155; padding:8px 16px; border-top-left-radius:10px; border-top-right-radius:10px;
    margin-right:4px; font-weight:800; min-width:118px;
}
QTabBar::tab:selected { background:#2563eb; color:white; }
QTabBar::tab:hover:!selected { background:#e2e8f0; }
QPlainTextEdit#sendLog { background:#fbfdff; color:#111827; font-family:Consolas,monospace; border:1px solid #d6deea; border-radius:12px; padding:8px; }
QLabel#rightHintTitle { color:#2563eb; font-size:14px; font-weight:800; }
QLabel#okSignStatus { background:#fff1dd; color:#166534; border:1px solid #fed7aa; border-radius:10px; padding:6px 8px; font-weight:800; }
QCheckBox { font-weight:700; color:#1f2937; spacing:8px; }
QCheckBox::indicator { width:17px; height:17px; }
QCheckBox::indicator:unchecked { border:1px solid #9ca3af; border-radius:4px; background:#fff; }
QCheckBox::indicator:checked { border:1px solid #2563eb; border-radius:4px; background:#2563eb; }
"""

PATIENT_COLUMNS = [
    "XML", "Excel", "STT", "MA_LK", "MA_BN", "HO_TEN", "MA_THE_BHYT", "NGAY_VAO", "NGAY_RA",
    "T_TONGCHI_BV", "T_BHTT"
]


def _safe_name(value: str, max_len: int = 90) -> str:
    s = (value or "").strip()
    s = re.sub(r"[\\/:*?\"<>|]+", "_", s)
    s = re.sub(r"\s+", "_", s)
    s = s.strip("._ ")
    return (s or "hoso")[:max_len]


def _mask_api_payload(payload: dict) -> dict:
    """Che bớt token trong log để không lộ thông tin nhạy cảm."""
    try:
        data = json.loads(json.dumps(payload, ensure_ascii=False))
        api_key = data.get("APIKey") or data.get("apiKey")
        if isinstance(api_key, dict):
            for key in ("access_token", "id_token"):
                val = str(api_key.get(key, ""))
                if len(val) > 14:
                    api_key[key] = val[:8] + "..." + val[-6:]
        return data
    except Exception:
        return payload


class TestConnectWorker(QObject):
    finished = pyqtSignal(bool, object)

    def __init__(self, username: str, password: str, timeout: int):
        super().__init__()
        self.username = username
        self.password = password
        self.timeout = timeout

    def run(self):
        try:
            payload = Bhyt3176Client(self.username, self.password, self.timeout).test_connect()
            ok = str(payload.get("maKetQua", "")).strip() == "200" and bool(payload.get("APIKey") or payload.get("apiKey"))
            self.finished.emit(ok, payload)
        except Exception as exc:
            self.finished.emit(False, str(exc))


class BatchSendWorker(QObject):
    log = pyqtSignal(str)
    finished = pyqtSignal(str)

    def __init__(
        self,
        username: str,
        password: str,
        timeout: int,
        ma_tinh: str,
        ma_cskcb: str,
        pending: str,
        sent: str,
        error: str,
        move_after_send: bool,
        auto_sign: bool,
        signer_exe: str,
        signer_args: str,
    ):
        super().__init__()
        self.username = username
        self.password = password
        self.timeout = timeout
        self.ma_tinh = ma_tinh
        self.ma_cskcb = ma_cskcb
        self.pending = Path(pending)
        self.sent = Path(sent)
        self.error = Path(error)
        self.move_after_send = move_after_send
        self.auto_sign = auto_sign
        self.signer_exe = signer_exe
        self.signer_args = signer_args or "{exe} {input} {output}"
        self.stop_requested = False

    def request_stop(self):
        self.stop_requested = True

    def run(self):
        try:
            if not self.pending.exists():
                self.finished.emit("Thiếu thư mục hồ sơ chờ gửi.")
                return
            files = sorted([p for p in self.pending.glob("*.xml") if not p.name.endswith(".unsigned.tmp")])
            if not files:
                self.finished.emit("Không có file XML trong thư mục chờ gửi.")
                return
            self.sent.mkdir(parents=True, exist_ok=True)
            self.error.mkdir(parents=True, exist_ok=True)
            tmp_dir = self.pending / ".signed_tmp"
            if self.auto_sign:
                tmp_dir.mkdir(parents=True, exist_ok=True)
                if not self.signer_exe or not Path(str(self.signer_exe)).exists():
                    self.signer_exe = XmlSigner.find_default_signer()
                if not self.signer_exe or not Path(str(self.signer_exe)).exists():
                    self.finished.emit("Không tìm thấy công cụ ký XML trong Signer/SignXml01BH.exe. Hãy copy file ký số vào Signer hoặc tắt 'Tự ký số khi xuất/gửi' nếu XML đã ký sẵn.")
                    return
            client = Bhyt3176Client(self.username, self.password, self.timeout)
            total = len(files)
            for i, f in enumerate(files, start=1):
                if self.stop_requested:
                    self.log.emit(f"Đã dừng gửi theo yêu cầu. Còn lại {total - i + 1} file chưa xử lý.")
                    self.finished.emit("Đã dừng lượt gửi.")
                    return
                send_path = f
                try:
                    self.log.emit(f"[{i}/{total}] Chuẩn bị gửi: {f.name}")
                    if self.auto_sign:
                        if XmlSigner.is_already_signed(f):
                            # V297: file đã ký thật thì gửi nguyên file, không ký lại.
                            # Việc ký lại file đã ký làm mất ý nghĩa test file mẫu và có thể gây lỗi 125.
                            send_path = f
                            self.log.emit(f"[{i}/{total}] File đã có chữ ký số thật, gửi nguyên file, không ký lại: {f.name}")
                        else:
                            send_path = tmp_dir / f.name
                            self.log.emit(f"[{i}/{total}] Đang ký số: {f.name}")
                            XmlSigner.prepare_fresh_signed_for_send(f, send_path)
                    elif not XmlSigner.is_already_signed(f):
                        self.log.emit(f"[{i}/{total}] CẢNH BÁO: File chưa ký số nhưng tùy chọn Tự ký số đang tắt: {f.name}")
                    sha = XmlSigner.sha256_file(send_path)
                    if sha:
                        self.log.emit(f"[{i}/{total}] SHA256 file thực tế gửi: {sha}")
                    self.log.emit(f"[{i}/{total}] Tham số gửi: loaiHoSo=130, maTinh={self.ma_tinh}, maCSKCB={self.ma_cskcb}, username={self.username}")
                    self.log.emit(f"[{i}/{total}] Đang gửi lên cổng BH: {f.name}")
                    result = client.send_xml_3176(send_path, self.ma_tinh, self.ma_cskcb, "130")
                    self.log.emit(json.dumps(result, ensure_ascii=False))
                    code = str(result.get("maKetQua", "")).strip()
                    ok = code == "200"
                    if not ok and code == "125":
                        self.log.emit("Cổng BH báo lỗi ký số 125: chữ ký sai hoặc file bị chỉnh sửa sau ký. V304: XML 3176 được tái dựng đúng wrapper trước khi ký; sau khi ký không parse/format/ghi đè file đã ký. Hãy đối chiếu SHA256 file thực tế gửi với file .signed_tmp nếu vẫn lỗi 125.")
                    if not ok and code == "123":
                        self.log.emit("Cổng BH báo 123: File chưa được ký số. Hãy bật Tự ký số khi xuất/gửi hoặc chọn file XML đã ký số hợp lệ.")
                    if self.move_after_send:
                        dest = (self.sent if ok else self.error) / f.name
                        if dest.exists():
                            dest = dest.with_name(dest.stem + "_" + str(i) + dest.suffix)
                        shutil.move(str(f), str(dest))
                        if ok and send_path != f:
                            signed_dest = self.sent / (Path(f).stem + "_signed.xml")
                            try:
                                shutil.copyfile(send_path, signed_dest)
                            except Exception:
                                pass
                except Exception as exc:
                    self.log.emit(f"Lỗi gửi {f.name}: {exc}")
                    if self.move_after_send:
                        try:
                            dest = self.error / f.name
                            if dest.exists():
                                dest = dest.with_name(dest.stem + "_" + str(i) + dest.suffix)
                            shutil.move(str(f), str(dest))
                        except Exception:
                            pass
            self.finished.emit("Hoàn tất lượt gửi.")
        except Exception as exc:
            self.finished.emit(f"Lỗi gửi hàng loạt: {exc}")


class Xml3176Editor(QMainWindow):
    def __init__(self, host_parent=None):
        super().__init__()
        self.host_parent = host_parent
        self.setWindowTitle("XML3176 Toolkit v0.6 - Danh sách bệnh nhân / Excel / XML / gửi cổng không đơ giao diện")
        self.resize(1520, 900)
        self.doc: Xml3176Document | None = None
        self.current_file = ""
        self.patient_rows: list[dict[str, str]] = []
        self.current_hoso_index: int | None = None
        self.detail_tables: dict[str, QTableWidget] = {}
        self.cfg = AppConfig.load()
        self.stop_sending = False
        self.test_thread = None
        self.test_worker = None
        self.send_thread = None
        self.send_worker = None
        if not self.cfg.signer_exe:
            self.cfg.signer_exe = XmlSigner.find_default_signer()
        self.setStyleSheet(APP_STYLE)
        self._build_ui()

    def _cfg_value(self, *names: str, default: str = "") -> str:
        for name in names:
            try:
                value = getattr(self.cfg, name)
            except Exception:
                value = None
            if value is not None and str(value).strip() != "":
                return str(value)
        return default

    def _cfg_password_value(self) -> str:
        return self._cfg_value("password", "portal_password", "bhyt_password", "mat_khau", "api_password", default="")

    def _cfg_username_value(self) -> str:
        return self._cfg_value("username", "portal_username", "bhyt_username", "tai_khoan", "api_username", default="")

    def _set_cfg_password_value(self, value: str):
        # AppConfig giữa app chính và module XML3176 có thể dùng tên trường khác nhau.
        # Gán mềm để không lỗi khi thiếu thuộc tính password.
        for name in ("password", "portal_password", "bhyt_password", "mat_khau", "api_password"):
            try:
                setattr(self.cfg, name, value)
                return
            except Exception:
                pass

    def _build_ui(self):
        root = QWidget()
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(8, 6, 8, 6)
        root_layout.setSpacing(6)

        title = QLabel("🧰 Công cụ XML 3176")
        title.setObjectName("moduleTitle")
        subtitle = QLabel("mở XML/thư mục → xem/sửa → tách XML → ký số → gửi cổng BH")
        subtitle.setObjectName("moduleSubTitle")
        root_layout.addWidget(title)
        # Ẩn dòng quy trình để ưu tiên không gian làm việc

        top_wrap = QFrame(); top_wrap.setObjectName("topBarCard")
        top_wrap_l = QHBoxLayout(top_wrap)
        top_wrap_l.setContentsMargins(10, 8, 10, 8)
        top_wrap_l.setSpacing(8)

        bar = QHBoxLayout()
        buttons = [
            ("📂 Mở XML", self.open_xml_many, "teal"),
            ("📘 Mở Excel", self.open_excel_to_screen, "purple"),
            ("📊 Xuất Excel", self.export_excel_all, "green"),
            ("🔄 Excel → XML", self.excel_to_xml_dialog, "dark"),
            ("✂️ Tách XML", self.split_xml_dialog, "orange"),
            ("💾 Lưu XML", self.save_xml_as, "green"),
        ]
        for text_btn, fn, name in buttons:
            b = QPushButton(text_btn)
            if name:
                b.setObjectName(name)
            b.clicked.connect(fn)
            bar.addWidget(b)
        bar.addStretch(1)
        self.chk_auto_sign = QCheckBox("Tự ký số khi xuất/gửi")
        self.chk_auto_sign.setChecked(getattr(self.cfg, "auto_sign_on_export", True))
        self.chk_auto_sign.setVisible(False)
        self.status = QLabel("Chưa mở file XML 3176")
        self.status.setObjectName("summaryPill")
        bar.addWidget(self.status)
        top_wrap_l.addLayout(bar)
        root_layout.addWidget(top_wrap)

        self.main_tabs = QTabWidget()
        self.main_tabs.setDocumentMode(True)
        self.main_tabs.addTab(self._build_patient_tab(), "🗂 XmlView")
        self.main_tabs.addTab(self._build_send_tab(), "☁ Gửi cổng tiếp nhận")
        root_layout.addWidget(self.main_tabs)
        self.setCentralWidget(root)

    def _build_patient_tab(self) -> QWidget:
        w = QWidget()
        w.setObjectName("patientPage")
        layout = QVBoxLayout(w)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(6)

        search_card = QFrame(); search_card.setObjectName("searchCard")
        search_l = QHBoxLayout(search_card)
        search_l.setContentsMargins(10, 8, 10, 8)
        search_title = QLabel("🔎 Tìm kiếm hồ sơ XML 3176")
        search_title.setStyleSheet("font-weight:800;color:#0f172a;")
        search_l.addWidget(search_title)
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("Nhập MA_LK, mã BN, họ tên, mã thẻ...")
        self.search_box.textChanged.connect(self.reload_patient_table)
        search_l.addWidget(self.search_box, 1)
        self.lbl_summary = QLabel("0 hồ sơ")
        self.lbl_summary.setObjectName("summaryPill")
        search_l.addWidget(self.lbl_summary)
        layout.addWidget(search_card)

        splitter = QSplitter(Qt.Orientation.Vertical)
        self.patient_splitter = splitter
        upper = QGroupBox("Danh sách bệnh nhân / hồ sơ XML 3176")
        upper.setObjectName("patientListCard")
        upper_l = QVBoxLayout(upper)
        upper_l.setContentsMargins(8, 10, 8, 8)
        hint1 = QLabel("Bấm nút XML để mở nhanh hồ sơ và ưu tiên vùng làm việc bên dưới. Bấm Excel để xuất riêng hồ sơ của bệnh nhân đó.")
        hint1.setObjectName("sectionHint")
        # Ẩn ghi chú để tăng chiều cao bảng danh sách
        self.patient_table = QTableWidget()
        self.patient_table.setObjectName("patientTable")
        self.patient_table.setAlternatingRowColors(True)
        self.patient_table.setColumnCount(len(PATIENT_COLUMNS))
        self.patient_table.setHorizontalHeaderLabels(PATIENT_COLUMNS)
        self.patient_table.verticalHeader().setDefaultSectionSize(30)
        self.patient_table.horizontalHeader().setFixedHeight(28)
        self.patient_table.horizontalHeader().setMinimumSectionSize(54)
        self.patient_table.setShowGrid(False)
        self.patient_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Interactive)
        self.patient_table.cellDoubleClicked.connect(self.open_patient_by_row)
        upper_l.addWidget(self.patient_table)
        splitter.addWidget(upper)

        lower = QWidget(); lower_l = QHBoxLayout(lower); lower_l.setContentsMargins(0, 0, 0, 0); lower_l.setSpacing(10)
        detail_box = QGroupBox("Dữ liệu XML chi tiết theo từng bảng")
        detail_box.setObjectName("detailCard")
        detail_l = QVBoxLayout(detail_box)
        detail_l.setContentsMargins(8, 10, 8, 8)
        hint2 = QLabel("Có thể sửa trực tiếp trên lưới. Khi click vào ô dữ liệu, XML chi tiết bên phải sẽ tự tô nổi bật vùng tương ứng.")
        hint2.setObjectName("sectionHint")
        # Ẩn ghi chú để ưu tiên vùng dữ liệu XML
        self.detail_tabs = QTabWidget()
        self.detail_tabs.setDocumentMode(True)
        self.detail_tabs.currentChanged.connect(lambda _i: self.preview_current_detail())
        detail_l.addWidget(self.detail_tabs)
        lower_l.addWidget(detail_box, 3)

        preview_box = QGroupBox("XML chi tiết hồ sơ đang chọn")
        preview_box.setObjectName("previewCard")
        pv_l = QVBoxLayout(preview_box)
        pv_l.setContentsMargins(8, 10, 8, 8)
        lbl = QLabel("Click ô bên trái để tô màu vùng XML")
        lbl.setObjectName("rightHintTitle")
        pv_l.addWidget(lbl)
        self.xml_preview = QPlainTextEdit()
        self.xml_preview.setPlaceholderText("XML chi tiết của bệnh nhân sẽ hiển thị tại đây...")
        self.xml_preview.setReadOnly(True)
        self.xml_preview.setStyleSheet("font-family: Consolas, monospace; font-size: 12px;")
        pv_l.addWidget(self.xml_preview)
        lower_l.addWidget(preview_box, 3)
        splitter.addWidget(lower)
        splitter.setSizes([360, 620])
        layout.addWidget(splitter, 1)
        return w

    def _build_send_tab(self) -> QWidget:
        w = QWidget()
        w.setObjectName("sendPage")
        layout = QVBoxLayout(w)
        layout.setContentsMargins(6, 4, 6, 4)
        layout.setSpacing(5)

        cards = QHBoxLayout()
        cards.setSpacing(10)
        account = QGroupBox("1. Cấu hình Tài khoản BHYT")
        account.setObjectName("sendCard")
        account_form = QFormLayout(account)
        account_form.setHorizontalSpacing(14)
        account_form.setVerticalSpacing(7)
        account_form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        self.ed_cskcb = QLineEdit(self.cfg.ma_cskcb)
        self.ed_user = QLineEdit(self._cfg_username_value())
        self.ed_pwd = QLineEdit(self._cfg_password_value()); self.ed_pwd.setEchoMode(QLineEdit.EchoMode.Password)
        self.ed_user.setToolTip("Tài khoản được lưu trong file cấu hình local của từng máy, không nằm trong source/EXE nếu không copy file cấu hình cá nhân.")
        self.ed_pwd.setToolTip("Mật khẩu được lưu trong file cấu hình local của từng máy khi bấm Lưu cấu hình.")
        self.ed_ma_tinh = QLineEdit((self.cfg.ma_tinh or (self.cfg.ma_cskcb or "")[:2]).strip())
        self.ed_ma_tinh.setPlaceholderText("VD: 94")
        self.ed_timeout = QLineEdit(str(self.cfg.timeout))
        self.ed_timeout.setPlaceholderText("30")
        for _w in (self.ed_cskcb, self.ed_user, self.ed_pwd, self.ed_ma_tinh, self.ed_timeout):
            _w.setMinimumHeight(30)
        account_form.addRow("Mã CSKCB", self.ed_cskcb)
        account_form.addRow("Tài khoản", self.ed_user)
        account_form.addRow("Mật khẩu", self.ed_pwd)
        account_form.addRow("Mã tỉnh API", self.ed_ma_tinh)
        account_form.addRow("Timeout", self.ed_timeout)
        acct_btns = QHBoxLayout()
        b_test = QPushButton("🧪 Test kết nối")
        b_test.setObjectName("testConnect")
        b_test.clicked.connect(self.test_connect)
        acct_btns.addWidget(b_test)
        account_form.addRow("", acct_btns)
        account.setMinimumHeight(172)
        account.setMaximumHeight(196)
        cards.addWidget(account, 2)

        signer = QGroupBox("2. Cấu hình chứng thư số")
        signer.setObjectName("signCard")
        signer_form = QFormLayout(signer)
        signer_form.setHorizontalSpacing(14)
        signer_form.setVerticalSpacing(7)
        signer_form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        self.ed_signer = self._path_line(self.cfg.signer_exe, False)
        self.ed_signer.setVisible(False)
        self.ed_sign_args = QLineEdit(self.cfg.signer_args or "{exe} {input} {output}")
        self.ed_sign_args.setVisible(False)
        self.lbl_sign_status = QLabel("Module sẽ dùng cấu hình chữ ký số chung trong tab Cài đặt.")
        self.lbl_sign_status.setObjectName("okSignStatus")
        self.lbl_sign_status.setWordWrap(True)
        signer_form.addRow("Trạng thái", self.lbl_sign_status)
        self.chk_auto_sign_send = QCheckBox("Tự ký số khi Save/Tách XML/Excel → XML/Gửi cổng")
        self.chk_auto_sign_send.setChecked(getattr(self.cfg, "auto_sign_on_export", True))
        self.chk_auto_sign_send.toggled.connect(lambda v: self.chk_auto_sign.setChecked(v))
        self.chk_auto_sign.toggled.connect(lambda v: self.chk_auto_sign_send.setChecked(v))
        signer_form.addRow("", self.chk_auto_sign_send)
        sign_btn_row = QHBoxLayout()
        btn_check_sign = QPushButton("🔎 Kiểm tra chữ ký")
        btn_check_sign.setObjectName("purple")
        btn_check_sign.clicked.connect(self.check_sign_config)
        btn_open_sign = QPushButton("⚙️ Mở cấu hình")
        btn_open_sign.setObjectName("purple")
        btn_open_sign.clicked.connect(self.open_host_sign_config)
        sign_btn_row.addWidget(btn_check_sign)
        sign_btn_row.addWidget(btn_open_sign)
        signer_form.addRow("", sign_btn_row)
        signer.setMinimumHeight(172)
        signer.setMaximumHeight(196)
        cards.addWidget(signer, 1)
        layout.addLayout(cards)

        bulk = QGroupBox("3. Thư mục thao tác gửi")
        bulk.setObjectName("folderCard")
        bulk_l = QVBoxLayout(bulk)
        # Margin trên đủ tránh title GroupBox che dòng đầu; row nhỏ để không đè nút.
        bulk_l.setContentsMargins(8, 16, 8, 6)
        bulk_l.setSpacing(2)

        folder_grid = QGridLayout()
        folder_grid.setHorizontalSpacing(6)
        folder_grid.setVerticalSpacing(1)
        self.ed_pending = self._path_line(self.cfg.folder_pending, True)
        self.ed_sent = self._path_line(self.cfg.folder_sent, True)
        self.ed_error = self._path_line(self.cfg.folder_error, True)

        lbl_pending = QLabel("📁 Chờ gửi")
        lbl_sent = QLabel("📁 Đã gửi")
        lbl_error = QLabel("📁 Lỗi")
        for _lbl in (lbl_pending, lbl_sent, lbl_error):
            _lbl.setMinimumWidth(82)
            _lbl.setMaximumHeight(22)
            _lbl.setStyleSheet("font-size:11px;")
            _lbl.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)

        folder_grid.addWidget(lbl_pending, 0, 0)
        folder_grid.addWidget(self.ed_pending, 0, 1)
        folder_grid.addWidget(lbl_sent, 1, 0)
        folder_grid.addWidget(self.ed_sent, 1, 1)
        folder_grid.addWidget(lbl_error, 2, 0)
        folder_grid.addWidget(self.ed_error, 2, 1)
        folder_grid.setColumnStretch(1, 1)
        bulk_l.addLayout(folder_grid)

        self.chk_move = QCheckBox("Tự chuyển file sang mục đã gửi/lỗi sau khi xử lý")
        self.chk_move.setChecked(self.cfg.move_after_send)
        self.chk_move.setMaximumHeight(22)
        self.chk_move.setStyleSheet("font-size:11px; font-weight:700;")
        bulk_l.addWidget(self.chk_move)

        btns = QHBoxLayout()
        btns.setSpacing(6)
        self.btn_start_send = QPushButton("Bắt đầu gửi")
        self.btn_start_send.setObjectName("startSend")
        self.btn_start_send.clicked.connect(self.batch_send_folder)
        self.btn_stop_send = QPushButton("Dừng gửi")
        self.btn_stop_send.setObjectName("stopSend")
        self.btn_stop_send.clicked.connect(self.stop_batch_send)
        b_save2 = QPushButton("💾 Lưu cấu hình")
        b_save2.setObjectName("saveConfig")
        b_save2.clicked.connect(self.save_config)
        b_clear = QPushButton("🧹 Xóa log")
        b_clear.setObjectName("clearLog")
        b_clear.clicked.connect(lambda: self.log.clear())
        btns.addWidget(self.btn_start_send)
        btns.addWidget(self.btn_stop_send)
        btns.addWidget(b_save2)
        btns.addWidget(b_clear)
        btns.addStretch(1)
        bulk_l.addLayout(btns)

        # V317: row đường dẫn nhỏ hơn, chiều cao khung cố định vừa đủ để không che đường dẫn và không che nút.
        bulk.setMinimumHeight(150)
        bulk.setMaximumHeight(162)
        layout.addWidget(bulk)

        log_card = QGroupBox("Lịch sử tác vụ")
        log_card.setObjectName("logCard")
        log_l = QVBoxLayout(log_card)
        log_l.setSpacing(8)
        log_l.setContentsMargins(10, 14, 10, 10)
        self.log = QPlainTextEdit()
        self.log.setMinimumHeight(105)
        self.log.setObjectName("sendLog")
        self.log.setReadOnly(True)
        self.log.setPlaceholderText("Nhật ký gửi hồ sơ sẽ hiển thị tại đây...")
        log_l.addWidget(self.log)
        layout.addWidget(log_card, 1)
        return w

    def _path_line(self, value: str, folder: bool) -> QWidget:
        box = QWidget()
        box.setMaximumHeight(24)
        l = QHBoxLayout(box)
        l.setContentsMargins(0, 0, 0, 0)
        l.setSpacing(4)
        ed = QLineEdit(value)
        ed.setObjectName("folderPathLine")
        ed.setProperty("line", True)
        ed.setMinimumHeight(22)
        ed.setMaximumHeight(22)
        ed.setToolTip(value or "")
        b = QPushButton("📁")
        b.setObjectName("browseBtn")
        b.setFixedWidth(32)
        b.setMinimumHeight(22)
        b.setMaximumHeight(22)
        def pick():
            if folder:
                p = QFileDialog.getExistingDirectory(self, "Chọn thư mục", ed.text() or "")
            else:
                p, _ = QFileDialog.getOpenFileName(self, "Chọn file", ed.text() or "", "Exe/XML Files (*.exe *.xml);;All Files (*)")
            if p:
                ed.setText(p)
                ed.setToolTip(p)
        b.clicked.connect(pick)
        l.addWidget(ed); l.addWidget(b)
        box.line_edit = ed  # type: ignore[attr-defined]
        return box

    def _line_text(self, widget: QWidget) -> str:
        return widget.line_edit.text().strip()  # type: ignore[attr-defined]

    def open_xml_many(self):
        box = QMessageBox(self)
        box.setWindowTitle("Mở XML 3176")
        box.setText("Anh muốn mở file XML riêng lẻ hay mở cả thư mục chứa XML?")
        btn_files = box.addButton("Chọn file XML", QMessageBox.ButtonRole.ActionRole)
        btn_folder = box.addButton("Chọn thư mục", QMessageBox.ButtonRole.ActionRole)
        box.addButton("Huỷ", QMessageBox.ButtonRole.RejectRole)
        box.exec()
        paths: list[str] = []
        if box.clickedButton() == btn_files:
            paths, _ = QFileDialog.getOpenFileNames(self, "Chọn một hoặc nhiều XML 3176", "", "XML Files (*.xml)")
        elif box.clickedButton() == btn_folder:
            folder = QFileDialog.getExistingDirectory(self, "Chọn thư mục chứa XML", "")
            if folder:
                paths = [str(p) for p in sorted(Path(folder).glob("*.xml"))]
        if not paths:
            return
        try:
            self.doc = Xml3176Parser.read_many(paths)
            self.current_file = paths[0] if len(paths) == 1 else ""
            self.after_doc_loaded(f"Đã mở {len(paths)} file XML")
        except Exception as exc:
            QMessageBox.critical(self, "Lỗi", str(exc))

    def open_excel_to_screen(self):
        path, _ = QFileDialog.getOpenFileName(self, "Chọn Excel XML3176 đã chỉnh", "", "Excel Files (*.xlsx)")
        if not path: return
        try:
            macskcb = self.doc.macskcb if self.doc else self.cfg.ma_cskcb
            self.doc = Xml3176ExcelIO.import_excel(path, macskcb=macskcb)
            self.current_file = path
            self.after_doc_loaded(f"Đã mở Excel: {Path(path).name}")
        except Exception as exc:
            QMessageBox.critical(self, "Lỗi", str(exc))

    def after_doc_loaded(self, message: str):
        if not self.doc: return
        self.patient_rows = Xml3176Parser.patient_rows(self.doc)
        self.current_hoso_index = None
        self.reload_patient_table()
        self.detail_tabs.clear(); self.detail_tables.clear(); self.xml_preview.clear()
        total_rows = sum(len(s.rows) for s in self.doc.sheets.values())
        self.status.setText(f"{message} | {len(self.patient_rows)} hồ sơ | {len(self.doc.sheets)} loại XML | {total_rows} dòng")

    def reload_patient_table(self):
        if not self.doc:
            self.patient_table.setRowCount(0); return
        query = self.search_box.text().strip().lower() if hasattr(self, 'search_box') else ""
        rows = []
        for p in self.patient_rows:
            hay = " ".join(str(p.get(k, "")) for k in ["MA_LK", "MA_BN", "HO_TEN", "MA_THE_BHYT", "NGAY_VAO", "NGAY_RA"]).lower()
            if not query or query in hay:
                rows.append(p)
        self.patient_table.blockSignals(True)
        self.patient_table.setRowCount(len(rows))
        for r, p in enumerate(rows):
            idx = int(float(str(p.get("__HOSO_INDEX", r + 1) or r + 1)))
            values = [
                "", "", str(r + 1), p.get("MA_LK", ""), p.get("MA_BN", ""), p.get("HO_TEN", ""),
                p.get("MA_THE_BHYT", ""), p.get("NGAY_VAO", ""), p.get("NGAY_RA", ""),
                p.get("T_TONGCHI_BV", ""), p.get("T_BHTT", "")
            ]
            for c, val in enumerate(values):
                item = QTableWidgetItem(val)
                if c == 2:
                    item.setData(Qt.ItemDataRole.UserRole, idx)
                self.patient_table.setItem(r, c, item)
            b_xml = QPushButton("🔎 XML"); b_xml.setObjectName("xmlAction"); b_xml.setToolTip("Mở màn hình xem/sửa XML chi tiết của bệnh nhân")
            b_xml.clicked.connect(lambda _, row=r: self.open_patient_by_row(row, 0))
            b_xls = QPushButton("📗 Excel"); b_xls.setObjectName("excelAction"); b_xls.setToolTip("Xuất riêng hồ sơ bệnh nhân này ra Excel")
            b_xls.clicked.connect(lambda _, row=r: self.export_patient_excel_by_row(row))
            self.patient_table.setCellWidget(r, 0, b_xml)
            self.patient_table.setCellWidget(r, 1, b_xls)
        self.patient_table.blockSignals(False)
        self.patient_table.resizeColumnsToContents()
        self.lbl_summary.setText(f"{len(rows)} / {len(self.patient_rows)} hồ sơ")

    def _hoso_index_from_row(self, row: int) -> int:
        item = self.patient_table.item(row, 2)
        if not item:
            return row + 1
        data = item.data(Qt.ItemDataRole.UserRole)
        try:
            return int(data)
        except Exception:
            return row + 1

    def _current_patient(self) -> dict[str, str]:
        idx = self.current_hoso_index
        if idx is None:
            return {}
        return next((p for p in self.patient_rows if int(float(str(p.get("__HOSO_INDEX", "0") or 0))) == idx), {})

    def open_patient_by_row(self, row: int, column: int = 0):
        if not self.doc or row < 0: return
        self.sync_detail_to_doc()
        idx = self._hoso_index_from_row(row)
        self.current_hoso_index = idx
        self.detail_tabs.clear(); self.detail_tables.clear()
        patient = next((p for p in self.patient_rows if int(float(str(p.get("__HOSO_INDEX", "0") or 0))) == idx), {})
        ma_lk = patient.get("MA_LK", "")
        ordered = DEFAULT_ORDER + [x for x in self.doc.sheet_names() if x not in DEFAULT_ORDER]
        count_tabs = 0
        for loai in ordered:
            if loai not in self.doc.sheets:
                continue
            sheet = self.doc.sheets[loai]
            rows = [r for r in sheet.rows if str(r.get("__HOSO_INDEX", "")) == str(idx) or (ma_lk and str(r.get("MA_LK", "")) == ma_lk)]
            if not rows:
                continue
            table = self._make_detail_table(sheet, rows)
            self.detail_tables[loai] = table
            self.detail_tabs.addTab(table, f"{loai} ({len(rows)})")
            count_tabs += 1
        self.xml_preview.clear()
        self.preview_current_detail()
        try:
            self.patient_splitter.setSizes([210, 790])
        except Exception:
            pass
        self.status.setText(f"Đang xem hồ sơ: {ma_lk or idx} | {patient.get('HO_TEN','')} | {count_tabs} bảng XML")

    def _make_detail_table(self, sheet: XmlSheet, rows: list[dict[str, str]]) -> QTableWidget:
        columns = [c for c in sheet.columns if not c.startswith("__")]
        table = QTableWidget()
        table.setObjectName("detailTable")
        table.setProperty("loai", sheet.loai_hoso)
        table.setProperty("columns", columns)
        table.setAlternatingRowColors(True)
        table.setShowGrid(False)
        table.setShowGrid(False)
        table.setColumnCount(len(columns))
        table.setHorizontalHeaderLabels(columns)
        table.verticalHeader().setDefaultSectionSize(28)
        table.horizontalHeader().setFixedHeight(28)
        table.horizontalHeader().setMinimumSectionSize(54)
        table.setRowCount(len(rows))
        for r, row in enumerate(rows):
            for c, col in enumerate(columns):
                table.setItem(r, c, QTableWidgetItem(row.get(col, "")))
        table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Interactive)
        table.cellClicked.connect(lambda rr, cc, t=table: self.preview_current_detail(rr, cc))
        table.itemChanged.connect(lambda item, t=table: self.preview_current_detail(item.row(), item.column()))
        return table

    def sync_detail_to_doc(self):
        if not self.doc or self.current_hoso_index is None: return
        idx = self.current_hoso_index
        for loai, table in self.detail_tables.items():
            if loai not in self.doc.sheets: continue
            sheet = self.doc.sheets[loai]
            columns = table.property("columns") or []
            new_rows = []
            for r in range(table.rowCount()):
                row = {"__HOSO_INDEX": str(idx)}
                has = False
                for c, col in enumerate(columns):
                    value = "" if table.item(r, c) is None else table.item(r, c).text()
                    row[col] = value
                    if value:
                        has = True
                if has:
                    new_rows.append(row)
            kept = [r for r in sheet.rows if str(r.get("__HOSO_INDEX", "")) != str(idx)]
            sheet.rows = kept + new_rows
            for col in columns:
                if col not in sheet.columns:
                    sheet.columns.append(col)

    def preview_current_detail(self, highlight_row: int | None = None, highlight_col: int | None = None):
        if not self.doc: return
        widget = self.detail_tabs.currentWidget()
        if not isinstance(widget, QTableWidget): return
        loai = widget.property("loai")
        if not loai or loai not in self.doc.sheets: return
        sheet = self.doc.sheets[str(loai)]
        columns = widget.property("columns") or []
        rows = []
        for r in range(widget.rowCount()):
            row = {"__HOSO_INDEX": str(self.current_hoso_index or 1)}
            for c, col in enumerate(columns):
                row[col] = "" if widget.item(r, c) is None else widget.item(r, c).text()
            rows.append(row)
        try:
            self.xml_preview.setPlainText(Xml3176Parser.build_inner_xml(sheet, rows).decode("utf-8", "ignore"))
            if highlight_row is not None and highlight_col is not None and 0 <= highlight_col < len(columns):
                self._highlight_xml_tag(columns[highlight_col], highlight_row)
        except Exception as exc:
            self.xml_preview.setPlainText(str(exc))

    def _highlight_xml_tag(self, tag: str, occurrence_index: int = 0):
        text = self.xml_preview.toPlainText()
        tag_re = re.compile(rf"<{re.escape(tag)}(?:\s[^>]*)?>.*?</{re.escape(tag)}>|<{re.escape(tag)}\s*/>", re.S)
        matches = list(tag_re.finditer(text))
        if not matches:
            return
        m = matches[min(max(occurrence_index, 0), len(matches) - 1)]
        cursor = self.xml_preview.textCursor()
        cursor.setPosition(m.start())
        cursor.setPosition(m.end(), QTextCursor.MoveMode.KeepAnchor)
        fmt = QTextCharFormat()
        fmt.setBackground(QColor("#FFF176"))
        fmt.setForeground(QColor("#000000"))
        sel = QTextEdit.ExtraSelection()
        sel.cursor = cursor
        sel.format = fmt
        self.xml_preview.setExtraSelections([sel])
        self.xml_preview.setTextCursor(cursor)
        self.xml_preview.ensureCursorVisible()

    def _auto_sign_enabled(self) -> bool:
        return self.chk_auto_sign.isChecked() if hasattr(self, "chk_auto_sign") else getattr(self.cfg, "auto_sign_on_export", True)

    def _ma_tinh_from_cskcb(self) -> str:
        cskcb = self.ed_cskcb.text().strip() if hasattr(self, "ed_cskcb") else self.cfg.ma_cskcb
        if hasattr(self, "ed_ma_tinh"):
            ma_tinh = self.ed_ma_tinh.text().strip()
        else:
            ma_tinh = str(getattr(self.cfg, "ma_tinh", "") or "").strip()
        return (ma_tinh or cskcb[:2]).strip()

    def _sign_file_if_needed(self, xml_path: str | Path, final_path: str | Path | None = None) -> Path:
        xml_path = Path(xml_path)
        final_path = Path(final_path) if final_path else xml_path
        if not self._auto_sign_enabled():
            if xml_path != final_path:
                shutil.copyfile(xml_path, final_path)
            return final_path
        # V289: chỉ bỏ qua khi XML có chữ ký số thật (SignatureValue/XMLDSig).
        # Thẻ CHUKYDONVI rỗng không được xem là đã ký.
        if XmlSigner.is_already_signed(xml_path):
            if xml_path.resolve() != final_path.resolve():
                shutil.copyfile(xml_path, final_path)
            return final_path
        try:
            # V313: khi Save/Tách XML có bật ký số cũng phải dùng đúng cơ chế ký XML3176 V304.
            # Không gọi sign_with_app_config trực tiếp nữa, vì cách đó ký trên wrapper cũ nên cổng BH báo 125.
            XmlSigner.prepare_fresh_signed_for_send(xml_path, final_path)
            if not XmlSigner.is_already_signed(final_path):
                raise RuntimeError(
                    "File sau ký chưa có SignatureValue/XMLDSig. Cổng BH sẽ xem là chưa ký số. "
                    "Hãy kiểm tra lại cấu hình ký XML trong Cài đặt hoặc file Signer/SignXml01BH.exe."
                )
            return final_path
        except Exception as exc:
            raise ValueError(
                "Không ký số được XML 3176 bằng cấu hình chữ ký số chung.\n\n"
                "Cổng BH chỉ cho phép gửi XML 3176 đã ký số. Hãy vào Cài đặt → Cấu hình chữ ký số, "
                "hoặc bấm 'Kiểm tra chữ ký số' trong module này để kiểm tra.\n\n"
                f"Chi tiết: {exc}"
            )

    def _write_xml_with_optional_sign(self, doc: Xml3176Document, path: str | Path, hoso_indexes=None, ma_lks=None) -> Path:
        path = Path(path)
        if self._auto_sign_enabled():
            tmp = path.with_suffix(path.suffix + ".unsigned.tmp")
            Xml3176Parser.write(doc, tmp, hoso_indexes=hoso_indexes, ma_lks=ma_lks)
            try:
                self._sign_file_if_needed(tmp, path)
            finally:
                try: tmp.unlink()
                except Exception: pass
            return path
        Xml3176Parser.write(doc, path, hoso_indexes=hoso_indexes, ma_lks=ma_lks)
        return path

    def save_xml_as(self):
        if not self.doc: return
        if self.current_hoso_index is None:
            QMessageBox.information(self, "Chọn bệnh nhân", "Bấm nút XML của một bệnh nhân trước, sau đó Save as XML sẽ lưu riêng hồ sơ đó.")
            return
        p = self._current_patient()
        base = _safe_name(f"{p.get('HO_TEN','')}_{p.get('MA_LK','')}")
        path, _ = QFileDialog.getSaveFileName(self, "Save as XML riêng bệnh nhân", f"{base}.xml", "XML Files (*.xml)")
        if not path: return
        try:
            self.sync_detail_to_doc()
            self._write_xml_with_optional_sign(self.doc, path, hoso_indexes=[self.current_hoso_index])
            self.current_file = path
            msg_sign = "đã ký số" if self._auto_sign_enabled() else "chưa ký số"
            QMessageBox.information(self, "OK", f"Đã lưu XML riêng bệnh nhân ({msg_sign}):\n{path}")
        except Exception as exc:
            QMessageBox.critical(self, "Lỗi", str(exc))

    def split_xml_dialog(self):
        if not self.doc: return
        folder = QFileDialog.getExistingDirectory(self, "Chọn thư mục lưu các XML đã tách", "")
        if not folder: return
        try:
            self.sync_detail_to_doc()
            out_dir = Path(folder)
            made = 0
            for p in self.patient_rows:
                idx = int(float(str(p.get("__HOSO_INDEX", made + 1) or made + 1)))
                name = _safe_name(f"{idx:04d}_{p.get('HO_TEN','')}_{p.get('MA_LK','')}")
                self._write_xml_with_optional_sign(self.doc, out_dir / f"{name}.xml", hoso_indexes=[idx])
                made += 1
            msg_sign = "đã ký số" if self._auto_sign_enabled() else "chưa ký số"
            QMessageBox.information(self, "OK", f"Đã tách {made} XML ({msg_sign}) vào thư mục:\n{folder}")
        except Exception as exc:
            QMessageBox.critical(self, "Lỗi tách XML", str(exc))

    def export_excel_all(self):
        if not self.doc: return
        path, _ = QFileDialog.getSaveFileName(self, "Mở Excel tất cả", "xml3176_tat_ca_benh_nhan.xlsx", "Excel Files (*.xlsx)")
        if not path: return
        try:
            self.sync_detail_to_doc()
            Xml3176ExcelIO.export_excel(self.doc, path)
            self._open_file(path)
            QMessageBox.information(self, "OK", f"Đã xuất Excel tất cả bệnh nhân:\n{path}")
        except Exception as exc:
            QMessageBox.critical(self, "Lỗi", str(exc))

    def export_patient_excel_by_row(self, row: int):
        if not self.doc: return
        idx = self._hoso_index_from_row(row)
        p = next((x for x in self.patient_rows if str(x.get("__HOSO_INDEX")) == str(idx)), {})
        ma_lk = p.get("MA_LK", f"hoso_{idx}")
        base = _safe_name(f"{p.get('HO_TEN','')}_{ma_lk}")
        path, _ = QFileDialog.getSaveFileName(self, "Xuất Excel hồ sơ đang chọn", f"{base}.xlsx", "Excel Files (*.xlsx)")
        if not path: return
        try:
            self.sync_detail_to_doc()
            Xml3176ExcelIO.export_excel(self.doc, path, hoso_indexes=[idx])
            self._open_file(path)
        except Exception as exc:
            QMessageBox.critical(self, "Lỗi", str(exc))

    def excel_to_xml_dialog(self):
        xlsx, _ = QFileDialog.getOpenFileName(self, "Chọn Excel cần chuyển sang XML", "", "Excel Files (*.xlsx)")
        if not xlsx: return
        xml, _ = QFileDialog.getSaveFileName(self, "Lưu XML sau khi chuyển", str(Path(xlsx).with_suffix(".xml")), "XML Files (*.xml)")
        if not xml: return
        try:
            macskcb = self.cfg.ma_cskcb or (self.doc.macskcb if self.doc else "")
            doc = Xml3176ExcelIO.import_excel(xlsx, macskcb=macskcb)
            self._write_xml_with_optional_sign(doc, xml)
            self.doc = doc; self.current_file = xml; self.after_doc_loaded(f"Đã chuyển Excel sang XML: {Path(xml).name}")
            msg_sign = "đã ký số" if self._auto_sign_enabled() else "chưa ký số"
            QMessageBox.information(self, "OK", f"Đã chuyển Excel sang XML ({msg_sign}):\n{xml}")
        except Exception as exc:
            QMessageBox.critical(self, "Lỗi", str(exc))

    def _open_file(self, path: str):
        try:
            if sys.platform.startswith("win"):
                os.startfile(path)  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
        except Exception:
            pass

    def sign_xml_current(self):
        input_path = self.current_file
        if not input_path or not Path(input_path).suffix.lower() == ".xml":
            input_path, _ = QFileDialog.getOpenFileName(self, "Chọn XML cần ký", "", "XML Files (*.xml)")
        if not input_path: return
        signer = self._line_text(self.ed_signer) or self.cfg.signer_exe
        if not signer:
            signer, _ = QFileDialog.getOpenFileName(self, "Chọn SignXml exe", "", "Exe Files (*.exe)")
        if not signer: return
        output_path, _ = QFileDialog.getSaveFileName(self, "Lưu XML đã ký", str(Path(input_path).with_name(Path(input_path).stem + "_signed.xml")), "XML Files (*.xml)")
        if not output_path: return
        try:
            XmlSigner.sign_with_exe(input_path, output_path, signer, self.ed_sign_args.text().strip() or "{exe} {input} {output}")
            self.current_file = output_path
            QMessageBox.information(self, "OK", f"Đã ký XML: {output_path}")
        except Exception as exc:
            QMessageBox.critical(self, "Lỗi ký số", str(exc))

    def _load_common_sign_config(self) -> dict:
        try:
            from signing_service import load_sign_config, find_sign_xml_helper
            cfg = load_sign_config()
            cfg["_helper_found"] = find_sign_xml_helper(cfg)
            return cfg
        except Exception as exc:
            return {"_error": str(exc), "_helper_found": XmlSigner.find_default_signer()}

    def _common_sign_status_text(self) -> tuple[bool, str]:
        cfg = self._load_common_sign_config()
        helper = str(cfg.get("_helper_found", "") or "")
        if not helper or not Path(helper).exists():
            return False, "Chưa tìm thấy Signer/SignXml01BH.exe. Hãy copy file ký số vào thư mục Signer/."
        provider = str(cfg.get("provider", "") or "").strip()
        if not provider:
            return False, "Đã thấy SignXml01BH.exe nhưng chưa cấu hình loại chữ ký trong tab Cài đặt."
        if "VNPT SmartCA" in provider:
            missing = []
            for label, key in [("Base URL", "smartca_base_url"), ("Client ID", "smartca_client_id"), ("Client Secret", "smartca_client_secret"), ("User ID", "smartca_user_id"), ("Password", "smartca_user_password"), ("User Secret/TOTP", "smartca_totp_secret"), ("Serial Number", "smartca_serial_number")]:
                if not str(cfg.get(key, "") or "").strip():
                    missing.append(label)
            if missing:
                return False, "Chưa đủ cấu hình VNPT SmartCA: " + ", ".join(missing)
            return True, "Đã sẵn sàng ký XML bằng VNPT SmartCA. Helper: " + helper
        # USB Token/native
        has_selector = any(str(cfg.get(k, "") or "").strip() for k in ["cert_thumbprint", "cert_serial", "cert_subject"])
        if not has_selector:
            return False, "Đã thấy SignXml01BH.exe nhưng chưa chọn chứng thư USB Token trong tab Cài đặt."
        return True, "Đã sẵn sàng ký XML bằng USB Token. Helper: " + helper

    def check_sign_config(self):
        ok, msg = self._common_sign_status_text()
        if hasattr(self, "lbl_sign_status"):
            self.lbl_sign_status.setText(msg)
            self.lbl_sign_status.setStyleSheet(("background:#F0FDF4; color:#065F46; border:1px solid #BBF7D0;" if ok else "background:#FEF2F2; color:#991B1B; border:1px solid #FECACA;") + " border-radius:8px; padding:8px 10px; font-weight:bold;")
        box = QMessageBox.information if ok else QMessageBox.warning
        box(self, "Kiểm tra chữ ký số", msg)

    def open_host_sign_config(self):
        # Gọi màn hình cấu hình chữ ký số chung của app chính nếu module đang được nhúng.
        obj = getattr(self, "host_parent", None)
        seen = set()
        while obj is not None and id(obj) not in seen:
            seen.add(id(obj))
            if hasattr(obj, "open_sign_config_dialog"):
                try:
                    obj.open_sign_config_dialog()
                    self.check_sign_config()
                    return
                except Exception as exc:
                    QMessageBox.warning(self, "Cấu hình chữ ký", f"Không mở được màn hình cấu hình chữ ký chung: {exc}")
                    return
            try:
                obj = obj.parent()
            except Exception:
                obj = None
        QMessageBox.information(self, "Cấu hình chữ ký", "Hãy mở tab Cài đặt của app chính → Cấu hình chữ ký số XML 01/BH để thiết lập chữ ký.")

    def save_config(self):
        self.cfg.username = self.ed_user.text().strip()
        self._set_cfg_password_value(self.ed_pwd.text())
        self.cfg.ma_tinh = self._ma_tinh_from_cskcb()
        self.cfg.ma_cskcb = self.ed_cskcb.text().strip()
        self.cfg.env = "Chính thức"
        self.cfg.signer_exe = XmlSigner.find_default_signer()
        self.cfg.signer_args = "{exe} {input} {output}"
        self.cfg.folder_pending = self._line_text(self.ed_pending)
        self.cfg.folder_sent = self._line_text(self.ed_sent)
        self.cfg.folder_error = self._line_text(self.ed_error)
        self.cfg.move_after_send = self.chk_move.isChecked()
        self.cfg.auto_sign_on_export = self._auto_sign_enabled()
        try: self.cfg.timeout = int(self.ed_timeout.text().strip() or "60")
        except Exception: self.cfg.timeout = 60
        self.cfg.save()
        self.log_append("Đã lưu cấu hình.")

    def _client(self) -> Bhyt3176Client:
        if not self.ed_user.text().strip() or not self.ed_pwd.text():
            raise ValueError("Thiếu tài khoản hoặc mật khẩu cổng BH")
        return Bhyt3176Client(self.ed_user.text().strip(), self.ed_pwd.text(), timeout=int(self.ed_timeout.text().strip() or "60"))

    def test_connect(self):
        self.save_config()
        if not self.ed_user.text().strip() or not self.ed_pwd.text():
            QMessageBox.warning(self, "Thiếu tài khoản", "Thiếu tài khoản hoặc mật khẩu cổng BH")
            return
        self.log_append("Đang test kết nối cổng BH ở nền, giao diện không bị đơ...")
        self.test_thread = QThread(self)
        self.test_worker = TestConnectWorker(
            self.ed_user.text().strip(),
            self.ed_pwd.text(),
            int(self.ed_timeout.text().strip() or "60"),
        )
        self.test_worker.moveToThread(self.test_thread)
        self.test_thread.started.connect(self.test_worker.run)
        self.test_worker.finished.connect(self._on_test_connect_finished)
        self.test_worker.finished.connect(self.test_thread.quit)
        self.test_worker.finished.connect(self.test_worker.deleteLater)
        self.test_thread.finished.connect(self.test_thread.deleteLater)
        self.test_thread.start()

    def _on_test_connect_finished(self, ok: bool, payload):
        try:
            if isinstance(payload, dict):
                prefix = "Test connect OK" if ok else "Test connect KHÔNG OK"
                self.log_append(prefix + ":\n" + json.dumps(_mask_api_payload(payload), ensure_ascii=False, indent=2))
            else:
                self.log_append(f"Test connect lỗi: {payload}")
            if not ok:
                QMessageBox.warning(self, "Chưa kết nối được", "Cổng trả về maKetQua khác 200 hoặc không có APIKey, hoặc đang lỗi kết nối. Kiểm tra tài khoản, mật khẩu, quyền API, Internet/IP/môi trường.")
        finally:
            self.test_thread = None
            self.test_worker = None

    def send_current_xml(self):
        self.save_config()
        input_path = self.current_file
        if not input_path or not Path(input_path).suffix.lower() == ".xml":
            input_path, _ = QFileDialog.getOpenFileName(self, "Chọn XML cần gửi", "", "XML Files (*.xml)")
        if not input_path:
            return
        try:
            client = self._client()
            src = Path(input_path)
            send_path = src
            if self._auto_sign_enabled():
                tmp_dir = src.parent / ".signed_tmp"
                tmp_dir.mkdir(parents=True, exist_ok=True)
                if XmlSigner.is_already_signed(src):
                    send_path = src
                    self.log_append(f"File đã có chữ ký số thật, gửi nguyên file, không ký lại: {src.name}")
                else:
                    send_path = tmp_dir / src.name
                    self.log_append(f"Đang ký số XML trước khi gửi: {src.name}")
                    XmlSigner.prepare_fresh_signed_for_send(src, send_path)
            elif not XmlSigner.is_already_signed(src):
                QMessageBox.warning(
                    self,
                    "XML chưa ký số",
                    "Cổng BH chỉ cho phép gửi XML 3176 đã ký số.\n"
                    "Bạn nên bật 'Tự ký số khi xuất/gửi' hoặc chọn file XML đã ký số."
                )
            sha = XmlSigner.sha256_file(send_path)
            if sha:
                self.log_append(f"SHA256 file thực tế gửi: {sha}")
            self.log_append(f"Tham số gửi: loaiHoSo=130, maTinh={self._ma_tinh_from_cskcb()}, maCSKCB={self.ed_cskcb.text().strip()}, username={self.ed_user.text().strip()}")
            self.log_append(f"Đang gửi XML: {Path(send_path).name}")
            result = client.send_xml_3176(send_path, self._ma_tinh_from_cskcb(), self.ed_cskcb.text().strip(), "130")
            self.log_append(json.dumps(result, ensure_ascii=False, indent=2))
            if str(result.get("maKetQua", "")).strip() == "123":
                self.log_append("Cổng BH báo 123: File chưa được ký số. Hãy kiểm tra file sau ký trong thư mục .signed_tmp.")
            QMessageBox.information(self, "Kết quả gửi", json.dumps(result, ensure_ascii=False, indent=2))
        except Exception as exc:
            self.log_append(f"Lỗi gửi XML: {exc}")
            QMessageBox.critical(self, "Lỗi gửi XML", str(exc))

    def stop_batch_send(self):
        self.stop_sending = True
        try:
            if self.send_worker is not None:
                self.send_worker.request_stop()
        except Exception:
            pass
        self.log_append("Đã yêu cầu dừng gửi. Tool sẽ dừng sau file đang xử lý.")

    def _set_send_busy(self, busy: bool):
        try:
            if hasattr(self, "btn_start_send"):
                self.btn_start_send.setEnabled(not busy)
            if hasattr(self, "btn_stop_send"):
                self.btn_stop_send.setEnabled(busy)
            self.log.setProperty("sending", busy)
        except Exception:
            pass

    def batch_send_folder(self):
        self.save_config()
        self.stop_sending = False
        pending = Path(self._line_text(self.ed_pending))
        sent = Path(self._line_text(self.ed_sent) or (pending / "da_gui"))
        error = Path(self._line_text(self.ed_error) or (pending / "gui_loi"))
        if not pending.exists():
            QMessageBox.warning(self, "Thiếu thư mục", "Chưa chọn thư mục hồ sơ chờ gửi")
            return
        files = sorted([p for p in pending.glob("*.xml") if not p.name.endswith(".unsigned.tmp")])
        if not files:
            self.log_append("Không có file XML trong thư mục chờ gửi.")
            return
        if not self.ed_user.text().strip() or not self.ed_pwd.text():
            QMessageBox.warning(self, "Thiếu tài khoản", "Thiếu tài khoản hoặc mật khẩu cổng BH")
            return
        self.log_append(f"Bắt đầu gửi nền {len(files)} file. Giao diện vẫn dùng được, có thể bấm Stop để dừng sau file đang xử lý.")
        self._set_send_busy(True)
        self.send_thread = QThread(self)
        self.send_worker = BatchSendWorker(
            username=self.ed_user.text().strip(),
            password=self.ed_pwd.text(),
            timeout=int(self.ed_timeout.text().strip() or "60"),
            ma_tinh=self._ma_tinh_from_cskcb(),
            ma_cskcb=self.ed_cskcb.text().strip(),
            pending=str(pending),
            sent=str(sent),
            error=str(error),
            move_after_send=self.chk_move.isChecked(),
            auto_sign=self._auto_sign_enabled(),
            signer_exe=XmlSigner.find_default_signer(),
            signer_args="{exe} {input} {output}",
        )
        self.send_worker.moveToThread(self.send_thread)
        self.send_thread.started.connect(self.send_worker.run)
        self.send_worker.log.connect(self.log_append)
        self.send_worker.finished.connect(self._on_batch_send_finished)
        self.send_worker.finished.connect(self.send_thread.quit)
        self.send_worker.finished.connect(self.send_worker.deleteLater)
        self.send_thread.finished.connect(self.send_thread.deleteLater)
        self.send_thread.start()

    def _on_batch_send_finished(self, message: str):
        self.log_append(message)
        self._set_send_busy(False)
        self.send_thread = None
        self.send_worker = None

    def log_append(self, text: str):
        self.log.appendPlainText(text)


def main():
    app = QApplication(sys.argv)
    win = Xml3176Editor()
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
