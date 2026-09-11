"""
DMH_Tools - Nội Soi AI 4K
Module D-Report: Xuất báo cáo Word/PDF
Tự động điền thông tin bệnh nhân và chèn 4 ảnh đẹp nhất vào template Word.
"""

import os
import logging
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# Template mặc định đặt tại python_core/templates/report_template.docx
DEFAULT_TEMPLATE = Path(__file__).parent / "templates" / "report_template.docx"


def export_word_report(
    patient: Dict,
    session: Dict,
    image_paths: List[str],
    output_path: str,
    template_path: Optional[str] = None,
) -> bool:
    """
    Tạo báo cáo Word từ template, điền thông tin bệnh nhân và chèn ảnh.
    
    Args:
        patient: dict từ database.get_patient()
        session: dict từ database.get_session()
        image_paths: danh sách đường dẫn ảnh 4K (tối đa 4 ảnh)
        output_path: đường dẫn file Word xuất ra
        template_path: template Word tùy chỉnh
    """
    try:
        from docx import Document
        from docx.shared import Inches, Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH

        tpl = str(template_path or DEFAULT_TEMPLATE)

        # Dùng template nếu có, ngược lại tạo mới từ đầu
        if os.path.exists(tpl):
            doc = Document(tpl)
            _fill_template_placeholders(doc, patient, session)
        else:
            doc = _build_report_from_scratch(patient, session)

        # Chèn ảnh (tối đa 4 ảnh)
        imgs = [p for p in image_paths if os.path.exists(p)][:4]
        if imgs:
            doc.add_heading("Hình Ảnh Nội Soi", level=2)
            # Xếp 2 ảnh mỗi hàng
            table = doc.add_table(rows=(len(imgs) + 1) // 2, cols=2)
            table.style = "Table Grid"
            for idx, img_path in enumerate(imgs):
                row_idx, col_idx = divmod(idx, 2)
                cell = table.cell(row_idx, col_idx)
                cell.paragraphs[0].add_run().add_picture(img_path, width=Inches(3.0))

        # Ngày giờ xuất báo cáo
        doc.add_paragraph(
            f"\nNgày xuất báo cáo: {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        ).alignment = WD_ALIGN_PARAGRAPH.RIGHT

        doc.save(output_path)
        logger.info(f"[Report] Word saved: {output_path}")
        return True

    except ImportError:
        logger.warning("[Report] python-docx chưa cài. Chạy: pip install python-docx")
        return False
    except Exception as e:
        logger.error(f"[Report] Lỗi xuất Word: {e}")
        return False


def _fill_template_placeholders(doc, patient: Dict, session: Dict):
    """Thay thế các placeholder {{...}} trong template Word."""
    replacements = {
        "{{HO_TEN}}":       patient.get("full_name", ""),
        "{{NGAY_SINH}}":    patient.get("birth_year", ""),
        "{{GIOI_TINH}}":    patient.get("gender", ""),
        "{{MA_BENH_NHAN}}": patient.get("patient_code", ""),
        "{{NGAY_KHAM}}":    session.get("exam_date", ""),
        "{{LOAI_NOI_SOI}}": session.get("exam_type", ""),
        "{{BAC_SI}}":       session.get("doctor_name", ""),
        "{{CHAN_DOAN}}":     session.get("diagnosis", ""),
        "{{GHI_CHU}}":      session.get("note", ""),
    }
    for para in doc.paragraphs:
        for key, val in replacements.items():
            if key in para.text:
                for run in para.runs:
                    run.text = run.text.replace(key, str(val))

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    for key, val in replacements.items():
                        if key in para.text:
                            for run in para.runs:
                                run.text = run.text.replace(key, str(val))


def _build_report_from_scratch(patient: Dict, session: Dict):
    """Tạo báo cáo Word từ đầu khi không có template."""
    from docx import Document
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()

    # Tiêu đề
    title = doc.add_heading("PHIẾU KẾT QUẢ NỘI SOI TAI MŨI HỌNG", level=1)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph()

    # Thông tin bệnh nhân
    doc.add_heading("Thông Tin Bệnh Nhân", level=2)
    info_table = doc.add_table(rows=4, cols=2)
    info_table.style = "Table Grid"
    rows_data = [
        ("Họ và tên:", patient.get("full_name", "")),
        ("Năm sinh:", patient.get("birth_year", "")),
        ("Giới tính:", patient.get("gender", "")),
        ("Mã bệnh nhân:", patient.get("patient_code", "")),
    ]
    for i, (label, value) in enumerate(rows_data):
        info_table.cell(i, 0).text = label
        info_table.cell(i, 1).text = str(value)

    doc.add_paragraph()

    # Thông tin khám
    doc.add_heading("Thông Tin Khám", level=2)
    exam_table = doc.add_table(rows=4, cols=2)
    exam_table.style = "Table Grid"
    exam_data = [
        ("Ngày khám:", session.get("exam_date", "")),
        ("Loại nội soi:", session.get("exam_type", "")),
        ("Bác sĩ:", session.get("doctor_name", "")),
        ("Chẩn đoán:", session.get("diagnosis", "")),
    ]
    for i, (label, value) in enumerate(exam_data):
        exam_table.cell(i, 0).text = label
        exam_table.cell(i, 1).text = str(value)

    doc.add_paragraph()
    doc.add_heading("Kết Luận & Chỉ Định", level=2)
    doc.add_paragraph(session.get("note", "_" * 80))
    doc.add_paragraph()
    doc.add_paragraph("Chữ ký bác sĩ: ___________________________").alignment = WD_ALIGN_PARAGRAPH.RIGHT

    return doc


def export_pdf_report(word_path: str, pdf_path: str) -> bool:
    """Chuyển đổi Word sang PDF (dùng LibreOffice hoặc reportlab)."""
    # Phương pháp 1: Dùng LibreOffice (cần cài LibreOffice trên máy)
    try:
        import subprocess
        result = subprocess.run(
            ["soffice", "--headless", "--convert-to", "pdf",
             "--outdir", str(Path(pdf_path).parent), word_path],
            capture_output=True, timeout=30
        )
        if result.returncode == 0:
            logger.info(f"[Report] PDF saved via LibreOffice: {pdf_path}")
            return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    logger.warning("[Report] LibreOffice không khả dụng. Hãy mở Word và xuất PDF thủ công.")
    return False


def create_default_template():
    """Tạo template Word mặc định nếu chưa có."""
    template_dir = Path(__file__).parent / "templates"
    template_dir.mkdir(exist_ok=True)
    template_path = template_dir / "report_template.docx"

    if template_path.exists():
        return

    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH

        doc = Document()
        doc.add_heading("PHIẾU KẾT QUẢ NỘI SOI", level=1).alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.add_paragraph("Họ và tên: {{HO_TEN}}")
        doc.add_paragraph("Năm sinh: {{NGAY_SINH}}   |   Giới tính: {{GIOI_TINH}}")
        doc.add_paragraph("Mã bệnh nhân: {{MA_BENH_NHAN}}")
        doc.add_paragraph("Ngày khám: {{NGAY_KHAM}}   |   Loại nội soi: {{LOAI_NOI_SOI}}")
        doc.add_paragraph("Bác sĩ thực hiện: {{BAC_SI}}")
        doc.add_paragraph("Chẩn đoán: {{CHAN_DOAN}}")
        doc.add_paragraph("Ghi chú: {{GHI_CHU}}")
        doc.save(str(template_path))
        logger.info(f"[Report] Đã tạo template mặc định: {template_path}")
    except ImportError:
        logger.warning("[Report] python-docx chưa cài, không thể tạo template.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    create_default_template()

    # Test
    patient = {"full_name": "Nguyễn Văn An", "birth_year": "1985",
               "gender": "Nam", "patient_code": "BN001"}
    session = {"exam_date": "11/05/2026", "exam_type": "Nội soi mũi",
               "doctor_name": "BS. Trần Minh", "diagnosis": "Viêm mũi mãn tính", "note": ""}
    ok = export_word_report(patient, session, [], "test_report.docx")
    print(f"Xuất báo cáo: {'✅ OK' if ok else '❌ Thất bại'}")
