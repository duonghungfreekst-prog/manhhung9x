from __future__ import annotations

import argparse
import json

from .parser import Xml3176Parser
from .excel_io import Xml3176ExcelIO
from .signing import XmlSigner
from .api_client import Bhyt3176Client


def main() -> None:
    p = argparse.ArgumentParser(prog="xml3176-toolkit")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("to-excel")
    a.add_argument("input_xml")
    a.add_argument("output_xlsx")

    a = sub.add_parser("to-xml")
    a.add_argument("input_xlsx")
    a.add_argument("output_xml")

    a = sub.add_parser("sign")
    a.add_argument("input_xml")
    a.add_argument("output_xml")
    a.add_argument("--signer", required=True)

    a = sub.add_parser("send")
    a.add_argument("xml")
    a.add_argument("--username", required=True)
    a.add_argument("--password", required=True)
    a.add_argument("--ma-tinh", required=True)
    a.add_argument("--ma-cskcb", required=True)

    args = p.parse_args()
    if args.cmd == "to-excel":
        doc = Xml3176Parser.read(args.input_xml)
        Xml3176ExcelIO.export_excel(doc, args.output_xlsx)
        print(f"Đã xuất Excel: {args.output_xlsx}")
    elif args.cmd == "to-xml":
        doc = Xml3176ExcelIO.import_excel(args.input_xlsx)
        Xml3176Parser.write(doc, args.output_xml)
        print(f"Đã xuất XML: {args.output_xml}")
    elif args.cmd == "sign":
        XmlSigner.sign_with_exe(args.input_xml, args.output_xml, args.signer)
        print(f"Đã ký số: {args.output_xml}")
    elif args.cmd == "send":
        client = Bhyt3176Client(args.username, args.password)
        result = client.send_xml_3176(args.xml, args.ma_tinh, args.ma_cskcb)
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
