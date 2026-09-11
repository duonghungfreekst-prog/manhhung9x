from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path

CONFIG_FILE = Path.home() / ".xml3176_toolkit_config.json"


@dataclass
class AppConfig:
    username: str = ""
    password: str = ""
    ma_tinh: str = ""
    ma_cskcb: str = ""
    env: str = "Chính thức"
    timeout: int = 60
    signer_exe: str = ""
    signer_args: str = "{exe} {input} {output}"
    move_after_send: bool = True
    folder_pending: str = ""
    folder_sent: str = ""
    folder_error: str = ""
    auto_sign_on_export: bool = True

    @classmethod
    def load(cls) -> "AppConfig":
        if not CONFIG_FILE.exists():
            return cls()
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
        except Exception:
            return cls()

    def save(self) -> None:
        CONFIG_FILE.write_text(json.dumps(asdict(self), ensure_ascii=False, indent=2), encoding="utf-8")
