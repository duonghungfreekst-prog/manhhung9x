import { useState, useEffect, useCallback } from 'react';
import { Printer, RefreshCw, Trash2, CheckCircle2, Search, Wrench, Download, Activity } from 'lucide-react';

interface PrinterInfo {
  Name: string;
  PrinterStatus: number;
  JobCount: number;
  DriverName: string;
  PortName: string;
}

interface PrintJob {
  Id: number;
  DocumentName: string;
  JobStatus: number;
  UserName: string;
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
  
  const addLog = (msg: string) => setLogs(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 10));

  const runPS = async (script: string) => {
    const w = window as unknown as { electronAPI?: { runPowershell: (s: string) => Promise<string> } };
    if (!w.electronAPI) {
      throw new Error('Tính năng này chỉ chạy trên phần mềm Desktop gốc (không chạy trên Web).');
    }
    return await w.electronAPI.runPowershell(script);
  };

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

  useEffect(() => {
    // Removed auto scan per user request
    // loadPrinters();
  }, []);

  const loadJobs = async (printerName: string) => {
    try {
      setLoading(true);
      setSelectedPrinter(printerName);
      addLog(`Kiểm tra lệnh in kẹt cho: ${printerName}`);
      const output = await runPS(`Get-PrintJob -PrinterName "${printerName}" | Select-Object Id, DocumentName, JobStatus, UserName | ConvertTo-Json`);
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

  const clearPrintQueue = async () => {
    try {
      setLoading(true);
      addLog('Bắt đầu quy trình gỡ kẹt lệnh in toàn hệ thống...');
      addLog('Đang dừng dịch vụ Spooler...');
      await runPS(`Stop-Service -Name Spooler -Force`);
      addLog('Đang xóa các file kẹt trong C:\\Windows\\System32\\spool\\PRINTERS...');
      await runPS(`Remove-Item -Path "$env:windir\\System32\\spool\\PRINTERS\\*.*" -Force -Recurse`);
      addLog('Đang khởi động lại dịch vụ Spooler...');
      await runPS(`Start-Service -Name Spooler`);
      addLog('✅ Đã xóa kẹt lệnh in thành công! Vui lòng in lại.');
      loadPrinters();
      setJobs([]);
    } catch (err: unknown) {
      const e = String(err);
      addLog('❌ Lỗi gỡ kẹt: ' + e);
      // Restart spooler just in case it stopped
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
      loadPrinters();
      setJobs([]);
    } catch (err: unknown) {
      const e = String(err);
      addLog('❌ Lỗi xử lý: ' + e);
      runPS(`Start-Service -Name Spooler`).catch(()=>{});
    } finally {
      setLoading(false);
    }
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

  const deleteSingleJob = async (printerName: string, jobId: number) => {
    try {
      setLoading(true);
      addLog(`Đang xóa lệnh in ID ${jobId} trên máy ${printerName}...`);
      await runPS(`Remove-PrintJob -PrinterName "${printerName}" -ID ${jobId}`);
      addLog(`✅ Đã xóa lệnh in ID ${jobId}.`);
      loadJobs(printerName);
    } catch (err: unknown) {
      const e = String(err);
      addLog('❌ Lỗi xóa lệnh in: ' + e);
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
      <div className="converter-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', paddingBottom: '1rem', paddingTop: '0.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Chẩn Đoán Máy In & Khắc Phục Lỗi</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0' }}>
            Khắc phục lỗi máy in không nhận lệnh, máy in bị kẹt lệnh, tải driver tự động.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={loadPrinters} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Quét Lại
          </button>
          <button className="btn-primary" onClick={fixAppPrinting} disabled={loading} style={{ background: '#f59e0b', borderColor: '#f59e0b', color: 'white', padding: '0.6rem 1rem' }}>
            <Activity size={15} /> Sửa Lỗi In (Word, PDF, App Khác)
          </button>
          <button className="btn-primary" onClick={clearPrintQueue} disabled={loading} style={{ background: '#ef4444', borderColor: '#ef4444', padding: '0.6rem 1rem' }}>
            <Trash2 size={15} /> Xóa Kẹt Lệnh In & Reset
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem' }}>
        
        {/* Left Col: Printers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={16} color="#6366f1" /> Danh sách Máy In trên máy tính
            </h3>
            
            <div style={{ display: 'grid', gap: 8 }}>
              {printers.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: 6 }}>
                  Vui lòng bấm nút <strong>"Quét Lại"</strong> ở góc trên để quét danh sách máy in và lỗi.
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
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {p.Name}
                          {isVirtual && <span style={{ fontSize: '0.65rem', background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>Máy in ảo</span>}
                          {suggestedDriver && <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: 4 }}>✓ Có driver phù hợp</span>}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>Cổng: {p.PortName || 'Không rõ'} | Driver: {p.DriverName}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: status.color, background: `${status.color}15`, padding: '2px 8px', borderRadius: 12, display: 'inline-block' }}>
                          {status.text}
                        </div>
                        {p.JobCount > 0 && (
                          <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 4, fontWeight: 500 }}>⚠ Kẹt {p.JobCount} lệnh</div>
                        )}
                      </div>
                    </div>

                    {/* Auto-fix buttons per printer */}
                    {isSelected && (
                      <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => autoFixPrinter(p.Name, p.DriverName)}
                          disabled={loading}
                          style={{ flex: 1, padding: '6px 10px', fontSize: '0.75rem', fontWeight: 600, borderRadius: 6, border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}
                        >
                          <Wrench size={13} /> Tự Sửa Lỗi (Reset + Cài Lại)
                        </button>
                        {suggestedDriver && (
                          <button
                            onClick={() => autoFixAndInstallDriver(p.Name, p.DriverName)}
                            disabled={loading}
                            style={{ flex: 1, padding: '6px 10px', fontSize: '0.75rem', fontWeight: 600, borderRadius: 6, border: '1px solid #6366f1', background: '#ede9fe', color: '#4338ca', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}
                          >
                            <Download size={13} /> Sửa + Cài Driver Mới ({suggestedDriver.name.split(' ').slice(0,3).join(' ')})
                          </button>
                        )}
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
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Search size={16} color="#f59e0b" /> Lệnh in đang chờ/kẹt
            </h3>
            
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
    </div>
  );
}
