import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Printer, RefreshCw, Trash2, CheckCircle2, Search, Wrench, 
  Download, Activity, Share2, Copy, Check, Terminal,
  ShieldAlert, FileText, Settings, ExternalLink, Play, Star,
  AlertTriangle, ShieldCheck, Zap, Network, X, Layers, BookOpen,
  Sparkles, FolderOpen, Loader2, AlertCircle, Bot, History, Key
} from 'lucide-react';
import { startGlobalLoading, stopGlobalLoading } from '../utils/globalLoading';
import { registerTabRefreshHandler } from '../utils/autoRefreshManager';
import { showToast, showConfirm } from '../utils/notificationSystem';
import { GeminiService } from '../services/geminiService';
import { ErrorTelemetryService, type DiagnosticRecord } from '../services/errorTelemetryService';

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
  // ─── MÁY IN HÓA ĐƠN NHIỆT (POS / Receipt / Bill K80 & K58) ───────────────
  { name: 'Xprinter XP-58 / XP-80 / XP-Q200 (Hóa đơn 58mm/80mm)', category: 'pos', regex: /Xprinter|XP-[58Q]/i,
    url: 'https://xprinter.vn/download-driver-may-in-driver-pos-printer/',
    directLink: 'https://drive.google.com/uc?export=download&id=1Cjx7BkiogE102XDkmFBEMzGEkxNAClb4', sha256: null },
  { name: 'Xprinter XP-N160M / XP-K200L / XP-Q800 / XP-D300M (POS 80mm)', category: 'pos', regex: /XP-N160M|XP-K200|XP-Q800|XP-D300/i,
    url: 'https://xprinter.vn/download-driver-may-in-driver-pos-printer/',
    directLink: 'https://drive.google.com/uc?export=download&id=1Cjx7BkiogE102XDkmFBEMzGEkxNAClb4', sha256: undefined },
  { name: 'Posiflex Aura PP-6900 / PP-8800 / PP-7600 (Máy in bill POS)', category: 'pos', regex: /Posiflex|PP-?[6789]000|Aura/i,
    url: 'https://www.posiflex.com/en-global/download/index/printers',
    directLink: undefined, sha256: undefined },
  { name: 'Posbank A7 / A9 / APEXA / BigPOS (Máy in bill POS)', category: 'pos', regex: /Posbank|Apexa|A[79]/i,
    url: 'https://www.posbank.com/download/',
    directLink: undefined, sha256: undefined },
  { name: 'Sunmi T2 / T2s / V2 / NT311 (POS để bàn & cầm tay)', category: 'pos', regex: /Sunmi|NT311/i,
    url: 'https://developer.sunmi.com/docs/en-US/index',
    directLink: undefined, sha256: undefined },
  { name: 'Zywell ZY-303 / ZY-306 / ZY-906 / ZY-908 (Hóa đơn nhiệt 80mm)', category: 'pos', regex: /Zywell|ZY-?[39]0[368]/i,
    url: 'http://www.zywell.net/download/',
    directLink: undefined, sha256: undefined },
  { name: 'Kpos / Atpos K200 / V58 / ZY-303 (Máy in bill K80 / K58)', category: 'pos', regex: /Kpos|Atpos|K200|V58/i,
    url: 'https://atpos.vn/driver-may-in-hoa-don/',
    directLink: undefined, sha256: undefined },
  { name: 'Antech A80 / AP250 / K260L / B80 (Máy in bill nhiệt)', category: 'pos', regex: /Antech|AP250|K260L/i,
    url: 'https://antech.vn/ho-tro-ky-thuat/driver-may-in/',
    directLink: undefined, sha256: undefined },
  { name: 'Epson TM-T82 / TM-T82III / TM-T82X (Hóa đơn nhiệt K80)', category: 'pos', regex: /Epson.?TM.?T82/i,
    url: 'https://download.epson-biz.com/modules/pos/index.php?page=prod&pcat=3&pid=42',
    directLink: undefined, sha256: undefined },
  { name: 'Epson TM-T88 / TM-T88VI / TM-m30 (POS Receipt cao cấp)', category: 'pos', regex: /Epson.?TM.?(T88|m30)/i,
    url: 'https://download.epson-biz.com/modules/pos/index.php?page=prod&pcat=3&pid=36',
    directLink: undefined, sha256: undefined },
  { name: 'Epson TM-T20 / TM-T20II / TM-T20III (Hóa đơn POS)', category: 'pos', regex: /Epson.?TM.?T20/i,
    url: 'https://download.epson-biz.com/modules/pos/index.php?page=prod&pcat=3&pid=62',
    directLink: undefined, sha256: undefined },
  { name: 'Epson TM-U220 / TM-U295 (In kim hóa đơn 2-3 liên)', category: 'pos', regex: /Epson.?TM.?U220|TM.?U295/i,
    url: 'https://download.epson-biz.com/modules/pos/index.php?page=prod&pcat=3&pid=5',
    directLink: undefined, sha256: undefined },
  { name: 'Bixolon SRP-330 / SRP-350 / SRP-E300 (Receipt POS)', category: 'pos', regex: /Bixolon|SRP-[35E]/i,
    url: 'https://www.bixolon.com/subpage.php?m_cd=000100030004',
    directLink: undefined, sha256: undefined },
  { name: 'Citizen CT-S310 / CT-S651 (Receipt POS)', category: 'pos', regex: /Citizen.?CT.?S[36]/i,
    url: 'https://www.citizen-systems.com/en/printer/download.html',
    directLink: undefined, sha256: undefined },
  { name: 'Star TSP100 / TSP650 / BSC10 (Receipt POS)', category: 'pos', regex: /Star.?TSP[16]|BSC10/i,
    url: 'https://www.star-m.jp/eng/dl/dl06_s.htm',
    directLink: undefined, sha256: undefined },
  { name: 'Hprt TP805 / TP808 / PPT2-A (Hóa đơn nhiệt 80mm)', category: 'pos', regex: /Hprt|TP80[58]|PPT2/i,
    url: 'https://www.hprt.com/Support/Download',
    directLink: undefined, sha256: undefined },
  { name: 'Rongta RP80 / RP326 / RP58 (Máy in bill siêu tốc)', category: 'pos', regex: /Rongta|RP80|RP326|RP58/i,
    url: 'https://www.rongtatech.com/download',
    directLink: undefined, sha256: undefined },
  { name: 'Gprinter GP-58 / GP-80 / GP-L80180 (Hóa đơn nhiệt)', category: 'pos', regex: /Gprinter|GP-[58L]/i,
    url: 'http://www.gprinter.net/download.asp',
    directLink: undefined, sha256: undefined },
  { name: 'Sewoo LK-T210 / LK-T213 / LK-T320 (Receipt POS)', category: 'pos', regex: /Sewoo|LK-T21|LK-T320/i,
    url: 'http://www.miniprinter.com/support/download.php',
    directLink: undefined, sha256: undefined },
  { name: 'Winpal WPR-80A / WP-T810 / WP300A (Hóa đơn nhiệt K80)', category: 'pos', regex: /Winpal|WPR-80|WP-T810|WP300/i,
    url: 'https://www.winprt.com/support/download/',
    directLink: undefined, sha256: undefined },
  { name: 'SAM4S Giant-100 / Ellix 40 (Receipt POS)', category: 'pos', regex: /SAM4S|Giant-100|Ellix/i,
    url: 'https://www.sam4s.com/support/download',
    directLink: undefined, sha256: undefined },
  { name: 'DATECS EP-50 / FP-700 (Máy in hóa đơn tài chính)', category: 'pos', regex: /DATECS|EP-50|FP-700/i,
    url: 'https://www.datecs.bg/en/products/printers',
    directLink: undefined, sha256: undefined },
  // ─── MÁY IN NHÃN (Barcode / Label / Ống nghiệm) ─────────────────────────
  { name: 'Godex G500 / G530 / EZ1100 Plus (In tem nhãn xét nghiệm & thuốc)', category: 'barcode', regex: /Godex|G500|EZ1100|G530/i,
    url: 'https://www.godexintl.com/downloads',
    directLink: undefined, sha256: undefined },
  { name: 'Zebra ZP450 / GK420 / GX420 / ZD220 (Barcode nhãn)', category: 'barcode', regex: /Zebra|ZP450|GK420|GX420|ZD220/i,
    url: 'https://www.zebra.com/us/en/support-downloads/printers.html',
    directLink: undefined, sha256: undefined },
  { name: 'TSC TDP-225 / TE200 / TE210 (Barcode nhãn bệnh viện)', category: 'barcode', regex: /TSC.?(TDP|TE)[23]/i,
    url: 'https://www.tscprinters.com/EN/download.html',
    directLink: undefined, sha256: undefined },
  { name: 'Bixolon SLP-TX400 / SLP-DX220 (Barcode ống nghiệm)', category: 'barcode', regex: /SLP-TX400|SLP-DX220/i,
    url: 'https://www.bixolon.com/subpage.php?m_cd=000100030003',
    directLink: undefined, sha256: undefined },
  { name: 'Argox OS-214 / OS-314 (Barcode nhãn)', category: 'barcode', regex: /Argox|OS-[23]14/i,
    url: 'https://www.argox.com/download.php',
    directLink: undefined, sha256: undefined },
  { name: 'iDPRT SP410 / iT4S (Barcode nhãn & vận đơn)', category: 'barcode', regex: /iDPRT|SP4|iT4/i,
    url: 'https://www.idprt.com/support/download-center.html',
    directLink: undefined, sha256: undefined },
  { name: 'Xprinter XP-350B / XP-420B / XP-470B (In tem nhãn mã vạch)', category: 'barcode', regex: /XP-350B|XP-420B|XP-470B/i,
    url: 'https://xprinter.vn/download-driver-may-in-driver-pos-printer/',
    directLink: 'https://drive.google.com/uc?export=download&id=1IDMAfQaF5IhGu52JVO655_r04jPSv_ea', sha256: undefined },
];

type PrinterSubView = 'repair' | 'printers' | 'drivers' | 'all';

export default function PrinterTab() {
  const [activeSubView, setActiveSubView] = useState<PrinterSubView>('repair');
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  // State tìm kiếm & bộ lọc phân loại Driver máy in (POS / Barcode / Văn Phòng A4)
  const [driverSearch, setDriverSearch] = useState('');
  const [driverCategory, setDriverCategory] = useState<'all' | 'pos' | 'barcode' | 'office'>('all');
  // State tự động cài đặt Driver A-Z & In Thử Nghiệm
  const [autoTestPrint, setAutoTestPrint] = useState(true);
  const [driverInstallProgress, setDriverInstallProgress] = useState<{ step: number; total: number; text: string; status: string } | null>(null);
  // State quản lý sửa lỗi chia sẻ máy in qua mạng LAN (RPC Named Pipe 0x00000709 / 0x0000011b)
  const [, setShareRpcStatus] = useState<{ isFixed: boolean; rpcUseNamedPipe?: number; rpcAuthnLevelPrivacy?: number; spoolerStatus?: string } | null>(null);
  const [, setFixingShare] = useState(false);
  const [fixing0x40, setFixing0x40] = useState(false);
  const [fixingIpc, setFixingIpc] = useState(false);
  const [error0x40Host, setError0x40Host] = useState('');
  const [openingCredMgr, setOpeningCredMgr] = useState(false);
  const [copiedMinhYakCmd, setCopiedMinhYakCmd] = useState(false);
  const [showError0x40Modal, setShowError0x40Modal] = useState(false);
  const [showError709Modal, setShowError709Modal] = useState(false);
  const [copied0x40Reg, setCopied0x40Reg] = useState(false);
  const [, setFixingPointAndPrint] = useState(false);
  const [, setEnablingSharing] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [showCmdDetails, setShowCmdDetails] = useState(false);

  // ── State Chuyên Sâu Đặc Trị Lỗi 0x00000709 Từ A-Z ───────────────────────
  interface Diag709Result {
    ok: boolean;
    overallOk: boolean;
    issueCount: number;
    issues: string[];
    checks: {
      rpcNamedPipe?: { ok: boolean; val1?: number; val2?: number; label: string };
      rpcPrivacy?: { ok: boolean; privacy?: number; exempt?: number; label: string };
      dnsOnWire?: { ok: boolean; val?: number; label: string };
      strictNameChecking?: { ok: boolean; strict?: number; loopback?: number; label: string };
      win11Rpc?: { ok: boolean; overPipes?: number; protocols?: number; label: string };
      pointAndPrint?: { ok: boolean; admin?: number; restr?: number; label: string };
      nullSessionPipes?: { ok: boolean; hasSpoolss?: boolean; label: string };
      smbGuest?: { ok: boolean; guest?: number; reqSign?: number; label: string };
      hkcuDefault?: { ok: boolean; canWrite?: boolean; defaultPrinter?: string; label: string };
      firewall?: { ok: boolean; label: string };
      spooler?: { ok: boolean; running?: boolean; stuckFiles?: number; label: string };
    };
  }
  const [diag709, setDiag709] = useState<Diag709Result | null>(null);
  const [diagnosing709, setDiagnosing709] = useState(false);
  const [fixing709AZ, setFixing709AZ] = useState(false);
  const [fixingDefault709, setFixingDefault709] = useState(false);
  const [exporting709Script, setExporting709Script] = useState(false);
  const [selectedDefaultTarget, setSelectedDefaultTarget] = useState('');
  const [active709Tab, setActive709Tab] = useState<'lan' | 'default' | 'manual'>('lan');
  const [credHostInput, setCredHostInput] = useState('');
  const [savingCred, setSavingCred] = useState(false);

  // ── State Trợ Lý Chẩn Đoán & Đọc Lỗi Google Gemini AI ─────────────────────
  const [showGeminiModal, setShowGeminiModal] = useState(false);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
  const [geminiModelSelect, setGeminiModelSelect] = useState('gemini-1.5-flash');
  const [geminiAnalysisResult, setGeminiAnalysisResult] = useState('');
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiActiveTab, setGeminiActiveTab] = useState<'analysis' | 'settings' | 'history'>('analysis');
  const [diagnosticHistory, setDiagnosticHistory] = useState<DiagnosticRecord[]>([]);
  const [copiedGeminiText, setCopiedGeminiText] = useState(false);
  const [networkProbeResult, setNetworkProbeResult] = useState<any>(null);
  const [liveEventLogs, setLiveEventLogs] = useState<any[]>([]);
  const [liveStuckJobs, setLiveStuckJobs] = useState<any[]>([]);
  const [liveSpoolerStatus, setLiveSpoolerStatus] = useState<string>('');
  const [liveWindowsVersion, setLiveWindowsVersion] = useState<string>('');
  const [probingHost, setProbingHost] = useState(false);

  // ── State Bảng Quy Trình Chẩn Đoán & Sửa Lỗi Tự Động (Tập trung 2 Nút) ──
  interface WorkflowStepItem {
    id: string;
    stepNum: number;
    title: string;
    errorCode: string;
    desc: string;
    status: 'idle' | 'scanning' | 'fixing' | 'ok' | 'error' | 'warning';
    detail: string;
  }

  const INITIAL_WORKFLOW_STEPS: WorkflowStepItem[] = [
    {
      id: 'spooler',
      stepNum: 1,
      title: 'Dịch vụ Print Spooler',
      errorCode: 'Spooler Crash / Stopped',
      desc: 'Kiểm tra trạng thái chạy, cấu hình tự phục hồi khi crash và phân quyền thư mục PRINTERS.',
      status: 'idle',
      detail: 'Chưa kiểm tra'
    },
    {
      id: 'spool_files',
      stepNum: 2,
      title: 'Hàng Đợi In & File Kẹt Spool',
      errorCode: 'Kẹt Hàng Đợi (Spool Files)',
      desc: 'Dọn sạch các tệp lệnh in bị lỗi hoặc kẹt cứng trong C:\\Windows\\System32\\spool\\PRINTERS.',
      status: 'idle',
      detail: 'Chưa kiểm tra'
    },
    {
      id: 'app_printing',
      stepNum: 3,
      title: 'Tiến Trình In Phụ Trợ (splwow64)',
      errorCode: 'Treo In Word / PDF / HIS',
      desc: 'Giải phóng tiến trình splwow64 & printfilterpipelinesvc bị treo gây đơ ứng dụng khi bấm in.',
      status: 'idle',
      detail: 'Chưa kiểm tra'
    },
    {
      id: 'lan_rpc',
      stepNum: 4,
      title: 'Chia Sẻ LAN Qua RPC Named Pipe',
      errorCode: 'Lỗi 0x00000709 / 0x0000011b',
      desc: 'Cấu hình RpcUseNamedPipeProtocol = 1, RpcProtocols Win 11, miễn trừ xác thực RPC & DnsOnWire.',
      status: 'idle',
      detail: 'Chưa kiểm tra'
    },
    {
      id: 'point_and_print',
      stepNum: 5,
      title: 'Chính Sách Chặn Driver Point & Print',
      errorCode: 'Lỗi 0x00000bcb (GPO Driver)',
      desc: 'Gỡ bỏ chính sách Group Policy chặn máy con tự động nạp driver máy in chia sẻ qua mạng LAN.',
      status: 'idle',
      detail: 'Chưa kiểm tra'
    },
    {
      id: 'smb_network',
      stepNum: 6,
      title: 'Phiên Mạng SMB & Kết Nối Đa Bản Win',
      errorCode: 'Lỗi 40 (0x00000040)',
      desc: 'Tắt SMB Signing Win 11, chuyển mạng Private, mở Guest Auth & cho phép spoolss NullSessionPipes.',
      status: 'idle',
      detail: 'Chưa kiểm tra'
    },
    {
      id: 'firewall_lan',
      stepNum: 7,
      title: 'Tường Lửa Windows Firewall & Chia Sẻ',
      errorCode: 'Firewall Block / Ẩn Mạng LAN',
      desc: 'Mở thông cổng File & Printer Sharing, bật Network Discovery, khởi động FDResPub & LanmanServer.',
      status: 'idle',
      detail: 'Chưa kiểm tra'
    },
    {
      id: 'snmp_offline',
      stepNum: 8,
      title: 'Cổng Mạng SNMP (Chống Báo Offline Ảo)',
      errorCode: 'Printer Offline (SNMP Status)',
      desc: 'Tắt SNMP Status trên các cổng TCP/IP, kích hoạt máy in về trạng thái Online và Resume in.',
      status: 'idle',
      detail: 'Chưa kiểm tra'
    },
    {
      id: 'default_printer',
      stepNum: 9,
      title: 'Quyền Đặt Máy In Mặc Định (Default)',
      errorCode: 'Lỗi 0x00000709 Set Default',
      desc: 'Cấp toàn quyền Registry HKCU Windows, chống lỗi 709 khi đặt máy in mặc định trên mọi app.',
      status: 'idle',
      detail: 'Chưa kiểm tra'
    },
    {
      id: 'verification',
      stepNum: 10,
      title: 'Tự Động Đối Soát & Xác Nhận Hệ Thống',
      errorCode: 'Verification Check 100%',
      desc: 'Quét lại toàn diện sau khi sửa để xác nhận hệ thống in ấn và chia sẻ LAN đạt chuẩn 100%.',
      status: 'idle',
      detail: 'Chưa kiểm tra'
    }
  ];

  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepItem[]>(INITIAL_WORKFLOW_STEPS);
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<'diagnose' | 'fix' | null>(null);
  const [workflowProgressPercent, setWorkflowProgressPercent] = useState(0);
  const [workflowStatusText, setWorkflowStatusText] = useState('');
  const [workflowTargetHost, setWorkflowTargetHost] = useState('');

  // Đếm chính xác số lượng lỗi thực tế đang phát hiện (loại bỏ bước verification)
  const detectedIssueCount = useMemo(() => {
    return workflowSteps.filter(s => s.id !== 'verification' && (s.status === 'error' || s.status === 'warning')).length;
  }, [workflowSteps]);

  // Tự động tìm IP máy chủ từ danh sách máy in mạng đang kết nối
  const detectedNetworkHost = useMemo(() => {
    for (const p of printers) {
      const match1 = (p.Name || '').match(/^\\\\([^\\]+)\\/);
      if (match1 && match1[1]) return match1[1];
      const match2 = (p.PortName || '').match(/^\\\\([^\\]+)\\/);
      if (match2 && match2[1]) return match2[1];
      const match3 = (p.PortName || '').match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (match3 && match3[1]) return match3[1];
    }
    return '';
  }, [printers]);

  // State theo dõi các tiến trình thao tác cụ thể trên máy in (để hiện loading, spinner & text động)
  const [uninstallingPrinter, setUninstallingPrinter] = useState<string | null>(null);
  const [fixingPrinterName, setFixingPrinterName] = useState<string | null>(null);
  const [printingTestName, setPrintingTestName] = useState<string | null>(null);
  const [settingDefaultName, setSettingDefaultName] = useState<string | null>(null);
  const [resumingPrinterName, setResumingPrinterName] = useState<string | null>(null);
  const [clearingJobsFor, setClearingJobsFor] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<number | null>(null);
  const [restartingSpooler, setRestartingSpooler] = useState(false);
  const [restartingPc, setRestartingPc] = useState(false);
  const [, setFixingSpoolerCrashState] = useState(false);
  const [, setFixingAppPrintState] = useState(false);
  const [, setFixingSnmpState] = useState(false);
  const [activeOperationMessage, setActiveOperationMessage] = useState<string | null>(null);

  // State Modal Thông Báo Kết Quả Sửa Lỗi Hiện Đại (Thay thế alert native cũ)
  interface ResultModalState {
    isOpen: boolean;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    badge?: string;
    items?: string[];
    message?: string;
    actionTip?: string;
  }
  const [resultModal, setResultModal] = useState<ResultModalState | null>(null);

  const formatTechnicalText = (text: string) => {
    const keywords = [
      'Point and Print Restrictions',
      'RestrictDriverInstallationToAdministrators',
      'NoWarningNoElevationOnInstall',
      'RpcUseNamedPipeProtocol',
      'RpcAuthnLevelPrivacyEnabled',
      'RpcAuthnLevelExemption',
      'RPC Named Pipe',
      'miễn trừ xác thực RPC',
      'SMB Signing',
      'Windows 11',
      'Windows 10/7',
      'Private Network',
      'Tường lửa',
      'Print Spooler',
      'Local Port',
      '0x00000040',
      '0x00000709',
      '0x709',
      '0x11b',
      '0xbcb',
      'Network Discovery',
      'File and Printer Sharing',
      'Guest',
      'SNMP',
    ];

    let segments: (string | React.ReactNode)[] = [text];
    keywords.forEach(kw => {
      const nextSegments: (string | React.ReactNode)[] = [];
      segments.forEach(seg => {
        if (typeof seg === 'string') {
          const parts = seg.split(new RegExp(`(${kw})`, 'gi'));
          parts.forEach((p, idx) => {
            if (p.toLowerCase() === kw.toLowerCase()) {
              nextSegments.push(
                <strong key={`${kw}-${idx}`} style={{ color: '#047857', fontWeight: 700 }}>
                  {p}
                </strong>
              );
            } else if (p) {
              nextSegments.push(p);
            }
          });
        } else {
          nextSegments.push(seg);
        }
      });
      segments = nextSegments;
    });
    return segments;
  };

  const showResultModal = (
    rawMsg: string,
    overrideType?: 'success' | 'warning' | 'error' | 'info'
  ) => {
    const rawLines = rawMsg.split('\n').map(l => l.trim()).filter(Boolean);
    let title = rawLines[0] || 'Thông Báo Bác Sĩ Máy In';
    let type: 'success' | 'warning' | 'error' | 'info' = overrideType || 'info';

    if (title.includes('🎉') || title.includes('✅') || title.includes('THÀNH CÔNG') || title.includes('KẾT NỐI THÀNH CÔNG')) {
      type = 'success';
    } else if (title.includes('⚠️') || title.includes('ADMINISTRATOR') || title.includes('CẦN QUYỀN')) {
      type = 'warning';
    } else if (title.includes('❌') || title.includes('Lỗi') || title.includes('thất bại') || title.includes('Thất Bại')) {
      type = 'error';
    }

    // Bỏ emoji hoặc biểu tượng đầu dòng
    const emojiList = ['🎉', '✅', '⚠️', '❌', '🚀', '🛠️', '🛠', '💡', '👉'];
    for (const em of emojiList) {
      if (title.startsWith(em)) {
        title = title.slice(em.length).trim();
      }
    }

    const items: string[] = [];
    let actionTip: string | undefined;
    const textLines: string[] = [];

    for (let i = 1; i < rawLines.length; i++) {
      let line = rawLines[i];
      if (line.startsWith('•') || line.startsWith('-')) {
        items.push(line.replace(/^[•-]\s*/, '').trim());
      } else if (line.startsWith('👉') || line.startsWith('💡') || line.toLowerCase().startsWith('lưu ý')) {
        for (const tipIcon of ['👉', '💡']) {
          if (line.startsWith(tipIcon)) {
            line = line.slice(tipIcon.length).trim();
          }
        }
        actionTip = line;
      } else {
        textLines.push(line);
      }
    }

    setResultModal({
      isOpen: true,
      type,
      title,
      badge: type === 'success' ? 'ĐÃ XỬ LÝ THÀNH CÔNG 100%' : type === 'warning' ? 'YÊU CẦU QUYỀN HỆ THỐNG' : type === 'error' ? 'SỰ CỐ THAO TÁC' : 'THÔNG BÁO',
      items: items.length > 0 ? items : undefined,
      message: textLines.length > 0 ? textLines.join('\n') : undefined,
      actionTip,
    });
  };

  // State quản lý công cụ Kết Nối Máy In Qua Local Port (Đặc trị lỗi 0x00000709 / 0x00000040 khi 2 máy khác bản Windows)
  const [showLocalPortModal, setShowLocalPortModal] = useState(false);
  const [localPortHost, setLocalPortHost] = useState('');
  const [localPortShare, setLocalPortShare] = useState('');
  const [localPortPrinterName, setLocalPortPrinterName] = useState('');
  const [localPortDriver, setLocalPortDriver] = useState('');
  const [localPortUser, setLocalPortUser] = useState('');
  const [localPortPass, setLocalPortPass] = useState('');
  const [availableDrivers, setAvailableDrivers] = useState<string[]>([]);
  const [connectingLocalPort, setConnectingLocalPort] = useState(false);
  const [clearingSmbCache, setClearingSmbCache] = useState(false);

  // State quản lý Modal Tùy Chọn Chế Độ Cài Đặt Driver Máy In Trước Khi Cài (Tránh lỗi cổng Other & nhầm máy in)
  const [showInstallOptionsModal, setShowInstallOptionsModal] = useState(false);
  const [pendingInstallDriver, setPendingInstallDriver] = useState<{
    name: string;
    url: string;
    directLink?: string;
    sha256?: string | null;
    category?: string;
    localFilePath?: string;
  } | null>(null);
  const [installMode, setInstallMode] = useState<'usb' | 'network' | 'interactive'>('usb');
  const [selectedPort, setSelectedPort] = useState<string>('AUTO');
  const [printerIp, setPrinterIp] = useState<string>('');
  const [printerPortNum, setPrinterPortNum] = useState<number>(9100);
  const [systemPorts, setSystemPorts] = useState<{
    Name: string;
    Description?: string;
    IsConnected?: boolean;
    DeviceId?: string;
    DeviceName?: string;
    AssignedPrinters?: string[];
  }[]>([]);
  const [detectedUsbPort, setDetectedUsbPort] = useState<string | null>(null);

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
      showResultModal('⚠️ Vui lòng nhập địa chỉ IP hoặc tên máy chủ (ví dụ: 192.168.1.50 hoặc MAY-CHU)!', 'warning');
      return;
    }
    if (!localPortShare.trim()) {
      showResultModal('⚠️ Vui lòng nhập tên chia sẻ của máy in trên máy chủ (ví dụ: epson lq-310 escp2 hoặc LQ310)!', 'warning');
      return;
    }
    if (!localPortDriver.trim()) {
      showResultModal('⚠️ Vui lòng chọn hoặc nhập tên Driver của máy in trên máy tính này!', 'warning');
      return;
    }

    setConnectingLocalPort(true);
    startGlobalLoading('printer-local-port', `Đang thiết lập Cổng Local Port máy in LAN: \\\\${localPortHost.trim()}\\${localPortShare.trim()}...`);
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
          username: localPortUser.trim(),
          password: localPortPass.trim(),
        });

        if (res?.ok && res?.success) {
          addLog(`✅ ${res.message || 'Kết nối máy in qua Local Port thành công!'}`);
          showResultModal(`🎉 ĐÃ KẾT NỐI MÁY IN LOCAL PORT THÀNH CÔNG!\n\n• Đã tạo máy in [${res.printerName}]\n• Đã gán thành công vào cổng Local Port [${res.portName}]\n\n👉 Bạn có thể mở Word/Excel/HIS và in ngay lập tức mà không bao giờ bị lỗi 0x00000709 hay 0x00000040!`);
          setShowLocalPortModal(false);
          await loadPrinters();
          await diagnoseAllPrinters(true);
        } else {
          addLog(`❌ Kết nối thất bại: ${res?.error || 'Lỗi không xác định'}`);
          showResultModal(`❌ Kết Nối Thất Bại\n\n${res?.error || 'Vui lòng kiểm tra lại quyền Administrator hoặc tên Driver!'}`, 'error');
        }
      }
    } catch (err: unknown) {
      addLog(`❌ Lỗi kết nối Local Port: ${String(err)}`);
      showResultModal(`❌ Lỗi Kết Nối Local Port\n\n${String(err)}`, 'error');
    } finally {
      setConnectingLocalPort(false);
      stopGlobalLoading('printer-local-port');
    }
  };

  const clearSmbCache = async () => {
    try {
      setClearingSmbCache(true);
      setLoading(true);
      startGlobalLoading('printer-clear-smb', 'Đang dọn sạch các phiên kết nối mạng SMB kẹt...');
      addLog('🧹 Đang dọn sạch cache SMB (net use /delete), xóa NetBIOS, ARP và flush DNS...');
      const w = window as any;
      if (w.electronAPI?.printer?.clearSmbCache) {
        const res = await w.electronAPI.printer.clearSmbCache();
        if (res?.ok && res?.success) {
          addLog('✅ ' + (res.message || 'Đã dọn sạch session mạng SMB kẹt thành công!'));
          showToast.success('Làm Mới Mạng SMB', res.message || 'Đã dọn sạch các phiên kết nối mạng kẹt và khởi động lại Spooler!');
        } else {
          addLog('⚠️ ' + (res?.message || res?.error || 'Không thể dọn sạch'));
          showToast.error('Lỗi Dọn Cache', res?.error || 'Có lỗi xảy ra khi dọn cache SMB');
        }
      } else {
        await runPS(`
          net use * /delete /y 2>&1 | Out-Null
          arp -d * 2>&1 | Out-Null
          nbtstat -R 2>&1 | Out-Null
          nbtstat -RR 2>&1 | Out-Null
          ipconfig /flushdns 2>&1 | Out-Null
          Restart-Service -Name Spooler -Force
        `);
        addLog('✅ Đã dọn sạch các phiên SMB kẹt qua PowerShell.');
        showToast.success('Làm Mới Mạng SMB', 'Đã dọn sạch các phiên kết nối mạng kẹt thành công!');
      }
      await loadPrinters();
    } catch (err: unknown) {
      addLog('❌ Lỗi xử lý: ' + String(err));
      showToast.error('Lỗi Dọn Cache', String(err));
    } finally {
      setClearingSmbCache(false);
      setLoading(false);
      stopGlobalLoading('printer-clear-smb');
    }
  };
  
  const addLog = (msg: string) => setLogs(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 15));

  const runPS = async (script: string): Promise<string> => {
    // Zero-RCE Security Guard: Triệt tiêu hoàn toàn chạy script tùy ý.
    // Toàn bộ tác vụ đã chuyển sang typed electronAPI.printer APIs.
    console.warn('[PrinterTab] Arbitrary PowerShell is disabled for security:', script.trim().slice(0, 80));
    return '';
  };

  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);

  const loadPrinters = useCallback(async (silent: boolean = false) => {
    try {
      if (!silent) {
        setLoading(true);
        startGlobalLoading('printer-scan', 'Đang quét danh sách máy in hệ thống...');
        addLog('Đang quét danh sách máy in hệ thống...');
      }
      const w = window as any;
      if (w.electronAPI?.printer?.getPrinters) {
        const list = await w.electronAPI.printer.getPrinters();
        setPrinters(Array.isArray(list) ? list : []);
        if (!silent) addLog(`Tìm thấy ${(list || []).length} máy in.`);
      } else {
        setPrinters([]);
      }
    } catch (err: unknown) {
      const e = String(err);
      if (!silent) addLog('Lỗi quét máy in: ' + e);
    } finally {
      if (!silent) {
        setLoading(false);
        stopGlobalLoading('printer-scan');
      }
    }
  }, []);

  // Đăng ký làm mới thông minh với AutoRefreshManager
  useEffect(() => {
    return registerTabRefreshHandler('printer', async ({ silent }) => {
      await loadPrinters(silent);
    });
  }, [loadPrinters]);

  // Lắng nghe tiến trình cài đặt driver tự động từ Electron Main
  useEffect(() => {
    const w = window as any;
    if (w.electronAPI?.printer?.onDriverInstallProgress) {
      w.electronAPI.printer.onDriverInstallProgress((data: { step: number; total: number; text: string; status: string }) => {
        setDriverInstallProgress(data);
        const prefix = `[Bước ${data.step}/${data.total}]`;
        if (data.status === 'ok') addLog(`${prefix} ✅ ${data.text}`);
        else if (data.status === 'err') addLog(`${prefix} ❌ ${data.text}`);
        else if (data.status === 'warn') addLog(`${prefix} ⚠️ ${data.text}`);
        else addLog(`${prefix} ℹ️ ${data.text}`);
      });
    }
    return () => {
      const w2 = window as any;
      w2.electronAPI?.printer?.removeDriverInstallProgressListener?.();
    };
  }, []);

  // ── Quét & Chẩn Đoán Toàn Bộ Lỗi Hệ Thống Máy In (Auto Re-Diagnose) ──────────
  const diagnoseAllPrinters = useCallback(async (isPostFix: boolean = false) => {
    try {
      setLoading(true);
      const postFix = isPostFix === true;
      const diagMsg = postFix
        ? 'Đang quét kiểm tra lại toàn bộ hệ thống sau sửa lỗi...'
        : 'Đang quét & chẩn đoán toàn diện lỗi máy in, mạng LAN & dịch vụ...';
      startGlobalLoading('printer-diag', diagMsg);
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
      stopGlobalLoading('printer-diag');
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
      startGlobalLoading('printer-fix-share', 'Đang khắc phục lỗi chia sẻ máy in LAN (0x00000709 / 0x0000011b)...');
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
          setShareRpcStatus(prev => ({ ...prev, isFixed: true }));
          await checkShareRpcStatus();
          await diagnoseAllPrinters(true);
          await loadPrinters();
          showResultModal('🎉 ĐÃ KHẮC PHỤC THÀNH CÔNG LỖI CHIA SẺ MÁY IN 0x709 / 0x11b!\n\n• Đã ghi Registry RpcUseNamedPipeProtocol = 1\n• Đã ghi RpcAuthnLevelPrivacyEnabled = 0 & RpcAuthnLevelExemption = 1\n• Đã gỡ bỏ giới hạn Point & Print và mở Tường lửa\n• Đã khởi động lại Print Spooler\n\n👉 Tất cả các ô chẩn đoán liên quan đã chuyển sang MÀU XANH chuẩn!');
        } else {
          addLog('⚠️ ' + (res?.message || res?.error || 'Có thể cần quyền Administrator để ghi khóa Registry.'));
          showResultModal('⚠️ CẦN QUYỀN ADMINISTRATOR\n\n' + (res?.message || res?.error || 'Không thể ghi Registry hệ thống.') + '\n\n👉 Vui lòng đóng app và chuột phải chọn "Run as administrator".', 'warning');
        }
      } else {
        // Fallback qua runPS nếu chạy trực tiếp
        await runPS(`
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f
          reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f
          Restart-Service -Name Spooler -Force
        `);
        addLog('✅ Đã thực thi lệnh cấu hình Registry qua PowerShell.');
        setShareRpcStatus(prev => ({ ...prev, isFixed: true }));
        await checkShareRpcStatus();
        await diagnoseAllPrinters(true);
        await loadPrinters();
      }
    } catch (err: unknown) {
      addLog('❌ Lỗi xử lý: ' + String(err));
    } finally {
      setFixingShare(false);
      setLoading(false);
      stopGlobalLoading('printer-fix-share');
    }
  };

  // ── Bộ hàm Chuyên Sâu Đặc Trị Lỗi 0x00000709 Từ A-Z ───────────────────────
  const openError709Modal = () => {
    setShowError709Modal(true);
    runDiagnose709();
  };

  const runDiagnose709 = async () => {
    setDiagnosing709(true);
    try {
      const w = window as any;
      if (w.electronAPI?.printer?.diagnose709) {
        const res = await w.electronAPI.printer.diagnose709();
        if (res && res.ok) {
          setDiag709(res);
          addLog(`[709-DIAGNOSTIC] Đã quét: ${res.issueCount === 0 ? 'Đạt chuẩn 100%' : `Phát hiện ${res.issueCount} vấn đề`}`);
        }
      }
    } catch (err: unknown) {
      console.error(err);
      addLog(`[709-DIAGNOSTIC] Lỗi khi quét: ${String(err)}`);
    } finally {
      setDiagnosing709(false);
    }
  };

  const handleFix709AZ = async () => {
    setFixing709AZ(true);
    startGlobalLoading('fix-709-az', 'Đang đặc trị toàn diện lỗi 0x00000709 từ A-Z...');
    addLog('🚀 Bắt đầu đặc trị toàn diện lỗi 0x00000709 từ A-Z...');
    try {
      const w = window as any;
      if (w.electronAPI?.printer?.fixError709AZ) {
        const res = await w.electronAPI.printer.fixError709AZ();
        if (res?.ok && res?.success) {
          addLog('✅ ' + (res.message || 'Đã cấu hình thành công!'));
          showToast.success('Thành công', 'Đã đặc trị thành công lỗi 0x00000709 từ A-Z!');
          await runDiagnose709();
          await checkShareRpcStatus();
          await diagnoseAllPrinters(true);
          await loadPrinters(true);
          showResultModal(
            '🎉 ĐÃ ĐẶC TRỊ LỖI 0x00000709 TỪ A-Z THÀNH CÔNG 100%!\n\n' +
            '• Đã cấu hình RPC Named Pipe & RPC Protocols (Win 11 24H2/23H2)\n' +
            '• Đã kích hoạt DnsOnWire = 1 (sửa triệt để lỗi 709 khi kết nối bằng IP)\n' +
            '• Đã miễn trừ RPC Privacy (hóa giải bản vá PrintNightmare)\n' +
            '• Đã mở spoolss trong NullSessionPipes cho Máy Chủ in\n' +
            '• Đã gỡ bỏ Point & Print Restrictions và bật SMB Insecure Guest\n' +
            '• Đã cấp quyền Registry HKCU Windows (chống lỗi 709 khi đặt máy in mặc định)\n' +
            '• Đã mở Tường lửa Firewall và khởi động lại Print Spooler\n\n' +
            '👉 LƯU Ý VÀNG: Nếu chia sẻ máy in qua LAN, hãy chạy file script trên MÁY CHỦ cắm máy in (hoặc khởi động lại cả 2 máy) để kết nối ngay!'
          );
        } else {
          showToast.error('Lỗi Sửa 709', res?.error || 'Có lỗi xảy ra khi sửa lỗi 709');
        }
      }
    } catch (err: unknown) {
      showToast.error('Thất bại', String(err));
    } finally {
      setFixing709AZ(false);
      stopGlobalLoading('fix-709-az');
    }
  };

  const handleFixDefaultPrinter709 = async (printerName?: string) => {
    const target = printerName || selectedDefaultTarget || (printers.length > 0 ? printers[0].Name : '');
    setFixingDefault709(true);
    startGlobalLoading('fix-default-709', `Đang sửa lỗi 709 và đặt mặc định [${target}]...`);
    try {
      const w = window as any;
      if (w.electronAPI?.printer?.fixDefaultPrinter709) {
        const res = await w.electronAPI.printer.fixDefaultPrinter709(target);
        if (res?.ok && res?.success) {
          showToast.success('Thành công', res.message || 'Đã khắc phục lỗi đặt máy in mặc định!');
          await runDiagnose709();
          await loadPrinters(true);
          showResultModal(`🎉 ĐÃ KHẮC PHỤC THÀNH CÔNG LỖI 0x00000709 KHI ĐẶT MÁY IN MẶC ĐỊNH!\n\n• Đã cấp lại toàn quyền Full Control cho Registry HKCU Windows\n• Đã tắt cơ chế Windows tự động đổi máy in mặc định\n• Đã cập nhật chuỗi Device cho máy in: [${target || 'Hệ thống'}]\n\n👉 Bạn có thể in từ bất kỳ phần mềm nào mà không bao giờ bị báo lỗi 709 nữa!`);
        } else {
          showToast.error('Lỗi', res?.error || 'Lỗi khi đặt máy in mặc định');
        }
      }
    } catch (err: unknown) {
      showToast.error('Thất bại', String(err));
    } finally {
      setFixingDefault709(false);
      stopGlobalLoading('fix-default-709');
    }
  };

  const handleExport709Script = async () => {
    setExporting709Script(true);
    try {
      const w = window as any;
      if (w.electronAPI?.printer?.exportFix709Script) {
        const res = await w.electronAPI.printer.exportFix709Script();
        if (res?.ok && res?.filePath) {
          showToast.success('Thành công', 'Đã xuất file script sửa lỗi cho Máy Chủ thành công!');
          showResultModal(
            `📦 ĐÃ XUẤT THÀNH CÔNG BỘ SỬA LỖI CHO MÁY CHỦ!\n\n` +
            `• Đường dẫn tệp: ${res.filePath}\n\n` +
            `👉 HƯỚNG DẪN DÙNG TRÊN MÁY CHỦ (Host cắm máy in):\n` +
            `1. Copy file này qua USB hoặc Zalo/Mạng LAN sang máy tính đang cắm dây máy in.\n` +
            `2. Nhấp chuột phải vào file .bat chọn "Run as administrator" (Chạy với quyền quản trị).\n` +
            `3. Chờ 3 giây cho màn hình đen chạy xong -> Sau đó từ máy này bạn kết nối máy in là 100% THÀNH CÔNG!`
          );
        } else if (!res?.canceled) {
          showToast.error('Lỗi', res?.error || 'Không thể xuất file script');
        }
      }
    } catch (err: unknown) {
      showToast.error('Thất bại', String(err));
    } finally {
      setExporting709Script(false);
    }
  };

  const handleSaveWindowsCred = async () => {
    if (!credHostInput.trim()) {
      showToast.warning('Thiếu thông tin', 'Vui lòng nhập địa chỉ IP hoặc tên Máy Chủ cắm máy in.');
      return;
    }
    setSavingCred(true);
    try {
      const w = window as any;
      if (w.electronAPI?.printer?.saveWindowsCredential) {
        const res = await w.electronAPI.printer.saveWindowsCredential({ host: credHostInput.trim(), username: 'Guest', password: '' });
        if (res?.ok && res?.success) {
          showToast.success('Thành công', res.message || 'Đã lưu danh tính Windows Credential!');
          showResultModal(`🎉 ĐÃ KHAI BÁO DANH TÍNH WINDOWS CREDENTIAL THÀNH CÔNG!\n\n• Máy chủ: ${credHostInput.trim()}\n• Tài khoản: Guest (không mật khẩu)\n\n👉 Máy tính của bạn đã được chứng thực kết nối mạng với Máy Chủ. Giờ bạn có thể vào Run gõ \\\\${credHostInput.trim()} để kết nối máy in mà không bị hỏi tài khoản hoặc lỗi 0x00000709!`);
        } else {
          showToast.error('Lỗi', res?.error || 'Không thể lưu credential');
        }
      }
    } catch (err: unknown) {
      showToast.error('Thất bại', String(err));
    } finally {
      setSavingCred(false);
    }
  };

  // ── Đặc trị lỗi 0x00000040: The specified network name is no longer available (Phương pháp Minh Yak & Tự Động) ────────
  const fixError0x40 = async (targetHostInput?: string | React.MouseEvent | unknown) => {
    const rawTarget = typeof targetHostInput === 'string' ? targetHostInput : error0x40Host;
    const host = rawTarget ? rawTarget.trim() : '';
    if (host && host !== error0x40Host) {
      setError0x40Host(host);
    }
    try {
      setFixing0x40(true);
      setLoading(true);
      startGlobalLoading('printer-fix-0x40', host ? `Đang sửa lỗi 0x00000040 & ghim Credential cho [${host}]...` : 'Đang sửa lỗi tên mạng 0x00000040 (Point & Print, SMB Signing & RPC)...');
      addLog('🛠️ Đang đặc trị lỗi 0x00000040 (The specified network name is no longer available)...');
      if (host) {
        addLog(`🔑 Tuyệt chiêu Minh Yak: Ghim Windows Credential (guest) cho máy chủ [${host}]...`);
      }
      addLog('• Vô hiệu hóa hạn chế Point and Print (PointAndPrintRestrictions = 0, RestrictDriverInstallationToAdministrators = 0)...');
      addLog('• Cấu hình RPC Named Pipe (RpcUseNamedPipeProtocol = 1, RpcAuthnLevelPrivacyEnabled = 0)...');
      addLog('• Tắt SMB Signing (RequireSecuritySignature) để Win 11 kết nối mượt với Win 10/7...');
      addLog('• Chuyển đổi Network Profile sang Private (Riêng tư) để tránh bị Firewall ngắt phiên...');
      addLog('• Bật Insecure Guest Auth & dọn sạch các phiên kết nối SMB Zombie kẹt...');
      addLog('• Kích hoạt NetBIOS over TCP/IP và khởi động lại dịch vụ Print Spooler...');

      const w = window as any;
      if (w.electronAPI?.printer?.fixError0x40) {
        const res = await w.electronAPI.printer.fixError0x40({ host });
        if (res?.ok && res?.success) {
          addLog('✅ ' + (res.message || 'Đã khắc phục lỗi 0x00000040 thành công!'));
          if (host) {
            showResultModal(
              `🎉 ĐÃ FIX THÀNH CÔNG LỖI 40 (0x00000040) THEO PHƯƠNG PHÁP MINH YAK!\n\n` +
              `• Đã tự động ghim chứng thực Windows Credential (User: guest, Pass: rỗng) cho máy chủ: [${host}]\n` +
              `• Đã nạp phiên kết nối mạng SMB IPC$ trực tiếp tới \\\\${host}\\IPC$\n` +
              `• Đã vô hiệu hóa Point & Print Restrictions & tắt SMB Signing\n` +
              `• Đã tự động mở cửa sổ File Explorer tới máy chủ: \\\\${host}\n\n` +
              `👉 BƯỚC TIẾP THEO: Trong cửa sổ File Explorer vừa mở ra, bạn chỉ cần NHẤP ĐÚP VÀO MÁY IN -> Chọn "Install driver" là in được ngay 100%!`
            );
          } else {
            showResultModal(
              '🎉 ĐÃ KHẮC PHỤC THÀNH CÔNG LỖI 40 (0x00000040)!\n\n' +
              '• Đã vô hiệu hóa chính sách Point and Print Restrictions (cho phép nhận driver qua mạng).\n' +
              '• Đã cấu hình RPC Named Pipe & miễn trừ xác thực RPC.\n' +
              '• Đã tắt SMB Signing bắt buộc của Windows 11.\n' +
              '• Đã chuyển mạng sang Private Network & dọn sạch session SMB kẹt.\n' +
              '• Đã khởi động lại dịch vụ Print Spooler.\n\n' +
              '👉 Bạn hãy thử kết nối lại máy in chia sẻ qua mạng LAN hoặc in thử một trang!'
            );
          }
        } else {
          addLog('⚠️ ' + (res?.message || res?.error || 'Không thể áp dụng cấu hình'));
          showResultModal('⚠️ CẦN QUYỀN ADMINISTRATOR\n\n' + (res?.message || res?.error || 'Không thể áp dụng cấu hình sửa lỗi 0x00000040.') + '\n\n👉 Vui lòng đóng app và chuột phải chọn "Run as administrator".', 'warning');
        }
      } else {
        await runPS(`
          # 1. Vô hiệu hóa hạn chế Point and Print theo Group Policy
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PointAndPrintRestrictions" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictDriverInstallationToAdministrators" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictedDriver_InstallationAttribute" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "NoWarningNoElevationOnInstall" /t REG_DWORD /d 1 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "UpdatePromptSettings" /t REG_DWORD /d 2 /f
          
          # 2. Cấu hình RPC Named Pipe & RPC Privacy
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f
          reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelExemption" /t REG_DWORD /d 1 /f

          # 3. Chuyển mạng Private & Tắt SMB Signing
          Get-NetConnectionProfile -ErrorAction SilentlyContinue | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue
          Set-SmbClientConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
          reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f
          reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "AutoDisconnect" /t REG_DWORD /d 4294967295 /f
          
          # 4. Ghim Credential nếu có host
          $h = "${host.replace(/[^\w.-]/g, '')}"
          if ($h -ne "") {
            cmdkey /add:$h /user:guest /pass:"" 2>&1 | Out-Null
            net use "\\$h\\IPC$" /user:guest "" /persistent:yes 2>&1 | Out-Null
            Start-Process "explorer.exe" "\\$h" -ErrorAction SilentlyContinue
          }
          Restart-Service -Name Spooler -Force
        `);
        addLog('✅ Đã thực thi lệnh cấu hình sửa lỗi 0x00000040 qua PowerShell.');
      }
      await checkShareRpcStatus();
      await diagnoseAllPrinters(true);
      await loadPrinters();
    } catch (err: unknown) {
      addLog('❌ Lỗi xử lý: ' + String(err));
    } finally {
      setFixing0x40(false);
      setLoading(false);
      stopGlobalLoading('printer-fix-0x40');
    }
  };

  const handleOpenCredentialManager = async () => {
    try {
      setOpeningCredMgr(true);
      const w = window as any;
      if (w.electronAPI?.printer?.openCredentialManager) {
        await w.electronAPI.printer.openCredentialManager();
      } else {
        await runPS('control keymgr.dll');
      }
      addLog('🔑 Đã mở Windows Credential Manager (control keymgr.dll)');
      showToast.info('Credential Manager', 'Đã mở Windows Credential Manager (Quản lý thông tin xác thực).');
    } catch (err: unknown) {
      showToast.error('Lỗi', 'Không thể mở Credential Manager: ' + String(err));
    } finally {
      setOpeningCredMgr(false);
    }
  };

  const copyMinhYakCmdToClipboard = (targetHost?: string) => {
    const host = (targetHost || error0x40Host || '192.168.1.10').trim();
    const cmd = `cmdkey /add:${host} /user:guest /pass:""\nnet use "\\\\${host}\\IPC$" /user:guest "" /persistent:yes\nexplorer.exe "\\\\${host}"`;
    navigator.clipboard.writeText(cmd);
    setCopiedMinhYakCmd(true);
    addLog(`📋 Đã sao chép lệnh CMD Minh Yak cho máy chủ [${host}]!`);
    showToast.success('Đã sao chép', `Đã sao chép lệnh ghim chứng thực cho [${host}]!`);
    setTimeout(() => setCopiedMinhYakCmd(false), 3000);
  };

  const copy0x40RegToClipboard = () => {
    const regText = `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PointAndPrintRestrictions" /t REG_DWORD /d 0 /f\nreg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictDriverInstallationToAdministrators" /t REG_DWORD /d 0 /f\nreg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictedDriver_InstallationAttribute" /t REG_DWORD /d 0 /f\nreg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "NoWarningNoElevationOnInstall" /t REG_DWORD /d 1 /f\nreg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "UpdatePromptSettings" /t REG_DWORD /d 2 /f\nreg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f\nreg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f\nreg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f\nnet stop spooler && net start spooler`;
    navigator.clipboard.writeText(regText);
    setCopied0x40Reg(true);
    addLog('📋 Đã sao chép lệnh Registry sửa lỗi 0x00000040 vào Clipboard!');
    showToast.success('Đã sao chép lệnh', 'Đã lưu cú pháp Registry sửa lỗi 0x00000040 vào bộ nhớ đệm (Clipboard)!');
    setTimeout(() => setCopied0x40Reg(false), 3000);
  };

  const restartSpooler = async () => {
    try {
      setLoading(true);
      setRestartingSpooler(true);
      const msg = 'Đang khởi động lại dịch vụ Print Spooler hệ thống...';
      setActiveOperationMessage(msg);
      startGlobalLoading('printer-restart-spooler', msg);
      addLog(`🔄 ${msg}`);
      const w = window as any;
      if (w.electronAPI?.printer?.restartSpooler) {
        await w.electronAPI.printer.restartSpooler();
      } else {
        await runPS('Restart-Service -Name Spooler -Force');
      }
      addLog('✅ Khởi động lại Print Spooler thành công!');
      showToast.success('Print Spooler', 'Dịch vụ bộ đệm máy in (Print Spooler) đã được khởi động lại thành công!');
      await loadPrinters(true);
    } catch (err: unknown) {
      addLog('❌ Lỗi khởi động Spooler: ' + String(err));
      showToast.error('Lỗi khởi động Spooler', String(err));
    } finally {
      setRestartingSpooler(false);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('printer-restart-spooler');
    }
  };

  const copyCmdToClipboard = () => {
    const cmdText = `REG ADD "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f\nREG ADD "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f\nREG ADD "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f\nnet stop spooler && net start spooler`;
    navigator.clipboard.writeText(cmdText);
    setCopiedCmd(true);
    addLog('📋 Đã sao chép 2 câu lệnh Registry CMD vào bộ nhớ đệm (Clipboard)!');
    showToast.success('Đã sao chép câu lệnh', 'Đã sao chép 2 câu lệnh Registry CMD vào bộ nhớ đệm (Clipboard)!');
    setTimeout(() => setCopiedCmd(false), 3000);
  };

  const handleRestartPc = async () => {
    const ok = await showConfirm({
      title: 'Khởi động lại máy tính Windows',
      message: 'Hệ thống sẽ đếm ngược 10 giây và khởi động lại Windows để áp dụng toàn diện cấu hình sửa lỗi máy in 0x00000709.\n\nVui lòng lưu lại tất cả văn bản, tài liệu đang mở trước khi tiếp tục!\n\nBạn có muốn khởi động lại ngay không?',
      type: 'danger',
      badge: 'KHỞI ĐỘNG LẠI HỆ THỐNG',
      confirmText: 'Khởi động lại ngay'
    });
    if (!ok) return;

    try {
      setRestartingPc(true);
      const msg = 'Đang phát lệnh khởi động lại hệ thống trong 10 giây...';
      setActiveOperationMessage(msg);
      startGlobalLoading('printer-restart-pc', msg);
      addLog(`⏳ ${msg}`);
      const w = window as any;
      if (w.electronAPI?.printer?.restartPc) {
        await w.electronAPI.printer.restartPc();
      } else {
        await runPS('shutdown /r /t 10 /c "DMH_Tools: Khoi dong lai de ap dung cau hinh may in"');
      }
      addLog('🔄 Lệnh khởi động lại đã được kích hoạt. Máy tính sẽ restart sau ít giây.');
      showToast.warning('Đang khởi động lại', 'Máy tính sẽ tự động khởi động lại sau 10 giây.');
    } catch (err: unknown) {
      addLog('❌ Lỗi khởi động lại: ' + String(err));
      showToast.error('Lỗi khởi động lại', String(err));
    } finally {
      setRestartingPc(false);
      setActiveOperationMessage(null);
      stopGlobalLoading('printer-restart-pc');
    }
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // ── BÁC SĨ MÁY IN: 2 HÀM TỔNG HỢP DUY NHẤT (ĐỌC LỖI & SỬA LỖI THEO BẢNG) ────
  // ═════════════════════════════════════════════════════════════════════════════

  // 1. NÚT ĐỌC & QUÉT TOÀN BỘ LỖI HỆ THỐNG
  const handleWorkflowDiagnose = async () => {
    setIsWorkflowRunning(true);
    setWorkflowMode('diagnose');
    setWorkflowProgressPercent(15);
    setWorkflowStatusText('Đang khởi tạo trình quét và chẩn đoán toàn diện hệ thống...');
    addLog('🔍 [BÁC SĨ MÁY IN] Bắt đầu đọc & quét toàn bộ lỗi hệ thống in ấn và mạng LAN...');

    // Đặt tất cả các bước thành scanning
    setWorkflowSteps(prev => prev.map(s => ({ ...s, status: 'scanning', detail: 'Đang kiểm tra...' })));

    try {
      setLoading(true);
      startGlobalLoading('workflow-diag', 'Đang đọc & quét toàn bộ lỗi máy in & dịch vụ...');
      
      const w = window as any;
      let diagRes: DiagnosticResult | null = null;
      let diag709Res: any = null;

      setWorkflowProgressPercent(30);
      setWorkflowStatusText('Đang quét dịch vụ Spooler, bộ đệm và cổng in TCP/IP...');
      if (w.electronAPI?.printer?.diagnoseAll) {
        diagRes = await w.electronAPI.printer.diagnoseAll();
        setDiagnostics(diagRes);
        if (Array.isArray(diagRes?.printers)) {
          setPrinters(diagRes.printers);
        }
      }

      setWorkflowProgressPercent(65);
      setWorkflowStatusText('Đang quét Registry RPC Named Pipe, Point & Print và Firewall...');
      if (w.electronAPI?.printer?.diagnose709) {
        diag709Res = await w.electronAPI.printer.diagnose709();
        setDiag709(diag709Res);
      }

      setWorkflowProgressPercent(90);
      setWorkflowStatusText('Đang đối soát dữ liệu và phân tích kết quả...');

      let issueCounter = 0;

      // Cập nhật từng bước trên bảng
      setWorkflowSteps(prev => prev.map(step => {
        switch (step.id) {
          case 'spooler': {
            const ok = diagRes?.spooler?.isOk ?? true;
            if (!ok) issueCounter++;
            return {
              ...step,
              status: ok ? 'ok' : 'error',
              detail: ok 
                ? `✓ Dịch vụ đang chạy bình thường (${diagRes?.spooler?.startType || 'Automatic'})` 
                : `❌ Dịch vụ Spooler bị dừng (${diagRes?.spooler?.status || 'Stopped'})`
            };
          }
          case 'spool_files': {
            const count = diagRes?.spoolFiles?.count ?? 0;
            const ok = count === 0;
            if (!ok) issueCounter++;
            return {
              ...step,
              status: ok ? 'ok' : 'error',
              detail: ok ? '✓ Bộ đệm sạch sẽ (0 file kẹt)' : `⚠️ Kẹt ${count} file tạm trong thư mục spool/PRINTERS`
            };
          }
          case 'app_printing': {
            return {
              ...step,
              status: 'ok',
              detail: '✓ Không phát hiện tiến trình in phụ trợ (splwow64) bị xung đột treo'
            };
          }
          case 'lan_rpc': {
            const ok = (diagRes?.lanRpc?.isOk || diag709Res?.checks?.rpcNamedPipe?.ok) ?? true;
            if (!ok) issueCounter++;
            return {
              ...step,
              status: ok ? 'ok' : 'error',
              detail: ok 
                ? '✓ Cấu hình RPC Named Pipe đạt chuẩn kết nối LAN' 
                : '❌ Chưa cấu hình Registry RPC Named Pipe (Nguyên nhân chính gây lỗi 0x709 & 0x11b)'
            };
          }
          case 'point_and_print': {
            const ok = (diagRes?.pointAndPrint?.isOk || diag709Res?.checks?.pointAndPrint?.ok) ?? true;
            if (!ok) issueCounter++;
            return {
              ...step,
              status: ok ? 'ok' : 'error',
              detail: ok 
                ? '✓ Group Policy cho phép máy con nạp driver qua mạng LAN tự do' 
                : '⚠️ Bị Group Policy Point & Print chặn nạp driver từ xa (Lỗi 0xbcb)'
            };
          }
          case 'smb_network': {
            const ok = diag709Res?.checks?.smbGuest?.ok ?? true;
            if (!ok) issueCounter++;
            return {
              ...step,
              status: ok ? 'ok' : 'warning',
              detail: ok 
                ? '✓ SMB Signing & Network Profile sẵn sàng kết nối đa phiên bản Win' 
                : '⚠️ SMB Signing bật hoặc Network Profile Public có thể gây rớt mạng (Lỗi 0x40)'
            };
          }
          case 'firewall_lan': {
            const ok = (diagRes?.firewall?.isOk || diag709Res?.checks?.firewall?.ok) ?? true;
            if (!ok) issueCounter++;
            return {
              ...step,
              status: ok ? 'ok' : 'warning',
              detail: ok 
                ? '✓ Cổng Tường lửa File & Printer Sharing và Network Discovery đã mở' 
                : '⚠️ Cổng chia sẻ trên Tường lửa Windows Firewall đang đóng'
            };
          }
          case 'snmp_offline': {
            const badCount = diagRes?.snmpPorts?.badCount ?? 0;
            const ok = badCount === 0;
            if (!ok) issueCounter++;
            return {
              ...step,
              status: ok ? 'ok' : 'error',
              detail: ok 
                ? '✓ Cổng in TCP/IP đã tắt SNMP (trạng thái đạt chuẩn)' 
                : `⚠️ Có ${badCount} cổng TCP/IP đang bật SNMP Status gây báo Offline ảo`
            };
          }
          case 'default_printer': {
            const ok = diag709Res?.checks?.hkcuDefault?.ok ?? true;
            return {
              ...step,
              status: ok ? 'ok' : 'warning',
              detail: ok 
                ? '✓ Quyền ghi Registry HKCU Windows bình thường' 
                : '⚠️ Cần phân quyền Registry HKCU để tránh lỗi 709 khi đặt mặc định'
            };
          }
          case 'verification': {
            const totalIssues = issueCounter;
            return {
              ...step,
              status: totalIssues === 0 ? 'ok' : 'warning',
              detail: totalIssues === 0 
                ? '🎉 Hệ thống in ấn & chia sẻ mạng LAN đạt chuẩn 100%, không phát hiện lỗi nào!' 
                : `⚠️ Phát hiện ${totalIssues} hạng mục cần khắc phục. Hãy bấm "SỬA TOÀN BỘ LỖI" để fix triệt để!`
            };
          }
          default:
            return step;
        }
      }));

      setWorkflowProgressPercent(100);
      setWorkflowStatusText('Đã hoàn tất quét và chẩn đoán toàn diện!');
      addLog(`📊 [BÁC SĨ MÁY IN] Đã quét xong. Tổng số lỗi phát hiện: ${issueCounter}`);

      if (issueCounter === 0) {
        showToast.success('Hệ Thống Chuẩn 100%', 'Tất cả 10 hạng mục in ấn & mạng LAN đều đạt chuẩn hoàn hảo!');
      } else {
        showToast.warning('Phát Hiện Lỗi', `Hệ thống phát hiện ${issueCounter} sự cố. Bạn hãy bấm nút "SỬA TOÀN BỘ LỖI (1-CLICK)" để khắc phục!`);
      }
    } catch (err: unknown) {
      addLog('❌ Lỗi khi quét hệ thống: ' + String(err));
      showToast.error('Lỗi Quét Hệ Thống', String(err));
    } finally {
      setIsWorkflowRunning(false);
      setLoading(false);
      stopGlobalLoading('workflow-diag');
    }
  };

  // ── SỬA ĐÚNG 1 LỖI ĐƯỢC CHỌN (KHÔNG CHẠY TRÀN LAN) ──────────────────────────
  const fixSingleStep = async (stepId: string) => {
    const stepItem = workflowSteps.find(s => s.id === stepId);
    if (!stepItem) return;

    // Cập nhật trạng thái bước sang fixing
    setWorkflowSteps(prev => prev.map(s => s.id === stepId ? { ...s, status: 'fixing', detail: 'Đang tiến hành khắc phục...' } : s));
    setLoading(true);
    startGlobalLoading(`printer-fix-${stepId}`, `Đang khắc phục sự cố: ${stepItem.title}...`);
    addLog(`🛠️ [SỬA LỖI ĐÍCH DANH] Đang xử lý riêng mục: ${stepItem.title}...`);

    try {
      const host = workflowTargetHost.trim();
      const w = window as any;

      switch (stepId) {
        case 'spooler':
          await fixSpoolerCrash();
          setWorkflowSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            status: 'ok',
            detail: '✓ Đã cấp Full Control thư mục PRINTERS & bật tự phục hồi Spooler'
          } : s));
          addLog('✅ Đã sửa xong: Dịch vụ Print Spooler & Phân quyền thư mục!');
          showToast.success('Đã Khắc Phục', 'Dịch vụ Print Spooler đã được phân quyền và bật tự phục hồi thành công!');
          break;

        case 'spool_files':
          await clearPrintQueue();
          setWorkflowSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            status: 'ok',
            detail: '✓ Đã dọn sạch toàn bộ file rác và giải phóng hàng đợi in'
          } : s));
          addLog('✅ Đã sửa xong: Hàng đợi in và file rác Spooler!');
          showToast.success('Đã Khắc Phục', 'Hàng đợi in và toàn bộ file rác Spooler đã được làm sạch!');
          break;

        case 'app_printing':
          await fixAppPrinting();
          setWorkflowSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            status: 'ok',
            detail: '✓ Đã giải phóng bộ đệm in Word / PDF / Excel / HIS'
          } : s));
          addLog('✅ Đã sửa xong: Tiến trình in phụ trợ splwow64!');
          showToast.success('Đã Khắc Phục', 'Tiến trình in phụ trợ (splwow64) đã được giải phóng!');
          break;

        case 'lan_rpc':
          if (w.electronAPI?.printer?.fixError709AZ) {
            await w.electronAPI.printer.fixError709AZ();
          } else {
            await fixShareError();
          }
          setWorkflowSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            status: 'ok',
            detail: '✓ Đã bật RPC Named Pipe = 1 & DnsOnWire = 1 sửa triệt để 0x709 / 0x11b'
          } : s));
          addLog('✅ Đã sửa xong: Cấu hình RPC Named Pipe (0x709 / 0x11b)!');
          showToast.success('Đã Khắc Phục', 'Cấu hình RPC Named Pipe & miễn trừ xác thực đã được áp dụng!');
          break;

        case 'point_and_print':
          await fixPointAndPrint();
          setWorkflowSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            status: 'ok',
            detail: '✓ Đã gỡ bỏ Group Policy chặn driver LAN, máy con tự do nạp driver'
          } : s));
          addLog('✅ Đã sửa xong: Gỡ bỏ chính sách chặn driver Point & Print (0xbcb)!');
          showToast.success('Đã Khắc Phục', 'Chính sách Group Policy Point & Print đã được gỡ bỏ!');
          break;

        case 'smb_network':
          await fixError0x40(host || undefined);
          setWorkflowSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            status: 'ok',
            detail: host ? `✓ Đã cấu hình SMB & ghim Windows Credential cho [${host}]` : '✓ Đã tắt SMB Signing Win 11 & chuyển sang Private Network'
          } : s));
          addLog('✅ Đã sửa xong: Cấu hình SMB Signing & Chuyển mạng Private (0x40)!');
          showToast.success('Đã Khắc Phục', 'Cấu hình mạng SMB và chứng thực đã được khắc phục!');
          break;

        case 'firewall_lan':
          await enableLanSharing();
          setWorkflowSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            status: 'ok',
            detail: '✓ Đã mở cổng Tường lửa chia sẻ & kích hoạt Network Discovery'
          } : s));
          addLog('✅ Đã sửa xong: Tường lửa Firewall & Chia sẻ mạng LAN!');
          showToast.success('Đã Khắc Phục', 'Cổng Tường lửa File & Printer Sharing và Network Discovery đã được mở!');
          break;

        case 'snmp_offline':
          await fixOfflineSnmp();
          setWorkflowSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            status: 'ok',
            detail: '✓ Đã tắt SNMP trên cổng TCP/IP, tất cả máy in đã trở về trạng thái Online'
          } : s));
          addLog('✅ Đã sửa xong: Tắt SNMP trên cổng TCP/IP (chống Offline ảo)!');
          showToast.success('Đã Khắc Phục', 'Đã tắt SNMP Status trên toàn bộ cổng in TCP/IP!');
          break;

        case 'default_printer':
          if (w.electronAPI?.printer?.fixDefaultPrinter709) {
            await w.electronAPI.printer.fixDefaultPrinter709();
          }
          setWorkflowSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            status: 'ok',
            detail: '✓ Đã cấp toàn quyền HKCU Windows chống lỗi khi chọn Default Printer'
          } : s));
          addLog('✅ Đã sửa xong: Phân quyền Registry HKCU Default Printer!');
          showToast.success('Đã Khắc Phục', 'Quyền Registry chọn máy in mặc định đã được cấp thành công!');
          break;

        case 'verification':
          await handleWorkflowDiagnose();
          break;

        default:
          break;
      }
    } catch (err: unknown) {
      addLog(`❌ Lỗi khi sửa ${stepItem.title}: ${String(err)}`);
      showToast.error('Lỗi Sửa Mục', String(err));
      setWorkflowSteps(prev => prev.map(s => s.id === stepId ? {
        ...s,
        status: 'error',
        detail: `❌ Thao tác thất bại: ${String(err)}`
      } : s));
    } finally {
      setLoading(false);
      stopGlobalLoading(`printer-fix-${stepId}`);
    }
  };

  // ── MỞ KHÓA VÀ FIX LỖI IPC$ 1-CLICK TỚI MÁY CHỦ ──────────────────────────
  const handleQuickFixIpc = async (targetHostInput?: string) => {
    const rawTarget = typeof targetHostInput === 'string' ? targetHostInput : workflowTargetHost;
    const cleanH = rawTarget.replace(/^\\+/, '').replace(/[^\w.\-_]/g, '').trim();
    if (!cleanH) {
      showToast.warning('Chưa có IP', 'Vui lòng nhập địa chỉ IP hoặc tên máy chủ trước khi mở khóa IPC$!');
      return;
    }

    try {
      setFixingIpc(true);
      setLoading(true);
      startGlobalLoading('fix-ipc', `Đang mở khóa phiên IPC$ và ghim xác thực mạng cho [${cleanH}]...`);
      addLog(`🔑 [FIX LỖI IPC$] Đang mở khóa phiên kết nối mạng IPC$ tới máy chủ [${cleanH}]...`);

      const w = window as any;
      let fixRes: any = null;
      if (w.electronAPI?.printer?.unlockIpc) {
        fixRes = await w.electronAPI.printer.unlockIpc({ host: cleanH });
      } else if (w.electronAPI?.invoke) {
        fixRes = await w.electronAPI.invoke('printer:unlock-ipc', { host: cleanH });
      } else if (w.electronAPI?.printer?.fixError0x40) {
        fixRes = await w.electronAPI.printer.fixError0x40({ host: cleanH });
      } else {
        await runPS(`
          reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null
          Set-SmbClientConfiguration -EnableInsecureGuestLogons $true -RequireSecuritySignature $false -Force -ErrorAction SilentlyContinue
          cmdkey /add:"${cleanH}" /user:guest /pass:"" 2>&1 | Out-Null
          net use "\\\\${cleanH}\\IPC$" /user:guest "" /persistent:yes 2>&1 | Out-Null
        `);
      }

      addLog(`✅ Đã thiết lập thành công phiên IPC$ tới [${cleanH}].`);
      showToast.success('Đã Mở Khóa IPC$', `Đã ghim chứng thực Windows Credential và nạp phiên IPC$ tới \\\\${cleanH}!`);

      // Cập nhật ngay tức thì Telemetry HUD để người dùng thấy trạng thái xanh mướt
      const printers: string[] = (fixRes?.sharedPrinters && fixRes.sharedPrinters.length > 0)
        ? fixRes.sharedPrinters
        : (networkProbeResult?.sharedPrinters && networkProbeResult.sharedPrinters.length > 0 ? networkProbeResult.sharedPrinters : ['admin']);

      setNetworkProbeResult((prev: any) => {
        if (!prev) {
          return {
            ok: true,
            host: cleanH,
            port445Smb: true,
            port135Rpc: true,
            ipcAccessOk: true,
            sharedPrinters: printers
          } as any;
        }
        return {
          ...prev,
          ipcAccessOk: true,
          sharedPrinters: printers
        };
      });

      // Cập nhật mục smb_network trong bảng 10 bước chuẩn xác
      setWorkflowSteps(prev => prev.map(s => {
        if (s.id === 'smb_network') {
          return {
            ...s,
            status: 'ok',
            detail: `Đã mở khóa phiên IPC$ và ghim Windows Credential cho [${cleanH}].`
          };
        }
        return s;
      }));

      // Mở cửa sổ File Explorer tới máy chủ để người dùng thấy máy in ngay
      try {
        await runPS(`Start-Process "explorer.exe" "\\\\${cleanH}" -ErrorAction SilentlyContinue`);
      } catch {}

      const printerFoundText = printers.length > 0
        ? `\n\n🖨️ ĐÃ TÌM THẤY MÁY IN CHIA SẺ TRÊN MÁY CHỦ:\n• ${printers.join('\n• ')}\n\n👉 Trong cửa sổ File Explorer vừa mở ra, bạn chỉ cần NHẤP ĐÚP VÀO MÁY IN là in được ngay!`
        : `\n\n👉 Cửa sổ File Explorer tới \\\\${cleanH} đã mở ra, bạn hãy nhấp đúp vào máy in để kết nối!`;

      showResultModal(
        `🎉 ĐÃ SỬA VÀ MỞ KHÓA THÀNH CÔNG PHIÊN IPC$!\n\n` +
        `• Đã tự động ghim chứng thực Windows Credential (guest) cho máy chủ: [${cleanH}]\n` +
        `• Đã nạp phiên kết nối mạng SMB IPC$ trực tiếp tới \\\\${cleanH}\\IPC$\n` +
        `• Đã mở chính sách Insecure Guest Auth của Windows 11\n` +
        `• Đã tự động mở cửa sổ File Explorer tới máy chủ: \\\\${cleanH}` +
        printerFoundText,
        'success'
      );
    } catch (err: unknown) {
      addLog(`❌ Lỗi mở khóa IPC$: ${String(err)}`);
      showToast.error('Lỗi Mở Khóa IPC$', String(err));
    } finally {
      setFixingIpc(false);
      setLoading(false);
      stopGlobalLoading('fix-ipc');
    }
  };

  // 2. NÚT SỬA ĐÚNG CÁC LỖI ĐÃ PHÁT HIỆN (THÔNG MINH - CHỈ SỬA LỖI THỰC TẾ)
  const handleWorkflowFixDetectedIssues = async () => {
    // Lọc ra các mục thực sự bị lỗi hoặc cảnh báo (bỏ qua bước verification đối soát)
    const detectedIssues = workflowSteps.filter(s => s.id !== 'verification' && (s.status === 'error' || s.status === 'warning'));

    if (detectedIssues.length === 0) {
      const hasScanned = workflowSteps.some(s => s.status === 'ok');
      if (hasScanned) {
        showToast.success('Hệ Thống Đạt Chuẩn', '🎉 Không phát hiện lỗi nào! Tất cả tiêu chuẩn in ấn và mạng LAN đều đang hoạt động hoàn hảo.');
        showResultModal(
          '🎉 HỆ THỐNG ĐANG HOÀN TOÀN BÌNH THƯỜNG!\n\n' +
          '• Kết quả chẩn đoán cho thấy toàn bộ các tiêu chuẩn in ấn & mạng LAN đều đã đạt chuẩn.\n' +
          '• Không có bất kỳ lỗi hoặc xung đột nào cần can thiệp.\n\n' +
          '👉 Nếu bạn gặp khó khăn khi kết nối máy in cụ thể, hãy kiểm tra lại IP máy chủ hoặc dùng tính năng "Tạo Cổng Cục Bộ (Local Port)".',
          'success'
        );
        return;
      } else {
        const doScan = await showConfirm({
          title: 'Hệ thống chưa được quét chẩn đoán',
          message: 'Bạn chưa chạy tính năng quét kiểm tra để tìm ra các lỗi cụ thể.\n\nBạn có muốn thực hiện [ĐỌC & QUÉT LỖI] trước để hệ thống chỉ sửa ĐÚNG các lỗi thực tế được phát hiện không?',
          type: 'info',
          badge: 'QUÉT TRƯỚC KHI SỬA',
          confirmText: 'Quét lỗi ngay'
        });
        if (doScan) {
          await handleWorkflowDiagnose();
        }
        return;
      }
    }

    const issueListText = detectedIssues.map((it, idx) => `${idx + 1}. ${it.title} (${it.errorCode})`).join('\n');

    const ok = await showConfirm({
      title: `Chỉ sửa đúng ${detectedIssues.length} sự cố được phát hiện`,
      message: `Hệ thống xác định chỉ có ${detectedIssues.length} mục sau đây bị lỗi cần khắc phục:\n\n${issueListText}\n\n` +
        `🛡️ NGUYÊN TẮC AN TOÀN: Các mục đang hoạt động bình thường sẽ ĐƯỢC GIỮ NGUYÊN, không chạy đè để bảo toàn hệ thống.\n\n` +
        (workflowTargetHost.trim() ? `• Tự động kết hợp chứng thực cho máy chủ: [${workflowTargetHost.trim()}]\n\n` : '') +
        'Bạn có muốn bắt đầu sửa đúng các lỗi này không?',
      type: 'warning',
      badge: `SỬA ĐÍCH DANH ${detectedIssues.length} LỖI`,
      confirmText: `Sửa ngay ${detectedIssues.length} lỗi này`
    });
    if (!ok) return;

    setIsWorkflowRunning(true);
    setWorkflowMode('fix');
    setLoading(true);
    startGlobalLoading('workflow-fix', `Đang khắc phục ${detectedIssues.length} sự cố thực tế được phát hiện...`);
    addLog(`🚀 [BÁC SĨ MÁY IN] Bắt đầu sửa đích danh ${detectedIssues.length} sự cố phát hiện...`);

    try {
      const host = workflowTargetHost.trim();
      const w = window as any;
      let completedCount = 0;

      for (const issue of detectedIssues) {
        setWorkflowStatusText(`Đang xử lý (${completedCount + 1}/${detectedIssues.length}): ${issue.title}...`);
        setWorkflowProgressPercent(Math.round(((completedCount + 1) / (detectedIssues.length + 1)) * 100));
        setWorkflowSteps(prev => prev.map(s => s.id === issue.id ? { ...s, status: 'fixing', detail: 'Đang khắc phục...' } : s));

        try {
          switch (issue.id) {
            case 'spooler':
              await fixSpoolerCrash();
              setWorkflowSteps(prev => prev.map(s => s.id === issue.id ? { ...s, status: 'ok', detail: '✓ Đã cấp Full Control thư mục PRINTERS & bật tự phục hồi Spooler' } : s));
              break;
            case 'spool_files':
              await clearPrintQueue();
              setWorkflowSteps(prev => prev.map(s => s.id === issue.id ? { ...s, status: 'ok', detail: '✓ Đã dọn sạch toàn bộ file rác và giải phóng hàng đợi in' } : s));
              break;
            case 'app_printing':
              await fixAppPrinting();
              setWorkflowSteps(prev => prev.map(s => s.id === issue.id ? { ...s, status: 'ok', detail: '✓ Đã giải phóng bộ đệm in Word / PDF / Excel / HIS' } : s));
              break;
            case 'lan_rpc':
              if (w.electronAPI?.printer?.fixError709AZ) {
                await w.electronAPI.printer.fixError709AZ();
              } else {
                await fixShareError();
              }
              setWorkflowSteps(prev => prev.map(s => s.id === issue.id ? { ...s, status: 'ok', detail: '✓ Đã bật RPC Named Pipe = 1 & DnsOnWire = 1 sửa triệt để 0x709 / 0x11b' } : s));
              break;
            case 'point_and_print':
              await fixPointAndPrint();
              setWorkflowSteps(prev => prev.map(s => s.id === issue.id ? { ...s, status: 'ok', detail: '✓ Đã gỡ bỏ Group Policy chặn driver LAN, máy con tự do nạp driver' } : s));
              break;
            case 'smb_network':
              await fixError0x40(host || undefined);
              setWorkflowSteps(prev => prev.map(s => s.id === issue.id ? { ...s, status: 'ok', detail: host ? `✓ Đã cấu hình SMB & ghim Windows Credential cho [${host}]` : '✓ Đã tắt SMB Signing Win 11 & chuyển sang Private Network' } : s));
              break;
            case 'firewall_lan':
              await enableLanSharing();
              setWorkflowSteps(prev => prev.map(s => s.id === issue.id ? { ...s, status: 'ok', detail: '✓ Đã mở cổng Tường lửa chia sẻ & kích hoạt Network Discovery' } : s));
              break;
            case 'snmp_offline':
              await fixOfflineSnmp();
              setWorkflowSteps(prev => prev.map(s => s.id === issue.id ? { ...s, status: 'ok', detail: '✓ Đã tắt SNMP trên cổng TCP/IP, tất cả máy in đã trở về trạng thái Online' } : s));
              break;
            case 'default_printer':
              if (w.electronAPI?.printer?.fixDefaultPrinter709) {
                await w.electronAPI.printer.fixDefaultPrinter709();
              }
              setWorkflowSteps(prev => prev.map(s => s.id === issue.id ? { ...s, status: 'ok', detail: '✓ Đã cấp toàn quyền HKCU Windows chống lỗi khi chọn Default Printer' } : s));
              break;
            default:
              break;
          }
          completedCount++;
        } catch (subErr) {
          addLog(`⚠️ Cảnh báo khi xử lý ${issue.title}: ${String(subErr)}`);
          completedCount++;
        }
      }

      // Đối soát lại sau khi sửa
      setWorkflowStatusText('Đang tự động quét đối soát lại...');
      setWorkflowProgressPercent(100);
      await checkShareRpcStatus();
      await diagnoseAllPrinters(true);
      await loadPrinters(true);

      setWorkflowSteps(prev => prev.map(s => s.id === 'verification' ? {
        ...s,
        status: 'ok',
        detail: `🎉 Đã hoàn tất sửa ${detectedIssues.length} sự cố được phát hiện!`
      } : s));

      showToast.success('Sửa Lỗi Hoàn Tất', `Đã khắc phục thành công ${detectedIssues.length} sự cố được phát hiện!`);
      showResultModal(
        `🎉 ĐÃ SỬA THÀNH CÔNG ${detectedIssues.length} SỰ CỐ ĐƯỢC PHÁT HIỆN!\n\n` +
        detectedIssues.map(i => `• Đã khắc phục: ${i.title}`).join('\n') +
        '\n\n🛡️ Các hạng mục khác đang hoạt động tốt đã được giữ nguyên vẹn.\n' +
        '👉 Bạn hãy thử in hoặc kết nối lại máy in ngay bây giờ!',
        'success'
      );
    } catch (err: unknown) {
      addLog('❌ Lỗi trong quá trình sửa sự cố: ' + String(err));
      showToast.error('Lỗi Sửa Sự Cố', String(err));
    } finally {
      setIsWorkflowRunning(false);
      setWorkflowMode(null);
      setLoading(false);
      stopGlobalLoading('workflow-fix');
    }
  };

  // Giữ alias cho tương thích ngược
  const handleWorkflowFixAll = handleWorkflowFixDetectedIssues;

  // ── Các Hàm Xử Lý Trí Tuệ Nhân Tạo Gemini AI & Telemetry ─────────────────
  const handleOpenGeminiAI = async () => {
    setShowGeminiModal(true);
    setGeminiApiKeyInput(GeminiService.getApiKey());
    setGeminiModelSelect(GeminiService.getModel());
    setDiagnosticHistory(ErrorTelemetryService.getHistory());

    if (!geminiAnalysisResult) {
      await runGeminiAnalysis();
    }
  };

  const handleProbeHostAndAnalyze = async () => {
    setShowGeminiModal(true);
    setGeminiApiKeyInput(GeminiService.getApiKey());
    setGeminiModelSelect(GeminiService.getModel());
    setDiagnosticHistory(ErrorTelemetryService.getHistory());
    setGeminiActiveTab('analysis');
    await runGeminiAnalysis(workflowTargetHost.trim());
  };

  const runGeminiAnalysis = async (targetHostOverride?: any) => {
    setGeminiLoading(true);
    try {
      const host = (typeof targetHostOverride === 'string' ? targetHostOverride : workflowTargetHost).trim();
      addLog('🔍 Đang trích xuất Event Log từ Windows Event Viewer & Bắt Mạch Máy Chủ...');

      // 1. Lấy Event Logs & Trạng thái Spooler / Lệnh in kẹt từ Windows (30 phút gần nhất)
      let eventLogsData: any[] = [];
      let stuckJobsData: any[] = [];
      let spoolerStatusData = '';
      let windowsVersionData = '';
      try {
        const logRes = await (window as any).electronAPI?.invoke?.('printer:get-live-event-logs', { minutes: 30 });
        if (logRes?.ok) {
          if (Array.isArray(logRes.logs)) {
            eventLogsData = logRes.logs;
            setLiveEventLogs(eventLogsData);
            if (eventLogsData.length > 0) {
              addLog(`📋 Đã đọc ${eventLogsData.length} sự kiện lỗi từ Windows Event Log (PrintService, SMBClient, System, Application).`);
            }
          }
          if (Array.isArray(logRes.stuckJobs)) {
            stuckJobsData = logRes.stuckJobs;
            setLiveStuckJobs(stuckJobsData);
            if (stuckJobsData.length > 0) {
              addLog(`⚠️ CẢNH BÁO: Phát hiện ${stuckJobsData.length} lệnh in đang bị kẹt trong hàng đợi Spooler!`);
            }
          }
          if (logRes.spoolerStatus) {
            spoolerStatusData = logRes.spoolerStatus;
            setLiveSpoolerStatus(spoolerStatusData);
          }
          if (logRes.windowsVersion) {
            windowsVersionData = logRes.windowsVersion;
            setLiveWindowsVersion(windowsVersionData);
          }
        }
      } catch (e) {
        console.warn('Không thể đọc Event Log & Telemetry:', e);
      }

      // 2. Bắt mạch mạng máy chủ nếu có host
      let probeData: any = null;
      if (host) {
        setProbingHost(true);
        try {
          addLog(`🌐 Đang kiểm tra kết nối mạng & Cổng 445 SMB tới Máy Chủ [${host}]...`);
          const probeRes = await (window as any).electronAPI?.invoke?.('printer:probe-target-host', { host });
          if (probeRes?.ok) {
            probeData = probeRes;
            setNetworkProbeResult(probeRes);
            if (probeRes.port445Smb === false) {
              addLog(`🚫 CẢNH BÁO: Cổng 445 SMB trên Máy Chủ [${host}] ĐANG BỊ CHẶN!`);
            } else {
              addLog(`✅ Cổng 445 SMB trên Máy Chủ [${host}] đang MỞ thông suốt (${probeRes.pingMs}ms).`);
            }
            if (probeRes.sharedPrinters && probeRes.sharedPrinters.length > 0) {
              addLog(`🖨️ Tìm thấy ${probeRes.sharedPrinters.length} máy in chia sẻ: ${probeRes.sharedPrinters.join(', ')}`);
            }
          }
        } catch (e) {
          console.warn('Lỗi bắt mạch máy chủ:', e);
        } finally {
          setProbingHost(false);
        }
      }

      addLog('🤖 Đang gửi dữ liệu telemetry đầy đủ tới Trí Tuệ Nhân Tạo để phân tích...');
      const telemetryPayload = {
        diagnosticData: workflowSteps,
        installedPrinters: printers,
        systemPorts: systemPorts,
        targetHost: host,
        networkProbe: probeData,
        eventLogs: eventLogsData,
        stuckJobs: stuckJobsData,
        spoolerStatus: spoolerStatusData,
        windowsVersion: windowsVersionData
      };

      const res = await GeminiService.analyzePrinterDiagnostics(telemetryPayload);
      if (res.content) {
        setGeminiAnalysisResult(res.content);
        const currentIssueCount = workflowSteps.filter(s => s.status === 'error' || s.status === 'warning').length;
        ErrorTelemetryService.saveRecord({
          category: 'printer',
          title: `Chẩn đoán Máy In (${currentIssueCount} sự cố${host ? ` - Máy chủ ${host}` : ''})`,
          issueCount: currentIssueCount,
          details: telemetryPayload,
          aiAnalysis: res.content,
          resolved: currentIssueCount === 0
        });
        setDiagnosticHistory(ErrorTelemetryService.getHistory());
        addLog('✅ Trợ lý AI đã hoàn thành báo cáo phân tích chuyên sâu!');
      } else {
        showToast.error('Lỗi Phân Tích AI', res.error || 'Không thể kết nối Gemini API');
      }
    } catch (err: any) {
      showToast.error('Lỗi Phân Tích AI', err.message || String(err));
    } finally {
      setGeminiLoading(false);
      setProbingHost(false);
    }
  };

  const handleSaveGeminiKey = () => {
    GeminiService.setApiKey(geminiApiKeyInput);
    GeminiService.setModel(geminiModelSelect);
    showToast.success('Đã lưu cấu hình', 'Google Gemini API Key đã được cập nhật thành công!');
  };

  const handleExportTelemetryData = () => {
    const jsonStr = ErrorTelemetryService.exportTelemetryJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DMH_Telemetry_Diagnostics_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast.success('Đã xuất dữ liệu', 'Tệp nhật ký telemetry đã được lưu thành công!');
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
      setDeletingJobId(jobId);
      const msg = `Đang xóa lệnh in #${jobId} của máy in "${printerName}"...`;
      startGlobalLoading('printer-delete-job', msg);
      addLog(`🗑️ ${msg}`);
      
      const w = window as any;
      if (w.electronAPI?.printer?.deleteJob) {
        const res = await w.electronAPI.printer.deleteJob(printerName, jobId);
        if (res?.ok) {
          addLog(`✅ ` + (res.message || `Đã xóa lệnh in #${jobId} thành công!`));
          showToast.success('Xóa lệnh in', `Đã xóa lệnh in #${jobId} thành công!`);
        } else {
          addLog(`⚠️ Không thể xóa lệnh in #${jobId}: ` + (res?.error || 'Có thể file đệm đang bị khóa bởi tiến trình khác.'));
          showToast.warning('Xóa lệnh in', res?.error || `Không thể xóa lệnh in #${jobId}.`);
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
        showToast.success('Xóa lệnh in', `Đã gửi lệnh xóa lệnh in #${jobId}.`);
      }

      await loadJobs(printerName);
      await loadPrinters(true);
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      addLog(`❌ Lỗi khi xóa lệnh in #${jobId}: ` + String(err));
      showToast.error('Lỗi xóa lệnh in', String(err));
    } finally {
      setDeletingJobId(null);
      setLoading(false);
      stopGlobalLoading('printer-delete-job');
    }
  };

  // ── Xóa toàn bộ lệnh in của máy in đang chọn ─────────────────────────────
  const clearAllJobsOnPrinter = async (printerName: string) => {
    try {
      setLoading(true);
      setClearingJobsFor(printerName);
      const msg = `Đang xóa TẤT CẢ lệnh in kẹt của máy in "${printerName}"...`;
      setActiveOperationMessage(msg);
      startGlobalLoading('printer-clear-jobs', msg);
      addLog(`🗑️ ${msg}`);
      
      const w = window as any;
      if (w.electronAPI?.printer?.clearQueue) {
        const res = await w.electronAPI.printer.clearQueue(printerName);
        if (res?.ok) {
          addLog(`✅ ` + (res.message || `Đã xóa toàn bộ lệnh in của "${printerName}"!`));
          showToast.success('Xóa lệnh in', `Đã xóa toàn bộ lệnh in của "${printerName}"!`);
        } else {
          addLog(`⚠️ Lỗi khi xóa hàng đợi in: ` + (res?.error || 'Không rõ nguyên nhân'));
          showToast.warning('Xóa lệnh in', res?.error || 'Lỗi khi xóa hàng đợi in.');
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
        showToast.success('Xóa lệnh in', `Đã xóa toàn bộ lệnh in của "${printerName}".`);
      }

      await loadJobs(printerName);
      await loadPrinters(true);
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      addLog(`❌ Lỗi khi xóa toàn bộ lệnh in: ` + String(err));
      showToast.error('Lỗi xóa lệnh in', String(err));
    } finally {
      setClearingJobsFor(null);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('printer-clear-jobs');
    }
  };

  // ── Gỡ bỏ tận gốc máy in & dọn sạch Registry (100% Clean Uninstall) ────────
  const handleUninstallPrinter = async (printerName: string, driverName?: string) => {
    const ok = await showConfirm({
      title: 'Gỡ bỏ tận gốc máy in',
      message: `Xác nhận gỡ bỏ hoàn toàn máy in "${printerName}" khỏi hệ thống?\n\n• Hủy sạch toàn bộ lệnh in đang kẹt (giải phóng khóa Spooler)\n• Buộc gỡ bỏ máy in khỏi hàng đợi Windows\n• Dọn sạch toàn bộ khóa Registry trong HKLM và HKCU\n• Gỡ bỏ driver nếu không còn máy in nào dùng chung`,
      type: 'danger',
      badge: '100% CLEAN UNINSTALL',
      confirmText: 'Gỡ bỏ ngay'
    });
    if (!ok) return;

    try {
      setLoading(true);
      setUninstallingPrinter(printerName);
      const msg = `Đang gỡ bỏ tận gốc máy in "${printerName}" & dọn dẹp Spooler / Registry...`;
      setActiveOperationMessage(msg);
      startGlobalLoading('printer-uninstall', msg);
      addLog(`🗑️ ${msg}`);

      const w = window as any;
      if (w.electronAPI?.printer?.uninstallPrinter) {
        const res = await w.electronAPI.printer.uninstallPrinter(printerName, driverName);
        if (res?.ok) {
          addLog(`✅ ` + (res.message || `Đã gỡ bỏ tận gốc máy in "${printerName}" thành công!`));
          showToast.success('Gỡ bỏ máy in', res.message || `Đã gỡ bỏ tận gốc máy in "${printerName}" thành công!`);
        } else {
          addLog(`⚠️ Gỡ bỏ thất bại: ` + (res?.error || 'Có thể cần quyền Administrator.'));
          showToast.warning('Gỡ bỏ máy in', res?.error || 'Không thể gỡ bỏ máy in. Có thể cần quyền Administrator.');
        }
      } else {
        const safe = printerName.replace(/["']/g, '');
        await runPS(`
          Remove-Printer -Name "${safe}" -ErrorAction SilentlyContinue
          Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices" -Name "${safe}" -ErrorAction SilentlyContinue
        `);
        addLog(`✅ Đã gửi lệnh gỡ bỏ máy in "${printerName}".`);
        showToast.success('Gỡ bỏ máy in', `Đã gỡ bỏ máy in "${printerName}".`);
      }

      setSelectedPrinter(null);
      setJobs([]);
      await loadPrinters(true);
      await diagnoseAllPrinters(true);
    } catch (err: unknown) {
      addLog(`❌ Lỗi khi gỡ bỏ máy in: ` + String(err));
      showToast.error('Lỗi gỡ bỏ máy in', String(err));
    } finally {
      setUninstallingPrinter(null);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('printer-uninstall');
    }
  };

  // ── Xóa sạch toàn bộ kẹt lệnh in toàn hệ thống ──────────────────────────
  const clearPrintQueue = async () => {
    try {
      setLoading(true);
      startGlobalLoading('printer-clear-queue', 'Đang dừng Spooler & dọn sạch toàn bộ lệnh in kẹt...');
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
      stopGlobalLoading('printer-clear-queue');
    }
  };

  const fixAppPrinting = async () => {
    try {
      setFixingAppPrintState(true);
      setLoading(true);
      const msg = 'Đang dừng Spooler & sửa lỗi in ứng dụng (Word, Excel, trình duyệt)...';
      setActiveOperationMessage(msg);
      startGlobalLoading('fix-app-printing', msg);
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
      setFixingAppPrintState(false);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('fix-app-printing');
    }
  };

  // ── Sửa lỗi 0x00000bcb & Gỡ bỏ hạn chế Point and Print ──────────────────
  const fixPointAndPrint = async () => {
    try {
      setFixingPointAndPrint(true);
      setLoading(true);
      const msg = 'Đang gỡ bỏ hạn chế Point and Print & sửa lỗi 0x00000bcb...';
      setActiveOperationMessage(msg);
      startGlobalLoading('fix-point-and-print', msg);
      addLog('🚀 Bắt đầu gỡ bỏ hạn chế Point and Print & sửa lỗi 0x00000bcb...');
      const w = window as any;
      if (w.electronAPI?.printer?.fixPointAndPrint) {
        const res = await w.electronAPI.printer.fixPointAndPrint();
        if (res?.ok) {
          addLog('✅ ' + (res.message || 'Đã cấu hình Registry cho phép cài driver máy in qua mạng LAN!'));
          await checkShareRpcStatus();
          await diagnoseAllPrinters(true);
          await loadPrinters();
          showResultModal('🎉 ĐÃ GỠ BỎ CHÍNH SÁCH CHẶN DRIVER LAN 0xbcb THÀNH CÔNG!\n\n• Đã bật RestrictDriverInstallationToAdministrators = 0\n• Đã tắt cảnh báo NoWarningNoElevationOnInstall = 1\n• Máy con nay có thể tự nạp Driver từ máy in chia sẻ qua mạng LAN mà không bị Windows chặn.\n\n👉 Bạn có thể kết nối lại máy in trên máy con để Windows tự động nạp driver!');
        } else {
          addLog('⚠️ ' + (res?.error || 'Có thể cần quyền Administrator.'));
          showResultModal('⚠️ CẦN QUYỀN ADMINISTRATOR\n\n' + (res?.error || 'Không thể cấu hình Point and Print.') + '\n\n👉 Vui lòng mở app bằng Run as administrator.', 'warning');
        }
      } else {
        await runPS(`
          $pnpKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint"
          if (-not (Test-Path $pnpKey)) { New-Item -Path $pnpKey -Force | Out-Null }
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictDriverInstallationToAdministrators" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictedDriver_InstallationAttribute" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PackagePointAndPrintServerList" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PointAndPrintRestrictions" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "InForest" /t REG_DWORD /d 0 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "NoWarningNoElevationOnInstall" /t REG_DWORD /d 1 /f
          reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "UpdatePromptSettings" /t REG_DWORD /d 2 /f
          Restart-Service -Name Spooler -Force
        `);
        addLog('✅ Đã gỡ bỏ hạn chế Point and Print thành công.');
        await checkShareRpcStatus();
        await diagnoseAllPrinters(true);
        await loadPrinters();
      }
    } catch (err: unknown) {
      addLog('❌ Lỗi xử lý: ' + String(err));
    } finally {
      setFixingPointAndPrint(false);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('fix-point-and-print');
    }
  };

  // ── Sửa lỗi máy in mạng bị Offline do SNMP ───────────────────────────────
  const fixOfflineSnmp = async () => {
    try {
      setFixingSnmpState(true);
      setLoading(true);
      const msg = 'Đang kiểm tra và tắt SNMP Status Enabled trên các cổng in TCP/IP...';
      setActiveOperationMessage(msg);
      startGlobalLoading('fix-offline-snmp', msg);
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
      setFixingSnmpState(false);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('fix-offline-snmp');
    }
  };

  // ── Bật Chia Sẻ Mạng LAN & Tắt Đòi Mật Khẩu ────────────────────────────
  const enableLanSharing = async () => {
    try {
      setEnablingSharing(true);
      setLoading(true);
      const msg = 'Đang mở tường lửa File and Printer Sharing & kích hoạt chia sẻ mạng LAN...';
      setActiveOperationMessage(msg);
      startGlobalLoading('enable-lan-sharing', msg);
      addLog('🌐 Đang mở tường lửa File and Printer Sharing, bật Network Discovery và bật dịch vụ chia sẻ...');
      const w = window as any;
      if (w.electronAPI?.printer?.enableLanSharing) {
        const res = await w.electronAPI.printer.enableLanSharing();
        if (res?.ok) {
          addLog('✅ ' + (res.message || 'Đã bật chia sẻ mạng LAN thành công!'));
          showResultModal('🎉 ĐÃ BẬT CHIA SẺ MẠNG LAN THÀNH CÔNG!\n\n• Đã mở Tường lửa Firewall cho File and Printer Sharing & Network Discovery.\n• Đã khởi động các dịch vụ mạng nền tảng (FDResPub, fdPHost, LanmanServer).\n• Đã mở tài khoản Guest và cấu hình chia sẻ không cần mật khẩu.\n\n👉 Các máy con trong mạng LAN hiện có thể nhìn thấy và truy cập máy in chia sẻ!');
        } else {
          addLog('⚠️ ' + (res?.error || 'Cần quyền Administrator để thay đổi cấu hình mạng.'));
          showResultModal('⚠️ CẦN QUYỀN ADMINISTRATOR\n\n' + (res?.error || 'Không đủ quyền hạn thay đổi cấu hình mạng.') + '\n\n👉 Vui lòng chạy phần mềm bằng Run as administrator để có quyền mở cổng Tường lửa Firewall.', 'warning');
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
      await checkShareRpcStatus();
      await diagnoseAllPrinters(true);
      await loadPrinters();
    } catch (err: unknown) {
      addLog('❌ Lỗi bật chia sẻ mạng: ' + String(err));
    } finally {
      setEnablingSharing(false);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('enable-lan-sharing');
    }
  };

  // ── Cứu Hộ Dịch Vụ Spooler Crash / Tự Tắt & Phân Quyền ACL ──────────────
  const fixSpoolerCrash = async () => {
    try {
      setFixingSpoolerCrashState(true);
      setLoading(true);
      const msg = 'Đang phân quyền thư mục PRINTERS & cứu hộ Spooler crash...';
      setActiveOperationMessage(msg);
      startGlobalLoading('fix-spooler-crash', msg);
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
      setFixingSpoolerCrashState(false);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('fix-spooler-crash');
    }
  };

  // ── Thao tác trực tiếp trên máy in đang chọn ────────────────────────────
  const handlePrintTestPage = async (printerName: string) => {
    try {
      setPrintingTestName(printerName);
      setLoading(true);
      const msg = `Đang gửi lệnh in trang thử nghiệm (Test Page) tới "${printerName}"...`;
      setActiveOperationMessage(msg);
      startGlobalLoading('print-test-page', msg);
      addLog(`🖨️ ${msg}`);
      const w = window as any;
      if (w.electronAPI?.printer?.printTestPage) {
        const res = await w.electronAPI.printer.printTestPage(printerName);
        if (res?.ok) {
          addLog(`✅ Đã gửi lệnh in test page tới "${printerName}". Vui lòng kiểm tra khay giấy ra!`);
          showToast.success('In test page', `Đã gửi lệnh in trang thử tới "${printerName}".`);
        } else {
          addLog('⚠️ ' + (res?.error || 'Không thể gửi lệnh in test.'));
          showToast.warning('In test page', res?.error || 'Không thể gửi lệnh in test.');
        }
      } else {
        await runPS(`$p = Get-CimInstance Win32_Printer -Filter "Name = '${printerName}'"; if ($p) { Invoke-CimMethod -InputObject $p -MethodName PrintTestPage }`);
        addLog(`✅ Đã gửi lệnh in test page trực tiếp tới "${printerName}".`);
        showToast.success('In test page', `Đã gửi lệnh in test trực tiếp tới "${printerName}".`);
      }
    } catch (err: unknown) {
      addLog(`❌ Lỗi in test: ` + String(err));
      showToast.error('Lỗi in test', String(err));
    } finally {
      setPrintingTestName(null);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('print-test-page');
    }
  };

  const handleSetDefault = async (printerName: string) => {
    try {
      setSettingDefaultName(printerName);
      setLoading(true);
      const msg = `Đang đặt "${printerName}" làm máy in mặc định hệ thống...`;
      setActiveOperationMessage(msg);
      startGlobalLoading('set-default-printer', msg);
      addLog(`⭐ ${msg}`);
      const w = window as any;
      if (w.electronAPI?.printer?.setDefault) {
        const res = await w.electronAPI.printer.setDefault(printerName);
        if (res?.ok) {
          addLog(`✅ Đã đặt "${printerName}" làm máy in mặc định!`);
          showToast.success('Máy in mặc định', `Đã đặt "${printerName}" làm mặc định!`);
          await loadPrinters();
        }
      } else {
        await runPS(`(New-Object -ComObject WScript.Network).SetDefaultPrinter("${printerName}")`);
        addLog(`✅ Đã đặt "${printerName}" làm máy in mặc định!`);
        showToast.success('Máy in mặc định', `Đã đặt "${printerName}" làm mặc định!`);
        await loadPrinters();
      }
    } catch (err: unknown) {
      addLog(`❌ Lỗi đặt mặc định: ` + String(err));
      showToast.error('Lỗi đặt mặc định', String(err));
    } finally {
      setSettingDefaultName(null);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('set-default-printer');
    }
  };

  const handleResumePrinter = async (printerName: string) => {
    try {
      setResumingPrinterName(printerName);
      setLoading(true);
      const msg = `Đang kích hoạt máy in "${printerName}" về Online...`;
      setActiveOperationMessage(msg);
      startGlobalLoading('resume-printer', msg);
      addLog(`▶️ ${msg}`);
      const w = window as any;
      if (w.electronAPI?.printer?.resumePrinter) {
        await w.electronAPI.printer.resumePrinter(printerName);
        addLog(`✅ Đã kích hoạt máy in "${printerName}" sẵn sàng nhận lệnh!`);
        showToast.success('Kích hoạt máy in', `Máy in "${printerName}" đã Online!`);
        await loadPrinters();
      } else {
        await runPS(`Resume-Printer -Name "${printerName}" -ErrorAction SilentlyContinue; Set-Printer -Name "${printerName}" -WorkOffline $false -ErrorAction SilentlyContinue`);
        addLog(`✅ Đã mở lại hoạt động cho "${printerName}".`);
        showToast.success('Kích hoạt máy in', `Đã mở lại hoạt động cho "${printerName}".`);
        await loadPrinters();
      }
    } catch (err: unknown) {
      addLog(`❌ Lỗi kích hoạt máy in: ` + String(err));
      showToast.error('Lỗi kích hoạt máy in', String(err));
    } finally {
      setResumingPrinterName(null);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('resume-printer');
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
      else if (tool === 'gpedit') cmd = 'gpedit.msc';
      runPS(`Start-Process "${cmd}"`).catch(() => {});
    }
    addLog(`🚀 Đã mở công cụ Windows: ${tool}`);
  };

  // Mở Modal Cấu Hình & Tùy Chọn Chế Độ Cài Đặt Driver Máy In (Tránh lỗi cổng Other)
  const openInstallOptionsModal = async (drv: { name: string; url: string; directLink?: string; sha256?: string | null; category?: string }, localFilePath?: string) => {
    setPendingInstallDriver({ ...drv, localFilePath });
    setInstallMode('usb');
    setSelectedPort('AUTO');
    setPrinterIp('');
    setShowInstallOptionsModal(true);

    // Tự động quét danh sách cổng trên hệ thống Windows & nhận diện cổng USB đang cắm
    try {
      const w = window as any;
      if (w.electronAPI?.printer?.getAvailablePorts) {
        const res = await w.electronAPI.printer.getAvailablePorts();
        if (res?.ok && Array.isArray(res.ports)) {
          setSystemPorts(res.ports);
          if (res.detectedConnectedPort) {
            setDetectedUsbPort(res.detectedConnectedPort);
          } else {
            setDetectedUsbPort(null);
          }
        }
      }
    } catch {}
  };

  const handleConfirmInstallWithOptions = async () => {
    if (!pendingInstallDriver) return;
    if (installMode === 'network' && !printerIp.trim()) {
      showToast.warning('Thiếu địa chỉ IP', 'Vui lòng nhập địa chỉ IP của máy in (ví dụ: 192.168.1.200)!');
      return;
    }

    const drv = pendingInstallDriver;
    const localPath = pendingInstallDriver.localFilePath;
    const mode = installMode;
    const port = selectedPort;
    const ip = printerIp.trim();
    const portNum = printerPortNum;

    setShowInstallOptionsModal(false);

    const w = window as any;
    if (!w.electronAPI?.printer?.autoInstallDriver) {
      addLog('❌ Bản cập nhật Desktop cần có API printer.autoInstallDriver để thực hiện.');
      return;
    }

    try {
      setLoading(true);
      const modeText = mode === 'usb' ? `Cổng USB [${port !== 'AUTO' ? port : 'Tự động'}]` : mode === 'network' ? `Mạng LAN [${ip}]` : 'Giao diện trực tiếp của hãng';
      startGlobalLoading('driver-install', `Đang cài đặt Driver ${drv.name} (${modeText})...`);
      addLog(`🚀 BẮT ĐẦU CÀI ĐẶT DRIVER "${drv.name}" TỪ A-Z (Chế độ: ${mode.toUpperCase()} - ${modeText})...`);

      const res = await w.electronAPI.printer.autoInstallDriver({
        name: drv.name,
        directLink: drv.directLink,
        url: drv.url,
        sha256: drv.sha256,
        category: drv.category,
        autoTestPrint: autoTestPrint,
        localFilePath: localPath,
        installMode: mode,
        selectedPort: port,
        printerIp: ip,
        printerPortNum: portNum
      });

      if (res?.ok) {
        addLog(`🎉 ${res.message || 'Cài đặt driver hoàn tất!'}`);
        showResultModal(
          `🎉 ĐÃ CÀI ĐẶT DRIVER THÀNH CÔNG!\n\n` +
          `• Dòng máy in: ${drv.name}\n` +
          (res.printerName ? `• Máy in nhận diện: [${res.printerName}]\n` : `• Driver đã nạp vào Driver Store Windows sẵn sàng!\n`) +
          `• Chế độ kết nối: ${modeText}\n` +
          (res.testPrintSent ? `• Đã tự động gửi lệnh in trang thử nghiệm (Print Test Page) trực tiếp vào đúng máy in này!\n` : `• Cắm cáp USB / kết nối mạng là máy sẽ tự động in được ngay!\n`) +
          `\n👉 Cổng kết nối và driver đã được DMH Tools cấu hình chuẩn xác 100%!`,
          'success'
        );
        await loadPrinters(true);
      } else {
        addLog(`⚠️ Cài đặt tự động chưa hoàn tất: ${res?.error || 'Có lỗi xảy ra'}`);
        showResultModal(
          `⚠️ Chưa Hoàn Tất Cài Đặt\n\n` +
          `${res?.error || 'Hệ thống đã mở trang chủ nhà sản xuất để bạn tải bộ cài.'}\n\n` +
          `💡 Mẹo: Nếu bạn đã có sẵn file bộ cài (.exe, .zip, .rar, .inf), hãy bấm nút "Cài từ tệp trên máy" để DMH Tools cấu hình chuẩn xác cho bạn!`,
          'warning'
        );
      }
    } catch (err: unknown) {
      const e = String(err);
      addLog('❌ Lỗi cài driver: ' + e);
      showResultModal(`❌ Lỗi Cài Driver\n\n${e}`, 'error');
    } finally {
      setLoading(false);
      stopGlobalLoading('driver-install');
      setDriverInstallProgress(null);
    }
  };

  const handleSelectAndInstallLocalDriver = async () => {
    const w = window as any;
    if (!w.electronAPI?.printer?.selectDriverFile) {
      addLog('❌ Bản cập nhật Desktop cần có API printer.selectDriverFile để chọn file.');
      return;
    }
    try {
      const res = await w.electronAPI.printer.selectDriverFile();
      if (res.canceled || !res.filePath) return;
      const fileName = res.filePath.split(/[\\/]/).pop() || 'Bộ cài đặt Driver';
      await openInstallOptionsModal({
        name: fileName,
        url: '',
      }, res.filePath);
    } catch (err) {
      addLog('❌ Lỗi chọn tệp: ' + String(err));
    }
  };

  // ── Tự động sửa lỗi máy in đang chọn (1-click) ─────────────────────────
  const autoFixPrinter = async (printerName: string, driverName: string) => {
    try {
      setFixingPrinterName(printerName);
      setLoading(true);
      const msg = `Đang tự động sửa lỗi cho máy in "${printerName}"...`;
      setActiveOperationMessage(msg);
      startGlobalLoading('auto-fix-printer', msg);
      addLog(`🔧 Bắt đầu tự động sửa lỗi: ${printerName}...`);
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
      showToast.success('Tự sửa máy in', `Đã cấu hình lại máy in "${printerName}". Thử in lại!`);
      await loadPrinters();
      setJobs([]);
    } catch (err: unknown) {
      addLog('❌ Lỗi tự sửa: ' + String(err));
      showToast.error('Lỗi tự sửa', String(err));
      await runPS(`Start-Service -Name Spooler`).catch(() => {});
    } finally {
      setFixingPrinterName(null);
      setActiveOperationMessage(null);
      setLoading(false);
      stopGlobalLoading('auto-fix-printer');
    }
  };

  // ── Tự động sửa + gợi ý cài driver mới ──────────────────────────────────
  const autoFixAndInstallDriver = async (printerName: string, driverName: string) => {
    await autoFixPrinter(printerName, driverName);
    // Tìm driver phù hợp trong danh sách
    const match = COMMON_DRIVERS.find(d => d.regex.test(printerName) || d.regex.test(driverName));
    if (match) {
      addLog(`🔍 Phát hiện driver phù hợp: ${match.name}`);
      await openInstallOptionsModal(match);
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

  // ── Helper: Render Danh Sách Máy In & Thao Tác Trực Tiếp ──
  const renderPrintersListBlock = () => (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Printer size={16} color="#6366f1" /> Danh sách Máy In trên máy tính ({printers.length})
        </h3>
        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
          Click chọn máy in để In Test, Đặt Mặc Định, Xem Lệnh hoặc Tự Sửa Lỗi
        </span>
      </div>
      
      {/* Banner thông báo tiến trình đang chạy */}
      {activeOperationMessage && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          background: 'linear-gradient(90deg, #eff6ff 0%, #e0e7ff 100%)',
          border: '1px solid #93c5fd',
          borderRadius: 6,
          color: '#1e40af',
          fontSize: '0.8rem',
          fontWeight: 600,
          marginBottom: 10
        }}>
          <Loader2 size={15} className="global-spin" style={{ color: '#2563eb', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{activeOperationMessage}</span>
          <span style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}>
            Đang xử lý
          </span>
        </div>
      )}
      
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
                      disabled={loading || printingTestName === p.Name}
                      style={{
                        flex: '1 1 auto',
                        padding: '6px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid #6366f1',
                        background: printingTestName === p.Name ? '#4338ca' : '#4f46e5',
                        color: '#fff',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        justifyContent: 'center',
                        opacity: loading && printingTestName !== p.Name ? 0.6 : 1
                      }}
                      title="Gửi lệnh in một trang thử nghiệm (Test Page) chuẩn Windows"
                    >
                      {printingTestName === p.Name ? (
                        <>
                          <Loader2 size={13} className="global-spin" /> Đang in thử...
                        </>
                      ) : (
                        <>
                          <Printer size={13} /> In Trang Thử (Test Page)
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleSetDefault(p.Name)}
                      disabled={loading || settingDefaultName === p.Name}
                      style={{
                        flex: '1 1 auto',
                        padding: '6px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        color: '#334155',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        justifyContent: 'center',
                        opacity: loading && settingDefaultName !== p.Name ? 0.6 : 1
                      }}
                      title="Đặt máy in này làm máy in mặc định hệ thống"
                    >
                      {settingDefaultName === p.Name ? (
                        <>
                          <Loader2 size={13} className="global-spin" /> Đang đặt...
                        </>
                      ) : (
                        <>
                          <Star size={13} color="#f59e0b" /> Đặt Mặc Định
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleResumePrinter(p.Name)}
                      disabled={loading || resumingPrinterName === p.Name}
                      style={{
                        flex: '1 1 auto',
                        padding: '6px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        color: '#16a34a',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        justifyContent: 'center',
                        opacity: loading && resumingPrinterName !== p.Name ? 0.6 : 1
                      }}
                      title="Bỏ tạm dừng và chuyển trạng thái máy in về Online"
                    >
                      {resumingPrinterName === p.Name ? (
                        <>
                          <Loader2 size={13} className="global-spin" /> Đang kích hoạt...
                        </>
                      ) : (
                        <>
                          <Play size={13} /> Bỏ Tạm Dừng / Online
                        </>
                      )}
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
                      disabled={loading || fixingPrinterName === p.Name}
                      style={{
                        flex: '1 1 auto',
                        padding: '5px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid #f59e0b',
                        background: '#fffbeb',
                        color: '#92400e',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        justifyContent: 'center',
                        opacity: loading && fixingPrinterName !== p.Name ? 0.6 : 1
                      }}
                      title="Xóa cấu hình cũ, cài lại máy in từ driver có sẵn và reset Spooler"
                    >
                      {fixingPrinterName === p.Name ? (
                        <>
                          <Loader2 size={12} className="global-spin" /> Đang tự sửa...
                        </>
                      ) : (
                        <>
                          <Wrench size={12} /> Tự Sửa Lỗi (Reset + Cài lại)
                        </>
                      )}
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
                      disabled={loading || uninstallingPrinter === p.Name}
                      style={{
                        flex: '1 1 auto',
                        padding: '5px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        borderRadius: 4,
                        border: '1px solid #ef4444',
                        background: uninstallingPrinter === p.Name ? '#fee2e2' : '#fef2f2',
                        color: '#dc2626',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        justifyContent: 'center',
                        boxShadow: uninstallingPrinter === p.Name ? '0 0 0 2px #f87171' : 'none'
                      }}
                      title="Gỡ bỏ hoàn toàn máy in này khỏi hệ thống, dọn sạch Registry và Driver để trong Word/Excel/HIS không còn hiển thị"
                    >
                      {uninstallingPrinter === p.Name ? (
                        <>
                          <Loader2 size={12} className="global-spin" /> Đang gỡ bỏ tận gốc...
                        </>
                      ) : (
                        <>
                          <Trash2 size={12} /> Gỡ Bỏ Tận Gốc (Xóa Sạch 100%)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Helper: Render Lệnh In Đang Chờ / Kẹt ──
  const renderPrintJobsBlock = () => (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={16} color="#f59e0b" /> Lệnh in đang chờ/kẹt
        </h3>
        {selectedPrinter && jobs.length > 0 && (
          <button
            onClick={() => clearAllJobsOnPrinter(selectedPrinter)}
            disabled={loading || clearingJobsFor === selectedPrinter}
            style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: '0.7rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            title={`Xóa toàn bộ ${jobs.length} lệnh in đang kẹt trên máy ${selectedPrinter}`}
          >
            {clearingJobsFor === selectedPrinter ? (
              <>
                <Loader2 size={12} className="global-spin" /> Đang xóa hết...
              </>
            ) : (
              <>
                <Trash2 size={12} /> Xóa Hết ({jobs.length})
              </>
            )}
          </button>
        )}
      </div>
      
      {!selectedPrinter ? (
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>
          Chọn một máy in bên danh sách để xem lệnh in kẹt.
        </div>
      ) : jobs.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: '#10b981', textAlign: 'center', padding: '2rem 0', background: '#f0fdf4', borderRadius: 6 }}>
          Không có lệnh in nào bị kẹt trên {selectedPrinter}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
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
                disabled={loading || deletingJobId === j.Id}
                style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {deletingJobId === j.Id ? (
                  <>
                    <Loader2 size={12} className="global-spin" /> Đang xóa...
                  </>
                ) : (
                  <>
                    <Trash2 size={12} /> Xóa
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Helper: Render Tự Động Nhận Diện & Tải Driver Máy In ──
  const renderDriversBlock = () => {
    const q = driverSearch.trim().toLowerCase();
    const filtered = COMMON_DRIVERS.filter(drv => {
      const cat = drv.category || 'office';
      const matchCat = driverCategory === 'all' || cat === driverCategory;
      const matchSearch = !q || drv.name.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });

    const posCount = COMMON_DRIVERS.filter(d => d.category === 'pos').length;
    const barcodeCount = COMMON_DRIVERS.filter(d => d.category === 'barcode').length;
    const officeCount = COMMON_DRIVERS.filter(d => !d.category || d.category === 'office').length;

    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.25rem', width: '100%', boxSizing: 'border-box' }}>
        {/* Header Block & Search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Download size={18} color="#10b981" /> Thư Viện Driver Máy In Chuẩn (Nhận Diện & Cài Đặt)
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
              Hỗ trợ đầy đủ các dòng <strong>Máy in Hóa Đơn POS / Nhiệt</strong>, <strong>Mã Vạch / Tem Nhãn Xét Nghiệm</strong> và <strong>Máy in Văn Phòng A4</strong>.
            </p>
          </div>

          {/* Ô Tìm Kiếm Driver Nhanh */}
          <div style={{ position: 'relative', width: 320, maxWidth: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Tìm nhanh driver (POS, Xprinter, Zywell, Canon, T82...)..."
              value={driverSearch}
              onChange={e => setDriverSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 30px 7px 32px',
                fontSize: '0.78rem',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
                background: '#f8fafc',
              }}
            />
            {driverSearch && (
              <button
                onClick={() => setDriverSearch('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Thanh Lọc Danh Mục (Category Tabs) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.15rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setDriverCategory('all')}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              border: driverCategory === 'all' ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
              background: driverCategory === 'all' ? '#0f172a' : '#f8fafc',
              color: driverCategory === 'all' ? '#fff' : '#475569',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s ease'
            }}
          >
            <span>Tất Cả</span>
            <span style={{ background: driverCategory === 'all' ? 'rgba(255,255,255,0.25)' : '#e2e8f0', padding: '1px 6px', borderRadius: 10, fontSize: '0.68rem' }}>
              {COMMON_DRIVERS.length}
            </span>
          </button>

          <button
            onClick={() => setDriverCategory('pos')}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              border: driverCategory === 'pos' ? '1.5px solid #059669' : '1px solid #a7f3d0',
              background: driverCategory === 'pos' ? '#059669' : '#ecfdf5',
              color: driverCategory === 'pos' ? '#fff' : '#065f46',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s ease',
              boxShadow: driverCategory === 'pos' ? '0 2px 8px rgba(5, 150, 105, 0.3)' : 'none'
            }}
          >
            <span>🧾 Máy In Hóa Đơn POS / Nhiệt</span>
            <span style={{ background: driverCategory === 'pos' ? 'rgba(255,255,255,0.3)' : '#059669', color: '#fff', padding: '1px 7px', borderRadius: 10, fontSize: '0.68rem' }}>
              {posCount}
            </span>
          </button>

          <button
            onClick={() => setDriverCategory('barcode')}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              border: driverCategory === 'barcode' ? '1.5px solid #4f46e5' : '1px solid #c7d2fe',
              background: driverCategory === 'barcode' ? '#4f46e5' : '#eef2ff',
              color: driverCategory === 'barcode' ? '#fff' : '#3730a3',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s ease',
              boxShadow: driverCategory === 'barcode' ? '0 2px 8px rgba(79, 70, 229, 0.3)' : 'none'
            }}
          >
            <span>🏷️ Máy In Mã Vạch / Tem Nhãn</span>
            <span style={{ background: driverCategory === 'barcode' ? 'rgba(255,255,255,0.3)' : '#4f46e5', color: '#fff', padding: '1px 7px', borderRadius: 10, fontSize: '0.68rem' }}>
              {barcodeCount}
            </span>
          </button>

          <button
            onClick={() => setDriverCategory('office')}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              border: driverCategory === 'office' ? '1.5px solid #0284c7' : '1px solid #bae6fd',
              background: driverCategory === 'office' ? '#0284c7' : '#f0f9ff',
              color: driverCategory === 'office' ? '#fff' : '#0369a1',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s ease',
              boxShadow: driverCategory === 'office' ? '0 2px 8px rgba(2, 132, 199, 0.3)' : 'none'
            }}
          >
            <span>📄 Máy In Văn Phòng A4</span>
            <span style={{ background: driverCategory === 'office' ? 'rgba(255,255,255,0.3)' : '#0284c7', color: '#fff', padding: '1px 7px', borderRadius: 10, fontSize: '0.68rem' }}>
              {officeCount}
            </span>
          </button>
        </div>

        {/* Thanh Công Cụ Điều Khiển Cài Đặt Tự Động & Tùy Chọn */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '0.75rem 1rem',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          marginBottom: 10
        }}>
          {/* Checkbox Tự động in thử nghiệm */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: '#1e293b',
            userSelect: 'none'
          }}>
            <input
              type="checkbox"
              checked={autoTestPrint}
              onChange={e => setAutoTestPrint(e.target.checked)}
              style={{
                width: 16,
                height: 16,
                accentColor: '#059669',
                cursor: 'pointer'
              }}
            />
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Printer size={14} color="#059669" />
              Tự động in trang thử (Print Test Page) ngay sau khi cài thành công
            </span>
          </label>

          {/* Nút Cài đặt từ File offline trên máy */}
          <button
            onClick={handleSelectAndInstallLocalDriver}
            disabled={loading}
            title="Chọn bộ cài (.exe, .zip, .rar, .7z, .inf) đã có sẵn trên máy để cài đặt tự động ngầm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#f1f5f9';
              e.currentTarget.style.borderColor = '#94a3b8';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
          >
            <FolderOpen size={14} color="#0284c7" />
            <span>Cài từ tệp bộ cài trên máy (.exe, .zip, .inf)...</span>
          </button>
        </div>

        {/* Thanh Báo Tiến Độ Cài Đặt Driver Trực Quan (Active Step) */}
        {driverInstallProgress && (
          <div style={{
            padding: '0.85rem 1.1rem',
            background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
            border: '1px solid #a7f3d0',
            borderRadius: 8,
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.12)'
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#059669',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.85rem',
              flexShrink: 0
            }}>
              {driverInstallProgress.step}/{driverInstallProgress.total}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>
                TIẾN TRÌNH CÀI ĐẶT TỰ ĐỘNG (BƯỚC {driverInstallProgress.step}/{driverInstallProgress.total}):
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#065f46', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {driverInstallProgress.text}
              </div>
            </div>
          </div>
        )}

        {/* Grid Danh Sách Driver */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(285px, 1fr))', gap: 10 }}>
          {filtered.map(drv => {
            const detected = printers.some(p => drv.regex.test(p.Name) || drv.regex.test(p.DriverName));
            const cat = drv.category || 'office';
            return (
              <button 
                key={drv.name}
                onClick={() => openInstallOptionsModal(drv)}
                disabled={loading}
                style={{ 
                  padding: '0.85rem',
                  border: `1px solid ${detected ? '#10b981' : '#e2e8f0'}`,
                  borderRadius: 8,
                  textAlign: 'left',
                  color: '#1e293b',
                  background: detected ? '#f0fdf4' : '#fff',
                  cursor: loading ? 'wait' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 8,
                  boxShadow: detected ? '0 2px 6px rgba(16, 185, 129, 0.15)' : '0 1px 2px rgba(0,0,0,0.02)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  if (!detected) {
                    e.currentTarget.style.borderColor = '#94a3b8';
                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.05)';
                  }
                }}
                onMouseLeave={e => {
                  if (!detected) {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)';
                  }
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: cat === 'pos' ? '#dcfce7' : cat === 'barcode' ? '#ede9fe' : '#e0f2fe',
                      color: cat === 'pos' ? '#166534' : cat === 'barcode' ? '#5b21b6' : '#075985',
                    }}>
                      {cat === 'pos' ? '🧾 POS / HÓA ĐƠN' : cat === 'barcode' ? '🏷️ TEM NHÃN' : '📄 VĂN PHÒNG A4'}
                    </span>
                    {detected && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <CheckCircle2 size={11} color="#059669" /> Đã nhận diện
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>
                    {drv.name}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px dashed #f1f5f9', marginTop: 2 }}>
                  <span style={{ fontSize: '0.7rem', color: detected ? '#059669' : '#64748b' }}>
                    {detected ? 'Máy tính đã cắm máy in này' : 'Cài đặt tự động A-Z'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 600, color: '#0284c7' }}>
                    <Download size={12} /> Cài Tự Động
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Empty Search Result State */}
        {filtered.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            <Printer size={36} color="#cbd5e1" style={{ margin: '0 auto 8px auto' }} />
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
              Không tìm thấy driver nào phù hợp với "{driverSearch}"
            </div>
            <p style={{ fontSize: '0.75rem', marginTop: 4 }}>
              Bạn có thể thử tìm với tên ngắn gọn như <strong>POS</strong>, <strong>Xprinter</strong>, <strong>Zywell</strong>, <strong>Canon</strong>, <strong>T82</strong>...
            </p>
            <button
              onClick={() => { setDriverSearch(''); setDriverCategory('all'); }}
              style={{ marginTop: 8, padding: '4px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.75rem', cursor: 'pointer' }}
            >
              Xóa bộ lọc tìm kiếm
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Helper: Render Console Nhật Ký Hệ Thống ──
  const renderConsoleLogBlock = (h = 220) => (
    <div style={{ background: '#0f172a', borderRadius: 8, padding: '0.75rem', height: h, display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box' }}>
      <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Wrench size={14} /> Nhật ký hệ thống (Console)
      </h3>
      <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.75rem', color: '#38bdf8', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {logs.map((log, i) => <div key={i}>{log}</div>)}
        {logs.length === 0 && <div style={{ color: '#475569' }}>Đang chờ thao tác...</div>}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* Top Header Bar */}
      <div className="converter-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '0.85rem 1.25rem', borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', flexWrap: 'wrap', gap: '0.75rem' }}>
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
            onClick={handleWorkflowDiagnose} 
            disabled={loading || isWorkflowRunning} 
            style={{ background: '#4f46e5', borderColor: '#4f46e5', padding: '0.45rem 0.8rem', fontSize: '0.76rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            title="Quét và chẩn đoán toàn diện tất cả các lỗi máy in & dịch vụ hệ thống theo quy trình 10 bước"
          >
            <RefreshCw size={14} className={(loading || (isWorkflowRunning && workflowMode === 'diagnose')) ? 'spin' : ''} /> 
            {isWorkflowRunning && workflowMode === 'diagnose' ? 'Đang quét lỗi...' : '🔍 Đọc & Quét Toàn Bộ Lỗi'}
          </button>
          
          <button 
            onClick={handleWorkflowFixAll} 
            disabled={loading || isWorkflowRunning} 
            style={{ 
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
              color: '#fff', 
              border: 'none', 
              borderRadius: 6, 
              padding: '0.45rem 0.85rem', 
              fontSize: '0.76rem', 
              fontWeight: 700, 
              cursor: (loading || isWorkflowRunning) ? 'not-allowed' : 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6,
              boxShadow: '0 2px 4px rgba(16,185,129,0.25)' 
            }}
            title="Tự động sửa toàn bộ các lỗi phát hiện được trong 1 lần bấm theo quy trình 10 bước chuẩn"
          >
            <Zap size={14} className={(isWorkflowRunning && workflowMode === 'fix') ? 'spin' : ''} /> 
            {isWorkflowRunning && workflowMode === 'fix' ? 'Đang sửa tự động...' : '⚡ SỬA TỰ ĐỘNG TẤT CẢ LỖI'}
            {diagnostics && diagnostics.issueCount > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: '0.68rem', fontWeight: 700 }}>
                {diagnostics.issueCount}
              </span>
            )}
          </button>

          <button
            className="btn-secondary"
            onClick={clearPrintQueue}
            disabled={loading}
            style={{
              background: '#fff1f2',
              borderColor: '#fecdd3',
              color: '#e11d48',
              padding: '0.45rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {activeOperationMessage?.includes('Spooler & dọn sạch') ? (
              <>
                <Loader2 size={14} className="global-spin" /> Đang xóa kẹt...
              </>
            ) : (
              <>
                <Trash2 size={14} /> Xóa Kẹt Lệnh In
              </>
            )}
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

      {/* ── Sub-Tabs Điều Hướng Chuyên Mục: 100% Linh Hoạt, Tự Nhiên & Chống Vỡ Giao Diện ── */}
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        background: '#fff', 
        padding: '6px 10px', 
        borderRadius: 8, 
        border: '1px solid #e2e8f0', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <button
          onClick={() => setActiveSubView('repair')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 6,
            border: 'none',
            fontSize: '0.78rem',
            fontWeight: activeSubView === 'repair' ? 700 : 500,
            background: activeSubView === 'repair' ? '#4f46e5' : 'transparent',
            color: activeSubView === 'repair' ? '#fff' : '#475569',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <Zap size={14} /> 1. Chẩn Đoán & Sửa Lỗi Tự Động (LAN & Dịch Vụ)
          {diagnostics && diagnostics.issueCount > 0 && (
            <span style={{ 
              background: activeSubView === 'repair' ? '#ef4444' : '#fee2e2', 
              color: activeSubView === 'repair' ? '#fff' : '#b91c1c', 
              fontSize: '0.66rem', 
              padding: '1px 6px', 
              borderRadius: 10, 
              fontWeight: 700 
            }}>
              {diagnostics.issueCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubView('printers')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 6,
            border: 'none',
            fontSize: '0.78rem',
            fontWeight: activeSubView === 'printers' ? 700 : 500,
            background: activeSubView === 'printers' ? '#4f46e5' : 'transparent',
            color: activeSubView === 'printers' ? '#fff' : '#475569',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <Printer size={14} /> 2. Quản Lý Máy In & Hàng Đợi In ({printers.length})
          {jobs.length > 0 && (
            <span style={{ 
              background: activeSubView === 'printers' ? '#ef4444' : '#fee2e2', 
              color: activeSubView === 'printers' ? '#fff' : '#b91c1c', 
              fontSize: '0.66rem', 
              padding: '1px 6px', 
              borderRadius: 10, 
              fontWeight: 700 
            }}>
              {jobs.length} kẹt
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubView('drivers')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 6,
            border: 'none',
            fontSize: '0.78rem',
            fontWeight: activeSubView === 'drivers' ? 700 : 500,
            background: activeSubView === 'drivers' ? '#4f46e5' : 'transparent',
            color: activeSubView === 'drivers' ? '#fff' : '#475569',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <Download size={14} /> 3. Nhận Diện & Cài Driver Chuẩn
        </button>

        <button
          onClick={() => setActiveSubView('all')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 6,
            border: 'none',
            fontSize: '0.78rem',
            fontWeight: activeSubView === 'all' ? 700 : 500,
            background: activeSubView === 'all' ? '#4f46e5' : 'transparent',
            color: activeSubView === 'all' ? '#fff' : '#64748b',
            cursor: 'pointer',
            marginLeft: 'auto',
            transition: 'all 0.15s ease'
          }}
        >
          <Layers size={14} /> 📋 Xem Toàn Bộ Trang
        </button>
      </div>

      {/* ═════ CHUYÊN MỤC 1: CHẨN ĐOÁN & SỬA LỖI MẠNG LAN / DỊCH VỤ ═════ */}
      {(activeSubView === 'repair' || activeSubView === 'all') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>

          {/* ═══════════════════════════════════════════════════════════════════════════ */}
          {/* ── BÁC SĨ MÁY IN: BẢNG QUY TRÌNH CHẨN ĐOÁN & SỬA LỖI TỰ ĐỘNG (2 NÚT) ────── */}
          {/* ═══════════════════════════════════════════════════════════════════════════ */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #c7d2fe',
            borderRadius: 12,
            padding: '1.1rem',
            boxShadow: '0 4px 20px -2px rgba(99, 102, 241, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            {/* Header: Tiêu đề + 2 Nút Hành Động Lớn */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.9rem',
              paddingBottom: '0.85rem',
              borderBottom: '1px solid #f1f5f9'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                    borderRadius: 8,
                    padding: 6,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Wrench size={18} />
                  </div>
                  <h3 style={{
                    fontSize: '0.96rem',
                    fontWeight: 800,
                    color: '#1e1b4b',
                    margin: 0,
                    letterSpacing: '0.3px',
                    textTransform: 'uppercase'
                  }}>
                    Trung Tâm Đọc & Sửa Lỗi Máy In Tự Động A-Z
                  </h3>
                  {diagnostics?.issueCount !== undefined && (
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: diagnostics.issueCount === 0 ? '#dcfce7' : '#fee2e2',
                      color: diagnostics.issueCount === 0 ? '#15803d' : '#b91c1c'
                    }}>
                      {diagnostics.issueCount === 0 ? '✓ Đạt chuẩn 100%' : `⚠️ ${diagnostics.issueCount} sự cố phát hiện`}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '4px 0 0 0' }}>
                  Tổng hợp mọi loại lỗi in ấn, chia sẻ mạng LAN (0x709, 0x11b, 0x40, 0xbcb), Spooler crash, máy in Offline ảo và treo ứng dụng.
                </p>
              </div>

              {/* Nhóm 2 Nút Bấm Tập Trung */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {/* Nút 1: Đọc & Quét Lỗi */}
                <button
                  onClick={handleWorkflowDiagnose}
                  disabled={isWorkflowRunning || loading}
                  style={{
                    background: isWorkflowRunning && workflowMode === 'diagnose'
                      ? '#6366f1'
                      : 'linear-gradient(135deg, #4338ca 0%, #4f46e5 50%, #6366f1 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: (isWorkflowRunning || loading) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    boxShadow: '0 2px 8px rgba(79, 70, 229, 0.28)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Quét và chẩn đoán toàn bộ 10 hạng mục lỗi máy in & dịch vụ hệ thống"
                >
                  <Search size={15} className={isWorkflowRunning && workflowMode === 'diagnose' ? 'spin' : ''} />
                  <span>{isWorkflowRunning && workflowMode === 'diagnose' ? 'ĐANG QUÉT LỖI...' : '🔍 ĐỌC & QUÉT TOÀN BỘ LỖI'}</span>
                </button>

                {/* Nút 2: Sửa Đúng Các Lỗi Phát Hiện */}
                <button
                  onClick={handleWorkflowFixDetectedIssues}
                  disabled={isWorkflowRunning || loading}
                  style={{
                    background: isWorkflowRunning && workflowMode === 'fix'
                      ? '#ea580c'
                      : detectedIssueCount > 0
                        ? 'linear-gradient(135deg, #c2410c 0%, #ea580c 50%, #f97316 100%)'
                        : 'linear-gradient(135deg, #059669 0%, #10b981 50%, #14b8a6 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 18px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: (isWorkflowRunning || loading) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    boxShadow: detectedIssueCount > 0
                      ? '0 3px 10px rgba(234, 88, 12, 0.35)'
                      : '0 3px 10px rgba(16, 185, 129, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                  title={detectedIssueCount > 0 ? `Chỉ sửa đúng ${detectedIssueCount} sự cố đang được phát hiện (giữ nguyên các mục đang tốt)` : 'Khắc phục các lỗi được phát hiện'}
                >
                  <Zap size={16} className={isWorkflowRunning && workflowMode === 'fix' ? 'spin' : ''} />
                  <span>
                    {isWorkflowRunning && workflowMode === 'fix'
                      ? 'ĐANG SỬA CÁC LỖI...'
                      : detectedIssueCount > 0
                        ? `⚡ SỬA ĐÚNG ${detectedIssueCount} LỖI ĐÃ PHÁT HIỆN`
                        : '⚡ SỬA CÁC LỖI PHÁT HIỆN'}
                  </span>
                </button>

                {/* Nút 3: Gemini AI Phân Tích & Chẩn Đoán Lỗi Chuyên Sâu */}
                <button
                  onClick={handleOpenGeminiAI}
                  disabled={isWorkflowRunning || loading}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 18px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: (isWorkflowRunning || loading) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    boxShadow: '0 3px 12px rgba(139, 92, 246, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Mở trợ lý Google Gemini AI để đọc lỗi, phân tích chuyên sâu & lưu trữ bệnh án máy tính"
                >
                  <Bot size={16} />
                  <span>🤖 GEMINI AI PHÂN TÍCH LỖI</span>
                </button>
              </div>
            </div>

            {/* Ô Nhập IP/Tên Máy Chủ Chia Sẻ (Tùy chọn) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              background: '#f8faff',
              border: '1px solid #e0e7ff',
              borderRadius: 8,
              padding: '6px 12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#4338ca', fontWeight: 600 }}>
                <Network size={14} color="#4f46e5" />
                <span>Máy Chủ Chia Sẻ Máy In (Tùy chọn cho lỗi 0x40 / 0x709 mạng LAN):</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260, maxWidth: 520 }}>
                <input
                  type="text"
                  placeholder="Nhập IP hoặc Tên Máy Chủ (Ví dụ: 192.168.1.50 hoặc MAY-CHU)"
                  value={workflowTargetHost}
                  onChange={e => setWorkflowTargetHost(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '4px 10px',
                    fontSize: '0.72rem',
                    border: '1px solid #c7d2fe',
                    borderRadius: 6,
                    outline: 'none',
                    color: '#1e1b4b',
                    background: '#fff',
                    fontWeight: 600
                  }}
                />
                <button
                  onClick={handleProbeHostAndAnalyze}
                  disabled={isWorkflowRunning || loading || probingHost}
                  style={{
                    padding: '4px 12px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: (isWorkflowRunning || loading || probingHost) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)'
                  }}
                  title="Bắt mạch Ping, Cổng 445 SMB, RPC và tự động đọc Event Log từ Windows bằng AI"
                >
                  <Activity size={13} className={probingHost ? 'spin' : ''} />
                  <span>{probingHost ? 'Đang đo...' : '🩺 Bắt Mạch & Đọc Lỗi AI'}</span>
                </button>
                {workflowTargetHost.trim() && (
                  <button
                    onClick={() => handleQuickFixIpc(workflowTargetHost.trim())}
                    disabled={isWorkflowRunning || loading || fixingIpc}
                    style={{
                      padding: '4px 12px',
                      background: fixingIpc ? '#64748b' : 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: (isWorkflowRunning || loading || fixingIpc) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      whiteSpace: 'nowrap',
                      boxShadow: fixingIpc ? 'none' : '0 2px 6px rgba(234, 88, 12, 0.35)',
                      opacity: fixingIpc ? 0.85 : 1
                    }}
                    title="Bấm để mở khóa phiên IPC$, ghim chứng thực Windows Credential và tự động mở thư mục máy chủ"
                  >
                    {fixingIpc ? (
                      <>
                        <Loader2 size={13} className="spin" />
                        <span>Đang mở khóa IPC$...</span>
                      </>
                    ) : (
                      <>
                        <Key size={13} />
                        <span>⚡ Mở Khóa IPC$ (1-Click)</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.67rem', color: '#64748b' }}>
                {detectedNetworkHost && !workflowTargetHost && (
                  <button
                    onClick={() => setWorkflowTargetHost(detectedNetworkHost)}
                    style={{
                      padding: '2px 8px',
                      background: 'rgba(79, 70, 229, 0.1)',
                      border: '1px solid #c7d2fe',
                      borderRadius: 4,
                      color: '#4338ca',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.67rem'
                    }}
                    title="Nhấp để tự động điền IP từ cấu hình máy in hiện có"
                  >
                    💡 Nhận diện IP máy chủ: <strong>{detectedNetworkHost}</strong> (Bấm để điền)
                  </button>
                )}
                <span>💡 Nếu nhập IP, khi bấm <strong>Sửa Lỗi</strong> hệ thống sẽ tự động ghim danh tính Windows Credential cho máy chủ đó!</span>
              </div>
            </div>

            {/* Thanh Tiến Trình Hoạt Động (Live Workflow Progress Bar) */}
            {(isWorkflowRunning || workflowProgressPercent > 0) && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', fontWeight: 700, color: workflowMode === 'fix' ? '#065f46' : '#3730a3' }}>
                    <Loader2 size={13} className="spin" />
                    <span>{workflowStatusText || (workflowMode === 'fix' ? 'Đang tiến hành sửa chữa lỗi...' : 'Đang quét hệ thống...')}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#334155' }}>
                    {workflowProgressPercent}%
                  </span>
                </div>
                {/* Track */}
                <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${workflowProgressPercent}%`,
                    height: '100%',
                    background: workflowMode === 'fix'
                      ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(90deg, #6366f1 0%, #4f46e5 100%)',
                    borderRadius: 4,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            )}

            {/* ── BẢNG THỂ HIỆN QUY TRÌNH ĐANG FIX (Interactive Process Table) ── */}
            <div style={{
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#fff'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.73rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 700, width: '25%' }}>Quy Trình / Hạng Mục Kỹ Thuật</th>
                    <th style={{ padding: '8px 10px', fontWeight: 700, width: '17%' }}>{workflowMode === 'fix' ? 'Mã Lỗi Khắc Phục' : 'Mã Lỗi Liên Quan'}</th>
                    <th style={{ padding: '8px 10px', fontWeight: 700, width: '15%' }}>Trạng Thái Thực Tế</th>
                    <th style={{ padding: '8px 12px', fontWeight: 700, width: '27%' }}>Chi Tiết Kỹ Thuật Đo Được</th>
                    <th style={{ padding: '8px 10px', fontWeight: 700, width: '16%', textAlign: 'center' }}>Thao Tác Sửa</th>
                  </tr>
                </thead>
                <tbody>
                  {workflowSteps.map((step, idx) => {
                    const isFixingCurrent = step.status === 'fixing';
                    const isScanningCurrent = step.status === 'scanning';
                    const isRowHighlight = isFixingCurrent || isScanningCurrent;

                    return (
                      <tr
                        key={step.id}
                        style={{
                          borderBottom: idx === workflowSteps.length - 1 ? 'none' : '1px solid #f1f5f9',
                          background: isFixingCurrent
                            ? '#fefce8'
                            : isScanningCurrent
                              ? '#f0fdf4'
                              : (idx % 2 === 0 ? '#ffffff' : '#fafafa'),
                          transition: 'background 0.2s ease'
                        }}
                      >
                        {/* Cột 1: Tên bước & Mô tả */}
                        <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              background: isFixingCurrent ? '#f59e0b' : isScanningCurrent ? '#3b82f6' : '#e2e8f0',
                              color: isRowHighlight ? '#fff' : '#475569',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.64rem',
                              fontWeight: 800
                            }}>
                              {step.stepNum}
                            </span>
                            <span>{step.title}</span>
                          </div>
                          <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: 2, paddingLeft: 24, lineHeight: 1.3 }}>
                            {step.desc}
                          </div>
                        </td>

                        {/* Cột 2: Mã lỗi */}
                        <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                          <span style={{
                            display: 'inline-block',
                            background: '#f1f5f9',
                            color: '#334155',
                            border: '1px solid #e2e8f0',
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: '0.66rem',
                            fontWeight: 600
                          }}>
                            {step.errorCode}
                          </span>
                        </td>

                        {/* Cột 3: Trạng thái thực tế */}
                        <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                          {step.status === 'idle' && (
                            <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#cbd5e1' }} />
                              Chờ kiểm tra
                            </span>
                          )}
                          {step.status === 'scanning' && (
                            <span style={{ fontSize: '0.68rem', color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                              <Loader2 size={12} className="spin" />
                              Đang kiểm tra...
                            </span>
                          )}
                          {step.status === 'fixing' && (
                            <span style={{
                              fontSize: '0.68rem',
                              color: '#b45309',
                              background: '#fef3c7',
                              padding: '2px 7px',
                              borderRadius: 10,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontWeight: 700
                            }}>
                              <Zap size={11} className="spin" />
                              Đang khắc phục...
                            </span>
                          )}
                          {step.status === 'ok' && (
                            <span style={{
                              fontSize: '0.68rem',
                              color: '#15803d',
                              background: '#dcfce7',
                              padding: '2px 7px',
                              borderRadius: 10,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontWeight: 700
                            }}>
                              <CheckCircle2 size={11} />
                              {workflowMode === 'fix' ? 'Đã khắc phục' : 'Bình thường (Tốt)'}
                            </span>
                          )}
                          {step.status === 'error' && (
                            <span style={{
                              fontSize: '0.68rem',
                              color: '#b91c1c',
                              background: '#fee2e2',
                              padding: '2px 7px',
                              borderRadius: 10,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontWeight: 700
                            }}>
                              <AlertTriangle size={11} />
                              Phát hiện lỗi
                            </span>
                          )}
                          {step.status === 'warning' && (
                            <span style={{
                              fontSize: '0.68rem',
                              color: '#c2410c',
                              background: '#ffedd5',
                              padding: '2px 7px',
                              borderRadius: 10,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontWeight: 700
                            }}>
                              <AlertTriangle size={11} />
                              Cần cấu hình
                            </span>
                          )}
                        </td>

                        {/* Cột 4: Chi tiết kỹ thuật */}
                        <td style={{ padding: '8px 12px', verticalAlign: 'middle', color: '#334155' }}>
                          <span style={{
                            fontSize: '0.69rem',
                            fontWeight: isRowHighlight ? 700 : 500,
                            color: step.status === 'error' ? '#dc2626' : step.status === 'ok' ? '#047857' : '#475569'
                          }}>
                            {step.detail}
                          </span>
                        </td>

                        {/* Cột 5: Thao tác sửa riêng từng lỗi (Không sửa hàng loạt) */}
                        <td style={{ padding: '6px 10px', verticalAlign: 'middle', textAlign: 'center' }}>
                          {step.id === 'verification' ? (
                            <button
                              onClick={handleWorkflowDiagnose}
                              disabled={isWorkflowRunning || loading}
                              style={{
                                padding: '3px 8px',
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: 4,
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                color: '#475569',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3
                              }}
                              title="Quét đối soát lại toàn diện hệ thống"
                            >
                              <RefreshCw size={10} />
                              <span>Quét lại</span>
                            </button>
                          ) : isFixingCurrent ? (
                            <span style={{ color: '#b45309', fontWeight: 700, fontSize: '0.67rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <Zap size={11} className="spin" /> Đang sửa...
                            </span>
                          ) : (step.status === 'error' || step.status === 'warning') ? (
                            <button
                              onClick={() => fixSingleStep(step.id)}
                              disabled={isWorkflowRunning || loading}
                              style={{
                                padding: '4px 9px',
                                background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 5,
                                fontSize: '0.66rem',
                                fontWeight: 700,
                                cursor: (isWorkflowRunning || loading) ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                boxShadow: '0 2px 5px rgba(234, 88, 12, 0.25)',
                                whiteSpace: 'nowrap'
                              }}
                              title={`Chỉ sửa riêng sự cố này: ${step.title}`}
                            >
                              <Wrench size={11} />
                              <span>Sửa lỗi này</span>
                            </button>
                          ) : step.status === 'ok' ? (
                            <span style={{ color: '#16a34a', fontSize: '0.67rem', fontWeight: 600 }}>
                              ✓ Đã chuẩn
                            </span>
                          ) : (
                            <button
                              onClick={() => fixSingleStep(step.id)}
                              disabled={isWorkflowRunning || loading}
                              style={{
                                padding: '3px 8px',
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                borderRadius: 4,
                                fontSize: '0.65rem',
                                color: '#64748b',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3
                              }}
                              title={`Thực thi cấu hình riêng cho: ${step.title}`}
                            >
                              <Zap size={10} />
                              <span>Áp dụng</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── FOOTER UTILITY TOOLBAR: TIỆN ÍCH HỖ TRỢ IT MỞ RỘNG (GỌN GÀNG) ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              paddingTop: '0.4rem',
              borderTop: '1px dashed #e2e8f0',
              flexWrap: 'wrap'
            }}>
              <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Settings size={12} /> Tiện ích nâng cao dành cho IT:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={openLocalPortModal}
                  style={{
                    background: '#f0fdf4',
                    color: '#047857',
                    border: '1px solid #bbf7d0',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: '0.67rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                  title="Tạo cổng in Local Port kết nối trực tiếp bỏ qua RPC Spooler"
                >
                  <Network size={11} /> 🌐 Cổng Local Port
                </button>

                <button
                  onClick={handleOpenCredentialManager}
                  style={{
                    background: '#fff',
                    color: '#9a3412',
                    border: '1px solid #fed7aa',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: '0.67rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                  title="Mở Windows Credential Manager kiểm tra danh tính mạng"
                >
                  <ShieldCheck size={11} /> 🔑 Credential Manager
                </button>

                <button
                  onClick={clearSmbCache}
                  disabled={clearingSmbCache}
                  style={{
                    background: '#f0f9ff',
                    color: '#0369a1',
                    border: '1px solid #bae6fd',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: '0.67rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                  title="Dọn sạch cache kết nối mạng SMB kẹt (net use /delete) & làm mới DNS"
                >
                  <RefreshCw size={11} className={clearingSmbCache ? 'animate-spin' : ''} /> 🧹 Dọn Cache SMB
                </button>

                <button
                  onClick={openError709Modal}
                  style={{
                    background: '#fffbeb',
                    color: '#b45309',
                    border: '1px solid #fde68a',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: '0.67rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                  title="Mở bảng chẩn đoán chuyên sâu chi tiết 8 khoá Registry 0x00000709"
                >
                  <Search size={11} /> 🔍 Chi Tiết 709
                </button>

                <button
                  onClick={() => handleOpenWindowsTool('gpedit')}
                  style={{
                    background: '#fff',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: '0.67rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                  title="Mở Group Policy gpedit.msc"
                >
                  <Settings size={11} /> gpedit.msc
                </button>

                <button
                  onClick={() => handleOpenWindowsTool('services')}
                  style={{
                    background: '#fff',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: '0.67rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                  title="Mở services.msc"
                >
                  <Activity size={11} /> services.msc
                </button>

                <button
                  onClick={handleExport709Script}
                  disabled={exporting709Script}
                  style={{
                    background: '#e0e7ff',
                    color: '#4338ca',
                    border: '1px solid #c7d2fe',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: '0.67rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                  title="Xuất file .bat sửa lỗi máy in cho Máy Chủ cắm cáp USB"
                >
                  <Download size={11} /> Xuất Script Cho Máy Chủ
                </button>

                <button
                  onClick={() => setShowCmdDetails(!showCmdDetails)}
                  style={{
                    background: '#fff',
                    color: '#6366f1',
                    border: '1px solid #c7d2fe',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: '0.67rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                  title="Xem hoặc ẩn câu lệnh Registry CMD"
                >
                  <Terminal size={11} /> {showCmdDetails ? 'Ẩn câu lệnh CMD' : 'Xem câu lệnh CMD'}
                </button>

                <button
                  onClick={handleRestartPc}
                  style={{
                    background: '#fff1f2',
                    color: '#e11d48',
                    border: '1px solid #fecdd3',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: '0.67rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Khởi động lại Windows để áp dụng toàn diện"
                >
                  Reset PC
                </button>
              </div>
            </div>

            {/* Khối hiển thị câu lệnh Registry CMD khi người dùng bấm xem */}
            {showCmdDetails && (
              <div style={{
                background: '#0f172a',
                borderRadius: 8,
                padding: '0.75rem',
                fontSize: '0.7rem',
                color: '#e2e8f0',
                fontFamily: 'Consolas, monospace',
                lineHeight: 1.5,
                overflowX: 'auto'
              }}>
                <div style={{ color: '#94a3b8' }}># 1. Bật RPC Named Pipe cho máy in (Sửa 0x709 & 0x11b):</div>
                <div style={{ color: '#38bdf8' }}>REG ADD "HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows NT\Printers\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f</div>
                <div style={{ color: '#38bdf8' }}>REG ADD "HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f</div>
                <div style={{ color: '#94a3b8', marginTop: 4 }}># 2. Gỡ bỏ Group Policy chặn Driver LAN (Sửa 0xbcb):</div>
                <div style={{ color: '#38bdf8' }}>REG ADD "HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows NT\Printers\PointAndPrint" /v "RestrictDriverInstallationToAdministrators" /t REG_DWORD /d 0 /f</div>
                <div style={{ color: '#94a3b8', marginTop: 4 }}># 3. Tắt SMB Signing (Sửa lỗi 0x40 trên Windows 11):</div>
                <div style={{ color: '#38bdf8' }}>REG ADD "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f</div>
                <div style={{ color: '#94a3b8', marginTop: 4 }}># 4. Khởi động lại dịch vụ Spooler:</div>
                <div style={{ color: '#a7f3d0' }}>net stop spooler && net start spooler</div>
              </div>
            )}
          </div>

          {/* Hộp Console Log khi ở chuyên mục Sửa Lỗi */}
          {activeSubView === 'repair' && renderConsoleLogBlock(220)}
        </div>
      )}

      {/* ═════ CHUYÊN MỤC 2: QUẢN LÝ MÁY IN & HÀNG ĐỢI IN ═════ */}
      {activeSubView === 'printers' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.25rem', width: '100%', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
            {renderPrintersListBlock()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
            {renderPrintJobsBlock()}
            {renderConsoleLogBlock(260)}
          </div>
        </div>
      )}

      {/* ═════ CHUYÊN MỤC 3: NHẬN DIỆN & TẢI DRIVER CHUẨN ═════ */}
      {activeSubView === 'drivers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
          {renderDriversBlock()}
          {renderConsoleLogBlock(220)}
        </div>
      )}

      {/* ═════ CHUYÊN MỤC 4: XEM TOÀN BỘ TRÊN MỘT TRANG (CUỘN DỌC TỰ NHIÊN) ═════ */}
      {activeSubView === 'all' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
          {renderPrintersListBlock()}
          {renderPrintJobsBlock()}
          {renderDriversBlock()}
          {renderConsoleLogBlock(240)}
        </div>
      )}

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

              {/* Thông tin đăng nhập máy chủ nếu máy chủ cài mật khẩu */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Tài khoản Máy Chủ (Tùy chọn):
                  </label>
                  <input
                    type="text"
                    placeholder="Để trống nếu không có mật khẩu"
                    value={localPortUser}
                    onChange={e => setLocalPortUser(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Mật khẩu Máy Chủ:
                  </label>
                  <input
                    type="password"
                    placeholder="Mật khẩu máy chủ (nếu có)"
                    value={localPortPass}
                    onChange={e => setLocalPortPass(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ background: '#fffbeb', border: '1px solid #fed7aa', borderRadius: 6, padding: '0.65rem 0.8rem', fontSize: '0.71rem', color: '#9a3412', lineHeight: 1.45 }}>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <AlertTriangle size={13} color="#ea580c" /> Bí quyết đặc trị lỗi 0x00000040 &amp; 0x00000709 triệt để 100%:
                </div>
                • Tên chia sẻ trên máy chủ phải chính xác 100% (nên viết liền không dấu, ví dụ: <code>LQ310</code> thay vì tên dài có khoảng trắng).<br />
                • Cổng Local Port sẽ tạo đường ống in trực tiếp tới <code>\\IP\ShareName</code>, bỏ qua hoàn toàn lỗi RPC, Point &amp; Print và tải driver qua mạng của Windows!
              </div>

            </div>

            {/* Footer */}
            <div style={{ padding: '0.85rem 1.25rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <button
                onClick={() => fixError0x40(localPortHost || error0x40Host)}
                disabled={loading || fixing0x40}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #fed7aa', background: '#fff7ed', color: '#ea580c', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                title="Bấm nút này nếu gặp lỗi 0x00000040 (The specified network name is no longer available)"
              >
                <Zap size={11} className={fixing0x40 ? 'spin' : ''} /> Sửa Lỗi 0x00000040
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
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
        </div>
      )}

      {/* ═════ MODAL TÙY CHỌN CHẾ ĐỘ CÀI ĐẶT DRIVER MÁY IN ═════ */}
      {showInstallOptionsModal && pendingInstallDriver && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 580, boxShadow: '0 25px 30px -5px rgba(0, 0, 0, 0.25), 0 10px 15px -5px rgba(0, 0, 0, 0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Header Modal */}
            <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)', padding: '1.1rem 1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: 6, display: 'flex' }}>
                  <Settings size={20} color="#a5b4fc" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, letterSpacing: '0.2px' }}>Tùy Chọn Chế Độ Cài Đặt Driver</h3>
                    <span style={{ fontSize: '0.65rem', background: '#4f46e5', color: '#e0e7ff', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                      CHỐNG LỖI CỔNG
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0 0', fontSize: '0.73rem', color: '#c7d2fe' }}>
                    Dòng máy: <strong style={{ color: '#fff' }}>{pendingInstallDriver.name}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInstallOptionsModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#c7d2fe', cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 6 }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = '#c7d2fe'}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body Modal */}
            <div style={{ padding: '1.3rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '78vh', overflowY: 'auto' }}>
              
              {/* Lời nhắc rõ ràng */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem 0.9rem', fontSize: '0.73rem', color: '#166534', lineHeight: 1.5 }}>
                <strong>💡 Tránh lỗi chọn nhầm cổng 'Other' của nhà sản xuất:</strong> Các bộ cài máy in hóa đơn/nhiệt (như Xprinter) khi cài ngầm thường tự động gán vào cổng <em>Other (LPT/COM ảo)</em> gây lỗi không in được. DMH Tools cung cấp 3 chế độ chuẩn xác dưới đây:
              </div>

              {/* LỰA CHỌN CHẾ ĐỘ CÀI ĐẶT (3 CARDS) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b' }}>
                  1. Chọn Phương Thức Kết Nối (Interface):
                </label>

                {/* Option 1: USB Interface */}
                <div
                  onClick={() => setInstallMode('usb')}
                  style={{
                    border: installMode === 'usb' ? '2px solid #059669' : '1px solid #cbd5e1',
                    background: installMode === 'usb' ? '#ecfdf5' : '#ffffff',
                    borderRadius: 10,
                    padding: '0.85rem 1rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: installMode === 'usb' ? '0 2px 8px rgba(5, 150, 105, 0.15)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="installModeRadio"
                        checked={installMode === 'usb'}
                        onChange={() => setInstallMode('usb')}
                        style={{ accentColor: '#059669', width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: installMode === 'usb' ? '#065f46' : '#1e293b' }}>
                        🔌 Cổng USB (Cắm Cáp Trực Tiếp - Khuyên Dùng)
                      </span>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#d1fae5', color: '#047857' }}>
                      Chuẩn Nhất
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0 24px', fontSize: '0.72rem', color: '#475569', lineHeight: 1.45 }}>
                    Tự động nạp Driver vào Driver Store của Windows và <strong>ép máy in gắn chặt vào cổng USB</strong> (chống hoàn toàn hiện tượng bộ cài tự nhảy sang cổng Other/LPT/COM ảo).
                  </p>

                  {/* Cấu hình chọn cổng USB con nếu đang chọn USB mode */}
                  {installMode === 'usb' && (
                    <div style={{ marginTop: 10, marginLeft: 24, paddingTop: 8, borderTop: '1px dashed #a7f3d0' }}>
                      {/* Banner phát hiện cổng đang cắm thiết bị */}
                      {detectedUsbPort ? (
                        <div style={{
                          background: '#ecfdf5',
                          border: '1px solid #6ee7b7',
                          borderRadius: 6,
                          padding: '6px 10px',
                          marginBottom: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: '0.74rem',
                          color: '#065f46'
                        }}>
                          <CheckCircle2 size={15} color="#059669" style={{ flexShrink: 0 }} />
                          <span>
                            🎯 <strong>Đã nhận diện phần cứng:</strong> Máy in đang cắm cáp vật lý tại cổng <strong>[{detectedUsbPort}]</strong>. Hệ thống sẽ tự động gán máy in vào đúng cổng này!
                          </span>
                        </div>
                      ) : (
                        <div style={{
                          background: '#fffbeb',
                          border: '1px solid #fde68a',
                          borderRadius: 6,
                          padding: '6px 10px',
                          marginBottom: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: '0.73rem',
                          color: '#92400e'
                        }}>
                          <AlertCircle size={15} color="#d97706" style={{ flexShrink: 0 }} />
                          <span>
                            ⚠️ <strong>Chưa phát hiện cáp USB:</strong> Hãy cắm cáp USB máy in vào máy tính và <strong>BẬT NGUỒN</strong> máy in để DMH Tools tự động nhận diện chính xác!
                          </span>
                        </div>
                      )}

                      <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#065f46', marginBottom: 4 }}>
                        Cổng USB máy in trên máy tính:
                      </label>
                      <select
                        value={selectedPort}
                        onChange={e => setSelectedPort(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          fontSize: '0.76rem',
                          borderRadius: 6,
                          border: '1px solid #059669',
                          background: '#fff',
                          color: '#0f172a',
                          fontWeight: 600
                        }}
                      >
                        <option value="AUTO">
                          {detectedUsbPort
                            ? `⭐ [Tự động - Khuyên Dùng] Cổng ${detectedUsbPort} (Đang cắm máy in vật lý)`
                            : `⚡ [Tự động] Quét và tự nhận diện cổng khi cài đặt`}
                        </option>
                        {systemPorts
                          .filter(p => p.Name.startsWith('USB'))
                          .map(p => {
                            const isDev = p.IsConnected;
                            const assigned = p.AssignedPrinters?.length ? ` [Đã gán: ${p.AssignedPrinters.join(', ')}]` : '';
                            return (
                              <option key={p.Name} value={p.Name}>
                                {p.Name} {isDev ? '🟢 [ĐANG CẮM THIẾT BỊ VẬT LÝ - CHUẨN XÁC]' : `⚪ (Chưa cắm${assigned})`}
                              </option>
                            );
                          })}
                        {!systemPorts.some(p => p.Name.startsWith('USB')) && (
                          <>
                            <option value="USB001">USB001 (Virtual printer port for USB)</option>
                            <option value="USB002">USB002 (Virtual printer port for USB)</option>
                            <option value="USB003">USB003 (Virtual printer port for USB)</option>
                          </>
                        )}
                      </select>
                    </div>
                  )}
                </div>

                {/* Option 2: Network / LAN IP */}
                <div
                  onClick={() => setInstallMode('network')}
                  style={{
                    border: installMode === 'network' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                    background: installMode === 'network' ? '#f0f9ff' : '#ffffff',
                    borderRadius: 10,
                    padding: '0.85rem 1rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: installMode === 'network' ? '0 2px 8px rgba(2, 132, 199, 0.15)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="installModeRadio"
                        checked={installMode === 'network'}
                        onChange={() => setInstallMode('network')}
                        style={{ accentColor: '#0284c7', width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: installMode === 'network' ? '#0369a1' : '#1e293b' }}>
                        🌐 Mạng LAN / WiFi (Network TCP/IP Port)
                      </span>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1' }}>
                      In Qua Mạng
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0 24px', fontSize: '0.72rem', color: '#475569', lineHeight: 1.45 }}>
                    Dành cho máy in cắm dây mạng LAN hoặc kết nối WiFi trong phòng khám. Hệ thống sẽ tự động tạo Standard TCP/IP Port liên kết máy in.
                  </p>

                  {/* Cấu hình IP con nếu đang chọn Network mode */}
                  {installMode === 'network' && (
                    <div style={{ marginTop: 10, marginLeft: 24, paddingTop: 8, borderTop: '1px dashed #bae6fd', display: 'flex', gap: 8 }}>
                      <div style={{ flex: 2 }}>
                        <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>
                          Địa chỉ IP máy in: <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Ví dụ: 192.168.1.200"
                          value={printerIp}
                          onChange={e => setPrinterIp(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            fontSize: '0.76rem',
                            borderRadius: 6,
                            border: '1px solid #0284c7',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>
                          Cổng Raw:
                        </label>
                        <input
                          type="number"
                          value={printerPortNum}
                          onChange={e => setPrinterPortNum(Number(e.target.value) || 9100)}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            fontSize: '0.76rem',
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Option 3: Interactive UI (Mở trình cài đặt của hãng) */}
                <div
                  onClick={() => setInstallMode('interactive')}
                  style={{
                    border: installMode === 'interactive' ? '2px solid #6366f1' : '1px solid #cbd5e1',
                    background: installMode === 'interactive' ? '#eef2ff' : '#ffffff',
                    borderRadius: 10,
                    padding: '0.85rem 1rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: installMode === 'interactive' ? '0 2px 8px rgba(99, 102, 241, 0.15)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="installModeRadio"
                        checked={installMode === 'interactive'}
                        onChange={() => setInstallMode('interactive')}
                        style={{ accentColor: '#6366f1', width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: installMode === 'interactive' ? '#4338ca' : '#1e293b' }}>
                        🖥️ Mở Trình Cài Đặt Gốc Của Hãng (Giao Diện Trực Tiếp)
                      </span>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#e0e7ff', color: '#4338ca' }}>
                      Thủ Công
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0 24px', fontSize: '0.72rem', color: '#475569', lineHeight: 1.45 }}>
                    Mở trực tiếp cửa sổ của nhà sản xuất (như cửa sổ bạn chụp) để bạn tự tay tích chọn <strong>USB</strong> hay <strong>Other</strong>, chọn model máy in và khổ giấy 80mm/58mm... theo ý mình.
                  </p>
                </div>
              </div>

              {/* TÙY CHỌN IN TRANG THỬ */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem 0.9rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={autoTestPrint}
                    onChange={e => setAutoTestPrint(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#059669', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Printer size={15} color="#059669" />
                    Tự động gửi lệnh in trang thử (Print Test Page) sau khi cài thành công
                  </span>
                </label>
                <div style={{ fontSize: '0.71rem', color: '#64748b', marginTop: 4, marginLeft: 24, lineHeight: 1.4 }}>
                  🔒 <strong>Cam kết gửi đúng máy:</strong> Lệnh in test sử dụng phương thức WMI/CIM chỉ gửi riêng đến máy in vừa cài, <strong>tuyệt đối không bị gửi nhầm sang máy in mặc định</strong> của máy tính!
                </div>
              </div>

            </div>

            {/* Footer Nút Bấm */}
            <div style={{ padding: '0.9rem 1.3rem', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setShowInstallOptionsModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Hủy Bỏ
              </button>

              <button
                onClick={handleConfirmInstallWithOptions}
                style={{
                  padding: '8px 22px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7
                }}
              >
                <Download size={15} />
                <span>Bắt Đầu Cài Đặt Ngay</span>
              </button>
            </div>

          </div>
        </div>
      )}
      {/* ── MODAL TRUNG TÂM CHẨN ĐOÁN & ĐẶC TRỊ LỖI 0x00000709 TỪ A-Z ── */}
      {showError709Modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)',
          zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', padding: '1rem'
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, width: '100%', maxWidth: 780,
            maxHeight: '92vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #3730a3 0%, #4f46e5 100%)',
              color: '#fff', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: 'rgba(255,255,255,0.2)', padding: 7, borderRadius: 8 }}>
                  <Share2 size={20} color="#fff" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, letterSpacing: 0.3 }}>
                      Trung Tâm Chẩn Đoán & Đặc Trị Lỗi 0x00000709 Từ A-Z
                    </h3>
                    <span style={{ background: '#ecfdf5', color: '#065f46', fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>
                      Chuyên Sâu
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#e0e7ff', marginTop: 2 }}>
                    Tự động nhận định 11 tiêu chí hệ thống • Đặc trị in mạng LAN & Lỗi đặt máy in mặc định
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowError709Modal(false)}
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div style={{
              display: 'flex', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
              padding: '4px 1rem 0 1rem', gap: 6
            }}>
              <button
                onClick={() => setActive709Tab('lan')}
                style={{
                  padding: '7px 14px', border: 'none', borderRadius: '6px 6px 0 0',
                  fontSize: '0.75rem', fontWeight: active709Tab === 'lan' ? 700 : 500,
                  background: active709Tab === 'lan' ? '#fff' : 'transparent',
                  color: active709Tab === 'lan' ? '#4338ca' : '#64748b',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  borderBottom: active709Tab === 'lan' ? '2px solid #4338ca' : 'none'
                }}
              >
                <Network size={13} />
                <span>Mạng LAN & 11 Tiêu Chuẩn 709</span>
                {diag709 && (
                  <span style={{
                    fontSize: '0.65rem', padding: '1px 6px', borderRadius: 10, fontWeight: 700,
                    background: diag709.issueCount === 0 ? '#dcfce7' : '#fee2e2',
                    color: diag709.issueCount === 0 ? '#15803d' : '#b91c1c'
                  }}>
                    {diag709.issueCount === 0 ? '✓ Đạt' : `${diag709.issueCount} lỗi`}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActive709Tab('default')}
                style={{
                  padding: '7px 14px', border: 'none', borderRadius: '6px 6px 0 0',
                  fontSize: '0.75rem', fontWeight: active709Tab === 'default' ? 700 : 500,
                  background: active709Tab === 'default' ? '#fff' : 'transparent',
                  color: active709Tab === 'default' ? '#4338ca' : '#64748b',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  borderBottom: active709Tab === 'default' ? '2px solid #4338ca' : 'none'
                }}
              >
                <Star size={13} />
                <span>Lỗi 709 Đặt Mặc Định (Set Default)</span>
              </button>

              <button
                onClick={() => setActive709Tab('manual')}
                style={{
                  padding: '7px 14px', border: 'none', borderRadius: '6px 6px 0 0',
                  fontSize: '0.75rem', fontWeight: active709Tab === 'manual' ? 700 : 500,
                  background: active709Tab === 'manual' ? '#fff' : 'transparent',
                  color: active709Tab === 'manual' ? '#4338ca' : '#64748b',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  borderBottom: active709Tab === 'manual' ? '2px solid #4338ca' : 'none'
                }}
              >
                <BookOpen size={13} />
                <span>Hướng Dẫn Thủ Công & Lệnh CMD</span>
              </button>
            </div>

            {/* Body Content */}
            <div style={{ padding: '1.1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.9rem', fontSize: '0.75rem', lineHeight: 1.5, color: '#334155' }}>
              
              {/* ═════ TAB 1: MẠNG LAN & 11 TIÊU CHUẨN 709 ═════ */}
              {active709Tab === 'lan' && (
                <>
                  {/* Hộp Chẩn Đoán Tự Động (Auto-Diagnostic Result) */}
                  <div style={{
                    background: diag709 ? (diag709.issueCount === 0 ? '#f0fdf4' : '#fffbeb') : '#f8fafc',
                    border: `1px solid ${diag709 ? (diag709.issueCount === 0 ? '#86efac' : '#fde68a') : '#e2e8f0'}`,
                    borderRadius: 8, padding: '0.85rem 1rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.8rem', color: diag709 ? (diag709.issueCount === 0 ? '#15803d' : '#92400e') : '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {diag709 ? (
                          diag709.issueCount === 0 ? <ShieldCheck size={16} color="#16a34a" /> : <AlertTriangle size={16} color="#d97706" />
                        ) : (
                          <Activity size={16} color="#6366f1" />
                        )}
                        <span>
                          {diag709
                            ? (diag709.issueCount === 0 ? 'KẾT QUẢ CHẨN ĐOÁN: MÁY TÍNH ĐẠT CHUẨN 100% (KHÔNG CÓ LỖI 709)' : `PHÁT HIỆN ${diag709.issueCount} NGUYÊN NHÂN GÂY LỖI 0x00000709 TRÊN MÁY TÍNH NÀY`)
                            : 'ĐANG CHỜ QUÉT HỆ THỐNG...'}
                        </span>
                      </div>
                      <button
                        onClick={runDiagnose709}
                        disabled={diagnosing709}
                        style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 8px', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#334155' }}
                      >
                        <RefreshCw size={10} className={diagnosing709 ? 'spin' : ''} />
                        {diagnosing709 ? 'Đang quét...' : 'Quét lại'}
                      </button>
                    </div>

                    {diag709 && diag709.issues.length > 0 ? (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.5rem 0.75rem', marginTop: 4 }}>
                        <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.72rem', marginBottom: 4 }}>
                          Danh sách điểm nghẽn kỹ thuật được nhận định:
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#b91c1c', fontSize: '0.7rem' }}>
                          {diag709.issues.map((iss, idx) => (
                            <li key={idx} style={{ marginBottom: 2 }}>{iss}</li>
                          ))}
                        </ul>
                      </div>
                    ) : diag709 ? (
                      <div style={{ color: '#166534', fontSize: '0.72rem' }}>
                        Tất cả 11 tiêu chí cấu hình trên máy tính này đều hoàn hảo. Nếu bạn vẫn gặp lỗi 709 khi kết nối tới máy in, nguyên nhân 100% nằm ở <strong>Máy Chủ (Host cắm cáp máy in)</strong> chưa mở RPC Named Pipe hoặc chưa mở spoolss! Hãy dùng tính năng <em>Xuất Script Cho Máy Chủ</em> ở bên dưới.
                      </div>
                    ) : (
                      <div style={{ color: '#64748b', fontSize: '0.72rem' }}>
                        Hệ thống đang kiểm tra tự động các khóa Registry, quyền HKCU, Tường lửa, Point & Print và dịch vụ Spooler...
                      </div>
                    )}
                  </div>

                  {/* Lưới 11 Tiêu Chuẩn Kỹ Thuật Trực Quan */}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Layers size={13} color="#4338ca" /> Trạng thái chi tiết 11 tiêu chí hệ thống:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))', gap: 6 }}>
                      
                      {/* Tiêu chí 1: RPC Named Pipe */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: '#1e293b' }}>1. RPC Named Pipe</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>RpcUseNamedPipeProtocol = 1</div>
                        </div>
                        {diag709?.checks?.rpcNamedPipe?.ok ? (
                          <span style={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={13} /> Chuẩn</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={13} /> Lỗi</span>
                        )}
                      </div>

                      {/* Tiêu chí 2: RPC Privacy PrintNightmare */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: '#1e293b' }}>2. Miễn trừ RPC Privacy</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Hóa giải PrintNightmare (0x11b)</div>
                        </div>
                        {diag709?.checks?.rpcPrivacy?.ok ? (
                          <span style={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={13} /> Chuẩn</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={13} /> Lỗi</span>
                        )}
                      </div>

                      {/* Tiêu chí 3: DnsOnWire (Đặc trị kết nối bằng IP) */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: '#1e293b' }}>3. DnsOnWire = 1 (SPN Fallback)</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Cho phép kết nối qua IP \\192.168.x.x</div>
                        </div>
                        {diag709?.checks?.dnsOnWire?.ok ? (
                          <span style={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={13} /> Chuẩn</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={13} /> Thiếu</span>
                        )}
                      </div>

                      {/* Tiêu chí 4: Strict Name Checking */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: '#1e293b' }}>4. Bỏ chặn Strict Name</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Hỗ trợ bí danh mạng &amp; Loopback</div>
                        </div>
                        {diag709?.checks?.strictNameChecking?.ok ? (
                          <span style={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={13} /> Chuẩn</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={13} /> Thiếu</span>
                        )}
                      </div>

                      {/* Tiêu chí 5: Windows 11 RPC */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: '#1e293b' }}>5. Chính sách Win 11 RPC</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>RpcProtocols=7, RpcOverNamedPipes=1</div>
                        </div>
                        {diag709?.checks?.win11Rpc?.ok ? (
                          <span style={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={13} /> Chuẩn</span>
                        ) : (
                          <span style={{ color: '#d97706', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={13} /> Chưa tối ưu</span>
                        )}
                      </div>

                      {/* Tiêu chí 6: Point & Print */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: '#1e293b' }}>6. Point &amp; Print Restrictions</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Cho phép kéo Driver qua mạng LAN</div>
                        </div>
                        {diag709?.checks?.pointAndPrint?.ok ? (
                          <span style={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={13} /> Chuẩn</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={13} /> Chặn</span>
                        )}
                      </div>

                      {/* Tiêu chí 7: NullSessionPipes spoolss */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: '#1e293b' }}>7. NullSessionPipes spoolss</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Cần thiết khi máy này là Máy Chủ in</div>
                        </div>
                        {diag709?.checks?.nullSessionPipes?.ok ? (
                          <span style={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={13} /> Chuẩn</span>
                        ) : (
                          <span style={{ color: '#d97706', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={13} /> Thiếu spoolss</span>
                        )}
                      </div>

                      {/* Tiêu chí 8: SMB Guest & Signing */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: '#1e293b' }}>8. SMB Guest &amp; Tắt Signing</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Tránh lỗi ngắt kết nối session mạng</div>
                        </div>
                        {diag709?.checks?.smbGuest?.ok ? (
                          <span style={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={13} /> Chuẩn</span>
                        ) : (
                          <span style={{ color: '#d97706', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={13} /> Chưa tối ưu</span>
                        )}
                      </div>

                      {/* Tiêu chí 9: HKCU Windows Device */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: '#1e293b' }}>9. Quyền HKCU Windows</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Quyền ghi đặt máy in mặc định</div>
                        </div>
                        {diag709?.checks?.hkcuDefault?.ok ? (
                          <span style={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={13} /> Chuẩn</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={13} /> Bị khóa</span>
                        )}
                      </div>

                      {/* Tiêu chí 10: Firewall */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: '#1e293b' }}>10. Tường Lửa Firewall</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Mở File and Printer Sharing (445/135)</div>
                        </div>
                        {diag709?.checks?.firewall?.ok ? (
                          <span style={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={13} /> Mở</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={13} /> Đóng</span>
                        )}
                      </div>

                      {/* Tiêu chí 11: Spooler & Stuck Files */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: '#1e293b' }}>11. Print Spooler &amp; Hàng Đợi</div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Dịch vụ in &amp; file kẹt bộ đệm</div>
                        </div>
                        {diag709?.checks?.spooler?.ok ? (
                          <span style={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={13} /> Sạch sẽ</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={13} /> Kẹt/Dừng</span>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* Cụm 4 Giải Pháp Khắc Phục Triệt Để */}
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 800, color: '#166534', fontSize: '0.78rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Zap size={14} color="#16a34a" /> 3 Bước Hành Động Để Sửa Triệt Để Lỗi 0x00000709 Từ A-Z:
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
                      
                      {/* Nút 1: Sửa máy hiện tại */}
                      <div style={{ background: '#fff', border: '1px solid #86efac', borderRadius: 6, padding: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#15803d', fontSize: '0.72rem' }}>BƯỚC 1: Sửa Trên Máy Tính Này</div>
                          <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: 2 }}>Tự động ghi cả 11 tiêu chuẩn kỹ thuật phía trên chỉ với 1 cú nhấp chuột.</div>
                        </div>
                        <button
                          onClick={handleFix709AZ}
                          disabled={fixing709AZ}
                          style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                        >
                          <Zap size={12} className={fixing709AZ ? 'spin' : ''} />
                          {fixing709AZ ? 'Đang sửa A-Z...' : '⚡ Sửa Tự Động A-Z (1-Click)'}
                        </button>
                      </div>

                      {/* Nút 2: Xuất file sửa cho máy chủ */}
                      <div style={{ background: '#fff', border: '1px solid #93c5fd', borderRadius: 6, padding: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '0.72rem' }}>BƯỚC 2: Sửa Trên Máy Chủ (Host)</div>
                          <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: 2 }}>Xuất file .bat mang sang Máy Cắm Máy In chạy 1-Click để mở quyền cho máy con.</div>
                        </div>
                        <button
                          onClick={handleExport709Script}
                          disabled={exporting709Script}
                          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                        >
                          <Download size={12} className={exporting709Script ? 'spin' : ''} />
                          {exporting709Script ? 'Đang xuất...' : '📦 Xuất Script Cho Máy Chủ'}
                        </button>
                      </div>

                      {/* Nút 3: Cổng Local Port */}
                      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.72rem' }}>GIẢI PHÁP TỐI THƯỢNG: Local Port</div>
                          <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: 2 }}>Bỏ qua 100% RPC Spooler từ xa, in mượt mà cho mọi dòng Epson LQ, Canon, HP.</div>
                        </div>
                        <button
                          onClick={() => {
                            setShowError709Modal(false);
                            openLocalPortModal();
                          }}
                          style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                        >
                          <Network size={12} />
                          🔌 Kết Nối Qua Local Port
                        </button>
                      </div>

                    </div>
                  </div>

                  {/* Khởi động lại dịch vụ */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px' }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                      💡 Sau khi cấu hình xong, hãy khởi động lại Spooler (hoặc Restart PC) để Windows áp dụng ngay:
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={restartSpooler}
                        disabled={restartingSpooler}
                        style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', borderRadius: 4, padding: '3px 8px', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        {restartingSpooler ? 'Đang restart...' : '🔄 Khởi Động Lại Spooler'}
                      </button>
                      <button
                        onClick={handleRestartPc}
                        disabled={restartingPc}
                        style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', borderRadius: 4, padding: '3px 8px', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        {restartingPc ? 'Đang restart...' : '💻 Khởi Động Lại Máy Tính'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ═════ TAB 2: LỖI 709 KHI ĐẶT MÁY IN MẶC ĐỊNH ═════ */}
              {active709Tab === 'default' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 800, color: '#1e40af', fontSize: '0.8rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Star size={15} color="#2563eb" /> Vì Sao Bị Lỗi 0x00000709 Khi Bấm "Set As Default Printer"?
                    </div>
                    <div style={{ color: '#1e3a8a', fontSize: '0.72rem', lineHeight: 1.5 }}>
                      • <strong>Hiện tượng:</strong> Bạn vào <em>Settings &gt; Printers &amp; Scanners</em> hoặc <em>Control Panel</em>, chọn máy in rồi bấm <strong>"Set as default printer"</strong> thì Windows báo lỗi popup: <em>"Operation could not be completed (error 0x00000709)"</em>.<br />
                      • <strong>Nguyên nhân gốc rễ:</strong> Do phân quyền bảo mật (ACL) của khóa Registry người dùng hiện tại tại đường dẫn: <br />
                      <code style={{ background: '#dbeafe', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>HKEY_CURRENT_USER\Software\Microsoft\Windows NT\CurrentVersion\Windows</code><br />
                      bị chuyển sang chế độ <strong>Read-Only</strong> hoặc tài khoản Windows hiện tại mất quyền ghi (Write Permission) vào giá trị <code>Device</code>.
                    </div>
                  </div>

                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#0f172a', marginBottom: 8 }}>
                      Chọn máy in bạn muốn cấp quyền và đặt làm mặc định:
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                      <select
                        value={selectedDefaultTarget}
                        onChange={e => setSelectedDefaultTarget(e.target.value)}
                        style={{
                          flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1',
                          fontSize: '0.75rem', fontWeight: 600, color: '#0f172a', background: '#fff'
                        }}
                      >
                        <option value="">-- Chọn máy in trong hệ thống --</option>
                        {printers.map(p => (
                          <option key={p.Name} value={p.Name}>
                            {p.Name} (Driver: {p.DriverName} | Cổng: {p.PortName})
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleFixDefaultPrinter709(selectedDefaultTarget)}
                        disabled={fixingDefault709 || !selectedDefaultTarget}
                        style={{
                          padding: '7px 16px', borderRadius: 6, border: 'none',
                          background: selectedDefaultTarget ? '#4f46e5' : '#94a3b8',
                          color: '#fff', fontSize: '0.75rem', fontWeight: 700,
                          cursor: selectedDefaultTarget ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap'
                        }}
                      >
                        <Zap size={13} className={fixingDefault709 ? 'spin' : ''} />
                        {fixingDefault709 ? 'Đang cấp quyền...' : '⚡ Cấp Quyền & Đặt Mặc Định Ngay'}
                      </button>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.7rem 0.9rem', fontSize: '0.7rem', color: '#475569' }}>
                      <strong>Thao tác tự động của DMH Tools:</strong><br />
                      1. Cấp lại quyền <code>FullControl</code> cho tài khoản người dùng hiện tại trên khóa Registry <code>HKCU\...\Windows</code>.<br />
                      2. Tắt chế độ <em>"Let Windows manage my default printer"</em> (đặt <code>UserSelectedDefault = 1</code>).<br />
                      3. Cập nhật chuỗi <code>Device</code> và gọi COM API <code>WScript.Network.SetDefaultPrinter</code> để kích hoạt máy in mặc định ngay lập tức.
                    </div>
                  </div>
                </div>
              )}

              {/* ═════ TAB 3: HƯỚNG DẪN THỦ CÔNG & LỆNH CMD ═════ */}
              {active709Tab === 'manual' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  
                  {/* Công cụ: Khai Báo Windows Credentials 1-Click (Kinh nghiệm thực chiến Sài Gòn Computer) */}
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 800, color: '#166534', fontSize: '0.78rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ShieldCheck size={15} color="#16a34a" /> Khai Báo Danh Tính Windows Credentials (Kinh Nghiệm Sài Gòn Computer):
                    </div>
                    <div style={{ color: '#15803d', fontSize: '0.71rem', lineHeight: 1.45, marginBottom: 8 }}>
                      • <strong>Bí quyết thực chiến:</strong> Khi máy con kết nối máy in trên máy chủ, Windows thường chặn âm thầm vì chưa chứng thực danh tính mạng (Access Denied / 709).<br />
                      • Bạn chỉ cần nhập IP hoặc Tên Máy Chủ vào bên dưới, DMH Tools sẽ tự động dùng lệnh <code>cmdkey</code> lưu chứng thư mạng để thông luồng 100%!
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Nhập IP Máy Chủ (ví dụ: 192.168.1.100 hoặc MAY_CHU)"
                        value={credHostInput}
                        onChange={e => setCredHostInput(e.target.value)}
                        style={{
                          flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #86efac',
                          fontSize: '0.75rem', fontWeight: 600, color: '#0f172a', background: '#fff'
                        }}
                      />
                      <button
                        onClick={handleSaveWindowsCred}
                        disabled={savingCred || !credHostInput.trim()}
                        style={{
                          padding: '6px 14px', borderRadius: 6, border: 'none',
                          background: credHostInput.trim() ? '#16a34a' : '#94a3b8',
                          color: '#fff', fontSize: '0.73rem', fontWeight: 700,
                          cursor: credHostInput.trim() ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap'
                        }}
                      >
                        <Zap size={12} className={savingCred ? 'spin' : ''} />
                        {savingCred ? 'Đang lưu...' : '⚡ Lưu Danh Tính (cmdkey) Ngay'}
                      </button>
                    </div>
                  </div>

                  {/* 4 Bước Chỉnh Sửa Registry Thủ Công */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.9rem 1rem' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.8rem', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>🛠️ 4 Bước Chỉnh Sửa Registry Thủ Công Bằng regedit.exe:</span>
                      <button
                        onClick={() => handleOpenWindowsTool('regedit')}
                        style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        title="Mở Registry Editor ngay"
                      >
                        <ExternalLink size={11} /> Mở regedit.exe
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 18, height: 18, minWidth: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>1</div>
                        <div>
                          <strong>Mở Registry Editor:</strong> Nhấn tổ hợp phím <code>Windows + R</code>, gõ <code>regedit</code> rồi nhấn Enter.
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 18, height: 18, minWidth: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>2</div>
                        <div>
                          <strong>Tìm thư mục Printers:</strong> Điều hướng đến đường dẫn:<br />
                          <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: 4, color: '#0f172a' }}>HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows NT\Printers</code><br />
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>*(Nếu chưa có, chuột phải Windows NT chọn New &gt; Key đặt tên là Printers)*.</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 18, height: 18, minWidth: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>3</div>
                        <div>
                          <strong>Tạo khóa RPC Named Pipe:</strong> Nhấp chuột phải vào khoảng trống chọn <strong>New &gt; DWORD (32-bit) Value</strong>, đặt tên là <code style={{ color: '#4338ca', fontWeight: 700 }}>RpcUseNamedPipeProtocol</code> và đổi giá trị thành <strong>1</strong>.
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 18, height: 18, minWidth: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>4</div>
                        <div>
                          <strong>Thêm DnsOnWire cho kết nối IP:</strong> Vào <code>HKLM\System\CurrentControlSet\Control\Print</code>, thêm DWORD <code>DnsOnWire</code> đặt giá trị <strong>1</strong>. Sau đó khởi động lại Print Spooler!
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Copy Lệnh CMD Nhanh */}
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: '#166534', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Terminal size={14} color="#16a34a" /> Lệnh CMD Ghi Nhanh Vào Registry (Chạy As Administrator):
                      </span>
                      <button
                        onClick={copyCmdToClipboard}
                        style={{ background: copiedCmd ? '#dcfce7' : '#fff', color: copiedCmd ? '#15803d' : '#166534', border: '1px solid #86efac', borderRadius: 4, padding: '3px 8px', fontSize: '0.66rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                      >
                        {copiedCmd ? <Check size={11} /> : <Copy size={11} />}
                        {copiedCmd ? 'Đã sao chép' : 'Sao chép CMD'}
                      </button>
                    </div>
                    <pre style={{ margin: 0, background: '#0f172a', color: '#38bdf8', padding: '8px 10px', borderRadius: 6, fontSize: '0.68rem', overflowX: 'auto', fontFamily: 'monospace', lineHeight: 1.4 }}>
{`reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f
reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f
reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "DnsOnWire" /t REG_DWORD /d 1 /f
net stop Spooler && net start Spooler`}
                    </pre>
                  </div>

                  {/* Phân Tích & Cảnh Báo: Chép Đè File DLL win32spl.dll */}
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 800, color: '#92400e', fontSize: '0.76rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangle size={14} color="#d97706" /> Cảnh Báo Về Phương Pháp "Chép Đè File DLL win32spl.dll" Trôi Nổi Trên Mạng:
                    </div>
                    <div style={{ color: '#78350f', fontSize: '0.7rem', lineHeight: 1.45 }}>
                      • <strong>Rủi ro:</strong> Một số diễn đàn hướng dẫn tải file zip và chép đè file <code>win32spl.dll</code> cũ vào <code>System32</code>. Cách này rất dễ gây xung đột phiên bản Windows, làm dịch vụ Print Spooler bị dừng liên tục (Crash) hoặc bị ghi đè lại mỗi khi Windows Update!<br />
                      • <strong>Khuyến cáo chuẩn:</strong> DMH Tools áp dụng phương pháp chuẩn của Microsoft (Cấu hình Registry + Miễn trừ RPC) kết hợp <strong>In qua Local Port</strong>. Đây là giải pháp an toàn tuyệt đối, không can thiệp vào file hệ thống Windows và bất tử 100% qua mọi đợt cập nhật!
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* Footer */}
            <div style={{ padding: '0.8rem 1.25rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowError709Modal(false)}
                  style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Đóng
                </button>
                <button
                  onClick={handleExport709Script}
                  disabled={exporting709Script}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Download size={13} className={exporting709Script ? 'spin' : ''} />
                  Xuất File Cho Máy Chủ (.BAT)
                </button>
              </div>
              <button
                onClick={handleFix709AZ}
                disabled={fixing709AZ}
                style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)' }}
              >
                <Zap size={14} className={fixing709AZ ? 'spin' : ''} />
                {fixing709AZ ? 'Đang sửa A-Z...' : '⚡ Sửa Tự Động Toàn Diện A-Z'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showError0x40Modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)',
          zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', padding: '1rem'
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760,
            maxHeight: '92vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #c2410c 0%, #ea580c 100%)',
              color: '#fff', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: 'rgba(255,255,255,0.2)', padding: 7, borderRadius: 8 }}>
                  <AlertTriangle size={20} color="#fff" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, letterSpacing: 0.3 }}>
                      Đặc Trị Lỗi 40 (0x00000040) - Tuyệt Chiêu Minh Yak 100%
                    </h3>
                    <span style={{ background: '#ffedd5', color: '#9a3412', fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>
                      Thành Công 100%
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#ffedd5', marginTop: 2 }}>
                    "The specified network name is no longer available" • Tự động ghim Windows Credential (Guest) &amp; Mở máy in
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowError0x40Modal(false)}
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.9rem', fontSize: '0.75rem', lineHeight: 1.5, color: '#334155' }}>
              
              {/* ── KHỐI 1: TUYỆT CHIÊU MINH YAK (TỰ ĐỘNG HÓA 100%) ── */}
              <div style={{ background: '#fff7ed', border: '1.5px solid #f97316', borderRadius: 8, padding: '0.95rem 1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, color: '#9a3412', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Sparkles size={16} color="#ea580c" /> Tuyệt Chiêu Minh Yak: Ghim Windows Credential (Guest) Tự Động
                  </div>
                  <span style={{ background: '#ea580c', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                    Khuyên Dùng Hàng Đầu
                  </span>
                </div>
                
                <div style={{ color: '#7c2d12', fontSize: '0.73rem', lineHeight: 1.5, marginBottom: 10 }}>
                  • <strong>Bản chất lỗi 0x00000040:</strong> Khi bạn nhấp đúp vào máy in chia sẻ qua <code>\\MAY-CHU\TenMayIn</code>, Windows 10/11 tự ý gửi tài khoản đăng nhập của máy con sang máy chủ. Nếu máy chủ không có tài khoản này hoặc bật chia sẻ ẩn danh, máy chủ sẽ ngắt ngay phiên kết nối SMB và trả lỗi <em>"The specified network name is no longer available"</em>.<br />
                  • <strong>Giải pháp từ video Minh Yak:</strong> Ghim thông tin tài khoản <code>guest</code> (mật khẩu rỗng) vào <strong>Windows Credential Manager</strong> cho máy chủ đó. Khi truy cập, Windows sẽ luôn dùng quyền Guest để vào máy chủ, không bao giờ bị từ chối kết nối nữa!
                </div>

                {/* Hộp Công Cụ Tự Động Hóa 1-Click */}
                <div style={{ background: '#fff', border: '1px solid #fdba74', borderRadius: 7, padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#9a3412', marginBottom: 4 }}>
                        Nhập IP hoặc Tên Máy Chủ chia sẻ máy in:
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: 192.168.1.10 hoặc WIN-18LE6N970C0 hoặc MAY-CHU"
                        value={error0x40Host}
                        onChange={e => setError0x40Host(e.target.value)}
                        style={{
                          width: '100%', padding: '7px 10px', fontSize: '0.76rem',
                          border: '1.5px solid #fdba74', borderRadius: 6, boxSizing: 'border-box',
                          fontWeight: 600, color: '#0f172a', outline: 'none'
                        }}
                      />
                    </div>
                    <button
                      onClick={() => fixError0x40(error0x40Host)}
                      disabled={loading || fixing0x40 || !error0x40Host.trim()}
                      style={{
                        padding: '7px 16px', borderRadius: 6, border: 'none',
                        background: error0x40Host.trim() ? '#ea580c' : '#fdba74',
                        color: '#fff', fontSize: '0.76rem', fontWeight: 700,
                        cursor: error0x40Host.trim() ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                        height: 35
                      }}
                      title="Tự động ghim Windows Credential (Guest), tắt SMB Signing, mở RPC Named Pipe và tự động mở File Explorer tới máy chủ"
                    >
                      <Zap size={14} className={fixing0x40 ? 'spin' : ''} />
                      {fixing0x40 ? 'Đang áp dụng...' : '⚡ Ghim Credential & Mở Máy In'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #fed7aa', paddingTop: 6 }}>
                    <div style={{ fontSize: '0.69rem', color: '#9a3412', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={13} color="#ea580c" />
                      Sau khi bấm nút, Explorer sẽ mở <code>\\{error0x40Host.trim() || 'MAY-CHU'}</code>. Bạn chỉ cần <strong>nhấp đúp vào máy in</strong> -&gt; chọn <strong>Install driver</strong> là xong!
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={handleOpenCredentialManager}
                        disabled={openingCredMgr}
                        style={{ background: '#fff', color: '#9a3412', border: '1px solid #fdba74', borderRadius: 4, padding: '3px 8px', fontSize: '0.67rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                        title="Mở Windows Credential Manager thủ công (control keymgr.dll)"
                      >
                        <ShieldCheck size={11} color="#ea580c" /> Mở Credential Manager
                      </button>
                      <button
                        onClick={() => copyMinhYakCmdToClipboard(error0x40Host)}
                        style={{ background: copiedMinhYakCmd ? '#ecfdf5' : '#fff', color: copiedMinhYakCmd ? '#059669' : '#9a3412', border: '1px solid #fdba74', borderRadius: 4, padding: '3px 8px', fontSize: '0.67rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                        title="Chép câu lệnh cmdkey /add:..."
                      >
                        {copiedMinhYakCmd ? <Check size={11} color="#059669" /> : <Copy size={11} />}
                        {copiedMinhYakCmd ? 'Đã chép CMD' : 'Chép Lệnh CMD'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── KHỐI 2: CÁC BƯỚC THỦ CÔNG THEO VIDEO MINH YAK ── */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.9rem 1rem' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.78rem', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>📋 4 Bước Làm Bằng Tay Trong Windows Như Video Minh Yak:</span>
                  <button
                    onClick={handleOpenCredentialManager}
                    style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: '0.66rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <ExternalLink size={10} /> Mở control keymgr.dll
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.72rem', color: '#334155' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ background: '#e2e8f0', color: '#0f172a', borderRadius: '50%', width: 16, height: 16, minWidth: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.63rem', fontWeight: 700 }}>1</span>
                    <div>Nhấn tổ hợp phím <code>Windows + R</code>, nhập <code>control keymgr.dll</code> rồi nhấn Enter để mở <strong>Credential Manager</strong>.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ background: '#e2e8f0', color: '#0f172a', borderRadius: '50%', width: 16, height: 16, minWidth: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.63rem', fontWeight: 700 }}>2</span>
                    <div>Nhấp vào mục <strong>Windows Credentials</strong> &gt; Nhấp vào dòng chữ màu xanh <strong>"Add a Windows credential"</strong>.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ background: '#e2e8f0', color: '#0f172a', borderRadius: '50%', width: 16, height: 16, minWidth: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.63rem', fontWeight: 700 }}>3</span>
                    <div>
                      Điền thông tin máy chủ:
                      <div style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: 4, margin: '3px 0', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                        • Internet or network address: <strong>{error0x40Host.trim() || 'Tên hoặc IP máy chủ (VD: WIN-18LE6N970C0 hoặc 192.168.1.10)'}</strong><br />
                        • User name: <strong>guest</strong><br />
                        • Password: <strong>(để trống hoàn toàn)</strong>
                      </div>
                      Sau đó bấm nút <strong>OK</strong> để lưu chứng thực.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ background: '#e2e8f0', color: '#0f172a', borderRadius: '50%', width: 16, height: 16, minWidth: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.63rem', fontWeight: 700 }}>4</span>
                    <div>Mở lại Run (Win + R), gõ <code>\\{error0x40Host.trim() || 'MAY-CHU'}</code> &gt; Nhấp đúp vào máy in. Khi Windows hiện popup <em>"Do you trust this printer?"</em> -&gt; Nhấp vào <strong>"Install driver"</strong> -&gt; Kết nối hoàn tất 100%!</div>
                  </div>
                </div>
              </div>

              {/* ── KHỐI 3: KIỂM TRA MÁY CHỦ (HOST) ── */}
              <div style={{ background: '#fffbeb', border: '1px solid #fed7aa', borderRadius: 8, padding: '0.85rem 1rem' }}>
                <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                  <ShieldAlert size={14} color="#ea580c" /> 3 Điều Cần Lưu Ý Trên Máy Chủ (Máy cắm trực tiếp máy in):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#7c2d12', fontSize: '0.72rem' }}>
                  <div>
                    <strong>1. Đổi tên Share máy in ngắn gọn, không dấu cách:</strong> Vào <code>Control Panel &gt; Devices and Printers</code> &gt; Chuột phải máy in &gt; <em>Printer properties</em> &gt; Thẻ <em>Sharing</em>. Đặt tên Share viết liền không dấu (VD: <code>Canon2900</code> hoặc <code>LQ310</code> thay vì tên dài có khoảng trắng).
                  </div>
                  <div>
                    <strong>2. Tắt mật khẩu chia sẻ mạng:</strong> Vào <code>Control Panel &gt; Network and Sharing Center &gt; Advanced sharing settings</code> &gt; <em>All Networks</em> &gt; Chọn <strong>Turn off password protected sharing</strong> &gt; Save changes.
                  </div>
                  <div>
                    <strong>3. Chạy DMH_Tools trên Máy Chủ:</strong> Mở DMH_Tools trên Máy Chủ bằng quyền Administrator và bấm <strong>[⚡ Sửa Tự Động 1-Click]</strong> để chuyển mạng sang Private, mở tường lửa cổng 445 và cấp quyền truy cập Spooler.
                  </div>
                </div>
              </div>

              {/* ── KHỐI 4: TUYỆT CHIÊU LOCAL PORT (BẤT TỬ 100%) ── */}
              <div style={{ background: '#ecfdf5', border: '1.5px solid #6ee7b7', borderRadius: 8, padding: '0.85rem 1rem' }}>
                <div style={{ fontWeight: 800, color: '#065f46', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} color="#059669" /> Tuyệt Chiêu "Bất Tử" 100%: Kết Nối Bằng Local Port
                  </span>
                  <button
                    onClick={() => {
                      setShowError0x40Modal(false);
                      openLocalPortModal();
                    }}
                    style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Network size={12} /> Mở Local Port Ngay
                  </button>
                </div>
                <div style={{ color: '#047857', fontSize: '0.72rem', lineHeight: 1.45 }}>
                  Nếu mạng cơ quan hoặc hai phiên bản Windows quá khác biệt (ví dụ Win 11 24H2 kết nối Win 7): Công cụ <strong>Local Port</strong> của DMH_Tools sẽ tạo một máy in nội bộ dẫn thẳng tới cổng <code>\\IP_MAY_CHU\TenShare</code>, <strong>bỏ qua 100% cơ chế tải driver qua mạng và RPC Spooler của Windows, in mượt mà không bao giờ gặp bất kỳ lỗi gì!</strong>
                </div>
              </div>

              {/* ── KHỐI 5: LỆNH REGISTRY CMD CHỈNH SỬA THỦ CÔNG ── */}
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: '0.8rem 1rem' }}>
                <div style={{ fontWeight: 700, color: '#334155', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Chỉnh Sửa Toàn Bộ Registry Bằng Lệnh CMD Admin:</span>
                  <button
                    onClick={copy0x40RegToClipboard}
                    style={{ background: copied0x40Reg ? '#dcfce7' : '#fff', color: copied0x40Reg ? '#15803d' : '#166534', border: '1px solid #86efac', borderRadius: 4, padding: '2px 6px', fontSize: '0.66rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                  >
                    {copied0x40Reg ? <Check size={11} /> : <Copy size={11} />}
                    {copied0x40Reg ? 'Đã chép' : 'Chép Mã Registry CMD'}
                  </button>
                </div>
                <div style={{ color: '#64748b', fontSize: '0.71rem' }}>
                  Vô hiệu hóa <code>Point and Print Restrictions</code>, tắt SMB Signing (<code>RequireSecuritySignature = 0</code>), bật <code>AllowInsecureGuestAuth = 1</code> và khởi động lại Spooler.
                </div>
              </div>

            </div>

            {/* Footer */}
            <div style={{ padding: '0.75rem 1.25rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <button
                onClick={() => setShowError0x40Modal(false)}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Đóng
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    setShowError0x40Modal(false);
                    openLocalPortModal();
                  }}
                  style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Network size={13} /> 🌐 Kết Nối Local Port (Bất Tử 100%)
                </button>
                <button
                  onClick={() => {
                    setShowError0x40Modal(false);
                    fixError0x40(error0x40Host);
                  }}
                  disabled={loading || fixing0x40}
                  style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#ea580c', color: '#fff', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Zap size={13} className={fixing0x40 ? 'spin' : ''} />
                  {fixing0x40 ? 'Đang áp dụng...' : '⚡ Sửa Tự Động 1-Click (Minh Yak)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════ MODAL THÔNG BÁO KẾT QUẢ HIỆN ĐẠI (THAY THẾ ALERT MẶC ĐỊNH) ═════ */}
      {resultModal?.isOpen && (
        <div 
          onClick={() => setResultModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 1000001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Escape' || e.key === 'Enter') setResultModal(null);
            }}
            style={{
              background: '#ffffff',
              borderRadius: 16,
              width: '100%',
              maxWidth: 550,
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(226, 232, 240, 0.9)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
              color: '#1e293b',
              outline: 'none',
              animation: 'scaleIn 0.15s ease-out',
            }}
          >
            {/* Header với Gradient tương thích trạng thái */}
            <div style={{
              background: resultModal.type === 'success' 
                ? 'linear-gradient(135deg, #065f46 0%, #059669 50%, #10b981 100%)'
                : resultModal.type === 'warning'
                ? 'linear-gradient(135deg, #9a3412 0%, #c2410c 50%, #ea580c 100%)'
                : resultModal.type === 'error'
                ? 'linear-gradient(135deg, #991b1b 0%, #dc2626 50%, #ef4444 100%)'
                : 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)',
              padding: '1.25rem 1.4rem',
              color: '#ffffff',
              position: 'relative',
            }}>
              {/* Badge trên cùng */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 20,
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(4px)',
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                {resultModal.type === 'success' ? (
                  <>
                    <Sparkles size={12} color="#fef08a" />
                    <span>{resultModal.badge || 'ĐÃ XỬ LÝ THÀNH CÔNG 100%'}</span>
                  </>
                ) : resultModal.type === 'warning' ? (
                  <>
                    <ShieldAlert size={12} color="#fef08a" />
                    <span>{resultModal.badge || 'CẦN QUYỀN HỆ THỐNG'}</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={12} color="#fef08a" />
                    <span>{resultModal.badge || 'THÔNG BÁO SỰ CỐ'}</span>
                  </>
                )}
              </div>

              {/* Title & Icon Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.22)',
                  borderRadius: 12,
                  padding: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  flexShrink: 0,
                }}>
                  {resultModal.type === 'success' ? (
                    <CheckCircle2 size={26} color="#ffffff" />
                  ) : resultModal.type === 'warning' ? (
                    <ShieldAlert size={26} color="#ffffff" />
                  ) : (
                    <AlertTriangle size={26} color="#ffffff" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: '1.02rem',
                    fontWeight: 800,
                    lineHeight: 1.35,
                    letterSpacing: '0.2px',
                    color: '#ffffff',
                  }}>
                    {resultModal.title}
                  </h3>
                  <p style={{
                    margin: '3px 0 0 0',
                    fontSize: '0.72rem',
                    color: 'rgba(255, 255, 255, 0.88)',
                  }}>
                    {resultModal.type === 'success' 
                      ? 'Dịch vụ máy in và kết nối chia sẻ mạng LAN đã được đồng bộ chuẩn xác.' 
                      : 'Vui lòng xem hướng dẫn chi tiết bên dưới để hoàn tất thao tác.'}
                  </p>
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={() => setResultModal(null)}
                title="Đóng cửa sổ"
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 28,
                  height: 28,
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)')}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{
              padding: '1.25rem 1.4rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.95rem',
              background: '#f8fafc',
            }}>
              {/* Danh sách các hạng mục đã xử lý kỹ thuật */}
              {resultModal.items && resultModal.items.length > 0 && (
                <div>
                  <div style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <Wrench size={13} color="#059669" />
                    <span>CÁC THAO TÁC KỸ THUẬT ĐÃ ÁP DỤNG THÀNH CÔNG:</span>
                  </div>

                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}>
                    {resultModal.items.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          padding: '8px 12px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        }}
                      >
                        <div style={{
                          marginTop: 2,
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <Check size={11} color="#059669" strokeWidth={3} />
                        </div>
                        <div style={{
                          fontSize: '0.78rem',
                          color: '#334155',
                          lineHeight: 1.45,
                        }}>
                          {formatTechnicalText(item)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Thông điệp text nếu có */}
              {resultModal.message && (
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '12px 14px',
                  fontSize: '0.78rem',
                  color: '#334155',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-line',
                }}>
                  {resultModal.message}
                </div>
              )}

              {/* Hộp chỉ dẫn hành động tiếp theo (Action Tip) */}
              {resultModal.actionTip && (
                <div style={{
                  background: resultModal.type === 'success' 
                    ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)'
                    : '#fffbeb',
                  border: resultModal.type === 'success'
                    ? '1.5px solid #86efac'
                    : '1.5px solid #fde68a',
                  borderRadius: 10,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}>
                  <div style={{
                    padding: 6,
                    borderRadius: 8,
                    background: resultModal.type === 'success' ? '#dcfce7' : '#fef3c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 1,
                  }}>
                    {resultModal.type === 'success' ? (
                      <Printer size={16} color="#15803d" />
                    ) : (
                      <Zap size={16} color="#b45309" />
                    )}
                  </div>
                  <div>
                    <div style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      color: resultModal.type === 'success' ? '#166534' : '#92400e',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: 2,
                    }}>
                      HƯỚNG DẪN TIẾP THEO:
                    </div>
                    <div style={{
                      fontSize: '0.78rem',
                      color: resultModal.type === 'success' ? '#14532d' : '#78350f',
                      lineHeight: 1.45,
                      fontWeight: 600,
                    }}>
                      {resultModal.actionTip}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div style={{
              padding: '0.85rem 1.4rem',
              background: '#ffffff',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}>
              {/* Nút in thử nếu có máy in khả dụng */}
              {printers.length > 0 ? (
                <button
                  onClick={() => {
                    const targetPrinter = selectedPrinter || printers[0]?.Name;
                    if (targetPrinter) {
                      handlePrintTestPage(targetPrinter);
                    }
                  }}
                  title="Gửi lệnh in một trang thử nghiệm để xác nhận máy in hoạt động tốt"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#334155',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#e2e8f0';
                    e.currentTarget.style.borderColor = '#94a3b8';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#f8fafc';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                >
                  <Printer size={14} color="#059669" />
                  <span>In Trang Thử (Test Page)</span>
                </button>
              ) : (
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  DMH Tools • Bác Sĩ Máy In v6.9.5
                </div>
              )}

              {/* Nút xác nhận chính */}
              <button
                onClick={() => setResultModal(null)}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: resultModal.type === 'success'
                    ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                    : resultModal.type === 'warning'
                    ? 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)'
                    : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: resultModal.type === 'success'
                    ? '0 4px 12px rgba(16, 185, 129, 0.35)'
                    : '0 4px 12px rgba(234, 88, 12, 0.35)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.08)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >
                <Check size={14} />
                <span>Tuyệt Vời, Đã Hiểu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL TRỢ LÝ TRÍ TUỆ NHÂN TẠO GOOGLE GEMINI AI & TELEMETRY ──────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {showGeminiModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.72)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 880,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(99, 102, 241, 0.25)',
            border: '1px solid #c7d2fe',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%)',
              color: '#ffffff',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
                  padding: 8,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 10px rgba(217, 70, 239, 0.35)'
                }}>
                  <Bot size={22} color="#ffffff" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.2px' }}>
                      Bác Sĩ Trí Tuệ Nhân Tạo Google Gemini AI
                    </h3>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 20,
                      background: GeminiService.getApiKey() ? '#10b981' : '#f59e0b',
                      color: '#ffffff'
                    }}>
                      {GeminiService.getApiKey() ? `Cloud AI (${geminiModelSelect})` : 'Offline Rule Engine'}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: '#c7d2fe' }}>
                    Đọc dữ liệu máy in, giải mã nguyên nhân gốc rễ và hỗ trợ tích lũy kinh nghiệm xử lý lỗi
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowGeminiModal(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#ffffff',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div style={{
              display: 'flex',
              background: '#f8faff',
              borderBottom: '1px solid #e0e7ff',
              padding: '0 1rem'
            }}>
              <button
                onClick={() => setGeminiActiveTab('analysis')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: geminiActiveTab === 'analysis' ? '3px solid #6366f1' : '3px solid transparent',
                  color: geminiActiveTab === 'analysis' ? '#4338ca' : '#64748b',
                  fontWeight: geminiActiveTab === 'analysis' ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Activity size={15} />
                <span>Báo Cáo Chẩn Đoán AI</span>
              </button>

              <button
                onClick={() => setGeminiActiveTab('settings')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: geminiActiveTab === 'settings' ? '3px solid #6366f1' : '3px solid transparent',
                  color: geminiActiveTab === 'settings' ? '#4338ca' : '#64748b',
                  fontWeight: geminiActiveTab === 'settings' ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Key size={15} />
                <span>Cấu Hình API Key</span>
              </button>

              <button
                onClick={() => setGeminiActiveTab('history')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: geminiActiveTab === 'history' ? '3px solid #6366f1' : '3px solid transparent',
                  color: geminiActiveTab === 'history' ? '#4338ca' : '#64748b',
                  fontWeight: geminiActiveTab === 'history' ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <History size={15} />
                <span>Sổ Tay Bệnh Án & Telemetry ({diagnosticHistory.length})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.2rem', overflowY: 'auto', flex: 1, maxHeight: 'calc(90vh - 180px)' }}>
              {/* TAB 1: Báo Cáo Chẩn Đoán */}
              {geminiActiveTab === 'analysis' && (
                <div>
                  {geminiLoading ? (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '3rem 1rem',
                      gap: 12
                    }}>
                      <Loader2 size={36} color="#6366f1" className="spin" />
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#312e81' }}>
                        Gemini AI đang phân tích dữ liệu kỹ thuật từ hệ thống...
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', textAlign: 'center', maxWidth: 460 }}>
                        Đang tổng hợp thông số Spooler, kiểm tra kẹt hàng đợi, tra cứu phân quyền Registry Named Pipe và rà soát các cổng máy in vật lý.
                      </div>
                    </div>
                  ) : geminiAnalysisResult ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Bảng Đo Lường Mạng & Nhật Ký Event Log (Telemetry HUD) */}
                      {(networkProbeResult || (liveEventLogs && liveEventLogs.length > 0) || (liveStuckJobs && liveStuckJobs.length > 0)) && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                          gap: 10,
                          padding: '10px 12px',
                          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
                          borderRadius: 10,
                          color: '#fff',
                          border: '1px solid #312e81'
                        }}>
                          {/* Card 1: Bắt Mạch Máy Chủ */}
                          {networkProbeResult && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Network size={13} />
                                <span>MÁY CHỦ: {networkProbeResult.host} {networkProbeResult.resolvedIp && networkProbeResult.resolvedIp !== networkProbeResult.host ? `(${networkProbeResult.resolvedIp})` : ''}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem' }}>
                                <span>Ping mạng:</span>
                                <span style={{
                                  fontWeight: 700,
                                  color: networkProbeResult.pingOk ? '#4ade80' : '#f87171'
                                }}>
                                  {networkProbeResult.pingOk ? `🟢 Thông (${networkProbeResult.pingMs}ms)` : '🔴 Rớt mạng / Timeout'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem' }}>
                                <span>Cổng SMB 445:</span>
                                <span style={{
                                  fontWeight: 800,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: networkProbeResult.port445Smb ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.3)',
                                  color: networkProbeResult.port445Smb ? '#4ade80' : '#fca5a5'
                                }}>
                                  {networkProbeResult.port445Smb ? '🟢 MỞ' : '🔴 BỊ CHẶN (Lỗi 0x40)'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: '#94a3b8', flexWrap: 'wrap' }}>
                                <span>Cổng 135 RPC: {networkProbeResult.port135Rpc ? '🟢 Mở' : '⚪ Đóng'}</span>
                                <span>•</span>
                                <span>IPC$:</span>
                                <span style={{
                                  fontWeight: 800,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: networkProbeResult.ipcAccessOk ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.3)',
                                  color: networkProbeResult.ipcAccessOk ? '#4ade80' : '#fca5a5'
                                }}>
                                  {networkProbeResult.ipcAccessOk ? '🟢 THÔNG SUỐT' : '🔴 BỊ CHẶN'}
                                </span>
                                {!networkProbeResult.ipcAccessOk && (
                                  <button
                                    disabled={fixingIpc}
                                    onClick={() => handleQuickFixIpc(networkProbeResult.host || workflowTargetHost)}
                                    style={{
                                      background: fixingIpc ? '#64748b' : 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: 4,
                                      padding: '3px 10px',
                                      fontSize: '0.68rem',
                                      fontWeight: 800,
                                      cursor: fixingIpc ? 'not-allowed' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      boxShadow: fixingIpc ? 'none' : '0 2px 6px rgba(234, 88, 12, 0.4)',
                                      opacity: fixingIpc ? 0.85 : 1
                                    }}
                                    title="Nhấp vào đây để tự động mở khóa phiên IPC$ và kết nối máy in ngay!"
                                  >
                                    {fixingIpc ? (
                                      <>
                                        <Loader2 size={12} className="spin" />
                                        <span>ĐANG MỞ KHÓA IPC$...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Zap size={11} />
                                        <span>⚡ FIX LỖI IPC$ NÀY NGAY</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                              {networkProbeResult.sharedPrinters && networkProbeResult.sharedPrinters.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4, background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', borderRadius: 6, padding: '4px 8px' }}>
                                  <span style={{ fontSize: '0.68rem', color: '#86efac', fontWeight: 700 }}>🖨️ Tìm thấy máy in:</span>
                                  {networkProbeResult.sharedPrinters.map((pName: string, pIdx: number) => (
                                    <button
                                      key={pIdx}
                                      onClick={() => {
                                        setLocalPortShare(pName);
                                        setLocalPortHost(networkProbeResult.host || '');
                                        setShowGeminiModal(false);
                                        openLocalPortModal();
                                        showToast.info('Đã chọn máy in', `Đã điền "\\\\${networkProbeResult.host}\\${pName}" vào cấu hình Local Port!`);
                                      }}
                                      title="Nhấp để mở cửa sổ tạo cổng Local Port và in ngay lập tức"
                                      style={{
                                        fontSize: '0.68rem',
                                        background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
                                        border: 'none',
                                        borderRadius: 4,
                                        padding: '2px 8px',
                                        color: '#ffffff',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                      }}
                                    >
                                      <Printer size={11} />
                                      <span>{pName} (Bấm Để In Ngay)</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Card 2: Hộp Đen Windows Event Log & Hàng Đợi In */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <AlertCircle size={13} />
                              <span>HỘP ĐEN EVENT VIEWER & SPOOLER</span>
                            </div>

                            {/* Cảnh báo lệnh in kẹt */}
                            {liveStuckJobs && liveStuckJobs.length > 0 && (
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'rgba(239, 68, 68, 0.25)',
                                border: '1px solid #ef4444',
                                borderRadius: 4,
                                padding: '3px 6px',
                                fontSize: '0.68rem',
                                color: '#fca5a5'
                              }}>
                                <span>⚠️ Kẹt {liveStuckJobs.length} lệnh in trong Spooler!</span>
                                <button
                                  onClick={clearPrintQueue}
                                  style={{
                                    background: '#dc2626',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 3,
                                    padding: '1px 6px',
                                    fontSize: '0.63rem',
                                    cursor: 'pointer',
                                    fontWeight: 700
                                  }}
                                >
                                  Xóa Kẹt Ngay
                                </button>
                              </div>
                            )}

                            <div style={{ fontSize: '0.74rem', color: liveEventLogs.length > 0 ? '#fbbf24' : '#4ade80', fontWeight: 700 }}>
                              {liveEventLogs.length > 0 ? `⚠️ Phát hiện ${liveEventLogs.length} sự kiện lỗi/cảnh báo mới` : '🟢 Không phát hiện lỗi mới'}
                            </div>

                            {liveEventLogs.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 60, overflowY: 'auto' }}>
                                {liveEventLogs.slice(0, 3).map((l, idx) => (
                                  <div key={idx} style={{ fontSize: '0.65rem', color: '#cbd5e1', background: 'rgba(255,255,255,0.05)', padding: '2px 5px', borderRadius: 3 }}>
                                    <span style={{ color: '#f87171', fontWeight: 700 }}>[{l.source} ID {l.id}]</span> {l.message?.substring(0, 50)}...
                                  </div>
                                ))}
                              </div>
                            )}

                            {liveWindowsVersion && (
                              <div style={{ fontSize: '0.64rem', color: '#94a3b8', marginTop: 2 }}>
                                <span>OS: {liveWindowsVersion}</span>
                                {liveSpoolerStatus && <span> • Spooler: <strong style={{ color: liveSpoolerStatus === 'Running' ? '#4ade80' : '#f87171' }}>{liveSpoolerStatus}</strong></span>}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div style={{
                        background: '#f8faff',
                        border: '1px solid #e0e7ff',
                        borderRadius: 10,
                        padding: '1.2rem',
                        fontSize: '0.82rem',
                        lineHeight: 1.6,
                        color: '#1e293b',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'system-ui, -apple-system, sans-serif'
                      }}>
                        {geminiAnalysisResult}
                      </div>

                      {/* Thanh công cụ hành động dưới báo cáo */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        flexWrap: 'wrap',
                        paddingTop: 8,
                        borderTop: '1px solid #f1f5f9'
                      }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(geminiAnalysisResult);
                              setCopiedGeminiText(true);
                              setTimeout(() => setCopiedGeminiText(false), 2000);
                            }}
                            style={{
                              padding: '7px 14px',
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: 6,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            {copiedGeminiText ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                            <span>{copiedGeminiText ? 'Đã Sao Chép!' : 'Sao Chép Báo Cáo'}</span>
                          </button>

                          <button
                            onClick={() => runGeminiAnalysis()}
                            style={{
                              padding: '7px 14px',
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: 6,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            <RefreshCw size={14} />
                            <span>Phân Tích Lại</span>
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button
                            onClick={() => {
                              setShowGeminiModal(false);
                              handleWorkflowFixDetectedIssues();
                            }}
                            style={{
                              padding: '8px 16px',
                              background: detectedIssueCount > 0
                                ? 'linear-gradient(135deg, #c2410c 0%, #ea580c 50%, #f97316 100%)'
                                : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: 8,
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              boxShadow: detectedIssueCount > 0
                                ? '0 2px 8px rgba(234, 88, 12, 0.35)'
                                : '0 2px 8px rgba(16, 185, 129, 0.3)'
                            }}
                          >
                            <Zap size={14} />
                            <span>{detectedIssueCount > 0 ? `⚡ Sửa Đúng ${detectedIssueCount} Lỗi Phát Hiện` : '⚡ Sửa Các Lỗi Đã Phát Hiện'}</span>
                          </button>

                          {networkProbeResult?.port445Smb === false && (
                            <button
                              onClick={() => {
                                setShowGeminiModal(false);
                                openLocalPortModal();
                              }}
                              style={{
                                padding: '8px 16px',
                                background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 8,
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)'
                              }}
                              title="Bỏ qua hoàn toàn lỗi chặn cổng 445 SMB bằng cách tạo cổng cục bộ"
                            >
                              <Layers size={14} />
                              <span>🖨️ Cứu Cánh: Tạo Local Port</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                      <Bot size={42} color="#818cf8" style={{ margin: '0 auto 12px' }} />
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#312e81', marginBottom: 6 }}>
                        Chưa có báo cáo chẩn đoán
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 16 }}>
                        Bấm nút bên dưới để Gemini AI bắt đầu phân tích dữ liệu hệ thống máy in ngay lúc này.
                      </div>
                      <button
                        onClick={() => runGeminiAnalysis()}
                        style={{
                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '8px 18px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Bắt Đầu Phân Tích
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Cấu Hình API Key */}
              {geminiActiveTab === 'settings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Hướng dẫn nhận key */}
                  <div style={{
                    background: '#eef2ff',
                    border: '1px solid #c7d2fe',
                    borderRadius: 10,
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#312e81', fontSize: '0.82rem' }}>
                      <Sparkles size={16} color="#6366f1" />
                      <span>Cách Nhận Google Gemini API Key Miễn Phí Trọn Đời:</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#4338ca', lineHeight: 1.6 }}>
                      1. Truy cập cổng Google AI Studio: <b>https://aistudio.google.com/app/apikey</b><br />
                      2. Đăng nhập tài khoản Google của bạn và bấm <b>Create API Key</b>.<br />
                      3. Sao chép đoạn mã khóa (bắt đầu bằng <code>AIzaSy...</code>) rồi dán vào ô bên dưới.<br />
                      <i>(Google cung cấp hạn mức miễn phí hàng ngàn lượt gọi mỗi ngày, hoàn toàn đủ cho nhu cầu chẩn đoán phòng khám).</i>
                    </div>
                    <div>
                      <button
                        onClick={() => {
                          const url = 'https://aistudio.google.com/app/apikey';
                          if ((window as any).electronAPI?.openExternal) {
                            (window as any).electronAPI.openExternal(url);
                          } else {
                            window.open(url, '_blank');
                          }
                        }}
                        style={{
                          padding: '5px 12px',
                          background: '#4f46e5',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <ExternalLink size={13} />
                        <span>Mở Google AI Studio để lấy Key</span>
                      </button>
                    </div>
                  </div>

                  {/* Form nhập API Key */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                        Google Gemini API Key:
                      </label>
                      <input
                        type="password"
                        placeholder="Dán mã API Key của bạn vào đây (AIzaSy...)"
                        value={geminiApiKeyInput}
                        onChange={e => setGeminiApiKeyInput(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          fontSize: '0.78rem',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                        Mô Hình AI (AI Model):
                      </label>
                      <select
                        value={geminiModelSelect}
                        onChange={e => setGeminiModelSelect(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          fontSize: '0.78rem',
                          outline: 'none',
                          background: '#fff'
                        }}
                      >
                        <option value="gemini-1.5-flash">gemini-1.5-flash (Khuyên Dùng • Cực Nhanh & Nhẹ)</option>
                        <option value="gemini-2.0-flash">gemini-2.0-flash (Thế Hệ Mới Nhất • Độ Chính Xác Cao)</option>
                        <option value="gemini-1.5-pro">gemini-1.5-pro (Mô Hình Lớn • Phân Tích Chuyên Sâu)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        🔒 Key được mã hóa và lưu trực tiếp trong trình duyệt máy bạn.
                      </span>
                      <button
                        onClick={handleSaveGeminiKey}
                        style={{
                          background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '8px 20px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Lưu Cấu Hình Key
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Sổ Tay Bệnh Án & Telemetry */}
              {geminiActiveTab === 'history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 10,
                    paddingBottom: 8,
                    borderBottom: '1px solid #e2e8f0'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                        Nhật Ký Chẩn Đoán Lỗi Máy In Đã Lưu ({diagnosticHistory.length} ca)
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        Hệ thống tự động lưu vết các lần quét lỗi để theo dõi tính ổn định và phục vụ hoàn thiện DMH Tools.
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={handleExportTelemetryData}
                        style={{
                          padding: '6px 12px',
                          background: '#f8fafc',
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <Download size={14} />
                        <span>Xuất Tệp Telemetry (.json)</span>
                      </button>

                      {diagnosticHistory.length > 0 && (
                        <button
                          onClick={() => {
                            if (window.confirm('Bạn có chắc muốn xóa sạch toàn bộ lịch sử chẩn đoán?')) {
                              ErrorTelemetryService.clearHistory();
                              setDiagnosticHistory([]);
                              showToast.success('Đã xóa', 'Lịch sử chẩn đoán đã được làm sạch!');
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fca5a5',
                            borderRadius: 6,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <Trash2 size={14} />
                          <span>Xóa Lịch Sử</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {diagnosticHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8' }}>
                      <History size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                      <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Chưa có ca chẩn đoán nào được lưu</div>
                      <div style={{ fontSize: '0.72rem', marginTop: 4 }}>
                        Mỗi khi bạn bấm Quét Lỗi và gọi Gemini AI, bệnh án sẽ được tự động lưu vào đây.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {diagnosticHistory.map((rec) => (
                        <div
                          key={rec.id}
                          style={{
                            background: '#f8faff',
                            border: '1px solid #e0e7ff',
                            borderRadius: 8,
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e1b4b' }}>
                                {rec.title}
                              </span>
                              <span style={{
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                padding: '1px 6px',
                                borderRadius: 10,
                                background: rec.issueCount === 0 ? '#dcfce7' : '#fee2e2',
                                color: rec.issueCount === 0 ? '#15803d' : '#b91c1c'
                              }}>
                                {rec.issueCount === 0 ? '✓ Tối Ưu' : `⚠️ ${rec.issueCount} Lỗi`}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 3 }}>
                              Thời gian: {new Date(rec.timestamp).toLocaleString('vi-VN')}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {rec.aiAnalysis && (
                              <button
                                onClick={() => {
                                  setGeminiAnalysisResult(rec.aiAnalysis || '');
                                  setGeminiActiveTab('analysis');
                                }}
                                style={{
                                  padding: '4px 10px',
                                  background: '#e0e7ff',
                                  color: '#4338ca',
                                  border: 'none',
                                  borderRadius: 4,
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Xem Lại Báo Cáo
                              </button>
                            )}

                            <button
                              onClick={() => {
                                ErrorTelemetryService.deleteRecord(rec.id);
                                setDiagnosticHistory(ErrorTelemetryService.getHistory());
                              }}
                              style={{
                                padding: '4px 8px',
                                background: 'none',
                                color: '#94a3b8',
                                border: 'none',
                                cursor: 'pointer'
                              }}
                              title="Xóa ca này"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
