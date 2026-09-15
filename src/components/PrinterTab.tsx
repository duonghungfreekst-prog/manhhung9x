import { useState, useEffect, useCallback } from 'react';
import { 
  Printer, RefreshCw, Trash2, CheckCircle2, Search, Wrench, 
  Download, Activity, Share2, Copy, Check, Power, Terminal,
  ShieldAlert, Wifi, FileText, Settings, ExternalLink, Play, Star,
  AlertTriangle, CheckCircle, ShieldCheck, Zap, Network, X
} from 'lucide-react';

interface PrinterInfo {
  Name: string;
  PrinterStatus: number;
  JobCount: number;
  DriverName: string;
  PortName: string;
  WorkOffline?: boolean;
}

interface PrintJob {
  Id: number;
  DocumentName: string;
  JobStatus: number;
  UserName: string;
}

interface DiagnosticResult {
  ok: boolean;
  timestamp?: string;
  issueCount: number;
  spooler?: {
    status: string;
    startType: string;
    isOk: boolean;
  };
  lanRpc?: {
    rpcUseNamedPipe?: number;
    rpcAuthnLevelPrivacy?: number;
    isOk: boolean;
  };
  pointAndPrint?: {
    restrictedDriver?: number;
    noWarningElevation?: number;
    isOk: boolean;
  };
  firewall?: {
    isOk: boolean;
  };
  spoolFiles?: {
    count: number;
    isOk: boolean;
  };
  snmpPorts?: {
    badCount: number;
    isOk: boolean;
  };
  offlinePrintersCount?: number;
  printers?: PrinterInfo[];
}

// Common driver links for quick install — bao gồm các dòng máy in phổ biến tại Bệnh viện/Phòng khám VN
const COMMON_DRIVERS = [
  // ─── CANON LBP (Laser A4) ────────────────────────────────────────────────
  { name: 'Canon LBP 2900 / 2900B', regex: /LBP.?2900/i,
    url: 'https://vn.canon/vi/support/0100278201',
    directLink: 'https://gdlp01.c-wss.com/gds/2/0100004592/05/LBP2900_R150_V330_W64_uk_EN_2.exe', sha256: undefined },
  { name: 'Canon LBP 3000', regex: /LBP.?3000/i,
    url: 'https://vn.canon/vi/support/0100278501',
    directLink: undefined, sha256: undefined },
  { name: 'Canon LBP 3300', regex: /LBP.?3300/i,
    url: 'https://vn.canon/vi/support/0100278701',
    directLink: 'https://gdlp01.c-wss.com/gds/7/0100002597/06/LBP3300_R150_V330_W64_uk_EN_2.exe', sha256: undefined },
  { name: 'Canon LBP 3500', regex: /LBP.?3500/i,
    url: 'https://vn.canon/vi/support/0100278901',
    directLink: undefined, sha256: undefined },
  { name: 'Canon LBP 3010 / 3018', regex: /LBP.?30(10|18)/i,
    url: 'https://vn.canon/vi/support/0100285201',
    directLink: undefined, sha256: undefined },
  { name: 'Canon LBP 6200D', regex: /LBP.?6200/i,
    url: 'https://vn.canon/vi/support/0100292601',
    directLink: undefined, sha256: undefined },
  { name: 'Canon LBP 6230 / 6240', regex: /LBP.?62[34]/i,
    url: 'https://vn.canon/vi/support/0100443901',
    directLink: undefined, sha256: undefined },
  { name: 'Canon LBP 6300 / 6310', regex: /LBP.?63/i,
    url: 'https://vn.canon/vi/support/0100285001',
    directLink: undefined, sha256: undefined },
  { name: 'Canon LBP 7100 / 7110', regex: /LBP.?71/i,
    url: 'https://vn.canon/vi/support/0100446001',
    directLink: undefined, sha256: undefined },
  { name: 'Canon LBP 7018C (Color)', regex: /LBP.?7018/i,
    url: 'https://vn.canon/vi/support/0100475401',
    directLink: undefined, sha256: undefined },
  // ─── CANON MF (Đa năng laser) ────────────────────────────────────────────
  { name: 'Canon MF 3010', regex: /MF.?3010/i,
    url: 'https://vn.canon/vi/support/0100374301',
    directLink: undefined, sha256: undefined },
  { name: 'Canon MF 4320D / 4350D', regex: /MF.?43[25]/i,
    url: 'https://vn.canon/vi/support/0100285601',
    directLink: undefined, sha256: undefined },
  { name: 'Canon MF 4410 / 4412 / 4430 / 4450', regex: /MF.?44[134]/i,
    url: 'https://vn.canon/vi/support/0100374601',
    directLink: undefined, sha256: undefined },
  { name: 'Canon MF 4750 / 4752 / 4770', regex: /MF.?47[57]/i,
    url: 'https://vn.canon/vi/support/0100391701',
    directLink: undefined, sha256: undefined },
  { name: 'Canon MF 211 / 212w / 215', regex: /MF.?21[125]/i,
    url: 'https://vn.canon/vi/support/0100490401',
    directLink: undefined, sha256: undefined },
  { name: 'Canon MF 226DN / 229DW', regex: /MF.?22[69]/i,
    url: 'https://vn.canon/vi/support/0100490401',
    directLink: undefined, sha256: undefined },
  { name: 'Canon MF 237W / 247DW / 267DW', regex: /MF.?2[46]7/i,
    url: 'https://vn.canon/vi/support/0100538301',
    directLink: undefined, sha256: undefined },
  { name: 'Canon MF 631Cn / 633Cdw (Color)', regex: /MF.?63[13]/i,
    url: 'https://vn.canon/vi/support/0100621001',
    directLink: undefined, sha256: undefined },
  // ─── HP LASERJET ─────────────────────────────────────────────────────────
  { name: 'HP LaserJet 1020 / 1022', regex: /LaserJet.?102[02]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-1020-printer-series/439423',
    directLink: undefined, sha256: undefined },
  { name: 'HP LaserJet 1200 / 1300', regex: /LaserJet.?1[23]00/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-1200-series/25372',
    directLink: undefined, sha256: undefined },
  { name: 'HP LaserJet P1005 / P1006', regex: /LaserJet.?P100[56]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-p1005-printer/3389769',
    directLink: undefined, sha256: undefined },
  { name: 'HP LaserJet P1102 / P1102W', regex: /LaserJet.?P1102/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-pro-p1102-printer-series/5081428',
    directLink: undefined, sha256: undefined },
  { name: 'HP LaserJet M1132 / M1136 MFP', regex: /LaserJet.?M113[26]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-pro-m1132-multifunction-printer/4122803',
    directLink: undefined, sha256: undefined },
  { name: 'HP LaserJet M1212 / M1214 MFP', regex: /LaserJet.?M121[24]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-pro-m1212nf-multifunction-printer/4073565',
    directLink: undefined, sha256: undefined },
  { name: 'HP LaserJet M126A / M127fn', regex: /LaserJet.?M12[67]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-pro-m126a/7101887',
    directLink: undefined, sha256: undefined },
  { name: 'HP LaserJet M201 / M202 / M206', regex: /LaserJet.?M20[1-6]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-pro-m201dw/7610372',
    directLink: undefined, sha256: undefined },
  { name: 'HP LaserJet M402 / M403', regex: /LaserJet.?M40[23]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-pro-m402dn/7532472',
    directLink: undefined, sha256: undefined },
  { name: 'HP LaserJet M426 / M427 MFP', regex: /LaserJet.?M42[67]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-pro-mfp-m426fdw/9089785',
    directLink: undefined, sha256: undefined },
  { name: 'HP LaserJet Pro M15A / M15W', regex: /LaserJet.?M15[AW]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-pro-m15a/23571568',
    directLink: undefined, sha256: undefined },
  { name: 'HP LaserJet MFP M28A / M28W', regex: /LaserJet.?M28[AW]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-laserjet-pro-mfp-m28a/23526204',
    directLink: undefined, sha256: undefined },
  // ─── HP DESKJET / OFFICEJET ─────────────────────────────────────────────
  { name: 'HP DeskJet 2130 / 2135 / 2136', regex: /DeskJet.?213[056]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-deskjet-2130-all-in-one-printer/10296440',
    directLink: undefined, sha256: undefined },
  { name: 'HP DeskJet 2320 / 2710 / 2720', regex: /DeskJet.?2(32|7)[012]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-deskjet-2320-all-in-one-printer/2101488099',
    directLink: undefined, sha256: undefined },
  { name: 'HP Ink Tank 115 / 310 / 315 / 319', regex: /Ink.?Tank.?(115|31[059])/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-ink-tank-310-series/14325158',
    directLink: undefined, sha256: undefined },
  { name: 'HP OfficeJet 200 / 250 (Mobile)', regex: /OfficeJet.?2[05]0/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/hp-officejet-200-mobile-printer-series/7951528',
    directLink: undefined, sha256: undefined },
  // ─── BROTHER ─────────────────────────────────────────────────────────────
  { name: 'Brother HL-1110 / HL-1112', regex: /HL.?111[02]/i,
    url: 'https://support.brother.com/g/b/downloadtop.aspx?c=vn&lang=vi&prod=hl1110_vn',
    directLink: undefined, sha256: undefined },
  { name: 'Brother HL-1210W / HL-1211W', regex: /HL.?121[01]/i,
    url: 'https://support.brother.com/g/b/downloadtop.aspx?c=vn&lang=vi&prod=hl1210w_vn',
    directLink: undefined, sha256: undefined },
  { name: 'Brother HL-L2321D / HL-L2366DW', regex: /HL.?L23[26]/i,
    url: 'https://support.brother.com/g/b/downloadtop.aspx?c=vn&lang=vi&prod=hll2321d_vn',
    directLink: undefined, sha256: undefined },
  { name: 'Brother HL-L2360DN / HL-L2365DW', regex: /HL.?L236[05]/i,
    url: 'https://support.brother.com/g/b/downloadtop.aspx?c=vn&lang=vi&prod=hll2360dn_vn',
    directLink: undefined, sha256: undefined },
  { name: 'Brother HL-L2540DW / HL-L2550DW', regex: /HL.?L25[45]0/i,
    url: 'https://support.brother.com/g/b/downloadtop.aspx?c=vn&lang=vi&prod=hll2540dw_vn',
    directLink: undefined, sha256: undefined },
  { name: 'Brother DCP-1510 / DCP-1511', regex: /DCP.?151[01]/i,
    url: 'https://support.brother.com/g/b/downloadtop.aspx?c=vn&lang=vi&prod=dcp1510_vn',
    directLink: undefined, sha256: undefined },
  { name: 'Brother DCP-L2520D / DCP-L2540DW', regex: /DCP.?L25[24]/i,
    url: 'https://support.brother.com/g/b/downloadtop.aspx?c=vn&lang=vi&prod=dcpl2520d_vn',
    directLink: undefined, sha256: undefined },
  { name: 'Brother MFC-L2700D / MFC-L2720DW', regex: /MFC.?L27[02]/i,
    url: 'https://support.brother.com/g/b/downloadtop.aspx?c=vn&lang=vi&prod=mfcl2700d_vn',
    directLink: undefined, sha256: undefined },
  { name: 'Brother MFC-L2750DW / MFC-L2770DW', regex: /MFC.?L277[05]/i,
    url: 'https://support.brother.com/g/b/downloadtop.aspx?c=vn&lang=vi&prod=mfcl2750dw_vn',
    directLink: undefined, sha256: undefined },
  // ─── EPSON (Laser / InkTank / Receipt) ──────────────────────────────────
  { name: 'Epson M105 / M205 (InkTank Mono)', regex: /Epson.?M[12]05/i,
    url: 'https://epson.com.vn/Support/Printers/Single-Function-Inkjet-Printers/Epson-M-Series/Epson-M105/s/SPT_C11CC85401',
    directLink: undefined, sha256: undefined },
  { name: 'Epson L120 / L121 (InkTank)', regex: /Epson.?L12[01]/i,
    url: 'https://epson.com.vn/Support/Printers/Single-Function-Inkjet-Printers/Epson-L-Series/Epson-L120/s/SPT_C11CD76501',
    directLink: undefined, sha256: undefined },
  { name: 'Epson L3110 / L3150 / L3160 (InkTank)', regex: /Epson.?L31[156]/i,
    url: 'https://epson.com.vn/Support/Printers/All-In-Ones/Epson-L-Series/Epson-L3110/s/SPT_C11CG89501',
    directLink: undefined, sha256: undefined },
  { name: 'Epson L4150 / L4160 (InkTank WiFi)', regex: /Epson.?L41[56]/i,
    url: 'https://epson.com.vn/Support/Printers/All-In-Ones/Epson-L-Series/Epson-L4150/s/SPT_C11CF56401',
    directLink: undefined, sha256: undefined },
  { name: 'Epson L5190 / L5196 (InkTank Fax)', regex: /Epson.?L51(9[06])/i,
    url: 'https://epson.com.vn/Support/Printers/All-In-Ones/Epson-L-Series/Epson-L5190/s/SPT_C11CG85503',
    directLink: undefined, sha256: undefined },
  { name: 'Epson LQ-300+ / LQ-310 (Kim A4)', regex: /Epson.?LQ.?3[01]/i,
    url: 'https://epson.com.vn/Support/Printers/Single-Function-Inkjet-Printers/Epson-L-Series/Epson-LQ-310/s/SPT_C11CF39501',
    directLink: undefined, sha256: undefined },
  { name: 'Epson TM-T82 / TM-T88 (Hóa đơn nhiệt)', regex: /Epson.?TM.?T(82|88)/i,
    url: 'https://download.epson-biz.com/modules/pos/index.php?page=prod&pcat=3&pid=36',
    directLink: undefined, sha256: undefined },
  { name: 'Epson TM-T20 / TM-T20II (Hóa đơn)', regex: /Epson.?TM.?T20/i,
    url: 'https://download.epson-biz.com/modules/pos/index.php?page=prod&pcat=3&pid=62',
    directLink: undefined, sha256: undefined },
  // ─── SAMSUNG (đã sáp nhập vào HP) ───────────────────────────────────────
  { name: 'Samsung ML-1670 / ML-1675', regex: /Samsung.?ML.?167[05]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/samsung-ml-1670-laser-printer-series/3878063',
    directLink: undefined, sha256: undefined },
  { name: 'Samsung ML-2165 / ML-2166W', regex: /Samsung.?ML.?216[56]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/samsung-ml-2160-laser-printer-series/5289476',
    directLink: undefined, sha256: undefined },
  { name: 'Samsung ML-3310 / ML-3312', regex: /Samsung.?ML.?33[12]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/samsung-ml-3310-laser-printer-series/5290088',
    directLink: undefined, sha256: undefined },
  { name: 'Samsung SCX-3400 / SCX-3405 MFP', regex: /Samsung.?SCX.?34/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/samsung-scx-3400-laser-multifunction-printer-series/5289958',
    directLink: undefined, sha256: undefined },
  { name: 'Samsung SCX-4623 / SCX-4650 MFP', regex: /Samsung.?SCX.?4(623|65)/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/samsung-scx-4600-laser-multifunction-printer-series/3722878',
    directLink: undefined, sha256: undefined },
  { name: 'Samsung M2020 / M2022 / M2026', regex: /Samsung.?M202[026]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/samsung-m2020-laser-printer-series/15622785',
    directLink: undefined, sha256: undefined },
  { name: 'Samsung M2070 / M2071 MFP', regex: /Samsung.?M207[01]/i,
    url: 'https://support.hp.com/vn-en/drivers/selfservice/samsung-multifunction-xpress-sl-m2070-series/11564089',
    directLink: undefined, sha256: undefined },
  // ─── RICOH / FUJI XEROX / XEROX ─────────────────────────────────────────
  { name: 'Ricoh SP 100 / SP 111', regex: /Ricoh.?SP.?1(00|11)/i,
    url: 'https://www.ricoh.com/support/sp_100/dl/index.html',
    directLink: undefined, sha256: undefined },
  { name: 'Ricoh SP 210 / SP 212 / SP 213', regex: /Ricoh.?SP.?21[023]/i,
    url: 'https://www.ricoh.com/support/sp_210/dl/index.html',
    directLink: undefined, sha256: undefined },
  { name: 'Ricoh SP 310DN / SP 311DN', regex: /Ricoh.?SP.?31[01]/i,
    url: 'https://www.ricoh.com/support/sp310dn/dl/index.html',
    directLink: undefined, sha256: undefined },
  { name: 'Xerox DocuPrint P255 / P265', regex: /Xerox.?P2[56]5/i,
    url: 'https://www.support.xerox.com/en-us/product/docuprint-p255dw/downloads',
    directLink: undefined, sha256: undefined },
  { name: 'Fuji Xerox DocuPrint M225 / M235', regex: /DocuPrint.?M2[23]5/i,
    url: 'https://www.support.xerox.com/en-us/product/docuprint-m235z/downloads',
    directLink: undefined, sha256: undefined },
  // ─── KYOCERA ─────────────────────────────────────────────────────────────
  { name: 'Kyocera ECOSYS M2035dn / M2535dn', regex: /Kyocera.?M[25]535/i,
    url: 'https://www.kyoceradocumentsolutions.us/en/support/downloads/index.html',
    directLink: undefined, sha256: undefined },
  { name: 'Kyocera ECOSYS P2035d / P2135d', regex: /Kyocera.?P2[01]35/i,
    url: 'https://www.kyoceradocumentsolutions.us/en/support/downloads/index.html',
    directLink: undefined, sha256: undefined },
  // ─── MÁY IN HÓA ĐƠN NHIỆT (POS / Receipt) ───────────────────────────────
  { name: 'Xprinter XP-58 / XP-80 / XP-Q200 (Hóa đơn 58mm/80mm)', regex: /Xprinter|XP-[58Q]/i,
    url: 'https://xprinter.vn/driver-may-in-hoa-don-xprinter/',
    directLink: 'https://xprinter.vn/wp-content/uploads/2021/04/XPrinter-Driver-V7.77.zip', sha256: null },
  { name: 'Gprinter GP-58 / GP-80 (Hóa đơn nhiệt)', regex: /Gprinter|GP-[58]/i,
    url: 'http://www.gprinter.net/download.asp',
    directLink: undefined, sha256: undefined },
  { name: 'DATECS EP-50 / FP-700 (Máy in hóa đơn tài chính)', regex: /DATECS|EP-50|FP-700/i,
    url: 'https://www.datecs.bg/en/products/printers',
    directLink: undefined, sha256: undefined },
  { name: 'Citizen CT-S310 / CT-S651 (Receipt)', regex: /Citizen.?CT.?S[36]/i,
    url: 'https://www.citizen-systems.com/en/printer/download.html',
    directLink: undefined, sha256: undefined },
  { name: 'Bixolon SRP-350 / SRP-500 (Receipt POS)', regex: /Bixolon|SRP-[35]/i,
    url: 'https://www.bixolon.com/subpage.php?m_cd=000100030004',
    directLink: undefined, sha256: undefined },
  { name: 'Star TSP100 / TSP650 (Receipt)', regex: /Star.?TSP[16]/i,
    url: 'https://www.star-m.jp/eng/dl/dl06_s.htm',
    directLink: undefined, sha256: undefined },
  { name: 'Hprt TP805 / TP808 (Hóa đơn nhiệt 80mm)', regex: /Hprt|TP80[58]/i,
    url: 'https://www.hprt.com/Support/Download',
    directLink: undefined, sha256: undefined },
  { name: 'iDPRT SP410 / iT4S (Barcode / Receipt)', regex: /iDPRT|SP4|iT4/i,
    url: 'https://www.idprt.com/support/download-center.html',
    directLink: undefined, sha256: undefined },
  // ─── MÁY IN NHÃ N (Barcode / Label) ─────────────────────────────────────
  { name: 'Zebra ZP450 / GK420 / GX420 (Barcode)', regex: /Zebra|ZP450|GK420|GX420/i,
    url: 'https://www.zebra.com/us/en/support-downloads/printers.html',
    directLink: undefined, sha256: undefined },
  { name: 'Argox OS-214 / OS-314 (Barcode nhãn)', regex: /Argox|OS-[23]14/i,
    url: 'https://www.argox.com/download.php',
    directLink: undefined, sha256: undefined },
  { name: 'TSC TDP-225 / TE210 (Barcode nhãn)', regex: /TSC.?(TDP|TE)[23]/i,
    url: 'https://www.tscprinters.com/EN/download.html',
    directLink: undefined, sha256: undefined },
];

export default function PrinterTab() {
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  // State quản lý sửa lỗi chia sẻ máy in qua mạng LAN (RPC Named Pipe 0x00000709 / 0x0000011b)
  const [shareRpcStatus, setShareRpcStatus] = useState<{ isFixed: boolean; rpcUseNamedPipe?: number; rpcAuthnLevelPrivacy?: number; spoolerStatus?: string } | null>(null);
  const [fixingShare, setFixingShare] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [showCmdDetails, setShowCmdDetails] = useState(false);

  // State quản lý công cụ Kết Nối Máy In Qua Local Port (Đặc trị lỗi 0x00000709 khi 2 máy khác bản Windows)
  const [showLocalPortModal, setShowLocalPortModal] = useState(false);
  const [localPortHost, setLocalPortHost] = useState('');
  const [localPortShare, setLocalPortShare] = useState('');
  const [localPortPrinterName, setLocalPortPrinterName] = useState('');
  const [localPortDriver, setLocalPortDriver] = useState('');
  const [availableDrivers, setAvailableDrivers] = useState<string[]>([]);
  const [connectingLocalPort, setConnectingLocalPort] = useState(false);

  const openLocalPortModal = async () => {
    setShowLocalPortModal(true);
    try {
      const w = window as any;
      if (w.electronAPI?.printer?.getDrivers) {
        const res = await w.electronAPI.printer.getDrivers();
        if (res?.ok && Array.isArray(res.drivers) && res.drivers.length > 0) {
          setAvailableDrivers(res.drivers);
          if (!localPortDriver) {
            const suggested = res.drivers.find((d: string) => /epson|lq|canon|hp|brother/i.test(d));
            setLocalPortDriver(suggested || res.drivers[0]);
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const handleConnectLocalPort = async () => {
    if (!localPortHost.trim()) {
      alert('Vui lòng nhập địa chỉ IP hoặc tên máy chủ (ví dụ: 192.168.1.50 hoặc MAY-CHU)!');
      return;
    }
    if (!localPortShare.trim()) {
      alert('Vui lòng nhập tên chia sẻ của máy in trên máy chủ (ví dụ: epson lq-310 escp2 hoặc LQ310)!');
      return;
    }
    if (!localPortDriver.trim()) {
      alert('Vui lòng chọn hoặc nhập tên Driver của máy in trên máy tính này!');
      return;
    }

    setConnectingLocalPort(true);
    const targetPort = `\\\\${localPortHost.trim()}\\${localPortShare.trim()}`;
    addLog(`🚀 Đang thiết lập Cổng Local Port: ${targetPort}...`);

    try {
      const w = window as any;
      if (w.electronAPI?.printer?.addLocalPortPrinter) {
        const res = await w.electronAPI.printer.addLocalPortPrinter({
          host: localPortHost.trim(),
          shareName: localPortShare.trim(),
          printerName: localPortPrinterName.trim() || `${localPortShare.trim()} (LAN)`,
          driverName: localPortDriver.trim(),
        });

        if (res?.ok && res?.success) {
          addLog(`✅ ${res.message || 'Kết nối máy in qua Local Port thành công!'}`);
          alert(`🎉 ĐÃ KẾT NỐI THÀNH CÔNG!\n\nĐã tạo máy in [${res.printerName}] gán vào cổng Local Port [${res.portName}].\n\nBạn có thể mở Word/Excel/HIS và in ngay lập tức mà không bao giờ bị lỗi 0x00000709!`);
          setShowLocalPortModal(false);
          await loadPrinters();
          await diagnoseAllPrinters(true);
        } else {
          addLog(`❌ Kết nối thất bại: ${res?.error || 'Lỗi không xác định'}`);
          alert(`❌ Kết nối thất bại: ${res?.error || 'Vui lòng kiểm tra lại quyền Administrator hoặc tên Driver!'}`);
        }
      }
    } catch (err: unknown) {
      addLog(`❌ Lỗi kết nối Local Port: ${String(err)}`);
      alert(`❌ Lỗi: ${String(err)}`);
    } finally {
      setConnectingLocalPort(false);
    }
  };
  
  const addLog = (msg: string) => setLogs(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 15));

  const runPS = async (script: string) => {
    const w = window as unknown as { electronAPI?: { runPowershell: (s: string) => Promise<string> } };
    if (!w.electronAPI) {
      throw new Error('Tính năng này chỉ chạy trên phần mềm Desktop gốc (không chạy trên Web).');
    }
    return await w.electronAPI.runPowershell(script);
  };

  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [fixingAll, setFixingAll] = useState(false);

  const loadPrinters = useCallback(async () => {
    try {
      setLoading(true);
      addLog('Đang quét danh sách máy in hệ thống...');
      const output = await runPS(`Get-Printer | Select-Object Name, PrinterStatus, JobCount, DriverName, PortName | ConvertTo-Json`);
      if (output) {
        const parsed = JSON.parse(output);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        setPrinters(list);
        addLog(`Tìm thấy ${list.length} máy in.`);
      } else {
        setPrinters([]);
      }
    } catch (err: unknown) {
      const e = String(err);
      addLog('Lỗi quét máy in: ' + e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Quét & Chẩn Đoán Toàn Bộ Lỗi Hệ Thống Máy In (Auto Re-Diagnose) ──────────
  const diagnoseAllPrinters = useCallback(async (isPostFix: boolean = false) => {
    try {
      setLoading(true);
      const postFix = isPostFix === true;
      if (postFix) {
        addLog('🔄 [TỰ ĐỘNG BÁO LẠI] Đang quét kiểm tra lại toàn bộ hệ thống sau sửa lỗi...');
      } else {
        addLog('🔍 Đang Quét & Chẩn Đoán Toàn Diện Lỗi Máy In, Mạng LAN & Dịch Vụ Hệ Thống...');
      }
      const w = window as any;
      if (w.electronAPI?.printer?.diagnoseAll) {
        const diag: DiagnosticResult = await w.electronAPI.printer.diagnoseAll();
        setDiagnostics(diag);
        if (Array.isArray(diag.printers)) {
          setPrinters(diag.printers);
        }

        // Ghi nhật ký phân tích chi tiết báo cáo lại cho người dùng
        addLog(`📊 KẾT QUẢ KIỂM TRA [${diag.timestamp || new Date().toLocaleTimeString()}]:`);
        addLog(`• Dịch vụ Spooler: ${diag.spooler?.isOk ? '✅ Đang chạy bình thường' : `❌ LỖI (${diag.spooler?.status})`}`);
        addLog(`• Chia sẻ mạng LAN (0x709/0x11b): ${diag.lanRpc?.isOk ? '✅ Chuẩn RPC Named Pipe' : '⚠️ Lỗi cấu hình RPC mạng'}`);
        addLog(`• Driver Point & Print (0xbcb): ${diag.pointAndPrint?.isOk ? '✅ Không bị hạn chế' : '⚠️ Bị Group Policy chặn driver LAN'}`);
        addLog(`• Tường lửa chia sẻ máy in: ${diag.firewall?.isOk ? '✅ Đã mở cổng' : '⚠️ File & Printer Sharing đang đóng'}`);
        addLog(`• Bộ đệm Spooler: ${diag.spoolFiles?.isOk ? '✅ Sạch sẽ' : `⚠️ Phát hiện ${diag.spoolFiles?.count} file kẹt trong spool`}`);
        addLog(`• Cổng mạng SNMP: ${diag.snmpPorts?.isOk ? '✅ Tắt SNMP (Hết Offline ảo)' : `⚠️ Có ${diag.snmpPorts?.badCount} cổng bật SNMP gây Offline ảo`}`);
        addLog(`• Tổng máy in: ${diag.printers?.length || 0} (Offline: ${diag.offlinePrintersCount || 0})`);

        if (diag.issueCount > 0) {
          addLog(`⚠️ PHÁT HIỆN ${diag.issueCount} MỤC CẦN XỬ LÝ! Bấm nút "Sửa Tự Động Tất Cả Lỗi" để khắc phục triệt để.`);
        } else {
          addLog('🎉 XUẤT SẮC! Hệ thống in ấn và chia sẻ mạng LAN đạt chuẩn 100%, không còn lỗi nào!');
        }
      } else {
        await loadPrinters();
      }
    } catch (err: unknown) {
      addLog('❌ Lỗi trong quá trình chẩn đoán: ' + String(err));
    } finally {
      setLoading(false);
    }
  }, [loadPrinters]);

  const checkShareRpcStatus = useCallback(async () => {
    try {
      const w = window as any;
      if (w.electronAPI?.printer?.getShareRpcStatus) {
        const res = await w.electronAPI.printer.getShareRpcStatus();
        if (res && res.ok) {
          setShareRpcStatus(res);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    checkShareRpcStatus();
  }, [checkShareRpcStatus]);

  const fixShareError = async () => {
    try {
      setFixingShare(true);
      setLoading(true);
      addLog('🚀 Bắt đầu khắc phục lỗi chia sẻ máy in LAN (0x00000709 / 0x0000011b)...');
      addLog('① Đang cấu hình Registry: RpcUseNamedPipeProtocol = 1...');
      addLog('② Đang cấu hình Registry: RpcAuthnLevelPrivacyEnabled = 0 & RpcAuthnLevelExemption = 1...');
      addLog('③ Đang gỡ bỏ hạn chế Point and Print & mở Tường lửa...');
      addLog('④ Đang khởi động lại dịch vụ Print Spooler...');

      const w = window as any;
      if (w.electronAPI?.printer?.fixShareError) {
        const res = await w.electronAPI.printer.fixShareError();
        if (res?.ok && res?.success) {
          addLog('✅ ' + (res.message || 'Đã cấu hình Registry và khởi động lại Spooler thành công!'));
          await checkShareRpcStatus();
          await diagnoseAllPrinters(true);
          await loadPrinters();
        } else {
          addLog('⚠️ ' + (res?.message || res?.error || 'Có thể cần quyền Administrator để ghi khóa Registry.'));
        }
      } else {
        // Fallback qua runPS nếu chạy trực tiếp
        await runPS(`
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f
          reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f
          Restart-Service -Name Spooler -Force
        `);
        addLog('✅ Đã thực thi lệnh cấu hình Registry qua PowerShell.');
        await checkShareRpcStatus();
        await diagnoseAllPrinters(true);
        await loadPrinters();
      }
    } catch (err: unknown) {
      addLog('❌ Lỗi xử lý: ' + String(err));
    } finally {
      setFixingShare(false);
      setLoading(false);
    }
  };

  const copyCmdToClipboard = () => {
    const cmdText = `REG ADD "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f\nREG ADD "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f\nnet stop spooler && net start spooler`;
    navigator.clipboard.writeText(cmdText);
    setCopiedCmd(true);
    addLog('📋 Đã sao chép 2 câu lệnh Registry CMD vào bộ nhớ đệm (Clipboard)!');
    setTimeout(() => setCopiedCmd(false), 3000);
  };

  const handleRestartPc = async () => {
    const ok = window.confirm(
      '⚠️ XÁC NHẬN KHỞI ĐỘNG LẠI MÁY TÍNH\n\n' +
      'Hệ thống sẽ đếm ngược 10 giây và khởi động lại Windows để áp dụng toàn diện cấu hình sửa lỗi máy in 0x00000709.\n\n' +
      'Vui lòng lưu lại tất cả văn bản, tài liệu đang mở trước khi tiếp tục!\n\n' +
      'Bạn có muốn khởi động lại ngay không?'
    );
    if (!ok) return;

    try {
      addLog('⏳ Đang phát lệnh khởi động lại hệ thống trong 10 giây...');
      const w = window as any;
      if (w.electronAPI?.printer?.restartPc) {
        await w.electronAPI.printer.restartPc();
      } else {
        await runPS('shutdown /r /t 10 /c "DMH_Tools: Khoi dong lai de ap dung cau hinh may in"');
      }
      addLog('🔄 Lệnh khởi động lại đã được kích hoạt. Máy tính sẽ restart sau ít giây.');
    } catch (err: unknown) {
      addLog('❌ Lỗi khởi động lại: ' + String(err));
    }
  };

  // ── Sửa Tự Động Toàn Bộ Lỗi 1-Click ─────────────────────────────────────
  const handleFixAllIssues = async () => {
    const ok = window.confirm(
      '⚡ XÁC NHẬN SỬA TỰ ĐỘNG TOÀN BỘ LỖI MÁY IN (1-CLICK AUTO FIX)\n\n' +
      'Phần mềm sẽ tự động khắc phục toàn bộ sự cố phát hiện được:\n' +
      '1. Khắc phục lỗi chia sẻ LAN 0x00000709 & 0x0000011b (Cấu hình RPC Named Pipe)\n' +
      '2. Gỡ bỏ chính sách chặn Driver LAN 0x00000bcb (Point & Print Restrictions)\n' +
      '3. Mở cổng Tường lửa Firewall File and Printer Sharing & Network Discovery\n' +
      '4. Dọn sạch toàn bộ file rác và lệnh in kẹt trong thư mục Spool PRINTERS\n' +
      '5. Cấp lại Full Quyền thư mục Spooler và kích hoạt tự phục hồi khi Crash\n' +
      '6. Tắt cờ SNMP Status trên các cổng TCP/IP để đưa toàn bộ máy in về Online\n\n' +
      'Bạn có muốn tiến hành sửa tự động ngay bây giờ không?'
    );
    if (!ok) return;

    try {
      setFixingAll(true);
      setLoading(true);
      addLog('🚀 Bắt đầu Sửa Tự Động Toàn Bộ Lỗi Máy In...');
      const w = window as any;
      if (w.electronAPI?.printer?.fixAllIssues) {
        const res = await w.electronAPI.printer.fixAllIssues();
        if (res?.ok) {
          addLog('🎉 ' + (res.message || 'Đã sửa chữa tự động toàn bộ lỗi thành công!'));
          await diagnoseAllPrinters();
          await checkShareRpcStatus();
        } else {
          addLog('⚠️ Sửa lỗi thất bại: ' + (res?.error || 'Có thể cần cấp quyền Administrator.'));
        }
      } else {
        // Fallback: gọi từng hàm
        await fixShareError();
        await fixPointAndPrint();
        await enableLanSharing();
        await fixOfflineSnmp();
        await fixSpoolerCrash();
        await loadPrinters();
      }
    } catch (err: unknown) {
      addLog('❌ Lỗi sửa tự động: ' + String(err));
    } finally {
      setFixingAll(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Removed auto scan per user request
    // loadPrinters();
  }, []);

  const loadJobs = async (printerName: string) => {
    try {
      setLoading(true);
      setSelectedPrinter(printerName);
      addLog(`Kiểm tra lệnh in kẹt cho: ${printerName}`);

      const w = window as any;
      if (w.electronAPI?.printer?.getJobs) {
        const res = await w.electronAPI.printer.getJobs(printerName);
        if (res && res.ok && Array.isArray(res.jobs)) {
          setJobs(res.jobs);
          if (res.jobs.length > 0) {
            addLog(`Phát hiện ${res.jobs.length} lệnh đang kẹt trên "${printerName}".`);
          } else {
            addLog(`Không có lệnh in nào bị kẹt trên "${printerName}".`);
          }
          return;
        }
      }

      // Fallback qua runPS với UTF-8
      const ps = `
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $OutputEncoding = [System.Text.Encoding]::UTF8
        Get-PrintJob -PrinterName "${printerName}" -ErrorAction SilentlyContinue | Select-Object Id, DocumentName, JobStatus, UserName | ConvertTo-Json
      `;
      const output = await runPS(ps);
      if (output && output.trim()) {
        const parsed = JSON.parse(output);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        setJobs(list);
        addLog(`Phát hiện ${list.length} lệnh đang kẹt.`);
      } else {
        setJobs([]);
        addLog('Không có lệnh in nào bị kẹt.');
      }
    } catch (err: unknown) {
      const e = String(err);
      if (e.includes('No MSFT_PrintJob')) {
        setJobs([]);
        addLog('Không có lệnh in nào.');
      } else {
        addLog('Lỗi đọc lệnh in: ' + e);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Xóa một lệnh in đơn lẻ theo ID ──────────────────────────────────────
  const deleteSingleJob = async (printerName: string, jobId: number) => {
    try {
      setLoading(true);
      addLog(`🗑️ Đang tiến hành xóa lệnh in #${jobId} của máy in "${printerName}"...`);
      
      const w = window as any;
      if (w.electronAPI?.printer?.deleteJob) {
        const res = await w.electronAPI.printer.deleteJob(printerName, jobId);
        if (res?.ok) {
          addLog(`✅ ` + (res.message || `Đã xóa lệnh in #${jobId} thành công!`));
        } else {
          addLog(`⚠️ Không thể xóa lệnh in #${jobId}: ` + (res?.error || 'Có thể file đệm đang bị khóa bởi tiến trình khác.'));
        }
      } else {
        // Fallback qua runPS
        const safePrinter = printerName.replace(/["']/g, '');
        const ps = `
          Remove-PrintJob -PrinterName "${safePrinter}" -ID ${jobId} -Force -ErrorAction SilentlyContinue
          Get-WmiObject -Class Win32_PrintJob -ErrorAction SilentlyContinue | Where-Object { $_.JobId -eq ${jobId} } | ForEach-Object { $_.Delete() }
          Resume-Printer -Name "${safePrinter}" -ErrorAction SilentlyContinue
        `;
        await runPS(ps);
        addLog(`✅ Đã gửi lệnh xóa lệnh in #${jobId}.`);
      }

      await loadJobs(printerName);
      await loadPrinters();
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      addLog(`❌ Lỗi khi xóa lệnh in #${jobId}: ` + String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Xóa toàn bộ lệnh in của máy in đang chọn ─────────────────────────────
  const clearAllJobsOnPrinter = async (printerName: string) => {
    try {
      setLoading(true);
      addLog(`🗑️ Đang xóa TẤT CẢ lệnh in kẹt của máy in "${printerName}"...`);
      
      const w = window as any;
      if (w.electronAPI?.printer?.clearQueue) {
        const res = await w.electronAPI.printer.clearQueue(printerName);
        if (res?.ok) {
          addLog(`✅ ` + (res.message || `Đã xóa toàn bộ lệnh in của "${printerName}"!`));
        } else {
          addLog(`⚠️ Lỗi khi xóa hàng đợi in: ` + (res?.error || 'Không rõ nguyên nhân'));
        }
      } else {
        const safePrinter = printerName.replace(/["']/g, '');
        const ps = `
          Get-PrintJob -PrinterName "${safePrinter}" -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-PrintJob -PrinterName "${safePrinter}" -ID $_.Id -Force -ErrorAction SilentlyContinue
          }
          Resume-Printer -Name "${safePrinter}" -ErrorAction SilentlyContinue
        `;
        await runPS(ps);
        addLog(`✅ Đã xóa toàn bộ lệnh in của "${printerName}".`);
      }

      await loadJobs(printerName);
      await loadPrinters();
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      addLog(`❌ Lỗi khi xóa toàn bộ lệnh in: ` + String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Gỡ bỏ tận gốc máy in & dọn sạch Registry (100% Clean Uninstall) ────────
  const handleUninstallPrinter = async (printerName: string, driverName?: string) => {
    const ok = window.confirm(
      `🗑️ XÁC NHẬN GỠ BỎ TẬN GỐC MÁY IN: "${printerName}"\n\n` +
      `Thao tác này sẽ giải quyết triệt để lỗi "vẫn thấy máy in trong Word/Excel/HIS":\n` +
      `1. Hủy sạch toàn bộ lệnh in đang kẹt (giải phóng khóa Spooler).\n` +
      `2. Buộc gỡ bỏ máy in hoàn toàn khỏi hàng đợi Windows.\n` +
      `3. Dọn sạch toàn bộ khóa Registry trong HKLM và HKCU (để các ứng dụng không còn nhìn thấy).\n` +
      `4. Gỡ bỏ driver khỏi hệ thống nếu không còn máy in nào khác dùng chung.\n\n` +
      `Bạn có chắc chắn muốn gỡ bỏ hoàn toàn máy in này không?`
    );
    if (!ok) return;

    try {
      setLoading(true);
      addLog(`🗑️ Đang tiến hành gỡ bỏ tận gốc máy in "${printerName}"...`);
      const w = window as any;
      if (w.electronAPI?.printer?.uninstallPrinter) {
        const res = await w.electronAPI.printer.uninstallPrinter(printerName, driverName);
        if (res?.ok) {
          addLog(`✅ ` + (res.message || `Đã gỡ bỏ tận gốc máy in "${printerName}" thành công!`));
        } else {
          addLog(`⚠️ Gỡ bỏ thất bại: ` + (res?.error || 'Có thể cần quyền Administrator.'));
        }
      } else {
        const safe = printerName.replace(/["']/g, '');
        await runPS(`
          Remove-Printer -Name "${safe}" -ErrorAction SilentlyContinue
          Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices" -Name "${safe}" -ErrorAction SilentlyContinue
        `);
        addLog(`✅ Đã gửi lệnh gỡ bỏ máy in "${printerName}".`);
      }

      setSelectedPrinter(null);
      setJobs([]);
      await loadPrinters();
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      addLog(`❌ Lỗi khi gỡ bỏ máy in: ` + String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Xóa sạch toàn bộ kẹt lệnh in toàn hệ thống ──────────────────────────
  const clearPrintQueue = async () => {
    try {
      setLoading(true);
      addLog('Bắt đầu quy trình gỡ kẹt lệnh in toàn hệ thống...');
      
      const w = window as any;
      if (w.electronAPI?.printer?.clearQueue) {
        const res = await w.electronAPI.printer.clearQueue(selectedPrinter || undefined);
        if (res?.ok) {
          addLog('✅ ' + (res.message || 'Đã dọn sạch toàn bộ lệnh in kẹt toàn hệ thống!'));
        } else {
          addLog('⚠️ Lỗi xóa kẹt: ' + (res?.error || 'Có thể cần quyền Administrator.'));
        }
      } else {
        addLog('Đang dừng dịch vụ Spooler & các tiến trình in...');
        await runPS(`Stop-Service -Name Spooler -Force; Stop-Process -Name "splwow64", "spoolsv", "printfilterpipelinesvc" -Force -ErrorAction SilentlyContinue;`);
        addLog('Đang xóa các file kẹt trong C:\\Windows\\System32\\spool\\PRINTERS...');
        await runPS(`Remove-Item -Path "$env:windir\\System32\\spool\\PRINTERS\\*.*" -Force -Recurse -ErrorAction SilentlyContinue`);
        addLog('Đang khởi động lại dịch vụ Spooler...');
        await runPS(`Start-Service -Name Spooler`);
        addLog('✅ Đã xóa kẹt lệnh in thành công! Vui lòng in lại.');
      }

      await loadPrinters();
      if (selectedPrinter) {
        await loadJobs(selectedPrinter);
      } else {
        setJobs([]);
      }
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      const e = String(err);
      addLog('❌ Lỗi gỡ kẹt: ' + e);
      runPS(`Start-Service -Name Spooler`).catch(()=>{});
    } finally {
      setLoading(false);
    }
  };

  const fixAppPrinting = async () => {
    try {
      setLoading(true);
      addLog('Bắt đầu quy trình sửa lỗi in cho các ứng dụng...');
      addLog('Đang dừng dịch vụ Spooler & các tiến trình in (splwow64, printfilter)...');
      await runPS(`Stop-Service -Name Spooler -Force; Stop-Process -Name "splwow64" -Force -ErrorAction SilentlyContinue; Stop-Process -Name "printfilterpipelinesvc" -Force -ErrorAction SilentlyContinue; Stop-Process -Name "spoolsv" -Force -ErrorAction SilentlyContinue;`);
      addLog('Đang dọn dẹp bộ nhớ đệm in...');
      await runPS(`Remove-Item -Path "$env:windir\\System32\\spool\\PRINTERS\\*.*" -Force -Recurse`);
      addLog('Đang khởi động lại dịch vụ Spooler...');
      await runPS(`Start-Service -Name Spooler`);
      addLog('✅ Sửa lỗi ứng dụng thành công! Vui lòng mở lại ứng dụng và in thử.');
      await loadPrinters();
      setJobs([]);
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      const e = String(err);
      addLog('❌ Lỗi xử lý: ' + e);
      runPS(`Start-Service -Name Spooler`).catch(()=>{});
    } finally {
      setLoading(false);
    }
  };

  // ── Sửa lỗi 0x00000bcb & Gỡ bỏ hạn chế Point and Print ──────────────────
  const fixPointAndPrint = async () => {
    try {
      setLoading(true);
      addLog('🚀 Bắt đầu gỡ bỏ hạn chế Point and Print & sửa lỗi 0x00000bcb...');
      const w = window as any;
      if (w.electronAPI?.printer?.fixPointAndPrint) {
        const res = await w.electronAPI.printer.fixPointAndPrint();
        if (res?.ok) {
          addLog('✅ ' + (res.message || 'Đã cấu hình Registry cho phép cài driver máy in qua mạng LAN!'));
        } else {
          addLog('⚠️ ' + (res?.error || 'Có thể cần quyền Administrator.'));
        }
      } else {
        await runPS(`
          $pnpKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint"
          if (-not (Test-Path $pnpKey)) { New-Item -Path $pnpKey -Force | Out-Null }
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictedDriver_InstallationAttribute" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PackagePointAndPrintServerList" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PointAndPrintRestrictions" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "InForest" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "NoWarningNoElevationOnInstall" /t REG_DWORD /d 1 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "UpdatePromptSettings" /t REG_DWORD /d 2 /f
          Restart-Service -Name Spooler -Force
        `);
        addLog('✅ Đã gỡ bỏ hạn chế Point and Print thành công.');
      }
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      addLog('❌ Lỗi xử lý: ' + String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Sửa lỗi máy in mạng bị Offline do SNMP ───────────────────────────────
  const fixOfflineSnmp = async () => {
    try {
      setLoading(true);
      addLog('🔍 Đang kiểm tra và tắt SNMP Status Enabled trên các cổng in TCP/IP...');
      const w = window as any;
      if (w.electronAPI?.printer?.fixOfflineSnmp) {
        const res = await w.electronAPI.printer.fixOfflineSnmp();
        if (res?.ok) {
          addLog('✅ ' + (res.message || 'Đã sửa lỗi máy in Offline thành công!'));
          await loadPrinters();
        } else {
          addLog('⚠️ ' + (res?.error || 'Có lỗi khi cập nhật cổng máy in.'));
        }
      } else {
        await runPS(`
          Get-WmiObject -Class Win32_TCPIPPrinterPort -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.SNMPEnabled -eq $true) { $_.SNMPEnabled = $false; $_.Put() | Out-Null }
          }
          Get-Printer -ErrorAction SilentlyContinue | ForEach-Object {
            try { Set-Printer -Name $_.Name -WorkOffline $false -ErrorAction SilentlyContinue } catch {}
            try { Resume-Printer -Name $_.Name -ErrorAction SilentlyContinue } catch {}
          }
        `);
        addLog('✅ Đã cấu hình đưa máy in về trạng thái Online.');
        await loadPrinters();
      }
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      addLog('❌ Lỗi: ' + String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Bật Chia Sẻ Mạng LAN & Tắt Đòi Mật Khẩu ────────────────────────────
  const enableLanSharing = async () => {
    try {
      setLoading(true);
      addLog('🌐 Đang mở tường lửa File and Printer Sharing, bật Network Discovery và bật dịch vụ chia sẻ...');
      const w = window as any;
      if (w.electronAPI?.printer?.enableLanSharing) {
        const res = await w.electronAPI.printer.enableLanSharing();
        if (res?.ok) {
          addLog('✅ ' + (res.message || 'Đã bật chia sẻ mạng LAN thành công!'));
        } else {
          addLog('⚠️ ' + (res?.error || 'Cần quyền Administrator để thay đổi cấu hình mạng.'));
        }
      } else {
        await runPS(`
          netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes
          netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes
          Set-Service -Name "FDResPub" -StartupType Automatic -ErrorAction SilentlyContinue; Start-Service -Name "FDResPub" -ErrorAction SilentlyContinue
          Set-Service -Name "LanmanServer" -StartupType Automatic -ErrorAction SilentlyContinue; Start-Service -Name "LanmanServer" -ErrorAction SilentlyContinue
          net user Guest /active:yes
          reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "everyoneincludesanonymous" /t REG_DWORD /d 1 /f
          reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "RestrictAnonymous" /t REG_DWORD /d 0 /f
        `);
        addLog('✅ Đã cấu hình chia sẻ mạng thành công.');
      }
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      addLog('❌ Lỗi bật chia sẻ mạng: ' + String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Cứu Hộ Dịch Vụ Spooler Crash / Tự Tắt & Phân Quyền ACL ──────────────
  const fixSpoolerCrash = async () => {
    try {
      setLoading(true);
      addLog('🛠️ Đang phân quyền thư mục PRINTERS và thiết lập Spooler tự khởi động lại khi crash...');
      const w = window as any;
      if (w.electronAPI?.printer?.fixSpoolerCrash) {
        const res = await w.electronAPI.printer.fixSpoolerCrash();
        if (res?.ok) {
          addLog('✅ ' + (res.message || 'Đã phục hồi Spooler thành công!'));
          await loadPrinters();
        } else {
          addLog('⚠️ ' + (res?.error || 'Có lỗi khi phân quyền Spooler.'));
        }
      } else {
        await runPS(`
          Stop-Service -Name Spooler -Force -ErrorAction SilentlyContinue
          Remove-Item -Path "$env:windir\\System32\\spool\\PRINTERS\\*.*" -Force -Recurse -ErrorAction SilentlyContinue
          $spoolDir = "$env:windir\\System32\\spool\\PRINTERS"
          & icacls $spoolDir /grant "SYSTEM:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" /grant "Users:(OI)(CI)F" /grant "EVERYONE:(OI)(CI)M" /T /C /Q | Out-Null
          sc.exe failure Spooler reset= 86400 actions= restart/5000/restart/10000/restart/20000 | Out-Null
          Set-Service -Name Spooler -StartupType Automatic
          Start-Service -Name Spooler
        `);
        addLog('✅ Đã phục hồi dịch vụ Spooler.');
        await loadPrinters();
      }
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      addLog('❌ Lỗi phục hồi Spooler: ' + String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Thao tác trực tiếp trên máy in đang chọn ────────────────────────────
  const handlePrintTestPage = async (printerName: string) => {
    try {
      addLog(`🖨️ Đang gửi lệnh in trang thử nghiệm (Test Page) tới "${printerName}"...`);
      const w = window as any;
      if (w.electronAPI?.printer?.printTestPage) {
        const res = await w.electronAPI.printer.printTestPage(printerName);
        if (res?.ok) {
          addLog(`✅ Đã gửi lệnh in test page tới "${printerName}". Vui lòng kiểm tra khay giấy ra!`);
        } else {
          addLog('⚠️ ' + (res?.error || 'Không thể gửi lệnh in test.'));
        }
      } else {
        await runPS(`rundll32.exe printui.dll,PrintUIEntry /k /n "${printerName}"`);
        addLog(`✅ Đã phát lệnh in test page tới "${printerName}".`);
      }
    } catch (err: unknown) {
      addLog(`❌ Lỗi in test: ` + String(err));
    }
  };

  const handleSetDefault = async (printerName: string) => {
    try {
      addLog(`⭐ Đang đặt "${printerName}" làm máy in mặc định hệ thống...`);
      const w = window as any;
      if (w.electronAPI?.printer?.setDefault) {
        const res = await w.electronAPI.printer.setDefault(printerName);
        if (res?.ok) {
          addLog(`✅ Đã đặt "${printerName}" làm máy in mặc định!`);
          await loadPrinters();
        }
      } else {
        await runPS(`(New-Object -ComObject WScript.Network).SetDefaultPrinter("${printerName}")`);
        addLog(`✅ Đã đặt "${printerName}" làm máy in mặc định!`);
        await loadPrinters();
      }
    } catch (err: unknown) {
      addLog(`❌ Lỗi đặt mặc định: ` + String(err));
    }
  };

  const handleResumePrinter = async (printerName: string) => {
    try {
      addLog(`▶️ Đang hủy tạm dừng và đưa "${printerName}" về Online...`);
      const w = window as any;
      if (w.electronAPI?.printer?.resumePrinter) {
        await w.electronAPI.printer.resumePrinter(printerName);
        addLog(`✅ Đã kích hoạt máy in "${printerName}" sẵn sàng nhận lệnh!`);
        await loadPrinters();
      } else {
        await runPS(`Resume-Printer -Name "${printerName}" -ErrorAction SilentlyContinue; Set-Printer -Name "${printerName}" -WorkOffline $false -ErrorAction SilentlyContinue`);
        addLog(`✅ Đã mở lại hoạt động cho "${printerName}".`);
        await loadPrinters();
      }
    } catch (err: unknown) {
      addLog(`❌ Lỗi kích hoạt máy in: ` + String(err));
    }
  };

  const handleOpenQueue = (printerName: string) => {
    const w = window as any;
    if (w.electronAPI?.printer?.openQueue) {
      w.electronAPI.printer.openQueue(printerName);
    } else {
      runPS(`Start-Process rundll32.exe -ArgumentList "printui.dll,PrintUIEntry /o /n \`"${printerName}\`""`).catch(() => {});
    }
    addLog(`📋 Đã mở cửa sổ hàng đợi in Windows của "${printerName}".`);
  };

  const handleOpenProperties = (printerName: string) => {
    const w = window as any;
    if (w.electronAPI?.printer?.openProperties) {
      w.electronAPI.printer.openProperties(printerName);
    } else {
      runPS(`Start-Process rundll32.exe -ArgumentList "printui.dll,PrintUIEntry /p /n \`"${printerName}\`""`).catch(() => {});
    }
    addLog(`⚙️ Đã mở cửa sổ cài đặt thuộc tính (Properties) của "${printerName}".`);
  };

  const handleOpenWindowsTool = (tool: string) => {
    const w = window as any;
    if (w.electronAPI?.printer?.openWindowsTool) {
      w.electronAPI.printer.openWindowsTool(tool);
    } else {
      let cmd = 'control printers';
      if (tool === 'printmanagement') cmd = 'printmanagement.msc';
      else if (tool === 'services') cmd = 'services.msc';
      else if (tool === 'devmgmt') cmd = 'devmgmt.msc';
      runPS(`Start-Process "${cmd}"`).catch(() => {});
    }
    addLog(`🚀 Đã mở công cụ Windows: ${tool}`);
  };

  const downloadAndInstallDriver = async (drv: { name: string; url: string; directLink?: string; sha256?: string | null; }) => {
    // Bảo mật #4.8: Xác nhận user trước khi tải và chạy file từ internet
    const domain = drv.directLink
      ? new URL(drv.directLink).hostname
      : new URL(drv.url).hostname;
    const fileName = drv.directLink
      ? drv.directLink.split('/').pop()
      : '';

    const confirmed = window.confirm(
      `⚠️ XÁC NHẬN TẢI DRIVER\n\n` +
      `Driver: ${drv.name}\n` +
      (fileName ? `File:   ${fileName}\n` : '') +
      `Domain: ${domain}\n\n` +
      `Hệ thống sẽ tải file từ internet và chạy bộ cài đặt.\n` +
      `Chỉ tiếp tục nếu bạn tin tưởng nguồn tải này.\n\n` +
      `Bấm OK để xác nhận tải và cài đặt.`
    );
    if (!confirmed) {
      addLog(`Đã hủy tải driver ${drv.name}.`);
      return;
    }

    try {
      if (!drv.directLink) {
        addLog(`Đang mở trang tải driver cho ${drv.name}...`);
        await runPS(`Start-Process "${drv.url}"`);
        return;
      }

      setLoading(true);
      addLog(`Đang tải driver ${drv.name}... Vui lòng đợi (có thể mất 1-2 phút).`);

      const fileName2 = drv.directLink.split('/').pop() || 'driver.exe';
      const destPath = `$env:TEMP\\${fileName2}`;

      // Bước 1: Tải file về TEMP
      await runPS(
        `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;` +
        `Invoke-WebRequest -Uri "${drv.directLink}" -OutFile "${destPath}" -UseBasicParsing`
      );
      addLog(`↓ Đã tải xong. Đang kiểm tra tính toàn vẹn file...`);

      // Bước 2: Verify SHA-256 nếu có hash
      if (drv.sha256) {
        const expectedHash = drv.sha256.toUpperCase();
        const actualHash = (await runPS(
          `(Get-FileHash -Path "${destPath}" -Algorithm SHA256).Hash`
        )).trim().toUpperCase();

        if (actualHash !== expectedHash) {
          // Hash không khớp — xóa file ngay, không cho chạy
          await runPS(`Remove-Item -Path "${destPath}" -Force`).catch(() => {});
          addLog(`❌ Bảo mật: SHA-256 không khớp! File có thể bị giả mạo.`);
          addLog(`   Mong đợi: ${expectedHash.slice(0, 16)}...`);
          addLog(`   Thực tế:  ${actualHash.slice(0, 16)}...`);
          addLog(`Đang mở trang chủ để tải thủ công an toàn hơn...`);
          runPS(`Start-Process "${drv.url}"`).catch(() => {});
          return;
        }
        addLog(`✅ SHA-256 hợp lệ. Đang chạy bộ cài đặt...`);
      } else {
        // Không có hash — cảnh báo nhưng vẫn cho chạy (user đã xác nhận ở bước trước)
        addLog(`⚠️ Chưa có hash để xác minh. User đã xác nhận — tiếp tục chạy cài...`);
      }

      // Bước 3: Chạy bộ cài
      await runPS(`Start-Process "${destPath}"`);
      addLog(`✅ Đã mở bộ cài ${drv.name}! Vui lòng thao tác trên cửa sổ cài đặt.`);
    } catch (err: unknown) {
      const e = String(err);
      addLog('❌ Lỗi tự động tải: ' + e);
      addLog('Đang mở trang web dự phòng...');
      runPS(`Start-Process "${drv.url}"`).catch(()=>{});
    } finally {
      setLoading(false);
    }
  };

  // ── Tự động sửa lỗi máy in đang chọn (1-click) ─────────────────────────
  const autoFixPrinter = async (printerName: string, driverName: string) => {
    setLoading(true);
    addLog(`🔧 Bắt đầu tự động sửa lỗi: ${printerName}...`);
    try {
      // Bước 1: Dừng spooler + xóa queue
      addLog('① Dừng dịch vụ in ấn (Spooler)...');
      await runPS(`Stop-Service -Name Spooler -Force; Stop-Process -Name splwow64 -Force -ErrorAction SilentlyContinue`);
      await runPS(`Remove-Item -Path "$env:windir\\System32\\spool\\PRINTERS\\*.*" -Force -Recurse -ErrorAction SilentlyContinue`);

      // Bước 2: Xóa và thêm lại máy in
      addLog(`② Xóa cấu hình máy in cũ "${printerName}"...`);
      await runPS(`Remove-Printer -Name "${printerName}" -ErrorAction SilentlyContinue`);

      // Bước 3: Thêm lại từ driver đã có
      addLog(`③ Cài lại máy in "${printerName}" với driver "${driverName}"...`);
      const portName = `${printerName.replace(/\s+/g, '_')}_PORT`;
      await runPS(
        `if (-not (Get-PrinterPort -Name "${portName}" -ErrorAction SilentlyContinue)) { Add-PrinterPort -Name "${portName}" }; ` +
        `Add-Printer -Name "${printerName}" -DriverName "${driverName}" -PortName "${portName}" -ErrorAction SilentlyContinue`
      );

      // Bước 4: Khởi động lại spooler
      addLog('④ Khởi động lại dịch vụ Spooler...');
      await runPS(`Start-Service -Name Spooler`);

      addLog(`✅ Sửa xong! Thử in lại từ ứng dụng.`);
      await loadPrinters();
      setJobs([]);
    } catch (err: unknown) {
      addLog('❌ Lỗi tự sửa: ' + String(err));
      await runPS(`Start-Service -Name Spooler`).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  // ── Tự động sửa + gợi ý cài driver mới ──────────────────────────────────
  const autoFixAndInstallDriver = async (printerName: string, driverName: string) => {
    await autoFixPrinter(printerName, driverName);
    // Tìm driver phù hợp trong danh sách
    const match = COMMON_DRIVERS.find(d => d.regex.test(printerName) || d.regex.test(driverName));
    if (match) {
      addLog(`🔍 Phát hiện driver phù hợp: ${match.name}`);
      addLog(`📥 Đang tải driver mới...`);
      await downloadAndInstallDriver(match);
    } else {
      addLog(`ℹ️ Không tìm thấy driver tự động cho "${driverName}".`);
      addLog(`Vui lòng tải driver thủ công từ trang web nhà sản xuất.`);
    }
  };

  const getStatusText = (status: number) => {
    switch(status) {
      case 0: return { text: 'Sẵn sàng', color: '#10b981' };
      case 1: return { text: 'Tạm dừng', color: '#f59e0b' };
      case 2: return { text: 'Lỗi', color: '#ef4444' };
      case 3: return { text: 'Đang xóa kẹt', color: '#6366f1' };
      case 7: return { text: 'Offline / Rút cáp', color: '#94a3b8' };
      default: return { text: `Trạng thái: ${status}`, color: '#64748b' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
      {/* Top Header Bar */}
      <div className="converter-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', paddingBottom: '0.75rem', paddingTop: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Printer size={20} color="#6366f1" /> Bác Sĩ Máy In - Chẩn Đoán Toàn Bộ Lỗi & Sửa Tự Động 1-Click
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>
            Quét & chẩn đoán toàn diện lỗi hệ thống máy in: Chia sẻ mạng LAN (0x709, 0x11b, 0xbcb), Spooler crash, máy in Offline ảo do SNMP, kẹt lệnh in.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button 
            className="btn-primary" 
            onClick={() => { void diagnoseAllPrinters(false); }} 
            disabled={loading} 
            style={{ background: '#4f46e5', borderColor: '#4f46e5', padding: '0.45rem 0.8rem', fontSize: '0.76rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            title="Quét và chẩn đoán toàn diện tất cả các lỗi máy in & dịch vụ hệ thống"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Quét & Chẩn Đoán Toàn Bộ Lỗi
          </button>
          
          <button 
            onClick={handleFixAllIssues} 
            disabled={loading || fixingAll} 
            style={{ 
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
              color: '#fff', 
              border: 'none', 
              borderRadius: 6, 
              padding: '0.45rem 0.85rem', 
              fontSize: '0.76rem', 
              fontWeight: 700, 
              cursor: (loading || fixingAll) ? 'not-allowed' : 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6,
              boxShadow: '0 2px 4px rgba(16,185,129,0.25)' 
            }}
            title="Tự động sửa toàn bộ các lỗi phát hiện được trong 1 lần bấm"
          >
            <Zap size={14} /> {fixingAll ? 'Đang sửa tự động...' : '⚡ SỬA TỰ ĐỘNG TẤT CẢ LỖI'}
            {diagnostics && diagnostics.issueCount > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: '0.68rem', fontWeight: 700 }}>
                {diagnostics.issueCount}
              </span>
            )}
          </button>

          <button className="btn-secondary" onClick={clearPrintQueue} disabled={loading} style={{ background: '#fff1f2', borderColor: '#fecdd3', color: '#e11d48', padding: '0.45rem 0.75rem', fontSize: '0.75rem', fontWeight: 600 }}>
            <Trash2 size={14} /> Xóa Kẹt Lệnh In
          </button>
          <button className="btn-secondary" onClick={() => handleOpenWindowsTool('printers')} style={{ padding: '0.45rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }} title="Mở Devices and Printers của Windows">
            <ExternalLink size={13} /> Devices & Printers
          </button>
          <button className="btn-secondary" onClick={() => handleOpenWindowsTool('printmanagement')} style={{ padding: '0.45rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }} title="Mở Trình Quản Trị In Ấn Print Management (msc)">
            <Settings size={13} /> Print Mgmt
          </button>
          <button className="btn-secondary" onClick={() => handleOpenWindowsTool('services')} style={{ padding: '0.45rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }} title="Mở danh sách Services Windows">
            <Wrench size={13} /> Services
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem' }}>
        
        {/* Left Col: Báo cáo chẩn đoán & Các công cụ sửa lỗi & Danh sách máy in */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          
          {/* ═════ KHỐI 0: BẢNG CHẨN ĐOÁN SỨC KHỎE MÁY IN TOÀN DIỆN ═════ */}
          <div style={{ 
            background: diagnostics ? (diagnostics.issueCount === 0 ? '#f0fdf4' : '#fffbeb') : '#f8fafc', 
            border: `1px solid ${diagnostics ? (diagnostics.issueCount === 0 ? '#86efac' : '#fde68a') : '#e2e8f0'}`, 
            borderRadius: 8, 
            padding: '0.9rem', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {diagnostics ? (
                  diagnostics.issueCount === 0 ? (
                    <ShieldCheck size={20} color="#16a34a" />
                  ) : (
                    <AlertTriangle size={20} color="#d97706" />
                  )
                ) : (
                  <Activity size={20} color="#64748b" />
                )}
                <div>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: diagnostics ? (diagnostics.issueCount === 0 ? '#15803d' : '#92400e') : '#334155', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {diagnostics ? (
                      diagnostics.issueCount === 0 
                        ? 'Hệ Thống Máy In Đạt Chuẩn 100% - Không Phát Hiện Lỗi' 
                        : `Phát Hiện ${diagnostics.issueCount} Sự Cố / Cảnh Báo Cần Khắc Phục`
                    ) : (
                      'Báo Cáo Chẩn Đoán Sức Khỏe Hệ Thống Máy In'
                    )}
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                    {diagnostics?.timestamp 
                      ? `Lần quét gần nhất: ${diagnostics.timestamp} | ${printers.length} máy in đã nhận diện`
                      : 'Bấm nút "Quét & Chẩn Đoán Toàn Bộ Lỗi" ở trên để quét toàn diện 6 hạng mục kỹ thuật.'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {diagnostics && diagnostics.issueCount > 0 && (
                  <button
                    onClick={handleFixAllIssues}
                    disabled={loading || fixingAll}
                    style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Zap size={12} /> Sửa Ngay Toàn Bộ ({diagnostics.issueCount} lỗi)
                  </button>
                )}
                <button
                  onClick={() => { void diagnoseAllPrinters(false); }}
                  disabled={loading}
                  style={{ background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 8px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <RefreshCw size={11} className={loading ? 'spin' : ''} /> Quét lại
                </button>
              </div>
            </div>

            {/* Grid 6 Hạng mục chẩn đoán */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              
              {/* Mục 1: Spooler Service */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.6rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>Dịch vụ Spooler</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>
                    {diagnostics?.spooler ? (
                      diagnostics.spooler.isOk ? (
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Đang chạy ({diagnostics.spooler.startType})</span>
                      ) : (
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ {diagnostics.spooler.status}</span>
                      )
                    ) : (
                      'Chưa kiểm tra'
                    )}
                  </div>
                </div>
                {diagnostics?.spooler?.isOk ? (
                  <CheckCircle size={16} color="#16a34a" />
                ) : diagnostics ? (
                  <button onClick={fixSpoolerCrash} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}>Fix</button>
                ) : null}
              </div>

              {/* Mục 2: Chia sẻ LAN (0x709 & 0x11b) */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.6rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>Lỗi LAN 0x709 / 0x11b</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>
                    {diagnostics?.lanRpc ? (
                      diagnostics.lanRpc.isOk ? (
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Đã fix Named Pipe</span>
                      ) : (
                        <span style={{ color: '#d97706', fontWeight: 600 }}>⚠️ Chưa fix Registry</span>
                      )
                    ) : (
                      'Chưa kiểm tra'
                    )}
                  </div>
                </div>
                {diagnostics?.lanRpc?.isOk ? (
                  <CheckCircle size={16} color="#16a34a" />
                ) : diagnostics ? (
                  <button onClick={fixShareError} style={{ background: '#fef3c7', color: '#b45309', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}>Fix</button>
                ) : null}
              </div>

              {/* Mục 3: Point & Print (0xbcb) */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.6rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>Driver Mạng 0xbcb</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>
                    {diagnostics?.pointAndPrint ? (
                      diagnostics.pointAndPrint.isOk ? (
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Cho phép nạp driver</span>
                      ) : (
                        <span style={{ color: '#d97706', fontWeight: 600 }}>⚠️ Bị chặn bởi GPO</span>
                      )
                    ) : (
                      'Chưa kiểm tra'
                    )}
                  </div>
                </div>
                {diagnostics?.pointAndPrint?.isOk ? (
                  <CheckCircle size={16} color="#16a34a" />
                ) : diagnostics ? (
                  <button onClick={fixPointAndPrint} style={{ background: '#fef3c7', color: '#b45309', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}>Fix</button>
                ) : null}
              </div>

              {/* Mục 4: Tường Lửa Firewall */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.6rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>Tường Lửa Chia Sẻ</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>
                    {diagnostics?.firewall ? (
                      diagnostics.firewall.isOk ? (
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Đã mở cổng chia sẻ</span>
                      ) : (
                        <span style={{ color: '#d97706', fontWeight: 600 }}>⚠️ Cổng Firewall đóng</span>
                      )
                    ) : (
                      'Chưa kiểm tra'
                    )}
                  </div>
                </div>
                {diagnostics?.firewall?.isOk ? (
                  <CheckCircle size={16} color="#16a34a" />
                ) : diagnostics ? (
                  <button onClick={enableLanSharing} style={{ background: '#fef3c7', color: '#b45309', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}>Mở</button>
                ) : null}
              </div>

              {/* Mục 5: File Kẹt Spooler */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.6rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>Bộ Đệm In Spooler</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>
                    {diagnostics?.spoolFiles ? (
                      diagnostics.spoolFiles.isOk ? (
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Sạch sẽ (0 file kẹt)</span>
                      ) : (
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠️ Kẹt {diagnostics.spoolFiles.count} file rác</span>
                      )
                    ) : (
                      'Chưa kiểm tra'
                    )}
                  </div>
                </div>
                {diagnostics?.spoolFiles?.isOk ? (
                  <CheckCircle size={16} color="#16a34a" />
                ) : diagnostics ? (
                  <button onClick={clearPrintQueue} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}>Dọn</button>
                ) : null}
              </div>

              {/* Mục 6: SNMP Offline Ảo */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.6rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>Cổng Mạng SNMP</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>
                    {diagnostics?.snmpPorts ? (
                      diagnostics.snmpPorts.isOk ? (
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Đã tắt (Tránh Offline ảo)</span>
                      ) : (
                        <span style={{ color: '#d97706', fontWeight: 600 }}>⚠️ {diagnostics.snmpPorts.badCount} cổng bật SNMP</span>
                      )
                    ) : (
                      'Chưa kiểm tra'
                    )}
                  </div>
                </div>
                {diagnostics?.snmpPorts?.isOk ? (
                  <CheckCircle size={16} color="#16a34a" />
                ) : diagnostics ? (
                  <button onClick={fixOfflineSnmp} style={{ background: '#fef3c7', color: '#b45309', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}>Tắt</button>
                ) : null}
              </div>

            </div>
          </div>
          
          {/* ═════ KHỐI 1: KHẮC PHỤC SỰ CỐ MẠNG LAN & CHIA SẺ ═════ */}
          <div style={{ background: '#fff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '0.9rem', boxShadow: '0 1px 3px rgba(99,102,241,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#3730a3', margin: 0, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <Share2 size={16} color="#6366f1" /> 1. Khắc Phục Lỗi Chia Sẻ Máy In Mạng LAN (Share Printer)
              </h3>
              {shareRpcStatus?.isFixed ? (
                <span style={{ fontSize: '0.7rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={12} /> Đã Bật RPC Named Pipe
                </span>
              ) : (
                <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                  ⚠️ Chưa cấu hình Registry Fix
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {/* Thẻ 1: Lỗi 0x00000709 / 0x0000011b */}
              <div style={{ background: '#f8faff', border: '1px solid #e0e7ff', borderRadius: 6, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#1e1b4b', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Share2 size={14} color="#6366f1" /> Lỗi 0x00000709 / 0x11b
                  </div>
                  <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '4px 0 8px 0', lineHeight: 1.4 }}>
                    Đặc trị lỗi <em>"Operation could not be completed"</em> khi máy con kết nối máy in qua LAN.
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    onClick={fixShareError}
                    disabled={loading || fixingShare}
                    style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 8px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    <Share2 size={12} className={fixingShare ? 'spin' : ''} />
                    {fixingShare ? 'Đang fix...' : '⚡ Sửa Tự Động 1-Click'}
                  </button>
                  <button
                    onClick={openLocalPortModal}
                    disabled={loading}
                    style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 8px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    title="Giải pháp chống lỗi 0x709 triệt để 100% khi kết nối giữa 2 bản Windows khác nhau (Win 11 - Win 10)"
                  >
                    <Network size={12} /> 🌐 Kết Nối Bằng Local Port
                  </button>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={copyCmdToClipboard}
                      style={{ flex: 1, background: copiedCmd ? '#ecfdf5' : '#fff', color: copiedCmd ? '#059669' : '#475569', border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px', fontSize: '0.68rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}
                      title="Chép câu lệnh Registry CMD Admin"
                    >
                      {copiedCmd ? <Check size={11} color="#059669" /> : <Copy size={11} />}
                      {copiedCmd ? 'Đã chép' : 'Chép CMD'}
                    </button>
                    <button
                      onClick={handleRestartPc}
                      style={{ flex: 1, background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', borderRadius: 4, padding: '4px', fontSize: '0.68rem', cursor: 'pointer' }}
                      title="Khởi động lại máy"
                    >
                      Reset PC
                    </button>
                  </div>
                </div>
              </div>

              {/* Thẻ 2: Lỗi 0x00000bcb / Point & Print */}
              <div style={{ background: '#f8faff', border: '1px solid #e0e7ff', borderRadius: 6, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#1e1b4b', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ShieldAlert size={14} color="#8b5cf6" /> Lỗi 0x00000bcb (Driver LAN)
                  </div>
                  <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '4px 0 8px 0', lineHeight: 1.4 }}>
                    Gỡ bỏ Group Policy chặn máy con tự nạp driver máy in chia sẻ qua mạng.
                  </p>
                </div>
                <button
                  onClick={fixPointAndPrint}
                  disabled={loading}
                  style={{ background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 8px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                >
                  <CheckCircle2 size={12} /> Gỡ Chặn Driver LAN
                </button>
              </div>

              {/* Thẻ 3: Mở Tường Lửa & Tắt Đòi Pass */}
              <div style={{ background: '#f8faff', border: '1px solid #e0e7ff', borderRadius: 6, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#1e1b4b', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Wifi size={14} color="#0284c7" /> Mạng & Tắt Đòi Mật Khẩu
                  </div>
                  <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '4px 0 8px 0', lineHeight: 1.4 }}>
                    Mở cổng Firewall File/Printer Sharing, bật Network Discovery, bỏ hỏi pass.
                  </p>
                </div>
                <button
                  onClick={enableLanSharing}
                  disabled={loading}
                  style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 8px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                >
                  <Wifi size={12} /> Bật Chia Sẻ Mạng LAN
                </button>
              </div>
            </div>

            {/* Banner hướng dẫn sống còn khi 2 Win khác nhau */}
            <div style={{ marginTop: '0.65rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '0.6rem 0.8rem', fontSize: '0.72rem', color: '#92400e', lineHeight: 1.45 }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, color: '#b45309', marginBottom: 3 }}>
                <AlertTriangle size={13} /> Lưu ý quan trọng khi bị lỗi 0x00000709 giữa 2 máy khác Win (Win 11 & Win 10):
              </div>
              <div style={{ paddingLeft: '0.5rem' }}>
                • <strong>Bước 1:</strong> Bấm <strong>⚡ Sửa Tự Động 1-Click</strong> trên <u>CẢ 2 MÁY</u> (Cả Máy Chủ cắm máy in và Máy Khách cần in), sau đó Restart máy.<br />
                • <strong>Bước 2:</strong> Trên máy chủ, đổi tên chia sẻ (Share Name) thành tên <strong>viết liền không dấu cách</strong> (ví dụ đặt <code>LQ310</code> thay vì <code>epson lq-310 escp2</code>).<br />
                • <strong>Bước 3 (Đặc trị 100%):</strong> Nếu Windows 11 vẫn chặn kéo driver, bấm nút <strong>[ 🌐 Kết Nối Bằng Local Port ]</strong> để in thông suốt vĩnh viễn không bao giờ bị 0x709!
              </div>
            </div>

            {/* Xem chi tiết CMD */}
            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCmdDetails(!showCmdDetails)}
                style={{ background: 'transparent', color: '#6366f1', border: 'none', padding: '2px 4px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'underline' }}
              >
                <Terminal size={12} /> {showCmdDetails ? 'Ẩn câu lệnh CMD' : 'Xem câu lệnh Registry sửa lỗi LAN'}
              </button>
            </div>

            {showCmdDetails && (
              <div style={{ marginTop: '0.4rem', background: '#0f172a', borderRadius: 6, padding: '0.6rem', fontSize: '0.7rem', color: '#e2e8f0', fontFamily: 'Consolas, monospace', lineHeight: 1.5, overflowX: 'auto' }}>
                <div style={{ color: '#94a3b8' }}># Bật RPC Named Pipe cho máy in:</div>
                <div style={{ color: '#38bdf8' }}>REG ADD "HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows NT\Printers\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f</div>
                <div style={{ color: '#94a3b8', marginTop: 4 }}># Tắt yêu cầu bảo mật mức cao RPC Print:</div>
                <div style={{ color: '#38bdf8' }}>REG ADD "HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f</div>
                <div style={{ color: '#94a3b8', marginTop: 4 }}># Khởi động lại dịch vụ Print Spooler:</div>
                <div style={{ color: '#a7f3d0' }}>net stop spooler && net start spooler</div>
              </div>
            )}
          </div>

          {/* ═════ KHỐI 2: KHẮC PHỤC SỰ CỐ DỊCH VỤ IN, KẸT LỆNH & ỨNG DỤNG ═════ */}
          <div style={{ background: '#fff', border: '1px solid #fed7aa', borderRadius: 8, padding: '0.9rem', boxShadow: '0 1px 3px rgba(249,115,22,0.06)' }}>
            <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c2410c', margin: '0 0 0.6rem 0', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <Activity size={16} color="#f97316" /> 2. Khắc Phục Sự Cố Dịch Vụ In & Ứng Dụng (Spooler, Offline, App Treo)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {/* Thẻ 4: Sửa lỗi Máy In Báo Offline do SNMP */}
              <div style={{ background: '#fffaf5', border: '1px solid #ffedd5', borderRadius: 6, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#7c2d12', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Power size={14} color="#ea580c" /> Máy In Báo "Offline" (SNMP)
                  </div>
                  <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '4px 0 8px 0', lineHeight: 1.4 }}>
                    Tắt SNMP Status trên cổng TCP/IP & ép chuyển máy in về trạng thái Online.
                  </p>
                </div>
                <button
                  onClick={fixOfflineSnmp}
                  disabled={loading}
                  style={{ background: '#ea580c', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 8px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                >
                  <Power size={12} /> Bật Online (Tắt SNMP)
                </button>
              </div>

              {/* Thẻ 5: Cứu Hộ Spooler Crash / Tự Tắt */}
              <div style={{ background: '#fffaf5', border: '1px solid #ffedd5', borderRadius: 6, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#7c2d12', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Wrench size={14} color="#d97706" /> Spooler Tự Tắt / Crash
                  </div>
                  <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '4px 0 8px 0', lineHeight: 1.4 }}>
                    Cấp lại Full Quyền thư mục Spooler PRINTERS & tự bật lại Spooler khi crash.
                  </p>
                </div>
                <button
                  onClick={fixSpoolerCrash}
                  disabled={loading}
                  style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 8px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                >
                  <Wrench size={12} /> Cứu Hộ Spooler Crash
                </button>
              </div>

              {/* Thẻ 6: Lỗi Treo In Word / Excel / PDF */}
              <div style={{ background: '#fffaf5', border: '1px solid #ffedd5', borderRadius: 6, padding: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#7c2d12', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Activity size={14} color="#16a34a" /> Treo In Word / PDF / HIS
                  </div>
                  <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '4px 0 8px 0', lineHeight: 1.4 }}>
                    Diệt tiến trình in phụ trợ treo (splwow64), giải phóng bộ đệm ứng dụng.
                  </p>
                </div>
                <button
                  onClick={fixAppPrinting}
                  disabled={loading}
                  style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 8px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                >
                  <Activity size={12} /> Sửa Lỗi In Ứng Dụng
                </button>
              </div>
            </div>
          </div>

          {/* ═════ KHỐI 3: DANH SÁCH MÁY IN VÀ THAO TÁC TRỰC TIẾP ═════ */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Printer size={16} color="#6366f1" /> Danh sách Máy In trên máy tính ({printers.length})
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Click chọn máy in để In Test, Đặt Mặc Định, Xem Lệnh hoặc Tự Sửa Lỗi
              </span>
            </div>
            
            <div style={{ display: 'grid', gap: 8 }}>
              {printers.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', padding: '1.5rem', background: '#f8fafc', borderRadius: 6 }}>
                  Vui lòng bấm nút <strong>"Quét & Chẩn Đoán Toàn Bộ Lỗi"</strong> ở góc trên để quét máy in và chẩn đoán toàn diện lỗi hệ thống.
                </div>
              )}
              {printers.map(p => {
                const isSelected = p.Name === selectedPrinter;
                const status = getStatusText(p.PrinterStatus);
                const isVirtual = p.PortName?.toLowerCase().includes('prompt') || p.PortName?.toLowerCase().includes('nul') || p.PortName?.includes('FILE');
                const hasError = p.PrinterStatus === 2 || p.JobCount > 0;
                const suggestedDriver = COMMON_DRIVERS.find(d => d.regex.test(p.Name) || d.regex.test(p.DriverName));

                return (
                  <div key={p.Name} style={{ border: `1px solid ${isSelected ? '#6366f1' : hasError ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 6, background: isSelected ? '#f5f7ff' : hasError ? '#fff5f5' : isVirtual ? '#f8fafc' : '#fff', overflow: 'hidden' }}>
                    <div
                      onClick={() => loadJobs(p.Name)}
                      style={{ padding: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {p.Name}
                          {isVirtual && <span style={{ fontSize: '0.65rem', background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>Máy in ảo</span>}
                          {suggestedDriver && <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: 4 }}>✓ Có driver phù hợp</span>}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: 4 }}>Cổng: {p.PortName || 'Không rõ'} | Driver: {p.DriverName}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: '0.73rem', fontWeight: 600, color: status.color, background: `${status.color}15`, padding: '2px 8px', borderRadius: 12, display: 'inline-block' }}>
                          {status.text}
                        </div>
                        {p.JobCount > 0 && (
                          <div style={{ fontSize: '0.73rem', color: '#ef4444', marginTop: 4, fontWeight: 500 }}>⚠ Kẹt {p.JobCount} lệnh</div>
                        )}
                      </div>
                    </div>

                    {/* Toolbar thao tác trực tiếp trên máy in đang chọn */}
                    {isSelected && (
                      <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #e0e7ff', paddingTop: '0.6rem' }}>
                        {/* Hàng 1: In test, Đặt mặc định, Bỏ tạm dừng/Online */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handlePrintTestPage(p.Name)}
                            style={{ flex: '1 1 auto', padding: '6px 10px', fontSize: '0.74rem', fontWeight: 600, borderRadius: 4, border: '1px solid #6366f1', background: '#4f46e5', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}
                            title="Gửi lệnh in một trang thử nghiệm (Test Page) chuẩn Windows"
                          >
                            <Printer size={13} /> In Trang Thử (Test Page)
                          </button>

                          <button
                            onClick={() => handleSetDefault(p.Name)}
                            style={{ flex: '1 1 auto', padding: '6px 10px', fontSize: '0.74rem', fontWeight: 600, borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}
                            title="Đặt máy in này làm máy in mặc định hệ thống"
                          >
                            <Star size={13} color="#f59e0b" /> Đặt Mặc Định
                          </button>

                          <button
                            onClick={() => handleResumePrinter(p.Name)}
                            style={{ flex: '1 1 auto', padding: '6px 10px', fontSize: '0.74rem', fontWeight: 600, borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff', color: '#16a34a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}
                            title="Bỏ tạm dừng và chuyển trạng thái máy in về Online"
                          >
                            <Play size={13} /> Bỏ Tạm Dừng / Online
                          </button>
                        </div>

                        {/* Hàng 2: Xem Queue, Thuộc tính, Tự sửa lỗi, Driver */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleOpenQueue(p.Name)}
                            style={{ flex: '1 1 auto', padding: '5px 8px', fontSize: '0.72rem', borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
                            title="Mở cửa sổ hàng đợi in gốc của Windows"
                          >
                            <FileText size={12} /> Xem Hàng Đợi In
                          </button>

                          <button
                            onClick={() => handleOpenProperties(p.Name)}
                            style={{ flex: '1 1 auto', padding: '5px 8px', fontSize: '0.72rem', borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
                            title="Mở thuộc tính cài đặt (Properties) của máy in"
                          >
                            <Settings size={12} /> Cài Đặt (Properties)
                          </button>

                          <button
                            onClick={() => autoFixPrinter(p.Name, p.DriverName)}
                            disabled={loading}
                            style={{ flex: '1 1 auto', padding: '5px 8px', fontSize: '0.72rem', fontWeight: 600, borderRadius: 4, border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
                            title="Xóa cấu hình cũ, cài lại máy in từ driver có sẵn và reset Spooler"
                          >
                            <Wrench size={12} /> Tự Sửa Lỗi (Reset + Cài lại)
                          </button>

                          {suggestedDriver && (
                            <button
                              onClick={() => autoFixAndInstallDriver(p.Name, p.DriverName)}
                              disabled={loading}
                              style={{ flex: '1 1 auto', padding: '5px 8px', fontSize: '0.72rem', fontWeight: 600, borderRadius: 4, border: '1px solid #6366f1', background: '#ede9fe', color: '#4338ca', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
                            >
                              <Download size={12} /> Cài Driver ({suggestedDriver.name.split(' ').slice(0,3).join(' ')})
                            </button>
                          )}

                          <button
                            onClick={() => handleUninstallPrinter(p.Name, p.DriverName)}
                            disabled={loading}
                            style={{ flex: '1 1 auto', padding: '5px 8px', fontSize: '0.72rem', fontWeight: 700, borderRadius: 4, border: '1px solid #ef4444', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
                            title="Gỡ bỏ hoàn toàn máy in này khỏi hệ thống, dọn sạch Registry và Driver để trong Word/Excel/HIS không còn hiển thị"
                          >
                            <Trash2 size={12} /> Gỡ Bỏ Tận Gốc (Xóa Sạch 100%)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Download Drivers Section */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
             <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={16} color="#10b981" /> Tự động nhận diện & Cài Driver Máy In
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
              Hệ thống cung cấp link tải driver chuẩn cho các dòng máy in phổ biến tại Bệnh viện/Phòng khám.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {COMMON_DRIVERS.map(drv => {
                const detected = printers.some(p => drv.regex.test(p.Name) || drv.regex.test(p.DriverName));
                return (
                  <button 
                    key={drv.name}
                    onClick={() => downloadAndInstallDriver(drv)}
                    disabled={loading}
                    style={{ 
                      padding: '0.75rem', border: `1px solid ${detected ? '#10b981' : '#e2e8f0'}`, borderRadius: 6,
                      textAlign: 'left', color: '#1e293b', background: detected ? '#f0fdf4' : '#fff', cursor: loading ? 'wait' : 'pointer'
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {detected ? <CheckCircle2 size={14} color="#10b981" /> : <Download size={14} color="#64748b" />} {drv.name}
                    </div>
                    {detected ? (
                      <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: 4 }}>Đã phát hiện thiết bị này</div>
                    ) : (
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>Click để tải & cài đặt</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Col: Jobs & Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Search size={16} color="#f59e0b" /> Lệnh in đang chờ/kẹt
              </h3>
              {selectedPrinter && jobs.length > 0 && (
                <button
                  onClick={() => clearAllJobsOnPrinter(selectedPrinter)}
                  disabled={loading}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  title={`Xóa toàn bộ ${jobs.length} lệnh in đang kẹt trên máy ${selectedPrinter}`}
                >
                  <Trash2 size={12} /> Xóa Hết ({jobs.length})
                </button>
              )}
            </div>
            
            {!selectedPrinter ? (
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>
                Chọn một máy in bên trái để xem lệnh in kẹt.
              </div>
            ) : jobs.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#10b981', textAlign: 'center', padding: '2rem 0', background: '#f0fdf4', borderRadius: 6 }}>
                Không có lệnh in nào bị kẹt trên {selectedPrinter}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {jobs.map(j => (
                  <div key={j.Id} style={{ padding: '8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ overflow: 'hidden', flex: 1, paddingRight: 8 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7f1d1d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {j.DocumentName}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#991b1b', marginTop: 4, display: 'flex', gap: 16 }}>
                        <span>User: {j.UserName}</span>
                        <span>Mã lỗi: {j.JobStatus}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => selectedPrinter && deleteSingleJob(selectedPrinter, j.Id)}
                      disabled={loading}
                      style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Trash2 size={12} /> Xóa
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: '#0f172a', borderRadius: 8, padding: '0.75rem', height: 200, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wrench size={14} /> Nhật ký hệ thống (Console)
            </h3>
            <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.75rem', color: '#38bdf8', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {logs.map((log, i) => <div key={i}>{log}</div>)}
              {logs.length === 0 && <div style={{ color: '#475569' }}>Đang chờ thao tác...</div>}
            </div>
          </div>

        </div>

      </div>

      {/* ═════ MODAL KẾT NỐI MÁY IN LOCAL PORT ═════ */}
      {showLocalPortModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 540, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
            
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #047857 0%, #059669 100%)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Network size={20} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Kết Nối Máy In Qua Cổng Local Port</h3>
                  <p style={{ margin: 0, fontSize: '0.72rem', opacity: 0.9 }}>Đặc trị lỗi 0x00000709 khi chia sẻ giữa 2 bản Windows khác nhau (Win 11 - Win 10/7)</p>
                </div>
              </div>
              <button onClick={() => setShowLocalPortModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '0.65rem 0.8rem', fontSize: '0.72rem', color: '#065f46', lineHeight: 1.45 }}>
                <strong>💡 Nguyên lý giải quyết triệt để 100%:</strong> Phương thức này tạo một máy in nội bộ trên máy này và dẫn thẳng cổng in qua mạng tới máy chủ (<code>\\IP\ShareName</code>). Nó hoàn toàn không dùng RPC Spooler từ xa của Windows, nên <strong>không bao giờ bị lỗi 0x00000709 hay 0x0000011b</strong>!
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  1. Địa chỉ IP hoặc Tên Máy Chủ (Máy cắm máy in): <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: 192.168.1.50 hoặc DESKTOP-MAYCHU"
                  value={localPortHost}
                  onChange={e => setLocalPortHost(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  2. Tên Chia Sẻ Máy In (Share Name trên máy chủ): <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: epson lq-310 escp2 hoặc LQ310"
                  value={localPortShare}
                  onChange={e => setLocalPortShare(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 3 }}>
                  Chính là tên máy in hiện trong cửa sổ mạng khi gõ \\IP_MAY_CHU vào Run.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  3. Chọn Driver Máy In Trên Máy Tính Này: <span style={{ color: '#ef4444' }}>*</span>
                </label>
                {availableDrivers.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <select
                      value={localPortDriver}
                      onChange={e => setLocalPortDriver(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff' }}
                    >
                      <option value="">-- Chọn driver tương ứng với máy in --</option>
                      {availableDrivers.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                      Hoặc nhập tên driver nếu không có trong danh sách:
                    </div>
                    <input
                      type="text"
                      placeholder="Hoặc tự gõ tên Driver (ví dụ: EPSON LQ-310 ESC/P2)"
                      value={localPortDriver}
                      onChange={e => setLocalPortDriver(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box' }}
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Ví dụ: EPSON LQ-310 ESC/P2"
                    value={localPortDriver}
                    onChange={e => setLocalPortDriver(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box' }}
                  />
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  4. Đặt Tên Máy In Hiển Thị (Tùy chọn):
                </label>
                <input
                  type="text"
                  placeholder={localPortShare ? `${localPortShare} (LAN)` : 'Epson LQ-310 (Mạng LAN)'}
                  value={localPortPrinterName}
                  onChange={e => setLocalPortPrinterName(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box' }}
                />
              </div>

            </div>

            {/* Footer */}
            <div style={{ padding: '0.85rem 1.25rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowLocalPortModal(false)}
                disabled={connectingLocalPort}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Hủy Bỏ
              </button>
              <button
                onClick={handleConnectLocalPort}
                disabled={connectingLocalPort}
                style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Network size={14} className={connectingLocalPort ? 'spin' : ''} />
                {connectingLocalPort ? 'Đang tạo cổng...' : '⚡ Tạo Cổng & Kết Nối Ngay'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
