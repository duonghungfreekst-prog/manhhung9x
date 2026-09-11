from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional


@dataclass
class XmlSheet:
    loai_hoso: str
    root_tag: str
    list_tag: Optional[str]
    record_tag: str
    columns: List[str]
    rows: List[Dict[str, str]] = field(default_factory=list)


@dataclass
class Xml3176Document:
    macskcb: str = ""
    ngaylap: str = ""
    sheets: Dict[str, XmlSheet] = field(default_factory=dict)
    outer_attrs: Dict[str, str] = field(default_factory=dict)
    source_path: str = ""

    def sheet_names(self) -> List[str]:
        def key(name: str):
            try:
                return int(name.replace("XML", ""))
            except Exception:
                return 9999
        return sorted(self.sheets.keys(), key=key)
