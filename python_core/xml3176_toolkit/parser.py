from __future__ import annotations

import base64
import copy
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Iterable

from .models import Xml3176Document, XmlSheet
from .schema import XML_STRUCTURE, DEFAULT_ORDER

XML_DECL_RE = re.compile(br"^\s*<\?xml[^>]*\?>", re.I)
META_COLS = ["__HOSO_INDEX"]


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _find_child(el: ET.Element, name: str) -> Optional[ET.Element]:
    for child in list(el):
        if _strip_ns(child.tag) == name:
            return child
    return None


def _findall(root: ET.Element, name: str) -> Iterable[ET.Element]:
    for el in root.iter():
        if _strip_ns(el.tag) == name:
            yield el


def _text(el: Optional[ET.Element]) -> str:
    return "" if el is None or el.text is None else str(el.text)


def _children_as_row(el: ET.Element) -> Tuple[List[str], Dict[str, str]]:
    cols: List[str] = []
    row: Dict[str, str] = {}
    for child in list(el):
        tag = _strip_ns(child.tag)
        if tag not in row:
            cols.append(tag)
        row[tag] = _text(child)
    return cols, row


def _decode_noidungfile(value: str) -> bytes:
    raw = (value or "").strip()
    if not raw:
        return b""
    if raw.startswith("<"):
        return raw.encode("utf-8")
    compact = re.sub(r"\s+", "", raw)
    try:
        return base64.b64decode(compact, validate=False)
    except Exception:
        return raw.encode("utf-8")


def _inner_xml_to_sheet(loai: str, content: bytes, hoso_index: int = 1, source_file: str = "") -> XmlSheet:
    spec = XML_STRUCTURE.get(loai, {})
    root_tag = spec.get("root", loai)
    list_tag = spec.get("list")
    record_tag = spec.get("record", root_tag)
    if not content.strip():
        return XmlSheet(loai, root_tag, list_tag, record_tag, META_COLS.copy(), [])

    content = XML_DECL_RE.sub(b"", content).strip()
    root = ET.fromstring(content)
    root_tag = _strip_ns(root.tag)
    list_tag = spec.get("list")
    record_tag = spec.get("record")

    if list_tag and record_tag:
        list_el = _find_child(root, list_tag)
        records = [] if list_el is None else [x for x in list(list_el) if _strip_ns(x.tag) == record_tag]
    else:
        record_tag = root_tag
        records = [root]
        list_tag = None

    columns: List[str] = META_COLS.copy()
    rows: List[Dict[str, str]] = []
    for rec in records:
        cols, row = _children_as_row(rec)
        row["__HOSO_INDEX"] = str(hoso_index)
        if source_file:
            row["__SOURCE_FILE"] = source_file
        for c in cols:
            if c not in columns:
                columns.append(c)
        if "__SOURCE_FILE" in row and "__SOURCE_FILE" not in columns:
            columns.append("__SOURCE_FILE")
        rows.append(row)

    return XmlSheet(loai, root_tag, list_tag, record_tag or root_tag, columns, rows)


def _merge_sheet(target: XmlSheet, incoming: XmlSheet) -> XmlSheet:
    for col in incoming.columns:
        if col not in target.columns:
            target.columns.append(col)
    target.rows.extend(incoming.rows)
    return target


def _row_hoso_index(row: Dict[str, str]) -> int:
    raw = str(row.get("__HOSO_INDEX", "1") or "1").strip()
    try:
        return int(float(raw))
    except Exception:
        return 1


def _row_ma_lk(row: Dict[str, str]) -> str:
    return str(row.get("MA_LK", "") or "").strip()


class Xml3176Parser:
    """Đọc và dựng lại XML 3176 dạng GIAMDINHHS.

    v0.3: UI quản lý theo danh sách bệnh nhân / MA_LK. Nội bộ vẫn giữ
    __HOSO_INDEX để ghi lại đúng nhiều HOSO trong 1 file, nhưng Excel xuất ra
    không cần sheet Meta và không cần cột nội bộ này.
    """

    @staticmethod
    def read(path: str | Path, start_index: int = 1) -> Xml3176Document:
        path = Path(path)
        tree = ET.parse(path)
        root = tree.getroot()
        if _strip_ns(root.tag) != "GIAMDINHHS":
            raise ValueError("File không phải XML 3176 dạng GIAMDINHHS")

        doc = Xml3176Document(source_path=str(path), outer_attrs=dict(root.attrib))
        thongtin_donvi = next(_findall(root, "THONGTINDONVI"), None)
        if thongtin_donvi is not None:
            doc.macskcb = _text(_find_child(thongtin_donvi, "MACSKCB"))
        thongtin_hoso = next(_findall(root, "THONGTINHOSO"), None)
        if thongtin_hoso is not None:
            doc.ngaylap = _text(_find_child(thongtin_hoso, "NGAYLAP"))

        hosos = list(_findall(root, "HOSO"))
        if not hosos:
            hosos = [root]
        for local_index, hoso in enumerate(hosos, start=start_index):
            for filehoso in [x for x in hoso.iter() if _strip_ns(x.tag) == "FILEHOSO"]:
                loai = _text(_find_child(filehoso, "LOAIHOSO")).strip().upper()
                noidung = _text(_find_child(filehoso, "NOIDUNGFILE"))
                if not loai:
                    continue
                sheet = _inner_xml_to_sheet(loai, _decode_noidungfile(noidung), local_index, path.name)
                if loai in doc.sheets:
                    _merge_sheet(doc.sheets[loai], sheet)
                else:
                    doc.sheets[loai] = sheet
        return doc

    @staticmethod
    def read_many(paths: List[str | Path]) -> Xml3176Document:
        merged = Xml3176Document()
        next_index = 1
        source_names = []
        for p in paths:
            d = Xml3176Parser.read(p, start_index=next_index)
            if not merged.macskcb:
                merged.macskcb = d.macskcb
            if not merged.ngaylap:
                merged.ngaylap = d.ngaylap
            if not merged.outer_attrs:
                merged.outer_attrs = d.outer_attrs
            source_names.append(Path(p).name)
            for loai, sheet in d.sheets.items():
                if loai in merged.sheets:
                    _merge_sheet(merged.sheets[loai], sheet)
                else:
                    merged.sheets[loai] = sheet
            next_index = max(Xml3176Parser._hoso_indexes(merged) or [0]) + 1
        merged.source_path = "; ".join(source_names)
        return merged

    @staticmethod
    def patient_rows(doc: Xml3176Document) -> List[Dict[str, str]]:
        if not doc:
            return []
        xml1 = doc.sheets.get("XML1")
        patients: Dict[int, Dict[str, str]] = {}
        if xml1:
            for row in xml1.rows:
                idx = _row_hoso_index(row)
                patients[idx] = dict(row)
        # Bổ sung hồ sơ không có XML1 bằng MA_LK từ các sheet khác.
        for sheet in doc.sheets.values():
            for row in sheet.rows:
                idx = _row_hoso_index(row)
                if idx not in patients:
                    patients[idx] = {
                        "__HOSO_INDEX": str(idx),
                        "MA_LK": row.get("MA_LK", ""),
                        "HO_TEN": row.get("HO_TEN", ""),
                        "MA_THE_BHYT": row.get("MA_THE_BHYT", ""),
                        "NGAY_VAO": row.get("NGAY_VAO", ""),
                        "NGAY_RA": row.get("NGAY_RA", ""),
                        "MA_CSKCB": row.get("MA_CSKCB", ""),
                    }
        return [patients[k] for k in sorted(patients)]

    @staticmethod
    def filter_doc(doc: Xml3176Document, hoso_indexes: Optional[List[int]] = None, ma_lks: Optional[List[str]] = None) -> Xml3176Document:
        if hoso_indexes is None and ma_lks is None:
            return copy.deepcopy(doc)
        idx_set = set(hoso_indexes or [])
        lk_set = {str(x).strip() for x in (ma_lks or []) if str(x).strip()}
        new = Xml3176Document(macskcb=doc.macskcb, ngaylap=doc.ngaylap, outer_attrs=dict(doc.outer_attrs), source_path=doc.source_path)
        for loai, sheet in doc.sheets.items():
            rows = []
            for row in sheet.rows:
                if idx_set and _row_hoso_index(row) in idx_set:
                    rows.append(dict(row)); continue
                if lk_set and _row_ma_lk(row) in lk_set:
                    rows.append(dict(row)); continue
            if rows:
                new.sheets[loai] = XmlSheet(sheet.loai_hoso, sheet.root_tag, sheet.list_tag, sheet.record_tag, list(sheet.columns), rows)
        return new

    @staticmethod
    def build_inner_xml(sheet: XmlSheet, rows: Optional[List[Dict[str, str]]] = None) -> bytes:
        data_rows = rows if rows is not None else sheet.rows
        root = ET.Element(sheet.root_tag)
        parent = root
        if sheet.list_tag:
            parent = ET.SubElement(root, sheet.list_tag)
        data_columns = [c for c in sheet.columns if not c.startswith("__")]
        if sheet.list_tag:
            for row in data_rows:
                rec = ET.SubElement(parent, sheet.record_tag)
                for col in data_columns:
                    child = ET.SubElement(rec, col)
                    value = row.get(col, "")
                    child.text = None if value is None or value == "" else str(value)
        else:
            row = data_rows[0] if data_rows else {}
            for col in data_columns:
                child = ET.SubElement(root, col)
                value = row.get(col, "")
                child.text = None if value is None or value == "" else str(value)
        ET.indent(root, space="  ")
        return ET.tostring(root, encoding="utf-8", xml_declaration=False)

    @staticmethod
    def _hoso_indexes(doc: Xml3176Document) -> List[int]:
        indexes = set()
        for sheet in doc.sheets.values():
            for row in sheet.rows:
                indexes.add(_row_hoso_index(row))
        return sorted(indexes) or [1]

    @staticmethod
    def write(doc: Xml3176Document, path: str | Path, hoso_indexes: Optional[List[int]] = None, ma_lks: Optional[List[str]] = None) -> None:
        if hoso_indexes is not None or ma_lks is not None:
            doc = Xml3176Parser.filter_doc(doc, hoso_indexes=hoso_indexes, ma_lks=ma_lks)
        attrs = doc.outer_attrs or {
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
        }
        root = ET.Element("GIAMDINHHS", attrs)
        dv = ET.SubElement(root, "THONGTINDONVI")
        ET.SubElement(dv, "MACSKCB").text = doc.macskcb or None
        hs = ET.SubElement(root, "THONGTINHOSO")
        ET.SubElement(hs, "NGAYLAP").text = doc.ngaylap or None
        hoso_indexes2 = Xml3176Parser._hoso_indexes(doc)
        ET.SubElement(hs, "SOLUONGHOSO").text = str(len(hoso_indexes2))
        dshs = ET.SubElement(hs, "DANHSACHHOSO")

        ordered = DEFAULT_ORDER + [x for x in doc.sheet_names() if x not in DEFAULT_ORDER]
        for idx in hoso_indexes2:
            hoso = ET.SubElement(dshs, "HOSO")
            for loai in ordered:
                sheet = doc.sheets.get(loai)
                if sheet is None:
                    continue
                rows = [row for row in sheet.rows if _row_hoso_index(row) == idx]
                if not rows:
                    continue
                fh = ET.SubElement(hoso, "FILEHOSO")
                ET.SubElement(fh, "LOAIHOSO").text = loai
                inner = Xml3176Parser.build_inner_xml(sheet, rows)
                encoded = base64.b64encode(inner).decode("ascii") if inner.strip() else ""
                ET.SubElement(fh, "NOIDUNGFILE").text = encoded or None

        ET.SubElement(root, "CHUKYDONVI")
        ET.indent(root, space="  ")
        ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
