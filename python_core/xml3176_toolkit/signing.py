from __future__ import annotations

import os
import hashlib
import base64
import re
import shlex
import uuid
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape as _xml_escape


class XmlSigner:
    """Bọc ký số XML bằng công cụ ngoài trên máy thật.

    Hỗ trợ cấu hình dòng lệnh dạng template:
      {exe} {input} {output}
      {exe} /in {input} /out {output}
    """

    DEFAULT_NAMES = ["SignXml3176.exe", "SignXml01BH.exe", "SignXml.exe"]

    @staticmethod
    def is_already_signed(xml_path: str | Path) -> bool:
        """Nhận diện XML đã có chữ ký số THẬT để tránh ký chồng.

        V288 nhận diện quá rộng: chỉ cần thấy thẻ CHUKYDONVI là xem như đã ký.
        Một số XML 3176 có sẵn thẻ CHUKYDONVI rỗng/chưa có ds:Signature, nên
        app bỏ qua bước ký và cổng BH trả mã 123 "File chưa được ký số".

        V289 chỉ xem là đã ký khi trong file có dấu hiệu chữ ký XMLDSig thật:
        SignatureValue hoặc thẻ Signature thuộc chuẩn xmldsig. CHUKYDONVI đơn
        thuần KHÔNG còn được xem là đã ký.
        """
        try:
            data = Path(xml_path).read_bytes()
            head = data[:500000].decode("utf-8", errors="ignore")
            low = head.lower()
            if "<signaturevalue" in low or "</signaturevalue" in low:
                return True
            if "xmlns=\"http://www.w3.org/2000/09/xmldsig#\"" in low and ("<signature" in low or "<ds:signature" in low):
                return True
            if "http://www.w3.org/2000/09/xmldsig#" in low and ("<signature" in low or "<ds:signature" in low):
                return True
            return False
        except Exception:
            return False

    @staticmethod
    def has_xml_signature(xml_path: str | Path) -> bool:
        return XmlSigner.is_already_signed(xml_path)

    @staticmethod
    def sha256_file(xml_path: str | Path) -> str:
        try:
            h = hashlib.sha256()
            with open(xml_path, "rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    h.update(chunk)
            return h.hexdigest().upper()
        except Exception:
            return ""

    @staticmethod
    def normalize_x509_subject_name_after_sign(xml_path: str | Path) -> Path:
        """Chuẩn hóa X509SubjectName sau khi ký XML 3176 theo dạng cổng BH đang nhận.

        V296: KHÔNG dùng cryptography.rfc4514_string() nữa, vì chuỗi này thường xuất
        theo thứ tự ngược và ghi UID thành OID.0.9.2342.19200300.100.1.1. File mẫu
        cổng BH nhận OK đang dùng dạng:
            C=VN,ST=...,L=...,CN=...,UID=MST:...

        X509SubjectName nằm trong KeyInfo của Signature, không nằm trong SignedInfo.
        Với kiểu Reference URI="" + enveloped-signature, việc chuẩn hóa text
        X509SubjectName sau ký không làm thay đổi DigestValue/SignatureValue.
        """
        xml_path = Path(xml_path)
        try:
            text = xml_path.read_text(encoding="utf-8", errors="ignore")
            msub = re.search(r"<X509SubjectName>(.*?)</X509SubjectName>", text, flags=re.IGNORECASE | re.DOTALL)
            if not msub:
                return xml_path
            raw_subject = (msub.group(1) or "").strip()
            if not raw_subject:
                return xml_path

            def _split_subject(s: str):
                # SubjectName helper xuất hiện tại dùng dấu phẩy ngăn cách; giá trị tiếng Việt
                # không có dấu phẩy trong tên PK nên split đơn giản đủ an toàn cho case này.
                out = []
                for part in s.split(','):
                    part = part.strip()
                    if not part or '=' not in part:
                        continue
                    k, v = part.split('=', 1)
                    k = k.strip()
                    v = v.strip()
                    if not k:
                        continue
                    # Map các alias/OID về tên cổng đang chấp nhận.
                    if k.upper() in ("S", "STATE", "STREET"):
                        k = "ST"
                    elif k in ("OID.0.9.2342.19200300.100.1.1", "0.9.2342.19200300.100.1.1"):
                        k = "UID"
                    elif k.upper() == "E" or k.lower() in ("emailaddress", "email"):
                        k = "E"
                    else:
                        k = k.upper() if k.upper() in ("C", "ST", "L", "O", "OU", "CN", "UID") else k
                    out.append((k, v))
                return out

            items = _split_subject(raw_subject)
            if not items:
                return xml_path
            values = {}
            extras = []
            for k, v in items:
                if not v:
                    continue
                if k not in values:
                    values[k] = v
                if k not in ("C", "ST", "L", "CN", "UID"):
                    extras.append((k, v))

            order = ["C", "ST", "L", "CN", "UID"]
            parts = [f"{k}={values[k]}" for k in order if values.get(k)]
            # Chỉ giữ O/OU/E phía sau nếu helper có và subject mẫu không cần các trường này.
            for k, v in extras:
                if k not in order and v and f"{k}={v}" not in parts:
                    parts.append(f"{k}={v}")
            subject = ",".join(parts).strip()
            if not subject or subject == raw_subject:
                return xml_path
            text2 = re.sub(
                r"<X509SubjectName>.*?</X509SubjectName>",
                "<X509SubjectName>" + _xml_escape(subject) + "</X509SubjectName>",
                text,
                flags=re.IGNORECASE | re.DOTALL,
            )
            if text2 != text:
                xml_path.write_text(text2, encoding="utf-8")
            return xml_path
        except Exception:
            return xml_path

    @staticmethod
    def find_default_signer(base_dir: str | Path | None = None) -> str:
        """Tự dò SignXml01BH.exe trong thư mục Signer/ của app chính.

        V286: không yêu cầu người dùng phải tự nhập đường dẫn ký XML cho
        Công cụ XML 3176. Khi chạy source hoặc bản PyInstaller, hàm sẽ dò:
        - thư mục app đang chạy,
        - thư mục _MEIPASS nếu có,
        - thư mục chứa module,
        - thư mục làm việc hiện tại,
        và các thư mục con Signer tương ứng.
        Chỉ dùng Signer/, không dùng Sign/.
        """
        roots: list[Path] = []

        def add_root(x):
            if not x:
                return
            try:
                p = Path(x).resolve()
                if p not in roots:
                    roots.append(p)
                sp = (p / "Signer").resolve()
                if sp not in roots:
                    roots.append(sp)
            except Exception:
                pass

        add_root(base_dir)
        try:
            if getattr(sys, "frozen", False):
                add_root(Path(sys.executable).parent)
                add_root(getattr(sys, "_MEIPASS", ""))
            add_root(Path(sys.argv[0]).parent)
        except Exception:
            pass
        try:
            # .../xml3176_toolkit/signing.py -> .../ (app root)
            add_root(Path(__file__).resolve().parents[1])
        except Exception:
            pass
        add_root(Path.cwd())
        add_root(os.environ.get("DOICHIEU01BH_HOME"))

        for root in roots:
            for name in XmlSigner.DEFAULT_NAMES:
                p = root / name
                if p.exists():
                    return str(p)
        return ""

    @staticmethod
    def _run(cmd: list[str], output_xml: Path, timeout: int) -> tuple[bool, str]:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        msg = (result.stdout or "") + "\n" + (result.stderr or "")
        return result.returncode == 0 and output_xml.exists(), msg.strip()

    @staticmethod
    def sign_with_exe(
        input_xml: str | Path,
        output_xml: str | Path,
        signer_exe: str | Path,
        args_template: str = "{exe} {input} {output}",
        timeout: int = 180,
    ) -> Path:
        input_xml = Path(input_xml)
        output_xml = Path(output_xml)
        signer_exe = Path(signer_exe)
        if not input_xml.exists():
            raise FileNotFoundError(f"Không thấy file XML cần ký: {input_xml}")
        if not signer_exe.exists():
            raise FileNotFoundError(f"Không thấy công cụ ký số: {signer_exe}")
        output_xml.parent.mkdir(parents=True, exist_ok=True)

        templates = [args_template, "{exe} {input} {output}", "{exe} /in {input} /out {output}"]
        tried = []
        last_error = ""
        for tpl in dict.fromkeys(templates):
            try:
                cmd_line = tpl.format(exe=str(signer_exe), input=str(input_xml), output=str(output_xml))
                cmd = shlex.split(cmd_line, posix=False)
                tried.append(cmd_line)
                ok, msg = XmlSigner._run(cmd, output_xml, timeout)
                if ok:
                    return output_xml
                last_error = msg
            except Exception as exc:
                last_error = str(exc)
        raise RuntimeError("Ký số không thành công. Đã thử:\n" + "\n".join(tried) + f"\nChi tiết: {last_error}")

    @staticmethod
    def sign_with_app_config(
        input_xml: str | Path,
        output_xml: str | Path,
        timeout: int = 300,
    ) -> Path:
        """Ký XML 3176 bằng cấu hình chữ ký số dùng chung của app chính.

        V287: không dùng cấu hình signer riêng của module XML3176 nữa.
        Cách ký ưu tiên đi qua signing_service của app chính để dùng đúng cấu hình
        VNPT SmartCA/USB Token đã thiết lập trong tab Cài đặt. Helper SignXml01BH.exe
        hiện nhận cú pháp --mode/--input/--output, nên nếu gọi kiểu positional sẽ thất bại.
        """
        input_xml = Path(input_xml)
        output_xml = Path(output_xml)
        output_xml.parent.mkdir(parents=True, exist_ok=True)
        # V288: không ký chồng file đã có chữ ký số.
        # Nếu cần output khác, copy nguyên byte để không làm thay đổi nội dung đã ký.
        if XmlSigner.is_already_signed(input_xml):
            if input_xml.resolve() != output_xml.resolve():
                shutil.copyfile(input_xml, output_xml)
            return output_xml
        try:
            from signing_service import load_sign_config, find_sign_xml_helper, sign_one_bh01_xml_file
            sign_cfg = load_sign_config()
            helper = find_sign_xml_helper(sign_cfg) or XmlSigner.find_default_signer()
            if not helper or not Path(helper).exists():
                raise FileNotFoundError(
                    "Không tìm thấy Signer/SignXml01BH.exe. Hãy copy file ký số vào thư mục Signer."
                )
            cert_info, err = sign_one_bh01_xml_file(helper, sign_cfg, str(input_xml), str(output_xml))
            if err:
                raise RuntimeError(err)
            if not output_xml.exists() or output_xml.stat().st_size == 0:
                raise RuntimeError(f"Module ký số chạy xong nhưng chưa tạo file đã ký: {output_xml}")
            # V300: tuyệt đối KHÔNG sửa file sau khi helper ký xong.
            # Lỗi 125 có thể xảy ra nếu app chỉnh XML sau ký, kể cả chỉnh KeyInfo/SubjectName.
            return output_xml
        except ImportError:
            # Khi chạy tool độc lập ngoài app chính, fallback về cơ chế cũ.
            signer = XmlSigner.find_default_signer()
            if not signer:
                raise FileNotFoundError("Không tìm thấy Signer/SignXml01BH.exe")
            return XmlSigner.sign_with_exe(input_xml, output_xml, signer, timeout=timeout)


    @staticmethod
    def _strip_ns(tag: str) -> str:
        return tag.split("}", 1)[-1] if "}" in str(tag) else str(tag)

    @staticmethod
    def normalize_noidungfile_base64(input_xml: str | Path, output_xml: str | Path | None = None) -> Path:
        """Chuẩn hóa nội dung thẻ NOIDUNGFILE trước khi ký/gửi XML3176.

        Một số file XML xuất ra có xuống dòng/khoảng trắng bên trong thẻ
        <NOIDUNGFILE>. Base64 vẫn đọc được, nhưng cổng BH có thể kiểm tra chữ
        ký trên bản nội dung đã chuẩn hóa/trim Base64, dẫn đến mã 125
        "Ký sai, file gốc có thể đã bị chỉnh sửa".

        Hàm này chỉ gom Base64 trong NOIDUNGFILE về 1 dòng, không sửa dữ liệu
        nghiệp vụ đã mã hóa trong Base64.
        """
        src = Path(input_xml)
        dst = Path(output_xml) if output_xml is not None else src
        data = src.read_bytes()
        text = data.decode("utf-8", errors="ignore")

        def repl(m):
            body = m.group(1) or ""
            compact = "".join(body.split())
            return f"<NOIDUNGFILE>{compact}</NOIDUNGFILE>"

        text2 = re.sub(
            r"<NOIDUNGFILE\b[^>]*>(.*?)</NOIDUNGFILE>",
            repl,
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(text2, encoding="utf-8")
        return dst

    @staticmethod
    def ensure_qd130_signature_target(input_xml: str | Path, output_xml: str | Path | None = None) -> Path:
        """V292: không tự thêm Id/không parse ghi lại XML 3176 trước khi ký.

        File XML 3176 đã được cổng nhận OK có chữ ký enveloped với
        ``Reference URI=""`` trên toàn tài liệu, đặt trong ``CHUKYDONVI``.
        Bản V291 từng thêm ``Id`` cho ``DANHSACHHOSO`` và ghi lại XML bằng
        ElementTree trước khi ký; cách này có thể làm helper tạo chữ ký không
        đúng dạng cổng BH đang chấp nhận và trả mã 125.

        Vì vậy hàm này chỉ bảo đảm có thẻ ``CHUKYDONVI`` rỗng ở cuối nếu file
        chưa có. Ngoài ra giữ nguyên byte/nội dung XML nghiệp vụ tối đa.
        """
        src = Path(input_xml)
        dst = Path(output_xml) if output_xml is not None else src
        try:
            data = src.read_bytes()
            text = data.decode("utf-8", errors="ignore")
            low = text.lower()
            if "<chukydonvi" in low:
                if dst != src:
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(src, dst)
                return dst

            # Chèn CHUKYDONVI ngay trước thẻ đóng GIAMDINHHS, không đụng cấu trúc khác.
            m = re.search(r"</\s*GIAMDINHHS\s*>\s*$", text, flags=re.IGNORECASE)
            if m:
                text2 = text[:m.start()] + "\n<CHUKYDONVI></CHUKYDONVI>\n" + text[m.start():]
            else:
                text2 = text + "\n<CHUKYDONVI></CHUKYDONVI>\n"
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(text2, encoding="utf-8")
            return dst
        except Exception:
            if dst != src:
                try:
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(src, dst)
                except Exception:
                    pass
            return dst

    @staticmethod
    def strip_existing_signature(input_xml: str | Path, output_xml: str | Path) -> Path:
        """Tạo bản XML chưa ký bằng cách bỏ chữ ký XMLDSig hiện có.

        Dùng khi gửi XML 3176 mà cổng BH trả 125 do chữ ký cũ không hợp lệ
        hoặc file đã bị chỉnh sau khi ký. Hàm này chỉ loại bỏ khối Signature,
        giữ nguyên nội dung nghiệp vụ còn lại để helper SignXml01BH.exe ký lại.
        """
        input_xml = Path(input_xml)
        output_xml = Path(output_xml)
        output_xml.parent.mkdir(parents=True, exist_ok=True)
        data = input_xml.read_bytes()
        text = data.decode("utf-8", errors="ignore")
        # Bỏ cả dạng <Signature ...>...</Signature> và <ds:Signature ...>...</ds:Signature>.
        cleaned = re.sub(
            r"<(?:(?:\w+):)?Signature\b[^>]*(?:>.*?</(?:(?:\w+):)?Signature>|\s*/>)",
            "",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        # Dọn các CHUKYDONVI rỗng quá nhiều khoảng trắng nhưng vẫn giữ thẻ để helper ký có thể điền.
        cleaned = re.sub(r"<CHUKYDONVI>\s*</CHUKYDONVI>", "<CHUKYDONVI></CHUKYDONVI>", cleaned, flags=re.IGNORECASE)
        output_xml.write_text(cleaned, encoding="utf-8")
        # V292: sau khi bỏ chữ ký cũ, chỉ bảo đảm CHUKYDONVI rỗng; không thêm Id/không ghi lại bằng ElementTree.
        return XmlSigner.ensure_qd130_signature_target(output_xml, output_xml)


    @staticmethod
    def _local_name(tag: str) -> str:
        return str(tag).split("}", 1)[-1] if "}" in str(tag) else str(tag)

    @staticmethod
    def _element_inner_xml_utf8_declaration(raw_b64: str) -> str:
        """Chuẩn hóa phần XML con nằm trong NOIDUNGFILE theo dạng tool 3176 ký OK.

        File 3176 gửi cổng thành công có NOIDUNGFILE là base64 của XML con có
        XML declaration ở đầu và dùng CRLF, ví dụ:
            <?xml version="1.0" encoding="utf-8"?><TONG_HOP>\r\n...

        Hàm này chỉ tác động TRƯỚC KHI KÝ file bao ngoài.
        """
        compact = "".join((raw_b64 or "").split())
        if not compact:
            return ""
        try:
            data = base64.b64decode(compact, validate=False)
            text = data.decode("utf-8-sig", errors="ignore")
        except Exception:
            return compact

        text = text.lstrip("\ufeff").strip()
        text = re.sub(r"^\s*<\?xml\s+[^>]*\?>\s*", "", text, flags=re.IGNORECASE)

        # Không parse/format sâu để tránh đổi nghiệp vụ. Chỉ bỏ khoảng trắng giữa các thẻ
        # do app cũ pretty-print sinh ra, tương tự file tool khác gửi OK.
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
        if lines:
            text = "\r\n".join(lines) + "\r\n"
        else:
            text = text.strip()
        inner = '<?xml version="1.0" encoding="utf-8"?>' + text
        return base64.b64encode(inner.encode("utf-8")).decode("ascii")

    @staticmethod
    def prepare_3176_unsigned_for_sign(input_xml: str | Path, output_xml: str | Path) -> Path:
        """V304: tái dựng XML 3176 chưa ký theo đúng mẫu file 3176 đã gửi cổng OK.

        Điểm rút ra từ file TRẦN VĂN ĐỰC gửi thành công:
        - File bao ngoài bắt đầu bằng <GIAMDINHHS>, không XML declaration.
        - Root GIAMDINHHS không có xmlns:xsd/xmlns:xsi.
        - NOIDUNGFILE là base64 một dòng.
        - XML con bên trong NOIDUNGFILE lại có XML declaration utf-8 và CRLF.
        - CHUKYDONVI rỗng trước khi ký.

        Hàm này chỉ tạo bản unsigned tạm TRƯỚC KHI KÝ. Sau khi ký xong, app
        không parse/format/ghi đè file đã ký.
        """
        src = Path(input_xml)
        dst = Path(output_xml)
        dst.parent.mkdir(parents=True, exist_ok=True)
        raw_text = src.read_bytes().decode("utf-8-sig", errors="ignore")

        # Bỏ signature cũ nếu có trước khi parse bản unsigned.
        raw_text = re.sub(
            r"<(?:(?:\w+):)?Signature\b[^>]*(?:>.*?</(?:(?:\w+):)?Signature>|\s*/>)",
            "",
            raw_text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        raw_text = re.sub(r"^\s*<\?xml\s+[^>]*\?>\s*", "", raw_text, flags=re.IGNORECASE)
        raw_text = re.sub(r"<CHUKYDONVI\b[^>]*>.*?</CHUKYDONVI>", "", raw_text, flags=re.IGNORECASE | re.DOTALL)
        raw_text = re.sub(r"<CHUKYDONVI\s*/>", "", raw_text, flags=re.IGNORECASE)

        try:
            root = ET.fromstring(raw_text.encode("utf-8"))
            def child_text(parent, name, default=""):
                for ch in list(parent):
                    if XmlSigner._local_name(ch.tag).upper() == name.upper():
                        return ch.text or default
                return default
            def child(parent, name):
                for ch in list(parent):
                    if XmlSigner._local_name(ch.tag).upper() == name.upper():
                        return ch
                return None

            ttdv = child(root, "THONGTINDONVI")
            tths = child(root, "THONGTINHOSO")
            macskcb = child_text(ttdv, "MACSKCB") if ttdv is not None else ""
            ngaylap = child_text(tths, "NGAYLAP") if tths is not None else ""
            soluong = child_text(tths, "SOLUONGHOSO") if tths is not None else "1"

            ds = child(tths, "DANHSACHHOSO") if tths is not None else None
            out = []
            out.append("<GIAMDINHHS><THONGTINDONVI><MACSKCB>" + _xml_escape(macskcb) + "</MACSKCB></THONGTINDONVI><THONGTINHOSO><NGAYLAP>" + _xml_escape(ngaylap) + "</NGAYLAP><SOLUONGHOSO>" + _xml_escape(soluong) + "</SOLUONGHOSO><DANHSACHHOSO>")
            if ds is not None:
                for hoso in list(ds):
                    if XmlSigner._local_name(hoso.tag).upper() != "HOSO":
                        continue
                    out.append("\n<HOSO>")
                    for fh in list(hoso):
                        if XmlSigner._local_name(fh.tag).upper() != "FILEHOSO":
                            continue
                        loai = ""
                        nd = ""
                        for ch in list(fh):
                            ln = XmlSigner._local_name(ch.tag).upper()
                            if ln == "LOAIHOSO":
                                loai = ch.text or ""
                            elif ln == "NOIDUNGFILE":
                                nd = ch.text or ""
                        nd2 = XmlSigner._element_inner_xml_utf8_declaration(nd)
                        out.append("\n<FILEHOSO><LOAIHOSO>" + _xml_escape(loai) + "</LOAIHOSO><NOIDUNGFILE>" + nd2 + "</NOIDUNGFILE></FILEHOSO>")
                    out.append("\n</HOSO>\n")
            out.append("\n</DANHSACHHOSO></THONGTINHOSO><CHUKYDONVI></CHUKYDONVI></GIAMDINHHS>")
            text = "".join(out)
        except Exception:
            # Fallback nếu XML lỗi: vẫn dùng cách cũ nhưng không sửa sau ký.
            text = raw_text
            text = re.sub(r'\s+xmlns:xsd="http://www\.w3\.org/2001/XMLSchema"', '', text, count=1, flags=re.IGNORECASE)
            text = re.sub(r'\s+xmlns:xsi="http://www\.w3\.org/2001/XMLSchema-instance"', '', text, count=1, flags=re.IGNORECASE)
            def _noidung_repl(m):
                return "<NOIDUNGFILE>" + XmlSigner._element_inner_xml_utf8_declaration(m.group(1) or "") + "</NOIDUNGFILE>"
            text = re.sub(r"<NOIDUNGFILE\b[^>]*>(.*?)</NOIDUNGFILE>", _noidung_repl, text, flags=re.IGNORECASE | re.DOTALL)
            if not re.search(r"<CHUKYDONVI\b", text, flags=re.IGNORECASE):
                text = re.sub(r"\s*</\s*GIAMDINHHS\s*>\s*$", "<CHUKYDONVI></CHUKYDONVI></GIAMDINHHS>", text, flags=re.IGNORECASE)

        dst.write_text(text, encoding="utf-8", newline="")
        return dst

    @staticmethod
    def prepare_fresh_signed_for_send(input_xml: str | Path, output_xml: str | Path) -> Path:
        """Tạo file đã ký để gửi cổng BH theo nguyên tắc V303.

        Kết hợp 2 yêu cầu đã rút ra từ lỗi 125:
        1) TRƯỚC KHI KÝ: chuẩn hóa bản XML chưa ký về dạng cổng 3176 hay chấp nhận:
           - bỏ chữ ký cũ nếu có,
           - bảo đảm CHUKYDONVI rỗng,
           - gom NOIDUNGFILE thành Base64 một dòng,
           - bỏ XML declaration ở đầu file.
        2) SAU KHI KÝ: tuyệt đối không parse/format/ghi đè/sửa file đã ký.

        Đây là nguyên tắc giống TT12 nhưng có thêm bước chuẩn hóa TRƯỚC KHI KÝ cho
        riêng XML 3176, vì NOIDUNGFILE có xuống dòng/khoảng trắng rất dễ làm cổng
        kiểm tra lại khác với byte đã ký.
        """
        input_xml = Path(input_xml)
        output_xml = Path(output_xml)
        output_xml.parent.mkdir(parents=True, exist_ok=True)
        if XmlSigner.is_already_signed(input_xml):
            if input_xml.resolve() != output_xml.resolve():
                shutil.copyfile(input_xml, output_xml)
            return output_xml

        unsigned_tmp = output_xml.with_suffix(output_xml.suffix + ".unsigned.tmp")
        XmlSigner.prepare_3176_unsigned_for_sign(input_xml, unsigned_tmp)
        XmlSigner.sign_with_app_config(unsigned_tmp, output_xml)
        # V303: signer có thể tự thêm XML declaration. Bỏ declaration bằng byte-level
        # vì declaration không nằm trong canonicalized XMLDSig; sau đó không sửa gì thêm.
        XmlSigner.remove_xml_declaration_after_sign(output_xml)
        return output_xml


    @staticmethod
    def remove_xml_declaration_after_sign(xml_path: str | Path) -> Path:
        """V302: bỏ XML declaration SAU KHI KÝ mà không parse/format XML.

        Signer/SignXml01BH.exe có thể tự thêm dòng:
            <?xml version="1.0" encoding="utf-8"?>
        vào file đã ký. Một số file XML 3176 cổng nhận OK bắt đầu trực tiếp
        bằng <GIAMDINHHS ...>. XML declaration không thuộc dữ liệu canonicalized
        của XMLDSig, nên bỏ đoạn khai báo này bằng thao tác byte-level không làm
        thay đổi DigestValue/SignatureValue.

        Hàm này KHÔNG parse XML, KHÔNG format lại XML, KHÔNG ghi đè bất kỳ
        nội dung nào sau thẻ gốc; chỉ cắt phần khai báo XML nếu nó nằm ngay đầu file.
        """
        path = Path(xml_path)
        try:
            data = path.read_bytes()
            # Giữ BOM nếu có, chỉ bỏ XML declaration ở đầu file.
            bom = b""
            body = data
            if body.startswith(b"\xef\xbb\xbf"):
                bom = b"\xef\xbb\xbf"
                body = body[3:]
            m = re.match(br"\s*<\?xml\s+[^>]*\?>\s*", body, flags=re.IGNORECASE)
            if not m:
                return path
            new_data = bom + body[m.end():]
            if new_data != data and new_data.lstrip().startswith(b"<GIAMDINHHS"):
                path.write_bytes(new_data)
            return path
        except Exception:
            return path

    @staticmethod
    def copy_as_unsigned(input_xml: str | Path, output_xml: str | Path) -> Path:
        shutil.copyfile(input_xml, output_xml)
        return Path(output_xml)
