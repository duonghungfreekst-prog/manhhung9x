/**
 * DriverInstallPanel — Panel cài driver camera tích hợp 1-click
 * Chạy PowerShell script bundled, stream live log, hiện progress 5 bước.
 * Không cần internet — hoàn toàn offline qua Windows built-in UVC driver.
 */
import { useState, useEffect, useRef } from 'react';
import {
  Download, RefreshCw, Monitor, Camera, CheckCircle2,
  AlertTriangle, Zap, Usb, HelpCircle,
} from 'lucide-react';

interface ElectronDriverAPI {
  installCameraDriver?:   () => Promise<{ ok: boolean; exitCode?: number; error?: string; message?: string }>;
  openDeviceManager?:     () => void;
  openCameraApp?:         () => void;
  openDriverUrl?:         (url: string) => void;
  onDriverLog?:           (cb: (line: string) => void) => void;
  removeDriverLogListener?: () => void;
}

interface Props {
  pk: string;
  onRescan: () => void;
  eAPI: () => ElectronDriverAPI | undefined;
}

interface LogLine {
  type: 'step' | 'ok' | 'warn' | 'info' | 'err' | 'done' | 'raw';
  text: string;
  step?: number;
  total?: number;
}

function parseLine(raw: string): LogLine {
  if (raw.startsWith('STEP:')) {
    const parts = raw.split(':');
    return { type: 'step', step: +parts[1], total: +parts[2], text: parts.slice(3).join(':') };
  }
  if (raw.startsWith('LOG:OK:'))   return { type: 'ok',   text: raw.slice(7) };
  if (raw.startsWith('LOG:WARN:')) return { type: 'warn', text: raw.slice(9) };
  if (raw.startsWith('LOG:INFO:')) return { type: 'info', text: raw.slice(9) };
  if (raw.startsWith('ERR:'))      return { type: 'err',  text: raw.slice(4) };
  if (raw.startsWith('DONE:'))     return { type: 'done', text: raw.slice(raw.indexOf(':', 5) + 1) };
  if (raw.startsWith('EXIT:'))     return { type: 'raw',  text: '' };  // bỏ qua
  return { type: 'raw', text: raw };
}

export function DriverInstallPanel({ pk, onRescan, eAPI }: Props) {
  const [installing, setInstalling] = useState(false);
  const [done, setDone]             = useState<null | 'success' | 'notfound' | 'error'>(null);
  const [logs, setLogs]             = useState<LogLine[]>([]);
  const [step, setStep]             = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  // Đăng ký listener log một lần
  useEffect(() => {
    const api = eAPI();
    if (!api?.onDriverLog) return;
    api.onDriverLog((raw: string) => {
      const parsed = parseLine(raw);
      if (parsed.type === 'raw' && !parsed.text) return;
      setLogs(prev => [...prev, parsed]);
      if (parsed.type === 'step' && parsed.step) setStep(parsed.step);
      if (parsed.type === 'done') {
        const isSuccess = raw.includes('DONE:SUCCESS');
        setDone(isSuccess ? 'success' : 'notfound');
        setInstalling(false);
        if (isSuccess) setTimeout(onRescan, 800);
      }
    });
    return () => { api.removeDriverLogListener?.(); };
  }, [eAPI, onRescan]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const handleInstall = async () => {
    setInstalling(true);
    setDone(null);
    setLogs([]);
    setStep(0);
    const api = eAPI();
    if (!api?.installCameraDriver) {
      setLogs([{ type:'err', text:'Không tìm thấy API cài driver — vui lòng dùng phiên bản mới nhất.' }]);
      setInstalling(false);
      setDone('error');
      return;
    }
    try {
      const result = await api.installCameraDriver();
      // Nếu DONE signal chưa xử lý (exit code !=0, không phải notfound)
      if (!result.ok && result.exitCode !== 2) {
        setDone('error');
        setLogs(prev => [...prev, { type:'err', text: result.error || result.message || 'Lỗi không xác định' }]);
        setInstalling(false);
      }
    } catch (e: unknown) {
      setLogs(prev => [...prev, { type:'err', text: e instanceof Error ? e.message : String(e) }]);
      setInstalling(false);
      setDone('error');
    }
  };

  const amber   = '#d97706';
  const amberBg = '#fffbeb';
  const amberBd = '#fde68a';

  const stepLabels = [
    'Quét phần cứng',
    'Cài driver UVC',
    'Kích hoạt thiết bị',
    'Cập nhật driver',
    'Kiểm tra kết quả',
  ];

  return (
    <div style={{
      margin: '0 0.75rem 0.5rem',
      background: amberBg,
      border: `1px solid ${amberBd}`,
      borderRadius: 10,
      padding: '0.9rem 1rem',
    }}>
      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <HelpCircle size={16} color={amber} />
        <strong style={{ fontSize:'0.88rem', color:'#92400e', flex:1 }}>
          Cài Driver Camera Nội Soi — Tự Động (Offline)
        </strong>
        {done === 'success' && (
          <span style={{ display:'flex', alignItems:'center', gap:4, color:'#065f46', fontSize:'0.8rem', fontWeight:600 }}>
            <CheckCircle2 size={14} /> Thành công
          </span>
        )}
      </div>

      <div style={{ fontSize:'0.8rem', color:'#78350f', marginBottom:12, lineHeight:1.6 }}>
        Nhấn nút bên dưới để tự động cài driver UVC/DirectShow tích hợp sẵn trong Windows.
        <b> Không cần internet.</b> Yêu cầu quyền Administrator.
      </div>

      {/* ── Nút cài 1-click ── */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:12 }}>
        <button
          onClick={handleInstall}
          disabled={installing}
          style={{
            display:'flex', alignItems:'center', gap:7,
            padding:'8px 18px', borderRadius:8,
            border:'none',
            background: installing ? '#e5e7eb' : '#d97706',
            color: installing ? '#9ca3af' : 'white',
            cursor: installing ? 'default' : 'pointer',
            fontWeight:700, fontSize:'0.88rem',
            boxShadow: installing ? 'none' : '0 2px 8px rgba(217,119,6,.35)',
            transition: 'all .2s',
          }}
        >
          {installing
            ? <RefreshCw size={15} style={{ animation:'spin 1s linear infinite' }} />
            : <Zap size={15} />
          }
          {installing ? `Đang cài... (bước ${step}/5)` : '⚡ Cài Driver 1-Click'}
        </button>

        <button
          onClick={() => eAPI()?.openDeviceManager?.()}
          title="Mở Device Manager"
          style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:6, border:`1px solid ${amberBd}`, background:'white', color:amber, cursor:'pointer', fontSize:'0.8rem' }}
        >
          <Monitor size={13}/> Device Manager
        </button>

        <button
          onClick={() => eAPI()?.openCameraApp?.()}
          title="Test camera Windows"
          style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:6, border:`1px solid ${amberBd}`, background:'white', color:amber, cursor:'pointer', fontSize:'0.8rem' }}
        >
          <Camera size={13}/> Test Camera
        </button>

        {done && (
          <button
            onClick={() => { setLogs([]); setDone(null); setStep(0); onRescan(); }}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:6, border:`1px solid ${pk}`, background:'white', color:pk, cursor:'pointer', fontSize:'0.8rem', fontWeight:600 }}
          >
            <RefreshCw size={13}/> Rescan Camera
          </button>
        )}
      </div>

      {/* ── Progress bar (5 bước) ── */}
      {(installing || done) && (
        <div style={{ marginBottom:10 }}>
          <div style={{ display:'flex', gap:4, marginBottom:6 }}>
            {stepLabels.map((lbl, i) => {
              const idx = i + 1;
              const active  = step === idx;
              const passed  = step > idx || done === 'success';
              const bg = passed ? '#10b981' : active ? amber : '#e5e7eb';
              return (
                <div key={i} style={{ flex:1, textAlign:'center' }}>
                  <div style={{ height:4, borderRadius:2, background: bg, transition:'background .3s' }} />
                  <div style={{ fontSize:'0.62rem', color: passed ? '#065f46' : active ? amber : '#9ca3af', marginTop:3, fontWeight: active ? 700 : 400 }}>
                    {lbl}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Live log ── */}
      {logs.length > 0 && (
        <div
          ref={logRef}
          style={{
            background:'#0f172a', borderRadius:6, padding:'8px 10px',
            maxHeight:160, overflowY:'auto', fontFamily:'monospace', fontSize:'0.72rem',
            marginBottom:10,
          }}
        >
          {logs.filter(l => l.type !== 'raw' || l.text).map((l, i) => {
            const col = l.type === 'ok'   ? '#86efac'
                      : l.type === 'warn' ? '#fcd34d'
                      : l.type === 'err'  ? '#fca5a5'
                      : l.type === 'step' ? '#93c5fd'
                      : l.type === 'done' ? '#86efac'
                      : '#9ca3af';
            const prefix = l.type === 'ok' ? '✓ ' : l.type === 'warn' ? '⚠ ' : l.type === 'err' ? '✗ ' : l.type === 'step' ? `[${l.step}/${l.total}] ` : '  ';
            return (
              <div key={i} style={{ color:col, marginBottom:1 }}>
                {prefix}{l.text}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Kết quả ── */}
      {done === 'success' && (
        <div style={{ padding:'8px 12px', background:'#d1fae5', borderRadius:6, color:'#065f46', fontSize:'0.82rem', display:'flex', alignItems:'center', gap:8 }}>
          <CheckCircle2 size={15} /> Camera đã sẵn sàng! Nhấn <b>Rescan Camera</b> ở trên để cập nhật danh sách.
        </div>
      )}
      {done === 'notfound' && (
        <div style={{ padding:'8px 12px', background:'#fef3c7', borderRadius:6, color:'#92400e', fontSize:'0.82rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontWeight:600, marginBottom:4 }}>
            <AlertTriangle size={14}/> Driver đã cài — nhưng camera chưa được nhận diện.
          </div>
          <div>Thử các bước: <b>(1)</b> Cắm lại cổng USB khác (ưu tiên USB 3.0 xanh) <b>(2)</b> Khởi động lại máy tính <b>(3)</b> Kiểm tra Device Manager</div>
        </div>
      )}
      {done === 'error' && (
        <div style={{ padding:'8px 12px', background:'#fee2e2', borderRadius:6, color:'#991b1b', fontSize:'0.82rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontWeight:600, marginBottom:4 }}>
            <AlertTriangle size={14}/> Lỗi cài driver.
          </div>
          <div>Hãy chạy lại với quyền Administrator, hoặc tải driver từ nhà sản xuất:</div>
          <button
            onClick={() => eAPI()?.openDriverUrl?.('https://www.magewell.com/downloads/usb-capture')}
            style={{ display:'flex', alignItems:'center', gap:5, marginTop:6, padding:'4px 10px', borderRadius:4, border:'1px solid #fca5a5', background:'white', color:'#991b1b', cursor:'pointer', fontSize:'0.78rem' }}
          >
            <Download size={12}/> Tải Magewell Driver
          </button>
        </div>
      )}

      {/* ── Footer tips ── */}
      <div style={{ marginTop:10, fontSize:'0.74rem', color:'#9ca3af', borderTop:`1px solid ${amberBd}`, paddingTop:8, display:'flex', gap:12, flexWrap:'wrap' }}>
        <span><Usb size={11} style={{verticalAlign:'middle'}}/> Thử cổng USB 3.0 (màu xanh) nếu không nhận</span>
        <span>🔄 Khởi động lại máy sau khi cài driver</span>
        <span>📋 Log lưu tại %TEMP%\dmh_cam_install.log</span>
      </div>
    </div>
  );
}
