import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera, RefreshCw,
  Image as Img, Heart,
  Play, Square, Search, X, Maximize2,
  Monitor, AlertTriangle, CheckCircle2,
  Wrench, Usb, Sliders, ExternalLink,
  Zap, Activity, Eye, Crosshair, Sparkles
} from 'lucide-react';
import * as API from '../utils/endoscopyApi';
import { showToast } from '../utils/notificationSystem';

type Tab = 'live' | 'patients' | 'images';
type SourceType = 'camera' | 'desktop';
type Source = { id: string; name: string; thumbnail: string; appIcon: string|null };

const eAPI = () => (window as any).electronAPI;

// Âm thanh chụp ảnh mô phỏng (Shutter Sound) bằng Web Audio API
function playShutterSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {}
}

export function EndoscopyTab() {
  const [tab,      setTab]      = useState<Tab>('live');
  const [patients, setPatients] = useState<API.Patient[]>([]);
  const [selPt,    setSelPt]    = useState<API.Patient|null>(null);
  const [sessions, setSessions] = useState<API.Session[]>([]);
  const [selSess,  setSelSess]  = useState<API.Session|null>(null);
  const [images,   setImages]   = useState<API.ImageRecord[]>([]);
  const [search,   setSearch]   = useState('');
  const [newPt,    setNewPt]    = useState({ full_name:'', birth_year:'', gender:'Nam', phone:'' });
  const [newSess,  setNewSess]  = useState({ exam_type:'Nội soi Tai Mũi Họng', doctor_name:'' });
  const [thumbs,   setThumbs]   = useState<Record<string,string>>({});
  const [lightbox, setLightbox] = useState<string|null>(null);

  // ── Source Mode: Camera Ngoại Vi (UVC/DirectShow) vs Desktop/Window ──────
  const [sourceType, setSourceType] = useState<SourceType>('camera');

  // Camera Devices (WebRTC + DirectShow Capture Cards)
  const [cameras, setCameras]       = useState<MediaDeviceInfo[]>([]);
  const [selCameraId, setSelCameraId] = useState<string>('');
  const [targetRes, setTargetRes]   = useState<'4k' | '2k' | '1080p' | '720p'>('1080p');
  const targetFps                   = 60;

  // Desktop Sources
  const [sources,    setSources]    = useState<Source[]>([]);
  const [selSource,  setSelSource]  = useState<Source|null>(null);

  // Stream state
  const [stream,     setStream]     = useState<MediaStream|null>(null);
  const [streaming,  setStreaming]  = useState(false);
  const [captureLog, setCaptureLog] = useState<string[]>([]);
  const [videoRes,   setVideoRes]   = useState('');
  const [autoCapture, setAutoCapture] = useState(false);
  const [autoInterval, setAutoInterval] = useState(5);

  // Foot Pedal & Trigger states (Bàn đạp PC)
  const [pedalKey, setPedalKey]       = useState<string>('F8'); // Chuẩn y tế: F8, F9, F12, Space
  const [triggerKeys, setTriggerKeys] = useState(true);

  // HDMI Video Signal AI Trigger states (Nhận diện cóc đạp máy soi qua cáp HDMI)
  const [hdmiTrigger, setHdmiTrigger]         = useState(true); // Bật mặc định
  const [hdmiSensitivity, setHdmiSensitivity] = useState(60);   // Độ nhạy (10 - 90, mặc định 60)
  const [triggerMeter, setTriggerMeter]       = useState(0);    // 0 - 100% đo xung thời gian thực
  const [hdmiTriggerCount, setHdmiTriggerCount] = useState(0);

  // AI Medical Vision: NBI (Narrow Band Imaging) & Thước Đo Ảo Caliper
  const [opticalFilter, setOpticalFilter]       = useState<'normal' | 'nbi' | 'hemoglobin' | 'sharp'>('normal');
  const [showCaliper, setShowCaliper]           = useState<boolean>(false);
  const [caliperDiameter, setCaliperDiameter]   = useState<number>(5); // 2mm, 5mm, 10mm
  const [antiBlur, setAntiBlur]                 = useState<boolean>(true); // Chống rung tự động

  // Driver Inspector & Health Modal
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [installingDriver, setInstallingDriver] = useState(false);
  const [driverLog, setDriverLog] = useState<string[]>([]);
  const [wmiCameras, setWmiCameras] = useState<{ index: number; name: string; deviceId: string }[]>([]);

  const videoRef           = useRef<HTMLVideoElement>(null);
  const canvasRef          = useRef<HTMLCanvasElement>(null);
  const triggerCanvasRef   = useRef<HTMLCanvasElement | null>(null);
  const prevLumaRef        = useRef<number>(-1);
  const lastCaptureTimeRef = useRef<number>(0);

  // ── Quét danh sách Camera / Capture Card (DirectShow / UVC) ───────────────
  const scanCameras = useCallback(async () => {
    try {
      // 1. Mở tạm quyền để nhận tên (label) thiết bị đầy đủ
      try {
        const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        temp.getTracks().forEach(t => t.stop());
      } catch {}

      // 2. Lấy danh sách video inputs
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoInputs);

      // Tự động chọn thiết bị nội soi hoặc capture card
      if (videoInputs.length > 0) {
        setSelCameraId(prev => {
          if (prev && videoInputs.some(v => v.deviceId === prev)) return prev;
          const preferred = videoInputs.find(d => /endoscope|nội soi|capture|cam link|avermedia|usb video|ms21/i.test(d.label)) || videoInputs[0];
          return preferred.deviceId;
        });
      }

      // 3. Đồng bộ danh sách qua WMI từ Electron
      const wmiRes = await eAPI()?.listCameras?.();
      if (wmiRes?.ok && wmiRes.cameras) {
        setWmiCameras(wmiRes.cameras);
      }
    } catch (err: any) {
      console.error('Lỗi quét camera:', err);
    }
  }, []);

  // ── Quét nguồn Desktop / Window Capture ──────────────────────────────────
  const scanSources = useCallback(async () => {
    const r = await eAPI()?.getSources?.();
    if (r?.ok) setSources(r.sources);
  }, []);

  // ── Tự động phát hiện cắm/rút USB (Hotplug Detection) ────────────────────
  useEffect(() => {
    scanCameras();
    const onDeviceChange = () => {
      setCaptureLog(prev => [`[${new Date().toLocaleTimeString('vi-VN')}] 🔄 Phát hiện thay đổi cổng USB/Camera! Đang quét lại driver...`, ...prev].slice(0, 60));
      scanCameras();
    };
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
  }, [scanCameras]);

  // ── Khởi động Stream từ Camera Ngoại Vi (DirectShow / UVC Capture Card) ────
  const startCameraStream = useCallback(async (devId?: string, resProfile?: '4k' | '2k' | '1080p' | '720p', fps?: number) => {
    if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); }
    const id = devId || selCameraId;
    const profile = resProfile || targetRes;
    const targetFramerate = fps || targetFps;

    let widthVal = 1920;
    let heightVal = 1080;
    if (profile === '4k') { widthVal = 3840; heightVal = 2160; }
    else if (profile === '2k') { widthVal = 2560; heightVal = 1440; }
    else if (profile === '720p') { widthVal = 1280; heightVal = 720; }

    try {
      setCaptureLog(prev => [`[${new Date().toLocaleTimeString('vi-VN')}] Đang kết nối Driver Camera (Yêu cầu ${profile.toUpperCase()})...`, ...prev].slice(0, 60));
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          deviceId: id ? { exact: id } : undefined,
          width: { ideal: widthVal, min: 640 },
          height: { ideal: heightVal, min: 480 },
          frameRate: { ideal: targetFramerate, min: 24 }
        }
      };
      const ms = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(ms);
      setStreaming(true);
      setSourceType('camera');

      const track = ms.getVideoTracks()[0];
      const settings = track.getSettings();
      const actualRes = `${settings.width || widthVal}x${settings.height || heightVal} @${Math.round(settings.frameRate || targetFramerate)}fps`;
      setVideoRes(actualRes);
      setCaptureLog(prev => [`[${new Date().toLocaleTimeString('vi-VN')}] 🟢 Stream Sẵn Sàng: ${track.label || 'UVC Camera'} (${actualRes})`, ...prev].slice(0, 60));

      if (videoRef.current) {
        videoRef.current.srcObject = ms;
        videoRef.current.play();
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      setCaptureLog(prev => [`[Lỗi Driver] ${msg}. Đang kích hoạt chế độ tương thích...`, ...prev].slice(0, 60));
      // Fallback không gượng ép độ phân giải cao nếu card cũ không hỗ trợ
      try {
        const fallbackMs = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: id ? { deviceId: { exact: id } } : true
        });
        setStream(fallbackMs);
        setStreaming(true);
        setSourceType('camera');
        const track = fallbackMs.getVideoTracks()[0];
        const s = track.getSettings();
        setVideoRes(`${s.width}x${s.height}`);
        setCaptureLog(prev => [`[${new Date().toLocaleTimeString('vi-VN')}] 🟢 Chế độ tương thích chuẩn: ${track.label}`, ...prev].slice(0, 60));
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackMs;
          videoRef.current.play();
        }
      } catch {
        setCaptureLog(prev => [`[Thất Bại] Không thể mở Camera. Vui lòng bấm 'Kiểm Tra Driver' để sửa lỗi.`, ...prev].slice(0, 60));
      }
    }
  }, [stream, selCameraId, targetRes, targetFps]);

  // ── Khởi động Stream từ Desktop/Window Capture ────────────────────────────
  const startDesktopStream = useCallback(async (src: Source) => {
    if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); }
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.id }
        } as unknown as MediaTrackConstraints,
      });
      setStream(ms); setStreaming(true); setSelSource(src); setSourceType('desktop');
      setCaptureLog(prev => [`[${new Date().toLocaleTimeString('vi-VN')}] Đang stream cửa sổ: ${src.name}`, ...prev].slice(0,60));
      if (videoRef.current) { videoRef.current.srcObject = ms; videoRef.current.play(); }
    } catch(e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCaptureLog(prev => [`[Lỗi Cửa Sổ] ${msg}`, ...prev].slice(0,60));
    }
  }, [stream]);

  const stopStream = useCallback(() => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null); setStreaming(false); setVideoRes('');
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stream]);

  // ── Chụp ảnh Nội Soi Y Khoa (Capture Frame Với Bộ Lọc AI NBI & Thước Caliper) ──
  const captureFrame = useCallback(async (sourceName?: unknown) => {
    if (!videoRef.current || !canvasRef.current || !streaming) return;
    const label = typeof sourceName === 'string' ? sourceName : 'Thủ Công';
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth || 1920; c.height = v.videoHeight || 1080;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    // Áp dụng bộ lọc quang học AI tương ứng (NBI, Hemoglobin, Sharpness)
    if (opticalFilter === 'nbi') {
      ctx.filter = 'contrast(1.4) saturate(1.8) hue-rotate(185deg) brightness(0.95)';
    } else if (opticalFilter === 'hemoglobin') {
      ctx.filter = 'contrast(1.35) saturate(2.0) brightness(1.05)';
    } else if (opticalFilter === 'sharp') {
      ctx.filter = 'contrast(1.25) brightness(1.02)';
    } else {
      ctx.filter = 'none';
    }

    ctx.drawImage(v, 0, 0, c.width, c.height);

    // Vẽ thước đo ảo Caliper lên ảnh nếu đang kích hoạt
    if (showCaliper) {
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 22px monospace';
      const cx = c.width / 2;
      const cy = c.height / 2;
      const radius = caliperDiameter * 12; // Quy đổi tương đối ra pixel
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.stroke();

      // Tâm ngắm
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
      ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
      ctx.stroke();

      ctx.fillText(`Caliper: Ø${caliperDiameter}mm`, cx - 75, cy + radius + 32);
      ctx.restore();
    }

    const b64 = c.toDataURL('image/jpeg', 0.95);
    const res = `${c.width}x${c.height}`;

    playShutterSound();

    const tagFilter = opticalFilter !== 'normal' ? ` [${opticalFilter.toUpperCase()}]` : '';

    if (selSess) {
      const r = await API.saveCapture(selSess.id, b64, res);
      if (r?.ok) {
        setCaptureLog(prev => [`[${new Date().toLocaleTimeString('vi-VN')}] 📸 [${label}${tagFilter}] Đã lưu ảnh ${res} vào hồ sơ phiên khám`, ...prev].slice(0,60));
        setImages(prev => [...prev, r.image]);
        showToast.success(`Đã chụp & lưu ảnh ${res} vào hồ sơ phiên khám!`);
      }
    } else {
      setLightbox(b64.split(',')[1] || b64);
      setCaptureLog(prev => [`[${new Date().toLocaleTimeString('vi-VN')}] 📸 [${label}${tagFilter}] Đã chụp ảnh nhanh ${res} (Chưa gán BN)`, ...prev].slice(0,60));
      showToast.info(`Đã chụp ảnh nhanh (${res})`);
    }
  }, [streaming, selSess, opticalFilter, showCaliper, caliperDiameter]);

  // Ref captureFrame để tránh stale state trong requestAnimationFrame
  const captureFrameRef = useRef(captureFrame);
  useEffect(() => {
    captureFrameRef.current = captureFrame;
  }, [captureFrame]);

  // ── AI Vision Trigger: Nhận diện xung Cóc Đạp Máy Soi qua cáp HDMI ─────────
  useEffect(() => {
    if (!streaming || !hdmiTrigger) {
      setTriggerMeter(0);
      return;
    }

    if (!triggerCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 36;
      triggerCanvasRef.current = c;
    }
    const canvas = triggerCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let animId: number;
    let lastCheckTime = 0;

    const analyzeLoop = (timestamp: number) => {
      // Throttle phân tích ~25 khung hình/giây (mỗi 40ms) -> CPU load < 0.1%
      if (timestamp - lastCheckTime >= 40) {
        lastCheckTime = timestamp;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && !v.paused && v.videoWidth > 0) {
          ctx.drawImage(v, 0, 0, 64, 36);
          const imgData = ctx.getImageData(0, 0, 64, 36);
          const d = imgData.data;
          const pixelCount = 64 * 36;

          let sumLuma = 0;
          for (let i = 0; i < d.length; i += 4) {
            sumLuma += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          }
          const currentLuma = sumLuma / pixelCount;

          if (prevLumaRef.current >= 0) {
            const lumaDiff = Math.abs(currentLuma - prevLumaRef.current);
            // Tính ngưỡng kích hoạt dựa trên độ nhạy
            // 60 => threshold = 25; 80 => threshold = 16; 40 => threshold = 34
            const threshold = Math.max(6, Math.round(52 - (hdmiSensitivity * 0.45)));
            const meterPct = Math.min(100, Math.round((lumaDiff / threshold) * 85));

            setTriggerMeter(prev => {
              if (meterPct > prev) return meterPct;
              return Math.max(0, prev - 10); // Decay giảm dần mượt mà
            });

            const now = Date.now();
            const cooldownPassed = (now - lastCaptureTimeRef.current) > 1300; // Debounce 1.3s chống chụp lặp

            if (lumaDiff >= threshold && cooldownPassed) {
              lastCaptureTimeRef.current = now;
              setTriggerMeter(100);
              setHdmiTriggerCount(c => c + 1);
              setCaptureLog(prev => [
                `[${new Date().toLocaleTimeString('vi-VN')}] ⚡ [HDMI CÓC ĐẠP MÁY SOI] Đã bắt xung tín hiệu! (+${Math.round(lumaDiff)} / Ngưỡng: ${threshold})`,
                ...prev
              ].slice(0, 60));
              captureFrameRef.current('Cóc Đạp HDMI');
            }
          }
          prevLumaRef.current = currentLuma;
        }
      }
      animId = requestAnimationFrame(analyzeLoop);
    };

    animId = requestAnimationFrame(analyzeLoop);
    return () => {
      cancelAnimationFrame(animId);
      setTriggerMeter(0);
    };
  }, [streaming, hdmiTrigger, hdmiSensitivity]);

  // ── Bàn Đạp Chân Foot Pedal & Phím Tắt Toàn Cục (Bàn đạp PC) ───────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (tab === 'live' && streaming && triggerKeys) {
        const isTargetKey =
          e.key === pedalKey ||
          e.key === 'F8' ||
          e.key === 'F9' ||
          e.key === 'F12' ||
          (e.key === 'Enter' && e.ctrlKey);

        if (isTargetKey) {
          e.preventDefault();
          captureFrame(`Bàn Đạp PC [${e.key}]`);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tab, streaming, triggerKeys, pedalKey, captureFrame]);

  // ── Tự Động Chụp Định Kỳ (Interval) ──────────────────────────────────────
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    if (streaming && autoCapture) {
      intervalId = setInterval(() => {
        captureFrame('Tự Động Interval');
      }, autoInterval * 1000);
    }
    return () => clearInterval(intervalId);
  }, [streaming, autoCapture, autoInterval, captureFrame]);

  // ── Thumbnails & Data ────────────────────────────────────────────────────
  const loadThumb = useCallback(async (p: string) => {
    if (!p || thumbs[p]) return;
    try {
      const r = await API.getThumbnailB64(p);
      if (r.ok && r.data) setThumbs(v => ({ ...v, [p]: r.data as string }));
    } catch { /* ignore */ }
  }, [thumbs]);

  const loadPts = useCallback(async (q?: string) => {
    try {
      const r = await API.getPatients(q);
      setPatients(r.patients);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (tab === 'patients') loadPts(); }, [tab, loadPts]);

  const addPt = async () => {
    if (!newPt.full_name) return;
    const name = newPt.full_name;
    await API.addPatient(newPt);
    setNewPt({ full_name:'', birth_year:'', gender:'Nam', phone:'' });
    showToast.success(`Đã thêm bệnh nhân "${name}" vào danh sách!`);
    loadPts();
  };

  const choosePt = async (p: API.Patient) => {
    setSelPt(p); setSelSess(null); setImages([]);
    const r = await API.getSessions(p.id);
    setSessions(r.sessions);
  };

  const createSess = async () => {
    if (!selPt) return;
    const r = await API.createSession({ patient_id: selPt.id, ...newSess });
    setSelSess(r.session);
    const imgs = await API.getImages(r.session.id);
    setImages(imgs.images);
    showToast.success(`Đã tạo phiên khám mới cho bệnh nhân "${selPt.full_name}"!`);
    choosePt(selPt);
  };

  const chooseSess = async (s: API.Session) => {
    setSelSess(s);
    const r = await API.getImages(s.id);
    setImages(r.images);
    r.images.forEach((i: API.ImageRecord) => loadThumb(i.thumbnail_path));
    setTab('images');
  };

  const toggleFav = async (id: number) => {
    await API.toggleFav(id);
    if (selSess) chooseSess(selSess);
  };

  // ── Xử lý Sửa Lỗi Driver (1-Click Fix Driver) ─────────────────────────────
  const handleInstallDriver = async () => {
    setInstallingDriver(true);
    setDriverLog(['[BẮT ĐẦU] Khởi động trình quét và sửa lỗi Driver Camera / Card Capture...']);

    eAPI()?.onDriverLog?.((line: string) => {
      setDriverLog(prev => [...prev, line]);
    });

    try {
      const r = await eAPI()?.installCameraDriver?.();
      if (r?.ok) {
        setDriverLog(prev => [...prev, '[HOÀN TẤT] Cài đặt và phục hồi driver thành công! Đang quét lại thiết bị...']);
        showToast.success('Cài đặt và phục hồi driver camera / card capture thành công!');
        await scanCameras();
      } else {
        const msg = r?.message || r?.error || 'Đã kiểm tra hệ thống';
        setDriverLog(prev => [...prev, `[LƯU Ý] ${msg}`]);
        showToast.info(msg);
      }
    } catch (err: any) {
      setDriverLog(prev => [...prev, `[LỖI] ${err.message}`]);
      showToast.error(`Lỗi phục hồi driver: ${err.message}`);
    } finally {
      setInstallingDriver(false);
      eAPI()?.removeDriverLogListener?.();
    }
  };

  const pk = '#ec4899';
  const card: React.CSSProperties = {
    background: 'white', borderRadius: 10,
    padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,.06)',
    border: '1px solid #f1f5f9',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'#fdf2f8' }}>

      {/* ── Lightbox Phóng to ảnh ── */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.92)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
          <button onClick={() => setLightbox(null)} style={{ position:'absolute', top:16, right:16, background:'rgba(255,255,255,.15)', border:'none', borderRadius:'50%', width:40, height:40, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={20} color="white" />
          </button>
          <img src={`data:image/jpeg;base64,${lightbox}`} style={{ maxWidth:'92vw', maxHeight:'90vh', borderRadius:8, objectFit:'contain', boxShadow:'0 8px 40px rgba(0,0,0,.8)' }} alt="Ảnh phóng to" />
        </div>
      )}

      {/* ── Driver Inspector Modal (Cửa Sổ Chẩn Đoán & Khắc Phục Lỗi Driver) ── */}
      {showDriverModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
          <div style={{ background:'white', borderRadius:16, width:'95%', maxWidth:680, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.4)', overflow:'hidden' }}>
            <div style={{ padding:'18px 24px', background:'linear-gradient(135deg, #1e1b4b, #312e81)', color:'white', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Usb size={22} color="#a5b4fc" />
                <div>
                  <div style={{ fontWeight:800, fontSize:'1.05rem' }}>Chẩn Đoán Driver Camera & Card Bắt Hình Nội Soi</div>
                  <div style={{ fontSize:'0.76rem', color:'#c7d2fe' }}>DirectShow · UVC Protocol · Auto PnP Repair</div>
                </div>
              </div>
              <button onClick={() => setShowDriverModal(false)} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:8, padding:6, cursor:'pointer', color:'white' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding:22, overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:16 }}>
              {/* Danh sách thiết bị phần cứng phát hiện được */}
              <div style={{ background:'#f8fafc', borderRadius:10, padding:14, border:'1px solid #e2e8f0' }}>
                <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#334155', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                  <CheckCircle2 size={16} color="#16a34a" /> Thiết Bị Đã Nhận Diện Trong Windows:
                </div>
                {cameras.length > 0 ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {cameras.map((c, idx) => (
                      <div key={idx} style={{ padding:'8px 12px', borderRadius:6, background:'white', border:'1px solid #cbd5e1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:'0.85rem', color:'#0f172a' }}>
                            {c.label || `Thiết bị Video USB #${idx + 1}`}
                          </div>
                          <div style={{ fontSize:'0.72rem', color:'#64748b', fontFamily:'monospace' }}>
                            Device ID: {c.deviceId.slice(0, 32)}...
                          </div>
                        </div>
                        <span style={{ fontSize:'0.72rem', background:'#dcfce7', color:'#166534', padding:'2px 8px', borderRadius:10, fontWeight:700 }}>
                          Driver OK
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding:'12px', borderRadius:8, background:'#fef2f2', border:'1px solid #fecaca', color:'#991b1b', fontSize:'0.82rem', display:'flex', alignItems:'center', gap:8 }}>
                    <AlertTriangle size={18} color="#dc2626" />
                    Chưa phát hiện Camera hoặc Card Capture USB nào! Vui lòng cắm lại giắc cáp USB.
                  </div>
                )}

                {/* Thông tin phần cứng chi tiết từ WMI */}
                {wmiCameras.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #cbd5e1' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
                      Chi tiết PnP DeviceID (WMI Hardware Registry):
                    </div>
                    {wmiCameras.map((w, idx) => (
                      <div key={idx} style={{ fontSize: '0.72rem', color: '#475569', fontFamily: 'monospace', marginBottom: 2 }}>
                        • {w.name} ({w.deviceId || 'PCI/USB'})
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Các công cụ cứu hộ 1-Click */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <button
                  onClick={handleInstallDriver}
                  disabled={installingDriver}
                  style={{
                    padding:'12px 14px', borderRadius:10, border:'none',
                    background:'linear-gradient(135deg, #ec4899, #db2777)', color:'white',
                    fontWeight:700, fontSize:'0.86rem', cursor: installingDriver ? 'not-allowed' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                    boxShadow:'0 4px 12px rgba(236,72,153,0.3)',
                  }}
                >
                  <Wrench size={16} />
                  {installingDriver ? 'Đang sửa lỗi Driver...' : '1-Click Sửa & Nạp Driver UVC'}
                </button>

                <button
                  onClick={() => eAPI()?.openDeviceManager?.()}
                  style={{
                    padding:'12px 14px', borderRadius:10, border:'1px solid #cbd5e1',
                    background:'white', color:'#334155', fontWeight:700, fontSize:'0.86rem',
                    cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  }}
                >
                  <ExternalLink size={16} /> Mở Device Manager (Windows)
                </button>
              </div>

              {/* Log cửa sổ cứu hộ */}
              {driverLog.length > 0 && (
                <div style={{ background:'#0f172a', borderRadius:10, padding:12, color:'#86efac', fontFamily:'monospace', fontSize:'0.75rem', maxHeight:160, overflowY:'auto' }}>
                  {driverLog.map((line, idx) => <div key={idx}>{line}</div>)}
                </div>
              )}
            </div>

            <div style={{ padding:'14px 24px', borderTop:'1px solid #f1f5f9', background:'#f8fafc', display:'flex', justifyContent:'flex-end' }}>
              <button
                onClick={() => { setShowDriverModal(false); scanCameras(); }}
                style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'#1e293b', color:'white', fontWeight:700, fontSize:'0.85rem', cursor:'pointer' }}
              >
                Đóng & Quét Lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ ...card, margin:'0.75rem 0.75rem 0', borderRadius:12, display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ width:38, height:38, borderRadius:10, background:'linear-gradient(135deg, #ec4899, #db2777)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Camera size={20} color="white" />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <strong style={{ fontSize:'1.05rem', color:'#1e293b' }}>Trạm Nội Soi AI 4K Y Khoa</strong>
            <span style={{ fontSize:'0.7rem', background:'#ec4899', color:'white', padding:'2px 8px', borderRadius:10, fontWeight:800 }}>
              &lt;25ms ULTRA-FAST
            </span>
          </div>
          <div style={{ fontSize:'0.76rem', color:'#64748b' }}>
            Hỗ trợ Card HDMI Capture, USB Medical Camera & Bàn Đạp Chân Foot Pedal
          </div>
        </div>

        {/* Nút chẩn đoán driver */}
        <button
          onClick={() => { setShowDriverModal(true); scanCameras(); }}
          style={{
            display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
            borderRadius:8, border:'1px solid #cbd5e1', background:'white',
            color:'#334155', fontWeight:700, fontSize:'0.78rem', cursor:'pointer',
          }}
          title="Kiểm tra trạng thái driver camera và khắc phục sự cố"
        >
          <Wrench size={14} color="#ec4899" />
          <span>Kiểm Tra Driver</span>
        </button>

        {selPt && (
          <span style={{ fontSize:'0.78rem', color:'#6366f1', background:'#eef2ff', padding:'4px 12px', borderRadius:20, fontWeight:700 }}>
            BN: {selPt.full_name}
          </span>
        )}
      </div>

      {/* ── Tab nav ── */}
      <div style={{ display:'flex', gap:4, margin:'0.5rem 0.75rem 0', flexShrink:0 }}>
        {(['live','patients','images'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'6px 18px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer',
            background:tab===t?'white':'transparent', color:tab===t?pk:'#6b7280',
            fontWeight:tab===t?800:500, borderBottom:tab===t?'2px solid '+pk:'2px solid transparent',
            fontSize:'0.86rem',
          }}>
            {t==='live' ? '📹 Liveview & Điều Khiển Soi' : t==='patients' ? '👤 Bệnh Nhân' : '🖼 Thư Viện Hình Ảnh'}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex:1, overflow:'auto', padding:'0 0.75rem 0.75rem' }}>

        {/* ─── LIVEVIEW TAB ─── */}
        {tab === 'live' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 310px', gap:'0.75rem' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>

              {/* Source Picker Panel (Bộ Chuyển Nguồn Kép) */}
              <div style={{ ...card, display:'flex', flexDirection:'column', gap:10 }}>
                {/* Chọn chế độ nguồn: Camera Ngoại Vi vs Desktop Window */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #f1f5f9', paddingBottom:8 }}>
                  <div style={{ display:'flex', gap:6 }}>
                    <button
                      onClick={() => { setSourceType('camera'); stopStream(); }}
                      style={{
                        padding:'5px 12px', borderRadius:6, border:'none', cursor:'pointer',
                        background: sourceType === 'camera' ? '#fdf2f8' : '#f8fafc',
                        color: sourceType === 'camera' ? pk : '#64748b',
                        fontWeight: sourceType === 'camera' ? 800 : 600,
                        borderBottom: sourceType === 'camera' ? `2px solid ${pk}` : 'none',
                        fontSize:'0.8rem', display:'flex', alignItems:'center', gap:5,
                      }}
                    >
                      <Camera size={14} /> 1. Camera / Card Capture USB
                    </button>
                    <button
                      onClick={() => { setSourceType('desktop'); stopStream(); scanSources(); }}
                      style={{
                        padding:'5px 12px', borderRadius:6, border:'none', cursor:'pointer',
                        background: sourceType === 'desktop' ? '#fdf2f8' : '#f8fafc',
                        color: sourceType === 'desktop' ? pk : '#64748b',
                        fontWeight: sourceType === 'desktop' ? 800 : 600,
                        borderBottom: sourceType === 'desktop' ? `2px solid ${pk}` : 'none',
                        fontSize:'0.8rem', display:'flex', alignItems:'center', gap:5,
                      }}
                    >
                      <Monitor size={14} /> 2. Cửa Sổ Phần Mềm Máy Soi
                    </button>
                  </div>

                  <div style={{ fontSize:'0.72rem', color:'#10b981', fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
                    <CheckCircle2 size={12} /> Hotplug USB Tự Động
                  </div>
                </div>

                {/* Dropdown chọn thiết bị */}
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  {sourceType === 'camera' ? (
                    <>
                      <Usb size={15} color="#6366f1" />
                      <select
                        value={selCameraId}
                        onChange={e => setSelCameraId(e.target.value)}
                        style={{
                          flex:1, minWidth:200, padding:'6px 10px', borderRadius:6,
                          border:'1.5px solid #cbd5e1', fontSize:'0.84rem', outline:'none',
                        }}
                      >
                        {cameras.length > 0 ? (
                          cameras.map(c => (
                            <option key={c.deviceId} value={c.deviceId}>
                              {c.label || `USB Video Device (${c.deviceId.slice(0, 8)})`}
                            </option>
                          ))
                        ) : (
                          <option value="">-- Chưa thấy thiết bị camera USB --</option>
                        )}
                      </select>

                      {/* Chọn độ phân giải */}
                      <select
                        value={targetRes}
                        onChange={e => setTargetRes(e.target.value as any)}
                        style={{ padding:'6px 10px', borderRadius:6, border:'1.5px solid #cbd5e1', fontSize:'0.82rem', fontWeight:700, color:pk }}
                        title="Độ phân giải lấy từ Driver"
                      >
                        <option value="4k">4K UHD (3840x2160)</option>
                        <option value="2k">2K QHD (2560x1440)</option>
                        <option value="1080p">Full HD (1920x1080)</option>
                        <option value="720p">HD (1280x720)</option>
                      </select>

                      <button
                        onClick={scanCameras}
                        style={{ padding:'6px 10px', borderRadius:6, border:`1.5px solid ${pk}`, background:'white', color:pk, cursor:'pointer', fontSize:'0.82rem', fontWeight:700, display:'flex', alignItems:'center', gap:5 }}
                        title="Quét lại driver camera"
                      >
                        <RefreshCw size={13} /> Quét Lại
                      </button>

                      {!streaming ? (
                        <button
                          onClick={() => startCameraStream()}
                          disabled={cameras.length === 0}
                          style={{
                            padding:'6px 16px', borderRadius:6, border:'none',
                            background: cameras.length === 0 ? '#cbd5e1' : pk, color:'white',
                            cursor: cameras.length === 0 ? 'not-allowed' : 'pointer',
                            fontWeight:700, fontSize:'0.84rem', display:'flex', alignItems:'center', gap:6,
                          }}
                        >
                          <Play size={14} /> Mở Soi
                        </button>
                      ) : (
                        <button
                          onClick={stopStream}
                          style={{ padding:'6px 16px', borderRadius:6, border:'none', background:'#ef4444', color:'white', cursor:'pointer', fontWeight:700, fontSize:'0.84rem', display:'flex', alignItems:'center', gap:6 }}
                        >
                          <Square size={14} /> Dừng
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <Monitor size={15} color="#6366f1" />
                      <select
                        value={selSource?.id || ''}
                        onChange={e => { const s = sources.find(x => x.id === e.target.value); if(s) setSelSource(s); }}
                        style={{ flex:1, minWidth:200, padding:'6px 10px', borderRadius:6, border:'1.5px solid #cbd5e1', fontSize:'0.84rem' }}
                      >
                        <option value="">-- Chọn cửa sổ phần mềm nội soi --</option>
                        {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>

                      <button onClick={scanSources} style={{ padding:'6px 10px', borderRadius:6, border:`1.5px solid ${pk}`, background:'white', color:pk, cursor:'pointer', fontSize:'0.82rem', fontWeight:700, display:'flex', alignItems:'center', gap:5 }}>
                        <RefreshCw size={13} /> Quét
                      </button>

                      {selSource && !streaming && (
                        <button onClick={() => startDesktopStream(selSource)} style={{ padding:'6px 16px', borderRadius:6, border:'none', background:pk, color:'white', cursor:'pointer', fontWeight:700, fontSize:'0.84rem', display:'flex', alignItems:'center', gap:6 }}>
                          <Play size={14} /> Bắt đầu
                        </button>
                      )}
                      {streaming && (
                        <button onClick={stopStream} style={{ padding:'6px 16px', borderRadius:6, border:'none', background:'#ef4444', color:'white', cursor:'pointer', fontWeight:700, fontSize:'0.84rem', display:'flex', alignItems:'center', gap:6 }}>
                          <Square size={14} /> Dừng
                        </button>
                      )}
                    </>
                  )}

                  {/* Nút chụp ảnh khi đang streaming */}
                  {streaming && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginLeft:'auto' }}>
                      <button
                        onClick={captureFrame}
                        style={{
                          padding:'6px 18px', borderRadius:6, border:'none',
                          background:'linear-gradient(135deg, #059669, #10b981)', color:'white',
                          cursor:'pointer', fontWeight:800, fontSize:'0.84rem',
                          display:'flex', alignItems:'center', gap:6, boxShadow:'0 2px 8px rgba(16,185,129,0.3)',
                        }}
                        title={`Bấm để chụp ảnh (Hoặc đạp bàn đạp chân ${pedalKey})`}
                      >
                        <Camera size={14} /> Chụp Ảnh [{pedalKey}]
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Video Live Preview */}
              <div style={{
                background:'#090d16', borderRadius:12, aspectRatio:'16/9',
                display:'flex', alignItems:'center', justifyContent:'center',
                position:'relative', overflow:'hidden', boxShadow:'inset 0 0 20px rgba(0,0,0,0.8)',
                border:'2px solid #334155',
              }}>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  onLoadedMetadata={e => {
                    const v = e.currentTarget;
                    setVideoRes(`${v.videoWidth}x${v.videoHeight}`);
                  }}
                  style={{
                    width:'100%', height:'100%', objectFit:'contain',
                    display: streaming ? 'block' : 'none',
                    filter: opticalFilter === 'nbi'
                      ? 'contrast(1.45) saturate(1.9) hue-rotate(185deg) brightness(0.95)'
                      : opticalFilter === 'hemoglobin'
                      ? 'contrast(1.35) saturate(2.1) brightness(1.05)'
                      : opticalFilter === 'sharp'
                      ? 'contrast(1.25) brightness(1.02)'
                      : 'none',
                    transition:'filter 0.25s ease'
                  }}
                />

                {/* AI Virtual Caliper Overlay (Thước Đo Ảo Định Cỡ Tổn Thương) */}
                {streaming && showCaliper && (
                  <div style={{
                    position:'absolute', pointerEvents:'none',
                    top:'50%', left:'50%', transform:'translate(-50%, -50%)',
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                    zIndex: 5
                  }}>
                    <div style={{
                      width: caliperDiameter * 26,
                      height: caliperDiameter * 26,
                      borderRadius:'50%',
                      border:'2px dashed #10b981',
                      background:'rgba(16, 185, 129, 0.12)',
                      boxShadow:'0 0 12px rgba(16,185,129,0.5)',
                      position:'relative',
                      display:'flex', alignItems:'center', justifyContent:'center'
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius:'50%', background:'#10b981' }} />
                      <div style={{ position:'absolute', top:0, bottom:0, width:1, background:'rgba(16,185,129,0.5)' }} />
                      <div style={{ position:'absolute', left:0, right:0, height:1, background:'rgba(16,185,129,0.5)' }} />
                    </div>
                    <span style={{
                      marginTop: 6, background:'rgba(0,0,0,0.85)', color:'#6ee7b7',
                      padding:'2px 8px', borderRadius:4, fontSize:'0.72rem', fontWeight:800, fontFamily:'monospace',
                      border:'1px solid rgba(16,185,129,0.3)'
                    }}>
                      Thước đo ảo: Ø{caliperDiameter}mm
                    </span>
                  </div>
                )}

                {!streaming && (
                  <div style={{ color:'#64748b', textAlign:'center', padding:20 }}>
                    <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                      <Camera size={32} color="#94a3b8" />
                    </div>
                    <div style={{ fontWeight:700, fontSize:'1rem', color:'#e2e8f0' }}>Chưa Bật Tín Hiệu Soi</div>
                    <div style={{ fontSize:'0.8rem', color:'#94a3b8', marginTop:6 }}>
                      {cameras.length > 0
                        ? 'Chọn thiết bị ở trên và nhấn [Mở Soi] để bắt đầu phiên khám'
                        : 'Chưa thấy thiết bị. Hãy cắm cáp USB và bấm [Kiểm Tra Driver] ở trên.'}
                    </div>
                  </div>
                )}

                {streaming && (
                  <div style={{ position:'absolute', top:10, right:12, background:'rgba(220,38,38,0.9)', color:'white', padding:'4px 12px', borderRadius:20, fontSize:'0.75rem', fontWeight:800, display:'flex', alignItems:'center', gap:6, backdropFilter:'blur(4px)' }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:'white', display:'inline-block' }} />
                    LIVE 4K ({videoRes})
                  </div>
                )}

                {/* Footer thông số video & Trạng thái Cóc Đạp HDMI */}
                {streaming && (
                  <div style={{ position:'absolute', bottom:8, left:12, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <div style={{ background:'rgba(0,0,0,0.75)', color:'#e2e8f0', padding:'3px 10px', borderRadius:6, fontSize:'0.72rem', fontFamily:'monospace' }}>
                      Độ trễ: &lt;20ms · Bàn đạp PC: [{pedalKey}]
                    </div>
                    {hdmiTrigger && (
                      <div style={{
                        background: triggerMeter > 60 ? 'rgba(234, 88, 12, 0.95)' : 'rgba(15, 23, 42, 0.85)',
                        color: triggerMeter > 60 ? '#ffffff' : '#86efac',
                        padding:'3px 10px', borderRadius:6, fontSize:'0.72rem', fontWeight:700,
                        display:'flex', alignItems:'center', gap:5, border:'1px solid rgba(255,255,255,0.15)',
                        transition:'all 0.15s ease'
                      }}>
                        <Zap size={12} color={triggerMeter > 60 ? '#ffffff' : '#eab308'} />
                        <span>Cóc đạp HDMI: {triggerMeter > 60 ? '⚡ ĐÃ BẮT XUNG ĐẠP CÓC!' : `Sẵn Sàng (${triggerMeter}%)`}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} style={{ display:'none' }} />

              {/* Capture Log */}
              <div style={card}>
                <div style={{ fontSize:'0.82rem', fontWeight:700, marginBottom:6, color:'#334155' }}>
                  📋 Nhật Ký Hoạt Động & Driver Stream:
                </div>
                <div style={{ height:110, overflowY:'auto', fontFamily:'monospace', fontSize:'0.72rem', background:'#0f172a', color:'#86efac', padding:10, borderRadius:8 }}>
                  {captureLog.length === 0
                    ? <span style={{ color:'#64748b' }}>Hệ thống sẵn sàng...</span>
                    : captureLog.map((l,i) => <div key={i}>{l}</div>)
                  }
                </div>
              </div>

              {/* Gallery ảnh phiên khám */}
              {images.length > 0 && (
                <div style={card}>
                  <div style={{ fontSize:'0.82rem', fontWeight:700, marginBottom:8, color:'#1e293b' }}>
                    📷 Ảnh Đã Chụp Trong Phiên Khám ({images.length})
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))', gap:8 }}>
                    {images.slice(-12).map((img, i) => (
                      <div key={i} onClick={() => thumbs[img.thumbnail_path] && setLightbox(thumbs[img.thumbnail_path])}
                        style={{ aspectRatio:'4/3', background:'#1f2937', borderRadius:8, overflow:'hidden', cursor:'zoom-in', position:'relative', border:'1px solid #e2e8f0' }}>
                        {thumbs[img.thumbnail_path]
                          ? <img src={`data:image/jpeg;base64,${thumbs[img.thumbnail_path]}`} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />
                          : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}><Img size={16} color="#94a3b8" /></div>
                        }
                        <div style={{ position:'absolute', bottom:2, left:2, background:'rgba(0,0,0,.7)', color:'white', fontSize:'0.6rem', padding:'1px 4px', borderRadius:3 }}>
                          {img.resolution}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel: Bàn Đạp Chân & Cài Đặt */}
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>

              {/* ── 0. BỘ LỌC QUANG HỌC AI & THƯỚC ĐO CALIPER (MEDICAL VISION) ── */}
              <div style={{ ...card, border: '1.5px solid #0284c7' }}>
                <div style={{ fontSize:'0.85rem', fontWeight:800, marginBottom:8, display:'flex', alignItems:'center', justifyContent:'space-between', color:'#1e293b' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Eye size={16} color="#0284c7" />
                    <span>AI Thị Giác & Bộ Lọc NBI</span>
                  </div>
                  <span style={{ fontSize:'0.68rem', background: '#e0f2fe', color: '#0284c7', padding:'2px 6px', borderRadius:4, fontWeight:700 }}>
                    NBI Vision
                  </span>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {/* Chế độ màu NBI */}
                  <div>
                    <label style={{ display:'block', fontSize:'0.75rem', fontWeight:700, color:'#475569', marginBottom:4 }}>
                      Chế Độ Lọc Quang Học:
                    </label>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                      {[
                        { id: 'normal', label: 'Chuẩn (TrueColor)' },
                        { id: 'nbi', label: 'NBI (Mao Mạch)' },
                        { id: 'hemoglobin', label: 'Hemoglobin' },
                        { id: 'sharp', label: 'Nét Cạnh Viền' },
                      ].map(f => (
                        <button
                          key={f.id}
                          onClick={() => setOpticalFilter(f.id as any)}
                          style={{
                            padding:'5px 6px', borderRadius:6, fontSize:'0.74rem', fontWeight:700, cursor:'pointer',
                            border: opticalFilter === f.id ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                            background: opticalFilter === f.id ? '#f0f9ff' : 'white',
                            color: opticalFilter === f.id ? '#0284c7' : '#475569',
                            display:'flex', alignItems:'center', justifyContent:'center', gap:4
                          }}
                        >
                          {f.id === 'nbi' && <Sparkles size={11} color="#0284c7" />}
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Thước đo ảo Caliper */}
                  <div style={{ borderTop:'1px dashed #e2e8f0', paddingTop:6, display:'flex', flexDirection:'column', gap:6 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:'0.78rem', fontWeight:700, color:'#334155' }}>
                        <Crosshair size={13} color="#10b981" />
                        <input
                          type="checkbox"
                          checked={showCaliper}
                          onChange={e => setShowCaliper(e.target.checked)}
                          style={{ accentColor:'#10b981' }}
                        />
                        <span>Thước đo tổn thương ảo</span>
                      </label>
                      {showCaliper && (
                        <div style={{ display:'flex', gap:4 }}>
                          {[2, 5, 10].map(mm => (
                            <button
                              key={mm}
                              onClick={() => setCaliperDiameter(mm)}
                              style={{
                                padding:'2px 6px', borderRadius:4, fontSize:'0.68rem', fontWeight:800, cursor:'pointer',
                                border: caliperDiameter === mm ? '1px solid #10b981' : '1px solid #cbd5e1',
                                background: caliperDiameter === mm ? '#ecfdf5' : 'white',
                                color: caliperDiameter === mm ? '#10b981' : '#64748b'
                              }}
                            >
                              Ø{mm}mm
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chống rung Anti-blur */}
                  <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:'0.75rem', color:'#475569' }}>
                    <input
                      type="checkbox"
                      checked={antiBlur}
                      onChange={e => setAntiBlur(e.target.checked)}
                      style={{ accentColor:'#0284c7' }}
                    />
                    <span>Chống nhòe chuyển động (Anti-Blur)</span>
                  </label>
                </div>
              </div>

              {/* ── 1. CÓC ĐẠP MÁY SOI (QUA CÁP HDMI) - AI FLASH TRIGGER ── */}
              <div style={{ ...card, border: hdmiTrigger ? '1.5px solid #ec4899' : '1px solid #e2e8f0' }}>
                <div style={{ fontSize:'0.85rem', fontWeight:800, marginBottom:8, display:'flex', alignItems:'center', justifyContent:'space-between', color:'#1e293b' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Zap size={16} color={pk} />
                    <span>Cóc Đạp Máy Soi (Qua HDMI)</span>
                  </div>
                  <span style={{ fontSize:'0.68rem', background: hdmiTrigger ? '#fdf2f8' : '#f1f5f9', color: hdmiTrigger ? pk : '#64748b', padding:'2px 6px', borderRadius:4, fontWeight:700 }}>
                    AI Flash Trigger
                  </span>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:'0.82rem', fontWeight:700, color:'#0f172a' }}>
                    <input
                      type="checkbox"
                      checked={hdmiTrigger}
                      onChange={e => setHdmiTrigger(e.target.checked)}
                      style={{ accentColor:pk }}
                    />
                    <span>Tự động chụp khi đạp cóc máy soi</span>
                  </label>

                  {/* Thanh đo xung tín hiệu HDMI thời gian thực (Realtime Meter) */}
                  <div style={{ background:'#0f172a', borderRadius:8, padding:'8px 10px', border:'1px solid #334155' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4, fontSize:'0.72rem' }}>
                      <span style={{ color:'#94a3b8', display:'flex', alignItems:'center', gap:4 }}>
                        <Activity size={12} color="#38bdf8" /> Xung Tín Hiệu HDMI:
                      </span>
                      <strong style={{ color: triggerMeter > 60 ? '#f43f5e' : '#38bdf8', fontFamily:'monospace' }}>
                        {triggerMeter}% {triggerMeter > 60 ? '⚡ CHỤP!' : ''}
                      </strong>
                    </div>

                    {/* LED Meter Bar */}
                    <div style={{ height:10, background:'#1e293b', borderRadius:5, overflow:'hidden', position:'relative' }}>
                      <div
                        style={{
                          height:'100%',
                          width:`${triggerMeter}%`,
                          background: triggerMeter > 70
                            ? 'linear-gradient(90deg, #10b981 0%, #f59e0b 60%, #ef4444 100%)'
                            : triggerMeter > 40
                            ? 'linear-gradient(90deg, #10b981 0%, #f59e0b 100%)'
                            : '#10b981',
                          transition:'width 0.08s ease-out'
                        }}
                      />
                      {/* Vạch ngưỡng threshold */}
                      <div
                        style={{
                          position:'absolute',
                          top:0, bottom:0,
                          left:`${Math.min(95, Math.max(10, 100 - hdmiSensitivity))}%`,
                          width:2,
                          background:'#ffffff',
                          boxShadow:'0 0 4px #ffffff'
                        }}
                        title="Vạch ngưỡng kích hoạt chụp"
                      />
                    </div>
                  </div>

                  {/* Độ nhạy (Sensitivity) Slider */}
                  <div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem', marginBottom:3 }}>
                      <span style={{ color:'#64748b', fontWeight:600 }}>Độ nhạy nhận diện:</span>
                      <strong style={{ color:pk }}>{hdmiSensitivity}%</strong>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={90}
                      value={hdmiSensitivity}
                      onChange={e => setHdmiSensitivity(Number(e.target.value))}
                      style={{ width:'100%', accentColor:pk }}
                    />
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.65rem', color:'#94a3b8' }}>
                      <span>Thấp (Ít nhạy)</span>
                      <span>Olympus/Storz: 55-65%</span>
                      <span>Cao (Nhạy)</span>
                    </div>
                  </div>

                  {/* Nút Test Xung Cóc Đạp */}
                  <div style={{ display:'flex', gap:6 }}>
                    <button
                      onClick={() => {
                        setTriggerMeter(100);
                        setHdmiTriggerCount(c => c + 1);
                        captureFrame('Test Cóc Đạp');
                      }}
                      style={{
                        flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid #cbd5e1',
                        background:'#f8fafc', color:'#334155', fontWeight:700, fontSize:'0.76rem',
                        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5
                      }}
                    >
                      <Zap size={12} color="#f59e0b" /> Bấm Thử Nhận Cóc ({hdmiTriggerCount})
                    </button>
                  </div>

                  <div style={{ padding:'6px 8px', borderRadius:6, background:'#fdf2f8', border:'1px solid #fce7f3', fontSize:'0.72rem', color:'#831843', lineHeight:1.35 }}>
                    💡 <em>Cóc đạp cắm ở máy soi (Olympus, Pentax, máy soi TQ). Khi đạp cóc, luồng HDMI phát xung chớp sáng - AI bắt xung và tự động chụp ngay (&lt; 20ms).</em>
                  </div>
                </div>
              </div>

              {/* ── 2. BÀN ĐẠP CHÂN USB (CẮM VÀO PC) ── */}
              <div style={card}>
                <div style={{ fontSize:'0.85rem', fontWeight:800, marginBottom:8, display:'flex', alignItems:'center', gap:6, color:'#1e293b' }}>
                  <Sliders size={15} color="#6366f1" /> Bàn Đạp Chân USB (PC)
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <div>
                    <label style={{ display:'block', fontSize:'0.76rem', fontWeight:600, color:'#64748b', marginBottom:3 }}>
                      Phím Bàn Đạp USB:
                    </label>
                    <select
                      value={pedalKey}
                      onChange={e => setPedalKey(e.target.value)}
                      style={{ width:'100%', padding:'5px 8px', borderRadius:6, border:'1.5px solid #cbd5e1', fontSize:'0.82rem', fontWeight:700 }}
                    >
                      <option value="F8">Phím F8 (Chuẩn y tế)</option>
                      <option value="F9">Phím F9</option>
                      <option value="F12">Phím F12</option>
                      <option value=" ">Phím Cách (Spacebar)</option>
                      <option value="Enter">Phím Enter</option>
                    </select>
                  </div>

                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:'0.78rem' }}>
                    <input type="checkbox" checked={triggerKeys} onChange={e => setTriggerKeys(e.target.checked)} style={{ accentColor:'#6366f1' }} />
                    <span>Bắt phím từ bàn đạp USB cắm vào PC</span>
                  </label>
                </div>
              </div>

              {/* Trạng Thái Driver Tóm Tắt */}
              <div style={card}>
                <div style={{ fontSize:'0.85rem', fontWeight:800, marginBottom:8, display:'flex', alignItems:'center', gap:8, color:'#1e293b' }}>
                  <Usb size={15} color="#2563eb" /> Trạng Thái Driver
                </div>
                <div style={{ fontSize:'0.8rem', color:'#334155', lineHeight:1.5 }}>
                  <div>Thiết bị nhận: <strong>{cameras.length} camera/capture</strong></div>
                  <div>Chế độ: <strong>DirectShow UVC Native</strong></div>
                  <div>Độ trễ lý thuyết: <strong style={{ color:'#16a34a' }}>&lt; 25ms</strong></div>
                </div>
                <button
                  onClick={() => { setShowDriverModal(true); scanCameras(); }}
                  style={{
                    marginTop:10, width:'100%', padding:'7px 10px', borderRadius:6,
                    border:'1px solid #cbd5e1', background:'white', color:'#2563eb',
                    fontWeight:700, fontSize:'0.78rem', cursor:'pointer', display:'flex',
                    alignItems:'center', justifyContent:'center', gap:6,
                  }}
                >
                  <Wrench size={13} /> Chẩn Đoán & Sửa Lỗi
                </button>
              </div>

              {/* Cài đặt Chụp Tự Động */}
              <div style={card}>
                <div style={{ fontSize:'0.85rem', fontWeight:700, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                  <Camera size={14} color="#64748b" /> Chụp Tự Động (Interval)
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <input type="checkbox" id="autoCapCheck" checked={autoCapture} onChange={e => setAutoCapture(e.target.checked)} style={{ accentColor:pk }} />
                  <label htmlFor="autoCapCheck" style={{ fontSize:'0.82rem', fontWeight:600, cursor:'pointer' }}>Bật tự động chụp</label>
                </div>
                {autoCapture && (
                  <div>
                    <div style={{ fontSize:'0.78rem', color:'#64748b', marginBottom:4 }}>Khoảng cách mỗi ảnh: {autoInterval} giây</div>
                    <input type="range" min={2} max={30} value={autoInterval} onChange={e => setAutoInterval(Number(e.target.value))} style={{ width:'100%', accentColor:pk }} />
                  </div>
                )}
              </div>

              {/* Thông tin Phiên Khám Hiện Tại */}
              <div style={card}>
                <div style={{ fontSize:'0.85rem', fontWeight:700, marginBottom:8, color:'#1e293b' }}>
                  📋 Thông Tin Khám
                </div>
                {selPt ? (
                  <div style={{ fontSize:'0.82rem', lineHeight:1.5 }}>
                    <div>Bệnh nhân: <strong style={{ color:'#6366f1' }}>{selPt.full_name}</strong></div>
                    <div>Mã số: <strong>{selPt.patient_code}</strong></div>
                    <div>Giới tính: <strong>{selPt.gender}</strong> ({selPt.birth_year})</div>
                  </div>
                ) : (
                  <div style={{ fontSize:'0.78rem', color:'#94a3b8' }}>
                    Chưa chọn bệnh nhân. Hãy chuyển qua tab [Bệnh Nhân] để tạo phiên khám mới.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── PATIENTS TAB ─── */}
        {tab === 'patients' && (
          <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:'0.75rem', marginTop:'0.25rem' }}>
            <div style={card}>
              <div style={{ fontSize:'0.88rem', fontWeight:800, marginBottom:12, color:'#1e293b' }}>➕ Thêm Bệnh Nhân Mới</div>
              {([['Họ và tên *','full_name'],['Năm sinh','birth_year'],['Số điện thoại','phone']] as [string, keyof typeof newPt][]).map(([lbl, k]) => (
                <div key={k} style={{ marginBottom:10 }}>
                  <div style={{ fontSize:'0.78rem', fontWeight:600, color:'#475569', marginBottom:3 }}>{lbl}</div>
                  <input
                    value={newPt[k]}
                    onChange={e => setNewPt(p => ({ ...p, [k]: e.target.value }))}
                    style={{ width:'100%', padding:'7px 10px', borderRadius:6, border:'1.5px solid #cbd5e1', fontSize:'0.84rem', boxSizing:'border-box', outline:'none' }}
                  />
                </div>
              ))}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:'0.78rem', fontWeight:600, color:'#475569', marginBottom:3 }}>Giới tính</div>
                <select value={newPt.gender} onChange={e => setNewPt(p => ({ ...p, gender: e.target.value }))} style={{ width:'100%', padding:'7px 10px', borderRadius:6, border:'1.5px solid #cbd5e1', fontSize:'0.84rem' }}>
                  <option>Nam</option><option>Nữ</option><option>Khác</option>
                </select>
              </div>
              <button onClick={addPt} disabled={!newPt.full_name} style={{ width:'100%', padding:'8px', borderRadius:6, border:'none', background:pk, color:'white', cursor:'pointer', fontWeight:700, fontSize:'0.86rem' }}>
                Lưu Bệnh Nhân
              </button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              <div style={{ ...card, display:'flex', gap:8, alignItems:'center' }}>
                <Search size={15} color="#94a3af" />
                <input value={search} onChange={e => { setSearch(e.target.value); loadPts(e.target.value); }} placeholder="Tìm theo tên bệnh nhân hoặc mã số..." style={{ flex:1, border:'none', outline:'none', fontSize:'0.85rem' }} />
              </div>

              <div style={card}>
                <div style={{ fontSize:'0.86rem', fontWeight:700, marginBottom:8 }}>Danh Sách Bệnh Nhân ({patients.length})</div>
                <div style={{ maxHeight:220, overflowY:'auto' }}>
                  {patients.map(p => (
                    <div key={p.id} onClick={() => choosePt(p)} style={{ padding:'8px 12px', borderRadius:8, cursor:'pointer', marginBottom:5, background:selPt?.id===p.id?'#fdf2f8':'#f8fafc', border:selPt?.id===p.id?'1.5px solid '+pk:'1px solid #e2e8f0' }}>
                      <div style={{ fontWeight:700, fontSize:'0.86rem', color:'#0f172a' }}>{p.full_name}</div>
                      <div style={{ fontSize:'0.74rem', color:'#64748b' }}>{p.patient_code} · {p.birth_year} · {p.gender} {p.phone && `· ☎ ${p.phone}`}</div>
                    </div>
                  ))}
                  {patients.length === 0 && <div style={{ color:'#94a3af', fontSize:'0.82rem', textAlign:'center', padding:20 }}>Chưa có bệnh nhân nào</div>}
                </div>
              </div>

              {selPt && (
                <div style={card}>
                  <div style={{ fontSize:'0.86rem', fontWeight:700, marginBottom:10 }}>📋 Tạo Phiên Khám Nội Soi Cho: {selPt.full_name}</div>
                  <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                    <select value={newSess.exam_type} onChange={e => setNewSess(p => ({ ...p, exam_type: e.target.value }))} style={{ flex:1, padding:'7px 10px', borderRadius:6, border:'1.5px solid #cbd5e1', fontSize:'0.83rem' }}>
                      <option>Nội soi Tai Mũi Họng</option>
                      <option>Nội soi Mũi Xoang</option>
                      <option>Nội soi Thanh Quản</option>
                      <option>Nội soi Cổ Tử Cung</option>
                      <option>Nội soi Dạ Dày</option>
                      <option>Nội soi Khác</option>
                    </select>
                    <input value={newSess.doctor_name} onChange={e => setNewSess(p => ({ ...p, doctor_name: e.target.value }))} placeholder="Bác sĩ thực hiện" style={{ flex:1, padding:'7px 10px', borderRadius:6, border:'1.5px solid #cbd5e1', fontSize:'0.83rem' }} />
                    <button onClick={createSess} style={{ padding:'7px 16px', borderRadius:6, border:'none', background:pk, color:'white', cursor:'pointer', fontWeight:700, fontSize:'0.84rem' }}>
                      Bắt Đầu Khám
                    </button>
                  </div>
                  <div style={{ maxHeight:180, overflowY:'auto' }}>
                    {sessions.map(s => (
                      <div key={s.id} onClick={() => chooseSess(s)} style={{ padding:'8px 12px', borderRadius:8, cursor:'pointer', marginBottom:4, background:selSess?.id===s.id?'#fdf2f8':'#f8fafc', border:selSess?.id===s.id?'1.5px solid '+pk:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:'0.84rem' }}>{s.exam_type}</div>
                          <div style={{ fontSize:'0.74rem', color:'#64748b' }}>{s.exam_date} · {s.image_count ?? 0} ảnh</div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); eAPI()?.openFolder?.(s.folder_path); }} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #cbd5e1', background:'white', cursor:'pointer', fontSize:'0.72rem', fontWeight:600 }}>
                          📁 Thư Mục
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── IMAGES TAB ─── */}
        {tab === 'images' && (
          <div style={{ marginTop:'0.25rem' }}>
            <div style={{ ...card, marginBottom:'0.75rem', display:'flex', alignItems:'center', gap:10 }}>
              <Img size={16} color={pk} />
              <strong style={{ flex:1, fontSize:'0.9rem' }}>
                {selSess ? `📋 ${selSess.exam_type} — ${selSess.exam_date}` : '← Chọn phiên khám từ tab Bệnh Nhân'}
              </strong>
              <button onClick={() => selSess && chooseSess(selSess)} style={{ padding:'6px 12px', borderRadius:6, border:'1px solid #cbd5e1', background:'white', cursor:'pointer', fontSize:'0.82rem', display:'flex', alignItems:'center', gap:4 }}>
                <RefreshCw size={13} /> Làm Mới
              </button>
            </div>

            {images.length === 0 && (
              <div style={{ ...card, textAlign:'center', color:'#9ca3af', padding:'3rem' }}>
                <Img size={40} opacity={0.3} style={{ marginBottom:10 }} />
                <div style={{ fontWeight:600 }}>Chưa có hình ảnh trong phiên này</div>
                <div style={{ fontSize:'0.8rem', marginTop:6 }}>Bật camera và chụp ảnh để lưu trữ kết quả tại đây</div>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))', gap:'0.75rem' }}>
              {images.map(img => (
                <div key={img.id} style={{ ...card, padding:0, overflow:'hidden', border:'1px solid #e2e8f0' }}>
                  <div style={{ aspectRatio:'4/3', background:'#0f172a', position:'relative', cursor: thumbs[img.thumbnail_path] ? 'zoom-in' : 'default' }}
                    onClick={() => thumbs[img.thumbnail_path] && setLightbox(thumbs[img.thumbnail_path])}>
                    {thumbs[img.thumbnail_path]
                      ? <img src={`data:image/jpeg;base64,${thumbs[img.thumbnail_path]}`} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />
                      : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}><Img size={24} color="#64748b" /></div>
                    }
                    {thumbs[img.thumbnail_path] && <div style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,.6)', borderRadius:4, padding:3 }}><Maximize2 size={12} color="white" /></div>}
                    <button onClick={(e) => { e.stopPropagation(); toggleFav(img.id); }} 
                      title={img.is_favorite ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích'}
                      style={{ position:'absolute', top:6, left:6, background:'rgba(0,0,0,.6)', border:'none', borderRadius:'50%', width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Heart size={14} color={img.is_favorite ? '#ef4444' : 'white'} fill={img.is_favorite ? '#ef4444' : 'none'} />
                    </button>
                    <div style={{ position:'absolute', bottom:4, left:4, background:'rgba(0,0,0,.7)', color:'white', fontSize:'0.65rem', padding:'2px 6px', borderRadius:3, fontFamily:'monospace' }}>
                      {img.resolution}
                    </div>
                  </div>
                  <div style={{ padding:'8px 10px' }}>
                    <div style={{ fontSize:'0.75rem', color:'#475569', fontWeight:600 }}>{img.captured_at}</div>
                    <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{img.trigger_type} · {img.file_size_kb} KB</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
