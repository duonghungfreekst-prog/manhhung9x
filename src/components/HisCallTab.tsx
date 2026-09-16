import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Volume2, Settings, Play, History, Plus, Save,
  Database, RefreshCw, Wifi, WifiOff, Bell, Users, Clock, CheckCircle, ChevronDown, ChevronRight
} from 'lucide-react';
import { normalizeVietnameseForSpeech } from '../utils/vietnameseTtsNormalizer';

interface HisConfig {
  ip: string; port: number; displayCode: string;
  roomCode: string; dbConnStr: string;
  autoRefreshSec: number; enableTTS: boolean;
  clinicName: string; logoUrl: string;
  ttsTemplate: string; // template nội dung đọc, dùng {stt} {name}
  ttsVoiceName: string; // tên giọng đã chọn ('' = tự động chọn giọng nữ vi-VN)
  ttsRate: number;   // tốc độ 0.5–2.0 (mặc định 0.9)
  ttsPitch: number;  // cao độ 0.0–2.0 (mặc định 1.1)
  ttsVolume: number; // âm lượng 0.0–1.0 (mặc định 1.0)
  ttsRepeatCount?: number; // Số lần đọc lặp lại (mặc định 1)
  ttsRepeatDelaySec?: number; // Thời gian delay giữa 2 lần đọc (giây)
  sortMode?: 'stt_then_time' | 'time_only'; // ưu tiên STT hay thời gian đăng ký
}
// Logo base64 lưu riêng vì kích thước lớn
const LS_LOGO_KEY = 'dmh_hiscall_logo_b64';

interface Patient {
  id: string;
  queueNumber: number;
  fullName: string;
  age?: number | null;           // tuổi bệnh nhân (tính từ namsinh)
  status: 'waiting' | 'called';
  roomCode?: string;       // mã phòng BN đăng ký
  registrationTime?: string; // HH:MM:SS để sort công bằng khi cùng STT
}
interface CallLog  { time: string; message: string; status: 'success' | 'error'; }

const LS_KEY = 'dmh_hiscall_config';
const DEFAULT_CFG: HisConfig = {
  ip: '192.168.1.100', port: 9090, displayCode: 'B01', roomCode: '1',
  dbConnStr: 'Server=127.0.0.1;Database=HIS_DATABASE;User Id=sa;Password=;TrustServerCertificate=true;',
  autoRefreshSec: 3, enableTTS: true,
  clinicName: 'PHÒNG KHÁM ĐA KHOA', logoUrl: '',
  ttsTemplate: 'Mời bệnh nhân {name}, số thứ tự {stt}, phòng {phong}, vào khám.',
  ttsVoiceName: '', ttsRate: 0.9, ttsPitch: 1.1, ttsVolume: 1.0,
  ttsRepeatCount: 1, ttsRepeatDelaySec: 2,
};

// Sắp xếp BN đa phòng: ưu tiên STT nhỏ trước, cùng STT xét GioDangKy
function sortPatients(list: Patient[], sortMode: 'stt_then_time' | 'time_only' = 'stt_then_time'): Patient[] {
  return [...list].sort((a, b) => {
    const ta = a.registrationTime || '00:00:00';
    const tb = b.registrationTime || '00:00:00';
    if (sortMode === 'time_only') {
      const tCmp = ta.localeCompare(tb);
      return tCmp !== 0 ? tCmp : (a.queueNumber - b.queueNumber);
    } else {
      const sttDiff = a.queueNumber - b.queueNumber;
      if (sttDiff !== 0) return sttDiff;
      return ta.localeCompare(tb);
    }
  });
}

function loadConfig(): HisConfig {
  try { 
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    let shouldResave = false;

    // Dọn sạch dữ liệu thử nghiệm nội bộ cũ nếu còn lưu trong localStorage (dùng base64 để không lộ ký tự trong bundle)
    const isLegacyInternal = (val: string) => {
      if (!val) return false;
      try {
        const p1 = atob('MTkyLjE2OC4zLjk4');
        const p2 = atob('UEtES1BUMjAyNFY2');
        const p3 = atob('MTIzQDFyY28=');
        const p4 = atob('MTkyLjE2OC4zLjI0OQ==');
        const p5 = atob('UEhVIFRIQUk=');
        return val.includes(p1) || val.includes(p2) || val.includes(p3) || val.includes(p4) || val.toUpperCase().includes(p5) || val.includes('NHAP_MAT_KHAU');
      } catch {
        return false;
      }
    };

    if (saved.dbConnStr && isLegacyInternal(saved.dbConnStr)) {
      saved.dbConnStr = DEFAULT_CFG.dbConnStr;
      shouldResave = true;
    }
    if (saved.ip && isLegacyInternal(saved.ip)) {
      saved.ip = DEFAULT_CFG.ip;
      shouldResave = true;
    }
    if (saved.clinicName && isLegacyInternal(saved.clinicName)) {
      saved.clinicName = DEFAULT_CFG.clinicName;
      shouldResave = true;
    }

    if (!saved.displayCode) saved.displayCode = 'B01';
    if (saved.roomCode) {
      const validCodes = String(saved.roomCode).split(',').filter(s => !isNaN(parseInt(s.trim(), 10)));
      if (validCodes.length === 0) saved.roomCode = '1';
    } else {
      saved.roomCode = '1';
    }

    const merged = { ...DEFAULT_CFG, ...saved, logoUrl: saved.logoUrl || DEFAULT_CFG.logoUrl };
    if (shouldResave) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(merged)); } catch {}
    }
    return merged; 
  }
  catch { return DEFAULT_CFG; }
}

export function HisCallTab() {
  const [config, setConfig] = useState<HisConfig>(loadConfig);
  // Danh sách giọng tiếng Việt khả dụng
  const [viVoices, setViVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [logoB64, setLogoB64] = useState<string>(() => localStorage.getItem(LS_LOGO_KEY) || '');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [calledPt, setCalledPt] = useState<Patient | null>(null); // bệnh nhân vừa được gọi
  const [isLoadingDB, setIsLoadingDB] = useState(false);
  const [tcpStatus, setTcpStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [dbStatus,  setDbStatus]  = useState<'idle' | 'ok' | 'err'>('idle');
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [newPtName, setNewPtName] = useState('');
  const [autoCount, setAutoCount] = useState(0); // countdown
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref luu handler moi nhat de tranh stale closure trong float window listener
  const callHandlerRef = useRef<{
    callNext: () => void;
    recall:   () => void;
    refresh:  () => void;
    callSpecific: (id: string) => void;
  }>({
    callNext: () => {},
    recall:   () => {},
    refresh:  () => {},
    callSpecific: () => {},
  });
  const [queueDisplayOpen, setQueueDisplayOpen] = useState(false);
  const [floatOpen, setFloatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen]       = useState(false);
  const [isSettingsUnlocked, setIsSettingsUnlocked] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdInput, setPwdInput]         = useState('');
  const [pwdError, setPwdError]         = useState(false);
  // Đổi mật khẩu UI state
  const [changePwdMode, setChangePwdMode] = useState(false);
  const [cpOld, setCpOld]   = useState('');
  const [cpNew, setCpNew]   = useState('');
  const [cpNew2, setCpNew2] = useState('');
  const [cpMsg, setCpMsg]   = useState<{ text: string; ok: boolean } | null>(null);

  const LS_PWD_KEY = 'dmh_settings_pwd';
  const getSettingsPwd = () => localStorage.getItem(LS_PWD_KEY) || '1234';

  const handleSettingsToggle = () => {
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      setIsSettingsUnlocked(false);
      setChangePwdMode(false); setCpMsg(null);
      return;
    }
    if (isSettingsUnlocked) {
      setIsSettingsOpen(true);
      return;
    }
    // Mở modal nhập mật khẩu
    setPwdInput('');
    setPwdError(false);
    setShowPwdModal(true);
  };

  const handlePwdConfirm = () => {
    if (pwdInput === getSettingsPwd()) {
      setShowPwdModal(false);
      setIsSettingsUnlocked(true);
      setIsSettingsOpen(true);
      setPwdError(false);
    } else {
      setPwdError(true);
      setPwdInput('');
    }
  };

  const handleChangePwd = () => {
    setCpMsg(null);
    if (cpOld !== getSettingsPwd()) {
      setCpMsg({ text: 'Mật khẩu hiện tại không đúng!', ok: false }); return;
    }
    if (cpNew.length < 4) {
      setCpMsg({ text: 'Mật khẩu mới phải từ 4 ký tự!', ok: false }); return;
    }
    if (cpNew !== cpNew2) {
      setCpMsg({ text: 'Xác nhận không khớp!', ok: false }); return;
    }
    localStorage.setItem(LS_PWD_KEY, cpNew);
    setCpMsg({ text: '✅ Đổi mật khẩu thành công!', ok: true });
    setCpOld(''); setCpNew(''); setCpNew2('');
    setTimeout(() => { setCpMsg(null); setChangePwdMode(false); }, 2000);
  };

  // Tải danh sách giọng nói tiếng Việt chuẩn khi mở tab
  useEffect(() => {
    const loadVoices = () => {
      const all = window.speechSynthesis?.getVoices() || [];
      const vi = all.filter(v => 
        v.lang === 'vi-VN' || 
        v.lang.startsWith('vi-') || 
        v.lang === 'vi' || 
        v.lang.toLowerCase().includes('vietnam') ||
        v.name.toLowerCase().includes('vietnamese') ||
        v.name.toLowerCase().includes('hoaimy') ||
        v.name.toLowerCase().includes('an')
      );
      setViVoices(vi);
    };
    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Auto scroll logs
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs]);

  const addLog = useCallback((message: string, status: 'success' | 'error' = 'success') => {
    setLogs(prev => [...prev.slice(-99), { time: new Date().toLocaleTimeString('vi-VN'), message, status }]);
  }, []);

  const eAPI = () => (window as any).electronAPI;

  // ── Fetch patients from DB ──────────────────────────────────────────────────
  const fetchPatientsFromDB = useCallback(async (silent = false) => {
    const api = eAPI();
    if (!api?.fetchHisPatients) {
      if (!silent) addLog('Giả lập: hiển thị dữ liệu mẫu', 'success');
      setPatients(sortPatients([
        { id: 'BN001', queueNumber: 1, fullName: 'Nguyễn Văn An',  status: 'waiting', roomCode: '1', registrationTime: '07:30:10' },
        { id: 'BN002', queueNumber: 1, fullName: 'Trần Thị Bình', status: 'waiting', roomCode: '2', registrationTime: '07:30:25' },
        { id: 'BN003', queueNumber: 2, fullName: 'Lê Văn Cường',  status: 'waiting', roomCode: '1', registrationTime: '07:45:00' },
      ], config.sortMode));
      return;
    }

    if (!config.dbConnStr || !config.dbConnStr.trim() || config.dbConnStr.includes('HIS_DATABASE') || (config.dbConnStr.includes('127.0.0.1') && !config.dbConnStr.includes('Password='))) {
      if (!silent) addLog('ℹ Vui lòng vào Cài đặt để cấu hình chuỗi kết nối SQL Server của phòng khám.', 'error');
      setDbStatus('idle');
      return;
    }

    setIsLoadingDB(true);
    const roomLabel = config.roomCode.includes(',') ? `[${config.roomCode}]` : `phòng ${config.roomCode}`;
    if (!silent) addLog(`Đang tải danh sách ${roomLabel}...`);
    try {
      const res = await api.fetchHisPatients(config.dbConnStr, config.roomCode);
      if (res.ok) {
        const mapped: Patient[] = res.data.map((r: any) => {
          // DaKham co the la: 1 (int), true (bool), '1' (string), 0, false, null
          const daKham = Number(r.DaKham);
          const st: 'waiting' | 'called' = daKham === 1 ? 'called' : 'waiting';
          return {
            id:               String(r.MaBenhNhan),
            queueNumber:      Number(r.SoThuTu),
            fullName:         r.TenBenhNhan,
            age:              r.Tuoi != null ? Number(r.Tuoi) : null,
            roomCode:         String(r.MaPhong || config.roomCode),
            registrationTime: r.GioDangKy || '00:00:00',
            status:           st,
          };
        });
        const waitingCount = mapped.filter(p => p.status === 'waiting').length;
        const calledCount  = mapped.filter(p => p.status === 'called').length;
        setPatients(prev => {
          // Tạo map từ local state để merge: id → status hiện tại
          const localCalledIds = new Set(prev.filter(p => p.status === 'called').map(p => p.id));
          const merged = mapped.map(p => {
            // Nếu DB nói "đã gọi" → luôn tin DB
            if (p.status === 'called') return p;
            // Nếu DB nói "chưa gọi" nhưng local đang là "đã gọi" → giữ "đã gọi"
            // (tránh race condition: DB update chưa commit kịp trước auto-refresh)
            if (localCalledIds.has(p.id)) return { ...p, status: 'called' as const };
            return p;
          });
          return sortPatients(merged, config.sortMode);
        });
        if (!silent) addLog(`Đã tải ${res.data.length} BN: ${waitingCount} chờ, ${calledCount} đã gọi (${roomLabel}).`);
        setDbStatus('ok');
      } else {
        addLog(`Lỗi DB: ${res.error}`, 'error');
        setDbStatus('err');
      }
    } catch (err: unknown) { addLog(`Lỗi kết nối DB: ${err instanceof Error ? err.message : String(err)}`, 'error'); setDbStatus('err'); }
    finally { setIsLoadingDB(false); }
  }, [config.dbConnStr, config.roomCode, config.sortMode, addLog]);

  // ── Auto-refresh danh sách BN mỗi 3s (chỉ load, KHÔNG tự gọi) ────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (config.autoRefreshSec <= 0) return;
    setAutoCount(config.autoRefreshSec);
    timerRef.current = setInterval(() => {
      setAutoCount(p => {
        if (p <= 1) { fetchPatientsFromDB(true); return config.autoRefreshSec; }
        return p - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [config.autoRefreshSec, fetchPatientsFromDB]);

  // ── Sync danh sách BN lên float window mỗi khi patients thay đổi ────────────
  useEffect(() => {
    if (!floatOpen) return;
    const api = eAPI();
    if (!api?.pushFloatState) return;
    const waitingList = patients.filter(p => p.status === 'waiting').map(p => ({ stt: p.queueNumber, name: p.fullName, room: p.roomCode || config.roomCode, age: p.age ?? null, id: p.id }));
    const calledList  = patients.filter(p => p.status === 'called').map(p => ({ stt: p.queueNumber, name: p.fullName, room: p.roomCode || config.roomCode, age: p.age ?? null, id: p.id }));
    api.pushFloatState({
      current: calledPt ? { stt: calledPt.queueNumber, name: calledPt.fullName, room: calledPt.roomCode || config.roomCode } : null,
      waiting: waitingList.length,
      called:  calledList.length,
      waitingList,
      calledList,
      autoRefreshSec: config.autoRefreshSec,
      tvOpen: queueDisplayOpen,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, floatOpen]);

  // ── Save config ─────────────────────────────────────────────────────────────
  const handleSaveConfig = () => {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
    addLog(`Đã lưu cấu hình: ${config.ip}:${config.port} | Phòng: ${config.roomCode}`);
    syncQueueDisplay(calledPt, patients);
    fetchPatientsFromDB();
  };

  // ── Test TCP ────────────────────────────────────────────────────────────────
  const testTcp = async () => {
    addLog(`Kiểm tra kết nối TCP ${config.ip}:${config.port}...`);
    const api = eAPI();
    if (!api?.sendTcpCommand) { addLog('Kiểm tra giả lập: TCP kết nối thành công', 'success'); setTcpStatus('ok'); return; }
    const r = await api.sendTcpCommand(config.ip, config.port, 'PING');
    if (r.ok) { addLog('✓ Kết nối TCP thành công!'); setTcpStatus('ok'); }
    else { addLog(`✗ Kết nối TCP thất bại: ${r.error}`, 'error'); setTcpStatus('err'); }
  };

  // ── Test CSDL ────────────────────────────────────────────────────────────────
  const testDb = async () => {
    addLog('Kiểm tra kết nối Cơ sở dữ liệu...');
    await fetchPatientsFromDB(false);
  };

  // ── Fetch room list từ CSDL ──────────────────────────────────────────────────
  const fetchRoomsFromDB = async () => {
    const api = eAPI();
    if (!api?.fetchHisRooms) { addLog('Chức năng này chỉ khả dụng trong phần mềm cài đặt', 'error'); return; }
    try {
      const r = await (api as any).fetchHisRooms(config.dbConnStr);
      if (r.ok && r.data.length > 0) {
        const roomList = r.data.map((row: { maphong: string; tenphong: string }) => `${row.maphong} - ${row.tenphong}`).join(', ');
        addLog(`✓ Danh sách phòng trong CSDL hôm nay: ${roomList}`);
        addLog(`Nhập số mã phòng vào ô "Mã Phòng Khám", ví dụ: ${r.data[0].maphong}`);
      } else if (r.ok && r.data.length === 0) {
        addLog('Hàng đợi hôm nay chưa có bệnh nhân nào hoặc CSDL chưa có dữ liệu phòng.', 'error');
      } else {
        addLog(`Lỗi tải danh sách phòng: ${r.error}`, 'error');
      }
    } catch (err: unknown) { addLog(`Lỗi: ${err instanceof Error ? err.message : String(err)}`, 'error'); }
  };

  // ── TTS (Ép buộc 100% phát âm Tiếng Việt, loại bỏ hoàn toàn tiếng Anh) ────────
  const speakText = async (rawText: string) => {
    if (!config.enableTTS || !rawText) return;
    // Chuẩn hóa 100% tiếng Việt thuần túy, chuyển số thành chữ, mở rộng viết tắt
    const text = normalizeVietnameseForSpeech(rawText);
    const api = eAPI();

    const count = config.ttsRepeatCount || 1;
    const delaySec = config.ttsRepeatDelaySec ?? 2;

    for (let i = 0; i < count; i++) {
      let ipcSuccess = false;
      // Nếu có Electron API, ưu tiên gọi bộ tổng hợp giọng nói Python (100% tiếng Việt, âm thanh tự nhiên)
      if (api?.speakTts) {
        try {
          const res = await api.speakTts(text, config.ttsVoiceName || 'default');
          ipcSuccess = res !== false;
        } catch {
          ipcSuccess = false;
        }
      }

      // Fallback sang Web Speech API nếu không thể gọi qua Electron backend
      if (!ipcSuccess) {
        await _speakWebSpeech(text);
      }

      if (i < count - 1 && delaySec > 0) {
        await new Promise(res => setTimeout(res, delaySec * 1000));
      }
    }
  };

  const _speakWebSpeech = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) { resolve(); return; }
      synth.cancel();
      const doSpeak = () => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang   = 'vi-VN';
        u.rate   = config.ttsRate   ?? 0.9;
        u.pitch  = config.ttsPitch  ?? 1.1;
        u.volume = config.ttsVolume ?? 1.0;
        
        u.onend = () => resolve();
        u.onerror = () => resolve();

        // ÉP BUỘC: CHỈ LẤY GIỌNG TIẾNG VIỆT, CHẶN ĐỨNG GIỌNG TIẾNG ANH
        const all = synth.getVoices();
        const viList = all.filter(v => 
          v.lang === 'vi-VN' || 
          v.lang.startsWith('vi-') || 
          v.lang === 'vi' || 
          v.lang.toLowerCase().includes('vietnam') ||
          v.name.toLowerCase().includes('vietnamese') ||
          v.name.toLowerCase().includes('hoaimy') ||
          v.name.toLowerCase().includes('an')
        );

        // NẾU HỆ THỐNG KHÔNG CÓ GIỌNG TIẾNG VIỆT -> BỎ QUA, TUYỆT ĐỐI KHÔNG ĐỂ GIỌNG ANH PHÁT ÂM SAI
        if (viList.length === 0) {
          addLog('⚠ Windows chưa cài giọng đọc Tiếng Việt (vi-VN). Đã tự động chặn để không phát âm sai lệch!', 'error');
          resolve();
          return;
        }

        let chosen: SpeechSynthesisVoice | null = null;
        if (config.ttsVoiceName) {
          chosen = viList.find(v => v.name === config.ttsVoiceName) || null;
        }
        if (!chosen) {
          chosen =
            viList.find(v => v.name.toLowerCase().includes('female')) ||
            viList.find(v => v.name.toLowerCase().includes('hoaimy') || v.name.toLowerCase().includes('hoai my')) ||
            viList.find(v => !v.name.toLowerCase().includes('male')) ||
            viList[0] ||
            null;
        }
        if (chosen) {
          u.voice = chosen;
          synth.speak(u);
        } else {
          resolve();
        }
      };
      
      const voices = synth.getVoices();
      if (voices.length > 0) {
        doSpeak();
      } else {
        let fired = false;
        const trigger = () => { if (!fired) { fired = true; synth.onvoiceschanged = null; doSpeak(); } };
        synth.onvoiceschanged = trigger;
        setTimeout(trigger, 500);
      }
    });
  };

  // ── Tạo nội dung đọc từ template cài đặt (Chuẩn hóa 100% tiếng Việt) ────────
  const buildTtsText = (patient: Patient) => {
    const tpl = config.ttsTemplate || DEFAULT_CFG.ttsTemplate;
    const raw = tpl
      .replace(/{name}/g,   patient.fullName)
      .replace(/{stt}/g,    String(patient.queueNumber))
      .replace(/{phong}/g,  patient.roomCode || config.roomCode)
      .replace(/{clinic}/g, config.clinicName);
    return normalizeVietnameseForSpeech(raw);
  };

  // ── Call patient ─────────────────────────────────────────────────────────────
  const handleCallPatient = async (patient: Patient) => {
    const isRecall = patient.status === 'called';
    const packet = `${config.displayCode}|${patient.queueNumber}|${patient.fullName}`;
    addLog(isRecall ? `↩ Gọi lại STT ${patient.queueNumber}: ${patient.fullName}` : `→ Gọi STT ${patient.queueNumber}: ${patient.fullName}`);
    const api = eAPI();
    // Gửi TCP sang bảng LED — nếu lỗi chỉ warn, không block việc gọi
    if (api?.sendTcpCommand) {
      api.sendTcpCommand(config.ip, config.port, packet)
        .then((r: { ok: boolean; error?: string }) => { if (!r.ok) addLog(`⚠ TCP (bảng LED) không phản hồi: ${r.error}`, 'error'); })
        .catch(() => {});
    }

    speakText(buildTtsText(patient));
    setCalledPt(patient);
    const updatedPatients = patients.map(p => p.id === patient.id ? { ...p, status: 'called' as const } : p);
    setPatients(updatedPatients);
    // Sync sang màn chờ TV
    syncQueueDisplay(patient, updatedPatients);
    // Push state sang cửa sổ nổi
    if (api?.pushFloatState) {
      const updWaiting = updatedPatients.filter((p: Patient) => p.status === 'waiting');
      const updCalled  = updatedPatients.filter((p: Patient) => p.status === 'called');
      api.pushFloatState({
        current: { stt: patient.queueNumber, name: patient.fullName, room: patient.roomCode || config.roomCode },
        waiting: updWaiting.length,
        called:  updCalled.length,
        waitingList: updWaiting.map((p: Patient) => ({ stt: p.queueNumber, name: p.fullName, room: p.roomCode || config.roomCode, age: p.age ?? null, id: p.id })),
        calledList:  updCalled.map((p: Patient) => ({ stt: p.queueNumber, name: p.fullName, room: p.roomCode || config.roomCode, age: p.age ?? null, id: p.id })),
        autoRefreshSec: config.autoRefreshSec,
        tvOpen: queueDisplayOpen,
      });
    }
    if (api?.updateHisPatientStatus) {
      const r = await api.updateHisPatientStatus(config.dbConnStr, patient.id);
      if (r.ok) { addLog(`CSDL cập nhật: ${patient.fullName} → Đã gọi`); } else { addLog(`CSDL lỗi cập nhật: ${r.error}`, 'error'); }
    }
  };

  const handleCallNext = () => {
    const next = patients.find(p => p.status === 'waiting');
    if (next) { handleCallPatient(next); } else { addLog('Không còn bệnh nhân trong hàng đợi!', 'error'); }
  };

  const handleRecall = () => {
    if (!calledPt) { addLog('Chưa có bệnh nhân nào được gọi để gọi lại.', 'error'); return; }
    const packet = `${config.displayCode}|${calledPt.queueNumber}|${calledPt.fullName}`;
    addLog(`↩ Gọi lại: ${calledPt.fullName}`);
    eAPI()?.sendTcpCommand?.(config.ip, config.port, packet);
    speakText(buildTtsText(calledPt));
  };

  const handleAddPatient = () => {
    if (!newPtName.trim()) return;
    // STT moi = max cua hang cho hien tai + 1 (khong tinh da goi)
    const waitingPts = patients.filter(p => p.status === 'waiting');
    const max = waitingPts.length ? Math.max(...waitingPts.map(p => p.queueNumber)) : (patients.length ? Math.max(...patients.map(p => p.queueNumber)) : 0);
    const newPt: Patient = { id: Date.now().toString(), queueNumber: max + 1, fullName: newPtName.trim(), status: 'waiting' };
    setPatients(prev => sortPatients([...prev, newPt], config.sortMode));
    setNewPtName('');
    addLog(`Đã thêm bệnh nhân: ${newPt.fullName} (STT ${newPt.queueNumber})`);
  };

  const waiting = patients.filter(p => p.status === 'waiting').length;
  const called  = patients.filter(p => p.status === 'called').length;

  // ── Sync data to Queue Display Window ────────────────────────────────────
  const syncQueueDisplay = useCallback((currentPt: Patient | null, allPatients: Patient[]) => {
    const api = eAPI();
    if (!api?.updateQueueDisplay) return;
    // Ưu tiên dùng base64 (portable), fallback về URL
    const effectiveLogo = logoB64 || config.logoUrl || 'icon.png';
    const data = {
      clinicName: config.clinicName || 'PHÒNG KHÁM ĐA KHOA',
      logoUrl:    effectiveLogo,
      roomCode:   config.roomCode,
      current: currentPt ? {
        stt:  currentPt.queueNumber,
        name: currentPt.fullName,
        code: currentPt.id,
      } : null,
      waiting: allPatients
        .filter(p => p.status === 'waiting')
        .map(p => ({ stt: p.queueNumber, name: p.fullName, code: p.id })),
      calledCount: allPatients.filter(p => p.status === 'called').length,
    };
    // Gửi qua IPC electron
    api.updateQueueDisplay(data);
    // Dự phòng: cũng ghi vào localStorage để fallback
    localStorage.setItem('dmh_queue_display', JSON.stringify(data));
  }, [config.roomCode, config.clinicName, config.logoUrl, logoB64]);

  const handleOpenQueueDisplay = async () => {
    const api = eAPI();
    if (!api?.openQueueDisplay) {
      addLog('Chức năng màn chờ chỉ hoạt động trong phần mềm cài đặt.', 'error');
      return;
    }
    const r = await api.openQueueDisplay({ roomCode: config.roomCode });
    if (r?.ok) {
      setQueueDisplayOpen(true);
      addLog(r.reused ? 'Đã kích hoạt hiển thị màn chờ.' : 'Đã mở màn chờ trên màn hình 2!');
      syncQueueDisplay(calledPt, patients);
    } else {
      addLog('Lỗi mở màn chờ.', 'error');
    }
  };

  const handleCloseQueueDisplay = async () => {
    const api = eAPI();
    await api?.closeQueueDisplay?.();
    setQueueDisplayOpen(false);
    addLog('Đã đóng màn chờ.');
  };

  // ── Float window ──────────────────────────────────────────────────────────────────────
  const handleToggleFloat = async () => {
    const api = eAPI();
    if (!api?.openFloatControl) {
      addLog('Cửa sổ nổi chỉ hoạt động trong phần mềm cài đặt.', 'error');
      return;
    }
    // Kiểm tra trạng thái thực tế từ Electron
    const realStatus = await api.isFloatOpen?.();
    const isActuallyOpen = typeof realStatus?.open === 'boolean' ? realStatus.open : floatOpen;

    if (isActuallyOpen) {
      await api.closeFloatControl();
      setFloatOpen(false);
      addLog('Đã đóng cửa sổ nổi.');
    } else {
      const r = await api.openFloatControl();
      if (r?.ok) {
        setFloatOpen(true);
        addLog(r.reused ? 'Đã kích hoạt hiển thị cửa sổ nổi.' : 'Đã mở cửa sổ nổi điều khiển!');
        const waitingList = patients.filter(p => p.status === 'waiting').map(p => ({ stt: p.queueNumber, name: p.fullName, room: p.roomCode || config.roomCode, age: p.age ?? null, id: p.id }));
        const calledList  = patients.filter(p => p.status === 'called').map(p => ({ stt: p.queueNumber, name: p.fullName, room: p.roomCode || config.roomCode, age: p.age ?? null, id: p.id }));
        api.pushFloatState({
          current: calledPt ? { stt: calledPt.queueNumber, name: calledPt.fullName, room: calledPt.roomCode || config.roomCode } : null,
          waiting: waitingList.length,
          called:  calledList.length,
          waitingList,
          calledList,
          autoRefreshSec: config.autoRefreshSec,
          tvOpen: queueDisplayOpen,
        });
      } else {
        addLog('Lỗi mở cửa sổ nổi.', 'error');
      }
    }
  };

  // ── Đồng bộ 2 chiều trạng thái Cửa Sổ Nổi & Màn Chờ TV ─────────────────────
  useEffect(() => {
    const api = eAPI();
    if (!api) return;

    // Kiểm tra trạng thái thực tế ngay khi component khởi động
    api.isFloatOpen?.().then((r: { open?: boolean }) => {
      if (typeof r?.open === 'boolean') setFloatOpen(r.open);
    });
    api.isQueueDisplayOpen?.().then((r: { open?: boolean }) => {
      if (typeof r?.open === 'boolean') setQueueDisplayOpen(r.open);
    });

    // Tự động cập nhật nút bấm trên giao diện chính ngay khi cửa sổ bị đóng từ bên ngoài (nút ✕, Alt+F4)
    const removeFloatStatus = api.onFloatStatus?.((isOpen: boolean) => {
      setFloatOpen(isOpen);
    });
    const removeQueueStatus = api.onQueueStatus?.((isOpen: boolean) => {
      setQueueDisplayOpen(isOpen);
    });

    return () => {
      removeFloatStatus?.();
      removeQueueStatus?.();
    };
  }, []);

  // Cap nhat ref moi nhat moi khi handler thay doi
  useEffect(() => {
    callHandlerRef.current = {
      callNext: handleCallNext,
      recall:   handleRecall,
      refresh:  () => fetchPatientsFromDB(false),
      callSpecific: (id: string) => {
        const pt = patients.find(p => p.id === id);
        if (pt) handleCallPatient(pt);
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleCallNext, handleRecall, fetchPatientsFromDB, patients]);

  // Nhan action tu float window — dung ref de luon goi handler moi nhat
  useEffect(() => {
    const api = eAPI();
    if (!api?.onFloatAction) return;
    api.onFloatAction((action: string | { type: string; id: string }) => {
      if (typeof action === 'string') {
        if      (action === 'call-next')  callHandlerRef.current.callNext();
        else if (action === 'recall')     callHandlerRef.current.recall();
        else if (action === 'refresh')    callHandlerRef.current.refresh();
        else if (action === 'toggle-tv') {
          if (queueDisplayOpen) handleCloseQueueDisplay();
          else handleOpenQueueDisplay();
        }
      } else if (action && action.type === 'call-specific') {
        callHandlerRef.current.callSpecific(action.id);
      }
    });
    return () => { api.removeFloatActionListener?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueDisplayOpen]);


  // ── Styles ──────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = { background: 'white', borderRadius: 8, padding: '0.875rem', boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
  const lbl:  React.CSSProperties = { fontSize: '0.72rem', color: '#6b7280', marginBottom: 3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.03em' };
  const inp:  React.CSSProperties = { width: '100%', padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: '0.82rem' };

  return (
    <div style={{ display: 'flex', gap: '0.75rem', height: '100%', padding: '0.75rem', background: '#f0fdf4', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* ── Password Modal ── */}
      {showPwdModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { setShowPwdModal(false); setPwdError(false); }}>
          <div
            style={{
              background: 'white', borderRadius: 14, padding: '28px 32px', width: 320,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.4rem' }}>🔐</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111' }}>Cấu Hình Mạng &amp; Gọi Bệnh Nhân</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Nhập mật khẩu để tiếp tục</div>
              </div>
            </div>
            <input
              type="password"
              autoFocus
              value={pwdInput}
              onChange={e => { setPwdInput(e.target.value); setPwdError(false); }}
              onKeyDown={e => e.key === 'Enter' && handlePwdConfirm()}
              placeholder="Nhập mật khẩu..."
              style={{
                padding: '10px 14px', borderRadius: 8, fontSize: '1rem',
                border: `2px solid ${pwdError ? '#ef4444' : '#d1d5db'}`,
                outline: 'none', width: '100%', boxSizing: 'border-box',
                letterSpacing: '0.15em',
              }}
            />
            {pwdError && (
              <div style={{ color: '#ef4444', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5, marginTop: -6 }}>
                ⚠️ Mật khẩu không đúng, vui lòng thử lại.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setShowPwdModal(false); setPwdError(false); }}
                style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1.5px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#6b7280' }}
              >
                Hủy
              </button>
              <button
                onClick={handlePwdConfirm}
                style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
              >
                Xác Nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEFT COLUMN ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '300px', overflowY: 'auto' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { icon: <Users size={16} color="#3b82f6" />, label: 'Chờ khám', value: waiting, color: '#eff6ff', border: '#bfdbfe' },
            { icon: <CheckCircle size={16} color="#10b981" />, label: 'Đã gọi', value: called, color: '#f0fdf4', border: '#bbf7d0' },
          ].map(s => (
            <div key={s.label} style={{ ...card, background: s.color, border: `1px solid ${s.border}`, padding: '0.6rem', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111' }}>{s.value}</div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Current patient */}
        {calledPt && (
          <div style={{ ...card, background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '0.72rem', opacity: 0.8, marginBottom: 4 }}>ĐANG GỌI</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: 2 }}>#{calledPt.queueNumber}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: 2 }}>{calledPt.fullName}</div>
          </div>
        )}

        {/* Control */}
        <div style={card}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Volume2 size={15} /> Điều Khiển Gọi
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={handleCallNext} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '14px', background: '#10b981', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '1rem', fontWeight: 800, letterSpacing: 0.5 }}>
              <Play size={18} fill="white" /> GỌI TIẾP THEO
            </button>
            <button onClick={handleRecall} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '9px', background: 'white', border: '1.5px solid #d1d5db', borderRadius: 7, cursor: 'pointer', color: '#374151', fontWeight: 600, fontSize: '0.85rem' }}>
              <Bell size={14} /> GỌI LẠI {calledPt ? `(STT ${calledPt.queueNumber})` : ''}
            </button>
            {/* ── Nút Màn Chờ TV ── */}
            <button
              onClick={queueDisplayOpen ? handleCloseQueueDisplay : handleOpenQueueDisplay}
              style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
                padding: '9px', borderRadius: 7, cursor: 'pointer', fontWeight: 700,
                fontSize: '0.85rem', border: 'none',
                background: queueDisplayOpen
                  ? 'linear-gradient(135deg,#dc2626,#b91c1c)'
                  : 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                color: 'white',
                boxShadow: queueDisplayOpen
                  ? '0 2px 8px rgba(220,38,38,0.4)'
                  : '0 2px 8px rgba(124,58,237,0.4)',
                transition: 'all 0.2s',
              }}
              title={queueDisplayOpen ? 'Đóng màn hình chờ TV' : 'Mở màn hình chờ trên màn hình 2'}
            >
              📺 {queueDisplayOpen ? 'ĐÓNG MÀN CHỜ' : 'MỞ MÀN CHỜ (MÀN 2)'}
            </button>
            {/* ── Nút Cửa Sổ Nổi ── */}
            <button
              onClick={handleToggleFloat}
              style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
                padding: '9px', borderRadius: 7, cursor: 'pointer', fontWeight: 700,
                fontSize: '0.85rem', border: 'none',
                background: floatOpen
                  ? 'linear-gradient(135deg,#dc2626,#b91c1c)'
                  : 'linear-gradient(135deg,#0284c7,#0369a1)',
                color: 'white',
                boxShadow: floatOpen
                  ? '0 2px 8px rgba(220,38,38,0.35)'
                  : '0 2px 8px rgba(2,132,199,0.4)',
                transition: 'all 0.2s',
              }}
              title={floatOpen ? 'Đóng cửa sổ nổi' : 'Mở cửa sổ nổi (luôn hiện trên cùng)'}
            >
              🪟 {floatOpen ? 'ĐÓNG CỬA SỔ NỔI' : 'CỬA SỔ NỔI'}
            </button>
          </div>
          {config.autoRefreshSec > 0 && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#6b7280' }}>
              <Clock size={12} /> Tự làm mới sau: <strong style={{ color: '#10b981' }}>{autoCount}s</strong>
            </div>
          )}
        </div>

        <div style={card}>
          <div 
            onClick={handleSettingsToggle}
            style={{ fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Settings size={15} color={isSettingsOpen ? '#111' : '#6b7280'} /> 
              <span style={{ color: isSettingsOpen ? '#111' : '#6b7280' }}>Cấu Hình Mạng &amp; Gọi Bệnh Nhân</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {!isSettingsUnlocked && (
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>🔒</span>
              )}
              {isSettingsOpen ? <ChevronDown size={15} color="#6b7280" /> : <ChevronRight size={15} color="#6b7280" />}
            </div>
          </div>
          
          {isSettingsOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {/* Tên Phòng Khám */}
              <div key="clinicName">
                <div style={lbl}>Tên Phòng Khám (TV)</div>
                <input type="text" value={config.clinicName}
                  onChange={e => setConfig(p => ({ ...p, clinicName: e.target.value }))}
                  style={inp} />
              </div>

              {/* Logo Upload - Base64 (portable, dùng được mọi máy) */}
              <div key="logoUrl">
                <div style={lbl}>Logo Phòng Khám (TV)</div>
                {/* Preview */}
                {logoB64 && (
                  <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={logoB64} alt="logo" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #d1d5db' }} />
                    <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>✓ Đã tải logo</div>
                    <button onClick={() => { setLogoB64(''); localStorage.removeItem(LS_LOGO_KEY); addLog('Đã xóa logo'); }}
                      style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, border: '1px solid #fca5a5', background: '#fff1f2', color: '#dc2626', cursor: 'pointer' }}>Xóa</button>
                  </div>
                )}
                {/* Upload button */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: logoB64 ? '#f0fdf4' : '#eff6ff', border: `1.5px dashed ${logoB64 ? '#10b981' : '#3b82f6'}`, borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: logoB64 ? '#059669' : '#2563eb' }}>
                  <Plus size={14} /> {logoB64 ? 'Đổi ảnh khác' : '📁 Chọn ảnh logo từ máy tính...'}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) { addLog('Ảnh quá lớn (>2MB), vui lòng chọn ảnh nhỏ hơn!', 'error'); return; }
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const b64 = ev.target?.result as string;
                        setLogoB64(b64);
                        localStorage.setItem(LS_LOGO_KEY, b64);
                        addLog(`✓ Đã tải logo: ${file.name} (${(file.size/1024).toFixed(0)}KB) — lưu vào bộ nhớ cục bộ`);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: 3 }}>Ảnh được lưu vào bộ nhớ — cấu hình 1 lần, dùng trên mọi máy</div>
              </div>

              {/* Các cấu hình khác */}
              {([
                { label: 'Địa chỉ IP bảng LED hàng đợi', key: 'ip', type: 'text' },
                { label: 'Cổng mạng (Port)', key: 'port', type: 'number' },
                { label: 'Mã Bảng Hiển Thị', key: 'displayCode', type: 'text' },
                { label: 'Mã Phòng (1 hoặc nhiều, VD: 2, 3, 5)', key: 'roomCode', type: 'text' },
                { label: 'Tự động làm mới mỗi (giây, 0 = tắt)', key: 'autoRefreshSec', type: 'number' },
              ] as { label: string; key: keyof HisConfig; type: string }[]).map(f => (
                <div key={f.key}>
                  <div style={lbl}>{f.label}</div>
                  <input type={f.type} value={String(config[f.key])}
                    onChange={e => setConfig(p => ({ ...p, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                    style={inp} />
                </div>
              ))}
            <div>
              <div style={lbl}>Điều Kiện Ưu Tiên Gọi</div>
              <select value={config.sortMode || 'stt_then_time'}
                onChange={e => setConfig(p => ({ ...p, sortMode: e.target.value as 'stt_then_time' | 'time_only' }))}
                style={inp}>
                <option value="stt_then_time">1. Số Thứ Tự → 2. Giờ đăng ký</option>
                <option value="time_only">1. Giờ đăng ký → 2. Số Thứ Tự</option>
              </select>
            </div>
            <div>
              <div style={lbl}>Chuỗi kết nối Cơ sở dữ liệu (SQL Server)</div>
              <textarea
                value={config.dbConnStr}
                onChange={e => setConfig(p => ({ ...p, dbConnStr: e.target.value }))}
                placeholder="Server=192.168.1.10;Database=HIS_DB;User Id=sa;Password=...;TrustServerCertificate=true;"
                style={{ ...inp, height: 56, fontFamily: 'monospace', fontSize: '0.72rem', resize: 'vertical' }}
              />
              <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 2 }}>
                💡 Nhập IP máy chủ, tên CSDL, tài khoản &amp; mật khẩu SQL Server của cơ sở khám chữa bệnh.
              </div>
            </div>
            {/* ── Cài đặt TTS ── */}
            <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer', marginBottom: 10 }}>
                <input type="checkbox" checked={config.enableTTS} onChange={e => setConfig(p => ({ ...p, enableTTS: e.target.checked }))} />
                <span style={{ fontWeight: 600, color: '#374151' }}>🔊 Đọc tên bệnh nhân (TTS)</span>
              </label>

              {config.enableTTS && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>

                  {/* Nội dung đọc */}
                  <div>
                    <div style={{ ...lbl, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span>📢 Nội dung thông báo</span>
                      <span style={{ fontSize: '0.63rem', color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>
                        {'{name}'} {'{stt}'} {'{phong}'} {'{clinic}'}
                      </span>
                    </div>
                    <textarea
                      value={config.ttsTemplate}
                      onChange={e => setConfig(p => ({ ...p, ttsTemplate: e.target.value }))}
                      placeholder="Mời bệnh nhân {name}, số thứ tự {stt}, vào phòng khám."
                      style={{ ...inp, height: 52, resize: 'vertical', fontSize: '0.8rem' }}
                    />
                    <button
                      onClick={() => setConfig(p => ({ ...p, ttsTemplate: DEFAULT_CFG.ttsTemplate }))}
                      style={{ marginTop: 4, fontSize: '0.68rem', padding: '2px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', color: '#6b7280' }}
                    >↩ Mặc định</button>
                  </div>

                  {/* Chọn giọng */}
                  <div>
                    <div style={lbl}>🎙️ Giọng đọc (vi-VN)</div>
                    <select
                      value={config.ttsVoiceName || 'piper_offline'}
                      onChange={e => setConfig(p => ({ ...p, ttsVoiceName: e.target.value }))}
                      style={{ ...inp, cursor: 'pointer', background: 'white' }}
                    >
                      <optgroup label="📦 Giọng Ngoại Tuyến (Chuyên dụng, không cần mạng - 100% Tiếng Việt)">
                        <option value="piper_bac">🍒 Giọng Nữ Miền Bắc - Chuẩn 100% (Ngoại tuyến) 📡</option>
                        <option value="piper_offline">⭐ Giọng Nam Chuẩn - VIVOS (Ngoại tuyến) 📡</option>
                      </optgroup>
                      <optgroup label="🌐 Giọng Trực Tuyến AI (Chất lượng cao - 100% Tiếng Việt)">
                        <option value="edge_hoaimy">✨ Giọng Nữ Hoài My Neural (Trực tuyến cao cấp) ☁️</option>
                        <option value="gtts_vi">🌟 Giọng Google Tiếng Việt (Trực tuyến) ☁️</option>
                      </optgroup>
                      {viVoices.length > 0 && (
                        <optgroup label="💻 Giọng Tiếng Việt hệ thống Windows (Đã lọc thuần Việt 100%)">
                          {viVoices.map(v => (
                            <option key={v.name} value={v.name}>
                              {v.name}{v.localService ? ' 📡' : ' ☁️'}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {viVoices.length === 0 && (
                        <optgroup label="💻 Giọng hệ thống Windows">
                          <option disabled value="">(Chưa cài gói Tiếng Việt trên Windows - Hãy chọn Giọng Ngoại Tuyến ở trên)</option>
                        </optgroup>
                      )}
                    </select>
                    <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 2 }}>📡 = Ngoại tuyến (có sẵn) &nbsp;|&nbsp; ☁️ = Trực tuyến</div>
                  </div>

                  {/* Tốc độ */}
                  <div>
                    <div style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
                      <span>⚡ Tốc độ đọc</span>
                      <span style={{ fontWeight: 700, color: '#3b82f6', textTransform: 'none' }}>{config.ttsRate.toFixed(1)}×</span>
                    </div>
                    <input type="range" min={0.5} max={1.8} step={0.1}
                      value={config.ttsRate}
                      onChange={e => setConfig(p => ({ ...p, ttsRate: Number(e.target.value) }))}
                      style={{ width: '100%', accentColor: '#3b82f6' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#9ca3af' }}>
                      <span>0.5× (chậm)</span><span>1.8× (nhanh)</span>
                    </div>
                  </div>

                  {/* Cao độ */}
                  <div>
                    <div style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
                      <span>🎵 Cao độ (pitch)</span>
                      <span style={{ fontWeight: 700, color: '#8b5cf6', textTransform: 'none' }}>{config.ttsPitch.toFixed(1)}</span>
                    </div>
                    <input type="range" min={0.5} max={2.0} step={0.1}
                      value={config.ttsPitch}
                      onChange={e => setConfig(p => ({ ...p, ttsPitch: Number(e.target.value) }))}
                      style={{ width: '100%', accentColor: '#8b5cf6' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#9ca3af' }}>
                      <span>0.5 (trầm)</span><span>2.0 (cao)</span>
                    </div>
                  </div>

                  {/* Âm lượng */}
                  <div>
                    <div style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
                      <span>🔉 Âm lượng</span>
                      <span style={{ fontWeight: 700, color: '#10b981', textTransform: 'none' }}>{Math.round(config.ttsVolume * 100)}%</span>
                    </div>
                    <input type="range" min={0.1} max={1.0} step={0.05}
                      value={config.ttsVolume}
                      onChange={e => setConfig(p => ({ ...p, ttsVolume: Number(e.target.value) }))}
                      style={{ width: '100%', accentColor: '#10b981' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#9ca3af' }}>
                      <span>10%</span><span>100%</span>
                    </div>
                  </div>

                  {/* Cài đặt lặp lại */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={lbl}>🔄 Số lần đọc</div>
                      <select
                        value={config.ttsRepeatCount || 1}
                        onChange={e => setConfig(p => ({ ...p, ttsRepeatCount: Number(e.target.value) }))}
                        style={{ ...inp, cursor: 'pointer', background: 'white' }}
                      >
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} lần</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={lbl}>⏳ Chờ giữa 2 lần (giây)</div>
                      <select
                        value={config.ttsRepeatDelaySec ?? 2}
                        onChange={e => setConfig(p => ({ ...p, ttsRepeatDelaySec: Number(e.target.value) }))}
                        style={{ ...inp, cursor: 'pointer', background: 'white' }}
                        disabled={(config.ttsRepeatCount || 1) <= 1}
                      >
                        {[1, 2, 3, 4, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n} giây</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Nút thử giọng + reset */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setConfig(p => ({ ...p, ttsVoiceName: '', ttsRate: DEFAULT_CFG.ttsRate, ttsPitch: DEFAULT_CFG.ttsPitch, ttsVolume: DEFAULT_CFG.ttsVolume, ttsRepeatCount: DEFAULT_CFG.ttsRepeatCount, ttsRepeatDelaySec: DEFAULT_CFG.ttsRepeatDelaySec }))}
                      style={{ flex: 1, fontSize: '0.7rem', padding: '5px 8px', borderRadius: 5, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', color: '#6b7280', fontWeight: 600 }}
                    >↩ Mặc định ban đầu</button>
                    <button
                      onClick={() => {
                        const test = buildTtsText({ id: 'test', queueNumber: 12, fullName: 'Nguyễn Văn An', status: 'waiting', roomCode: config.roomCode });
                        speakText(test);
                        addLog(`🔊 Thử giọng: "${test}"`);
                      }}
                      style={{ flex: 2, fontSize: '0.75rem', padding: '5px 12px', borderRadius: 5, border: '1.5px solid #8b5cf6', background: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', cursor: 'pointer', color: '#7c3aed', fontWeight: 700 }}
                    >🔊 Thử giọng ngay</button>
                  </div>

                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={testTcp} style={{ flex: 1, padding: '6px', borderRadius: 5, border: `1.5px solid ${tcpStatus === 'ok' ? '#10b981' : tcpStatus === 'err' ? '#ef4444' : '#d1d5db'}`, background: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: tcpStatus === 'ok' ? '#10b981' : tcpStatus === 'err' ? '#ef4444' : '#374151' }}>
                {tcpStatus === 'ok' ? <Wifi size={12} /> : <WifiOff size={12} />} Kiểm tra TCP
              </button>
              <button onClick={testDb} style={{ flex: 1, padding: '6px', borderRadius: 5, border: `1.5px solid ${dbStatus === 'ok' ? '#10b981' : dbStatus === 'err' ? '#ef4444' : '#d1d5db'}`, background: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: dbStatus === 'ok' ? '#10b981' : dbStatus === 'err' ? '#ef4444' : '#374151' }}>
                <Database size={12} /> Kiểm tra CSDL
              </button>
              <button onClick={fetchRoomsFromDB} title="Xem mã phòng trong hàng đợi hôm nay" style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1.5px solid #8b5cf6', background: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#8b5cf6' }}>
                <RefreshCw size={12} /> Xem Phòng CSDL
              </button>
            </div>
            {/* ── Đổi mật khẩu ── */}
            <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 10, marginTop: 2 }}>
              <div
                style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => { setChangePwdMode(!changePwdMode); setCpMsg(null); setCpOld(''); setCpNew(''); setCpNew2(''); }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>🔑 Đổi mật khẩu cài đặt</span>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{changePwdMode ? '▲' : '▼'}</span>
              </div>
              {changePwdMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {([
                    { label: 'Mật khẩu hiện tại', val: cpOld, set: setCpOld },
                    { label: 'Mật khẩu mới', val: cpNew, set: setCpNew },
                    { label: 'Xác nhận mật khẩu mới', val: cpNew2, set: setCpNew2 },
                  ] as { label: string; val: string; set: (v: string) => void }[]).map(f => (
                    <div key={f.label}>
                      <div style={lbl}>{f.label}</div>
                      <input
                        type="password"
                        value={f.val}
                        onChange={e => { f.set(e.target.value); setCpMsg(null); }}
                        onKeyDown={e => e.key === 'Enter' && handleChangePwd()}
                        style={{ ...inp, letterSpacing: '0.12em' }}
                      />
                    </div>
                  ))}
                  {cpMsg && (
                    <div style={{ fontSize: '0.76rem', padding: '5px 10px', borderRadius: 6, background: cpMsg.ok ? '#f0fdf4' : '#fef2f2', color: cpMsg.ok ? '#059669' : '#dc2626', border: `1px solid ${cpMsg.ok ? '#bbf7d0' : '#fecaca'}` }}>
                      {cpMsg.text}
                    </div>
                  )}
                  <button
                    onClick={handleChangePwd}
                    style={{ padding: '7px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}
                  >
                    Xác nhận đổi mật khẩu
                  </button>
                </div>
              )}
            </div>
            <button onClick={handleSaveConfig} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, width: '100%', padding: '8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              <Save size={14} /> Lưu &amp; Áp Dụng
            </button>
          </div>
          )}
        </div>

        {/* Log */}
        <div style={card}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><History size={13} /> Nhật Ký</span>
            <button onClick={() => setLogs([])} style={{ fontSize: '0.7rem', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}>Xóa</button>
          </div>
          <div ref={logRef} style={{ height: 130, overflowY: 'auto', background: '#0f172a', color: '#86efac', padding: 8, borderRadius: 6, fontSize: '0.7rem', fontFamily: 'monospace' }}>
            {logs.length === 0
              ? <span style={{ color: '#4b5563' }}>Chưa có hoạt động...</span>
              : logs.map((l, i) => (
                <div key={i} style={{ color: l.status === 'error' ? '#fca5a5' : '#86efac', marginBottom: 2 }}>
                  <span style={{ color: '#4b5563' }}>[{l.time}]</span> {l.message}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0, overflow: 'hidden' }}>
        <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Database size={15} /> Hàng Đợi Bệnh Nhân
              <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>{waiting} chờ</span>
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={newPtName} onChange={e => setNewPtName(e.target.value)}
                placeholder="Nhập họ tên bệnh nhân mới..."
                onKeyDown={e => e.key === 'Enter' && handleAddPatient()}
                style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.82rem', width: 200 }} />
              <button onClick={handleAddPatient} style={{ padding: '5px 10px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 600 }}>
                <Plus size={13} /> Thêm
              </button>
              <button onClick={() => fetchPatientsFromDB()} disabled={isLoadingDB} style={{ padding: '5px 10px', background: 'white', border: '1px solid #d1d5db', borderRadius: 5, cursor: isLoadingDB ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem' }}>
                <RefreshCw size={13} className={isLoadingDB ? 'spin' : ''} /> Làm mới CSDL
              </button>
            </div>
          </div>
          
          <style>{`
            .pt-list::-webkit-scrollbar { width: 8px; }
            .pt-list::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
            .pt-list::-webkit-scrollbar-thumb { background: #10b981; border-radius: 4px; border: 2px solid #f1f5f9; }
            .pt-list::-webkit-scrollbar-thumb:hover { background: #059669; }
            .pt-list-called::-webkit-scrollbar-thumb { background: #6366f1; }
            .pt-list-called::-webkit-scrollbar-thumb:hover { background: #4f46e5; }
          `}</style>

          {/* ── Phần 1: Bệnh nhân CHỜ KHÁM ── */}
          <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px 6px', borderBottom: '2px solid #fcd34d' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 5 }}>
                ⏳ Bệnh Nhân Chờ Khám
              </span>
              <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 9px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700 }}>{waiting}</span>
            </div>
            <div className="pt-list" style={{ flex: 1, overflowY: 'auto', border: '1px solid #fde68a', borderTop: 'none', borderRadius: '0 0 6px 6px', background: 'white' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead style={{ background: '#fffbeb', position: 'sticky', top: 0 }}>
                  <tr>
                    {['STT', 'Phòng', 'Họ Tên Bệnh Nhân', 'Giờ ĐK', 'Thao Tác'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: i < 2 || i === 3 ? 'center' : 'left', borderBottom: '1px solid #fde68a', fontWeight: 600, color: '#92400e', fontSize: '0.75rem',
                        width: i === 0 ? 52 : i === 1 ? 56 : i === 3 ? 68 : i === 4 ? 80 : 'auto' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {patients.filter(p => p.status === 'waiting').length === 0 && (
                    <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
                      Không có bệnh nhân chờ khám
                    </td></tr>
                  )}
                  {patients.filter(p => p.status === 'waiting').map(p => {
                    const isCurrent = calledPt?.id === p.id;
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #fef9c3', background: isCurrent ? '#ecfdf5' : 'white', transition: 'background .15s' }}>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, fontSize: '1rem', color: '#f59e0b' }}>{p.queueNumber}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 7px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700 }}>
                            {p.roomCode || config.roomCode}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#111' }}>
                          {isCurrent && <span style={{ marginRight: 5, fontSize: '0.65rem', background: '#10b981', color: 'white', padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>GỌI</span>}
                          {p.fullName}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.72rem', color: '#6b7280' }}>{p.registrationTime || '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button onClick={() => handleCallPatient(p)}
                            style={{ padding: '4px 12px', background: 'linear-gradient(135deg,#ec4899,#db2777)', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            📢 Gọi
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Phần 2: Bệnh nhân ĐÃ GỌI ── */}
          <div style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px 6px', borderBottom: '2px solid #a5b4fc', marginTop: 10 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4338ca', display: 'flex', alignItems: 'center', gap: 5 }}>
                ✓ Bệnh Nhân Đã Gọi
              </span>
              <span style={{ background: '#ede9fe', color: '#4338ca', padding: '1px 9px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700 }}>{called}</span>
            </div>
            <div className="pt-list pt-list-called" style={{ flex: 1, overflowY: 'auto', border: '1px solid #c7d2fe', borderTop: 'none', borderRadius: '0 0 6px 6px', background: '#fafafa' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead style={{ background: '#f5f3ff', position: 'sticky', top: 0 }}>
                  <tr>
                    {['STT', 'Phòng', 'Họ Tên Bệnh Nhân', 'Giờ ĐK', 'Gọi lại'].map((h, i) => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: i < 2 || i === 3 ? 'center' : 'left', borderBottom: '1px solid #c7d2fe', fontWeight: 600, color: '#4338ca', fontSize: '0.75rem',
                        width: i === 0 ? 52 : i === 1 ? 56 : i === 3 ? 68 : i === 4 ? 80 : 'auto' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {patients.filter(p => p.status === 'called').length === 0 && (
                    <tr><td colSpan={5} style={{ padding: '1.2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.78rem' }}>Chưa gọi bệnh nhân nào</td></tr>
                  )}
                  {patients.filter(p => p.status === 'called').map(p => {
                    const isCurrent = calledPt?.id === p.id;
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #ede9fe', background: isCurrent ? '#ecfdf5' : '#fafafa' }}>
                        <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: '#6366f1' }}>{p.queueNumber}</td>
                        <td style={{ padding: '7px 6px', textAlign: 'center' }}>
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 7px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700 }}>
                            {p.roomCode || config.roomCode}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px', color: '#6b7280' }}>
                          {isCurrent && <span style={{ marginRight: 5, fontSize: '0.65rem', background: '#10b981', color: 'white', padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>VỪA GỌI</span>}
                          {p.fullName}
                        </td>
                        <td style={{ padding: '7px 6px', textAlign: 'center', fontSize: '0.72rem', color: '#9ca3af' }}>{p.registrationTime || '—'}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <button onClick={() => handleCallPatient(p)}
                            style={{ padding: '3px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            🔁 Gọi lại
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 8, padding: '6px 10px', background: '#f0fdf4', borderRadius: 6, fontSize: '0.72rem', color: '#166534', border: '1px solid #bbf7d0' }}>
            <strong>TCP:</strong> <code>{config.displayCode}|[STT]|[Tên BN]</code> → <code>{config.ip}:{config.port}</code> &nbsp;|&nbsp;
            <strong>Phòng:</strong> <code>{config.roomCode}</code> &nbsp;|&nbsp;
            <strong>Sắp xếp:</strong> STT tăng dần → Giờ đăng ký
          </div>
        </div>
      </div>
    </div>
  );
}
