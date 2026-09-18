import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import {
  Play, Download, Search, RotateCcw,
  FileText, Settings,
  FileCode2, Printer, Wrench, Filter,
  GitCompare, Code2, ShieldCheck, ShieldOff, Camera, Volume2, FileSignature, Cpu,
  Clock, BookOpen, Building2, Boxes, RefreshCw, MoreVertical, ChevronDown, Grid
} from 'lucide-react';

import './index.css';
import type { ComparedResult, MatchStatus, Stats, HistoryEntry, FileFormat } from './types';
import { readAnyFile, compareData, exportToExcel, saveHistory, detectDecimalMismatch, loadHistory } from './utils/excelProcessor';
import { UploadCard } from './components/UploadCard';
import { ResultsTable } from './components/ResultsTable';
import { StatsBar } from './components/StatsBar';
import { GlobalNotificationContainer, type ToastMessage } from './components/Toast';
import { showToast } from './utils/notificationSystem';
import { Dashboard } from './components/Dashboard';
import { HistoryPanel } from './components/HistoryPanel';
import { FieldMappingModal } from './components/FieldMappingModal';
import { LicenseModal } from './components/LicenseModal';
import { RulesModal } from './components/RulesModal';
import { QuickGuideModal } from './components/QuickGuideModal';
import { OemSettingsModal } from './components/OemSettingsModal';
import { ModuleHubModal } from './components/ModuleHubModal';
import { UpdateNotificationModal } from './components/UpdateNotificationModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TabLoadingSkeleton } from './components/TabLoadingSkeleton';
import { GlobalTopProgressBar, HeaderProcessingIndicator } from './components/GlobalLoadingIndicator';
import { startGlobalLoading, stopGlobalLoading, clearAllGlobalLoading } from './utils/globalLoading';
import { AutoRefreshControl } from './components/AutoRefreshControl';
import { AutoRefreshManager, registerTabRefreshHandler, triggerGlobalSmartRefresh } from './utils/autoRefreshManager';

// ─── Code-Splitting Lazy Loaded Tabs (Tối ưu khởi động siêu tốc & tiết kiệm RAM) ───
const FileReaderTab     = lazy(() => import('./components/FileReaderTab').then(m => ({ default: m.FileReaderTab })));
const ConverterTab      = lazy(() => import('./components/ConverterTab').then(m => ({ default: m.ConverterTab })));
const PrinterTab        = lazy(() => import('./components/PrinterTab'));
const FileRepairTab     = lazy(() => import('./components/FileRepairTab').then(m => ({ default: m.FileRepairTab })));
const DataFilterTab     = lazy(() => import('./components/DataFilterTab').then(m => ({ default: m.DataFilterTab })));
const SelfBuilt01Tab    = lazy(() => import('./components/SelfBuilt01Tab').then(m => ({ default: m.SelfBuilt01Tab })));
const EndoscopyTab      = lazy(() => import('./components/EndoscopyTab').then(m => ({ default: m.EndoscopyTab })));
const HisCallTab        = lazy(() => import('./components/HisCallTab').then(m => ({ default: m.HisCallTab })));
const AttendanceTab     = lazy(() => import('./components/AttendanceTab').then(m => ({ default: m.AttendanceTab })));
const BhytValidatorTab  = lazy(() => import('./components/BhytValidatorTab').then(m => ({ default: m.BhytValidatorTab })));
const SignatureTab      = lazy(() => import('./components/SignatureTab').then(m => ({ default: m.SignatureTab })));
const DcbhytTab         = lazy(() => import('./components/DcbhytTab').then(m => ({ default: m.DcbhytTab })));
const OfficeFormulasTab = lazy(() => import('./components/OfficeFormulasTab').then(m => ({ default: m.OfficeFormulasTab })));
const PcToolsTab        = lazy(() => import('./components/PcToolsTab').then(m => ({ default: m.PcToolsTab })));

import { 
  checkForUpdates, isAutoCheckEnabled, getDismissedVersion, CURRENT_APP_VERSION,
  type UpdateCheckResult 
} from './utils/updateChecker';
import { loadOemConfig, type OemConfig } from './utils/oemConfig';
import type { ColumnMapping } from './types';
import { DEFAULT_PORTAL_MAPPING, DEFAULT_INTERNAL_MAPPING } from './utils/excelProcessor';
import {
  checkLicenseOrTrial, ALL_TABS, TIER_LABELS, TAB_LABELS,
  type LicenseResult,
} from './utils/licenseManager';
import { runAutoDownloadLicensedModules, subscribeAutoDownload } from './utils/moduleAutoDownloader';
import { LockedFeatureGuard } from './components/LockedFeatureGuard';

type AppTab = 'compare' | 'reader' | 'converter' | 'printer' | 'repair' | 'filter' | 'selfbuilt' | 'endoscopy' | 'hiscall' | 'attendance' | 'bhytcheck' | 'signature' | 'dcbhyt' | 'officeformulas' | 'pctools';

type FilterType = MatchStatus | 'TẤT CẢ';
const PAGE_SIZE = 25;

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('compare');
  const [visitedTabs, setVisitedTabs] = useState<Set<AppTab>>(new Set(['compare']));
  const [file1, setFile1]         = useState<File | null>(null);
  const [file2, setFile2]         = useState<File | null>(null);
  const [format1, setFormat1]     = useState<FileFormat | null>(null);
  const [format2, setFormat2]     = useState<FileFormat | null>(null);
  const [preview1, setPreview1]   = useState<Record<string, unknown>[]>([]);
  const [preview2, setPreview2]   = useState<Record<string, unknown>[]>([]);
  const [portalCount, setPortalCount] = useState(0);
  const [internalCount, setInternalCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults]     = useState<ComparedResult[]>([]);
  const [filter, setFilter]       = useState<FilterType>('TẤT CẢ');
  const [searchQuery, setSearch]  = useState('');
  const [page, setPage]           = useState(1);
  const [showHelp, setShowHelp]   = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [showOemModal, setShowOemModal]     = useState(false);
  const [showModuleHub, setShowModuleHub]   = useState(false);
  const [targetModuleId, setTargetModuleId] = useState<string | null>(null);
  const [oemConfig, setOemConfig]           = useState<OemConfig>(loadOemConfig());

  // ── License state: Hỗ trợ Smart 3-Day Trial + Hardware ID Locking ─────────
  const [license, setLicense]         = useState<LicenseResult | null>(null);
  const [showLicense, setShowLicense] = useState(false);

  // ── Auto-Update States ───────────────────────────────────────────────────
  const [updateResult, setUpdateResult]         = useState<UpdateCheckResult | null>(null);
  const [showUpdateModal, setShowUpdateModal]   = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    if (toast.type === 'success') showToast.success(toast.title, toast.message);
    else if (toast.type === 'error') showToast.error(toast.title, toast.message);
    else if (toast.type === 'warning') showToast.warning(toast.title, toast.message);
    else showToast.info(toast.title, toast.message);
  }, []);

  // Tự động kiểm tra bản cập nhật từ GitHub sau 3.5 giây khi mở app
  useEffect(() => {
    if (!isAutoCheckEnabled()) return;
    const timer = setTimeout(() => {
      checkForUpdates(CURRENT_APP_VERSION).then(res => {
        if (res.hasUpdate) {
          const dismissed = getDismissedVersion();
          if (dismissed !== res.latestVersion) {
            setUpdateResult(res);
            setShowUpdateModal(true);
          }
        }
      });
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  // ── Tự Động Làm Mới Thông Minh Toàn App: Đồng bộ activeTab & Bắt phím tắt F5 / Ctrl+R ──
  useEffect(() => {
    AutoRefreshManager.getInstance().setActiveTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bắt phím F5 hoặc Ctrl+R (Cmd+R trên macOS) — Loại trừ Ctrl+Shift+R dành cho Hard Reload
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R') && !e.shiftKey)) {
        e.preventDefault();
        triggerGlobalSmartRefresh({ silent: false, isAuto: false });
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Lắng nghe IPC từ Electron menu (nếu có)
    const w = window as any;
    let unsubIpc: (() => void) | undefined;
    if (w.electronAPI?.onSmartRefresh) {
      unsubIpc = w.electronAPI.onSmartRefresh(() => {
        triggerGlobalSmartRefresh({ silent: false, isAuto: false });
      });
    }

    let unsubCrash: (() => void) | undefined;
    if (w.electronAPI?.endoscopy?.onServerCrashed) {
      unsubCrash = w.electronAPI.endoscopy.onServerCrashed((payload: any) => {
        const srvName = payload.server === 'endoscopy' ? 'Nội Soi AI 4K' 
                      : payload.server === 'xml3176' ? 'Giải mã XML' 
                      : payload.server === 'compare' ? 'Đối chiếu hồ sơ' : payload.server;
        showToast.error('Máy chủ Python bị sập ngầm!', `Dịch vụ ${srvName} đã bị tắt đột ngột (Lỗi: ${payload.error || payload.code || 'OOM'}). Hãy khởi động lại tính năng hoặc F5 để khôi phục.`);
        clearAllGlobalLoading(); // Giải cứu UI khỏi trạng thái loading vĩnh viễn (Zombie)
      });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (unsubIpc) unsubIpc();
      if (unsubCrash) unsubCrash();
    };
  }, []);

  const handleManualCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    startGlobalLoading('app-update-check', 'Đang kiểm tra bản cập nhật mới từ GitHub...');
    try {
      const res = await checkForUpdates(CURRENT_APP_VERSION);
      setUpdateResult(res);
      if (res.hasUpdate) {
        setShowUpdateModal(true);
      } else if (res.error) {
        addToast({
          type: 'error',
          title: 'Lỗi kiểm tra cập nhật',
          message: res.error,
        });
      } else {
        addToast({
          type: 'success',
          title: 'Đang ở phiên bản mới nhất',
          message: `Ứng dụng đang hoạt động ở phiên bản mới nhất (v${CURRENT_APP_VERSION}), chưa có bản cập nhật mới nào.`,
        });
      }
    } catch (e: unknown) {
      addToast({
        type: 'error',
        title: 'Lỗi kiểm tra cập nhật',
        message: (e as Error).message || 'Không thể kết nối đến GitHub',
      });
    } finally {
      setIsCheckingUpdate(false);
      stopGlobalLoading('app-update-check');
    }
  };

  // Tự động kiểm tra bản quyền hoặc kích hoạt dùng thử 3 ngày khi khởi động
  useEffect(() => {
    checkLicenseOrTrial().then(r => {
      setLicense(r);
      if (r.valid && !r.expired) {
        runAutoDownloadLicensedModules(r);
        // Tự động chuyển sang tab đầu tiên có quyền nếu tab ban đầu bị khóa
        if (!r.tabs[activeTab]) {
          const firstAllowed = ALL_TABS.find(t => r.tabs[t]);
          if (firstAllowed) {
            const allowedTab = firstAllowed as AppTab;
            setActiveTab(allowedTab);
            setVisitedTabs(prev => new Set(prev).add(allowedTab));
          }
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional: chỉ chạy 1 lần khi mount, activeTab không phải dep cần watch

  // Lắng nghe sự kiện tải ngầm tự động để hiển thị toast thông báo tế nhị
  useEffect(() => {
    const unsub = subscribeAutoDownload((e) => {
      if (e.status === 'START') {
        addToast({
          type: 'warning',
          title: 'Đang tải gói dữ liệu chức năng...',
          message: e.message || e.moduleName,
        });
      } else if (e.status === 'SUCCESS') {
        addToast({
          type: 'success',
          title: 'Đã sẵn sàng sử dụng',
          message: e.message || e.moduleName,
        });
      }
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional: subscription chỉ cần đăng ký 1 lần khi mount

  const canAccess = (tab: typeof ALL_TABS[number]) =>
    license?.valid && !license.expired && license.tabs[tab] === true;

  const ALL_TAB_ITEMS = [
    { tab: 'compare' as const,        icon: <GitCompare size={14}/>,     shortLabel: 'Đối Chiếu',    fullLabel: 'Đối Chiếu Hồ Sơ BHYT', category: 'BHYT' },
    { tab: 'reader' as const,         icon: <FileCode2 size={14}/>,      shortLabel: 'Đọc XML',      fullLabel: 'Đọc XML / Tra Cứu CSV', category: 'BHYT' },
    { tab: 'converter' as const,      icon: <FileText size={14}/>,       shortLabel: 'Chuyển Đổi',   fullLabel: 'Chuyển Đổi File Excel/PDF', color: '#6366f1', category: 'Văn Phòng' },
    { tab: 'filter' as const,         icon: <Filter size={14}/>,         shortLabel: 'Lọc Dữ Liệu',  fullLabel: 'Lọc & Tách Dữ Liệu Lớn', color: '#3b82f6', category: 'Văn Phòng' },
    { tab: 'printer' as const,        icon: <Printer size={14}/>,        shortLabel: 'Máy In',       fullLabel: 'Quản Lý Máy In & Spooler', color: '#10b981', category: 'Hệ Thống' },
    { tab: 'repair' as const,         icon: <Wrench size={14}/>,         shortLabel: 'Sửa File',     fullLabel: 'Sửa File & Khôi Phục Dữ Liệu', color: '#f59e0b', category: 'Văn Phòng' },
    { tab: 'selfbuilt' as const,      icon: <Code2 size={14}/>,          shortLabel: 'Self-Built',   fullLabel: 'Self-Built 01 Dịch Ngược Cấu Trúc', color: '#8b5cf6', category: 'Hệ Thống' },
    { tab: 'endoscopy' as const,      icon: <Camera size={14}/>,         shortLabel: 'Nội Soi 4K',   fullLabel: 'Nội Soi AI 4K & Bắt Hình Y Khoa', color: '#ec4899', category: 'Lâm Sàng' },
    { tab: 'hiscall' as const,        icon: <Volume2 size={14}/>,        shortLabel: 'Gọi Khám',     fullLabel: 'Gọi Bệnh Nhân HIS & Màn Chờ TV', color: '#10b981', category: 'Lâm Sàng' },
    { tab: 'attendance' as const,     icon: <Clock size={14}/>,          shortLabel: 'Chấm Công',    fullLabel: 'Máy Chấm Công, Chia Ca & Lịch Biểu', color: '#f59e0b', category: 'Lâm Sàng' },
    { tab: 'bhytcheck' as const,      icon: <ShieldCheck size={14}/>,    shortLabel: 'Check BHYT',   fullLabel: 'Kiểm Tra Thông Tuyến & Lỗi Thẻ BHYT', color: '#0ea5e9', category: 'BHYT' },
    { tab: 'signature' as const,      icon: <FileSignature size={14}/>, shortLabel: 'Ký Số XML',   fullLabel: 'Ký Số Token USB & Ký Hàng Loạt', color: '#14b8a6', category: 'BHYT' },
    { tab: 'dcbhyt' as const,         icon: <GitCompare size={14}/>,     shortLabel: '01/BH',        fullLabel: 'Đối Chiếu Bảng Kê 01/BH Chi Tiết', color: '#0ea5e9', category: 'BHYT' },
    { tab: 'officeformulas' as const, icon: <FileText size={14}/>,       shortLabel: 'Office',       fullLabel: 'Tra Cứu & Tạo Công Thức Excel/Word', color: '#8b5cf6', category: 'Văn Phòng' },
    { tab: 'pctools' as const,        icon: <Cpu size={14}/>,            shortLabel: 'Kỹ Thuật PC',  fullLabel: 'Kỹ Thuật Máy Tính & Cứu Hộ IT Pro', color: '#0284c7', category: 'Hệ Thống' },
  ];

  const handleTabClick = (tab: AppTab) => {
    if (!canAccess(tab as typeof ALL_TABS[number])) {
      setShowLicense(true);
      return;
    }
    setVisitedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
    setActiveTab(tab);
  };

  const [showUtilityMenu, setShowUtilityMenu] = useState(false);
  const [showAllTabsMenu, setShowAllTabsMenu] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.utility-menu-container')) {
        setShowUtilityMenu(false);
      }
      if (!target.closest('.all-tabs-container')) {
        setShowAllTabsMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [customPortalMap, setCustomPortalMap] = useState<ColumnMapping | null>(() => {
    try {
      const saved = localStorage.getItem('dmh_portal_mapping');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [customInternalMap, setCustomInternalMap] = useState<ColumnMapping | null>(() => {
    try {
      const saved = localStorage.getItem('dmh_internal_mapping');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const handleFile1 = async (f: File | null) => {
    setFile1(f);
    setFormat1(null);
    setPreview1([]);
    if (!f) return;
    try {
      const { data, format } = await readAnyFile(f);
      setFormat1(format.toLowerCase() as FileFormat);
      setPreview1(data.slice(0, 5));
      addToast({ type: 'success', title: 'Đã tải file Cổng Giám Định', message: `${data.length} dòng dữ liệu (${format})` });
      // Phát hiện lỗi dấu phẩy/chấm không đồng nhất
      const mismatchCols = detectDecimalMismatch(data);
      if (mismatchCols.length > 0) {
        addToast({
          type: 'warning',
          title: '⚠ Phát hiện lỗi dấu phẩy/chấm',
          message: `File Cổng GĐ có cột dùng lẫn dấu phẩy và dấu chấm thập phân: ${mismatchCols.join(', ')}. Kiểm tra lại file nguồn!`,
        });
      }
    } catch {
      addToast({ type: 'error', title: 'Lỗi đọc file', message: 'Không thể đọc tệp. Vui lòng kiểm tra định dạng.' });
      setFile1(null);
    }
  };

  const handleFile2 = async (f: File | null) => {
    setFile2(f);
    setFormat2(null);
    setPreview2([]);
    if (!f) return;
    try {
      const { data, format } = await readAnyFile(f);
      setFormat2(format.toLowerCase() as FileFormat);
      setPreview2(data.slice(0, 5));
      addToast({ type: 'success', title: 'Đã tải file 01/BH', message: `${data.length} dòng dữ liệu (${format})` });
      // Phát hiện lỗi dấu phẩy/chấm không đồng nhất
      const mismatchCols = detectDecimalMismatch(data);
      if (mismatchCols.length > 0) {
        addToast({
          type: 'warning',
          title: '⚠ Phát hiện lỗi dấu phẩy/chấm',
          message: `File 01/BH có cột dùng lẫn dấu phẩy và dấu chấm thập phân: ${mismatchCols.join(', ')}. Kiểm tra lại file nguồn!`,
        });
      }
    } catch {
      addToast({ type: 'error', title: 'Lỗi đọc file', message: 'Không thể đọc tệp. Vui lòng kiểm tra định dạng.' });
      setFile2(null);
    }
  };

  const handleReset = () => {
    setFile1(null); setFile2(null);
    setFormat1(null); setFormat2(null);
    setPreview1([]); setPreview2([]);
    setResults([]); setFilter('TẤT CẢ');
    setSearch(''); setPage(1);
    setPortalCount(0); setInternalCount(0);
    setCustomPortalMap(null); setCustomInternalMap(null);
    // Lỗi #1 fix: xóa cả localStorage để mapping không tái xuất hiện lần sau
    localStorage.removeItem('dmh_portal_mapping');
    localStorage.removeItem('dmh_internal_mapping');
  };

  const handleProcess = async (options?: { preserveView?: boolean; silent?: boolean }) => {
    if (!file1 || !file2) return;
    const silent = options?.silent ?? false;
    const preserveView = options?.preserveView ?? false;

    setIsProcessing(true);
    if (!silent) {
      startGlobalLoading('app-compare', 'Đang đối chiếu dữ liệu 2 tệp tin...');
    }
    try {
      // Chuyển File → base64
      const toB64 = async (f: File) => {
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      };

      const [portalB64, internalB64] = await Promise.all([toB64(file1), toB64(file2)]);

      // Gọi Python compare server qua IPC
      const electron = (window as any).electronAPI;
      let pyResult: any = null;
      if (electron?.compareFiles) {
        pyResult = await electron.compareFiles(portalB64, internalB64);
      }

      // Nếu Python server không khả dụng, fallback TypeScript cũ
      if (!pyResult || !pyResult.ok) {
        console.warn('[COMPARE] Python server không khả dụng, dùng engine TypeScript:', pyResult?.error);
        const [r1, r2] = await Promise.all([readAnyFile(file1), readAnyFile(file2)]);
        if (r1.data.length === 0 || r2.data.length === 0) {
          if (!silent) addToast({ type: 'warning', title: 'Cảnh báo', message: 'Một trong hai tệp không có dữ liệu.' });
          setIsProcessing(false);
          if (!silent) stopGlobalLoading('app-compare');
          return;
        }
        setPortalCount(r1.data.length);
        setInternalCount(r2.data.length);
        const compared = compareData(r1.data, r2.data, customPortalMap || DEFAULT_PORTAL_MAPPING, customInternalMap || DEFAULT_INTERNAL_MAPPING);
        setResults(compared);
        if (!preserveView) {
          setFilter('TẤT CẢ');
          setPage(1);
        }
        const lech = compared.filter(r => r.status === 'LỆCH').length;
        const khongThay = compared.filter(r => r.status === 'KHÔNG THẤY').length;
        const khop = compared.filter(r => r.status === 'KHỚP').length;
        const statsObj: Stats = { total: compared.length, khop, lech, khongThay, totalDiffs: compared.reduce((s, r) => s + r.differences.length, 0), highSeverityDiffs: compared.reduce((s, r) => s + r.differences.filter(d => d.severity === 'high').length, 0) };
        // Bảo mật: chỉ lưu HistorySafeResult (không có portalRow/internalRow chứa dữ liệu bệnh nhân đầy đủ)
        const safeResults = compared.map(r => ({ id: r.id, name: r.name, insuranceCode: r.insuranceCode, timeRange: r.timeRange, status: r.status, differences: r.differences }));
        const histEntry: HistoryEntry = { id: `${Date.now()}`, timestamp: new Date().toLocaleString('vi-VN'), portalFileName: file1.name, internalFileName: file2.name, stats: statsObj, results: safeResults };
        saveHistory(histEntry);
        if (!silent) {
          if (lech === 0 && khongThay === 0) addToast({ type: 'success', title: '✅ Hoàn hảo!', message: `Tất cả ${compared.length} hồ sơ đều khớp hoàn toàn.` });
          else addToast({ type: 'warning', title: 'Đối chiếu hoàn tất', message: `${khop} khớp · ${lech} lệch · ${khongThay} không thấy` });
        }
        return;
      }

      // Map kết quả Python → format CompareResult
      setPortalCount(pyResult.portalCount ?? pyResult.total);
      setInternalCount(pyResult.internalCount ?? pyResult.total);

      const compared = (pyResult.results ?? []).map((r: any, idx: number) => ({
        id:          `${idx}-${Date.now()}`,
        status:      r.status,
        name:        r.name        ?? '',
        insuranceCode: r.mathe       ?? '',
        timeRange:   r.timeRange   ?? '',
        differences: (r.differences ?? []).map((d: any) => ({
          field:         d.field    ?? '',
          portalValue:   d.portal   ?? '',
          internalValue: d.internal ?? '',
          severity:      d.severity ?? 'medium',
        })),
      }));

      setResults(compared);
      if (!preserveView) {
        setFilter('TẤT CẢ');
        setPage(1);
      }

      const lech      = pyResult.lech ?? 0;
      const khongThay = pyResult.khongThay ?? 0;
      const khop      = pyResult.khop ?? 0;

      const statsObj: Stats = {
        total: compared.length, khop, lech, khongThay,
        totalDiffs: compared.reduce((s: number, r: any) => s + r.differences.length, 0),
        highSeverityDiffs: compared.reduce((s: number, r: any) => s + r.differences.filter((d: any) => d.severity === 'high').length, 0),
      };
      const histEntry: HistoryEntry = {
        id: `${Date.now()}`,
        timestamp: new Date().toLocaleString('vi-VN'),
        portalFileName: file1.name,
        internalFileName: file2.name,
        stats: statsObj,
        results: compared,
      };
      saveHistory(histEntry);

      if (!silent) {
        if (lech === 0 && khongThay === 0) {
          addToast({ type: 'success', title: '✅ Hoàn hảo!', message: `Tất cả ${compared.length} hồ sơ đều khớp hoàn toàn.` });
        } else {
          addToast({ type: 'warning', title: 'Đối chiếu hoàn tất (Python Engine)', message: `${khop} khớp · ${lech} lệch · ${khongThay} không thấy` });
        }
      }
    } catch (err) {
      console.error(err);
      if (!silent) addToast({ type: 'error', title: 'Lỗi xử lý', message: String(err) || 'Không thể xử lý dữ liệu.' });
    } finally {
      setIsProcessing(false);
      if (!silent) stopGlobalLoading('app-compare');
    }
  };

  // Đăng ký làm mới thông minh cho tab compare (Đối Chiếu BHYT)
  useEffect(() => {
    return registerTabRefreshHandler('compare', async ({ silent }) => {
      if (file1 && file2 && !isProcessing) {
        await handleProcess({ preserveView: true, silent });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file1, file2, isProcessing, customPortalMap, customInternalMap]);


  const handleExport = () => {
    if (results.length === 0) return;
    try {
      const date = new Date().toISOString().slice(0, 10);
      exportToExcel(results, `DoiChieu_BHYT_${date}.xlsx`);
      addToast({ type: 'success', title: 'Xuất thành công', message: 'File Excel 2 sheet đã được tải xuống.' });
    } catch {
      addToast({ type: 'error', title: 'Lỗi xuất file', message: 'Vui lòng thử lại.' });
    }
  };

  const handleRestore = (entry: HistoryEntry) => {
    // HistorySafeResult[] không có portalRow/internalRow — cast sang ComparedResult[]
    // an toàn vì ResultsTable chỉ dùng: id, name, insuranceCode, timeRange, status, differences
    setResults(entry.results as unknown as ComparedResult[]);
    // Lỗi #2 fix: không set sai count từ stats.total, reset về 0 vì không có thông tin chính xác
    setPortalCount(entry.stats.khop + entry.stats.lech + entry.stats.khongThay);
    setInternalCount(entry.stats.khop + entry.stats.lech + entry.stats.khongThay);
    setFilter('TẤT CẢ');
    setPage(1);
    addToast({ type: 'success', title: 'Đã tải lại', message: `Phiên: ${entry.portalFileName} vs ${entry.internalFileName}` });
  };

  const stats: Stats = {
    total: results.length,
    khop: results.filter(r => r.status === 'KHỚP').length,
    lech: results.filter(r => r.status === 'LỆCH').length,
    khongThay: results.filter(r => r.status === 'KHÔNG THẤY').length,
    totalDiffs: results.reduce((s, r) => s + r.differences.length, 0),
    highSeverityDiffs: results.reduce((s, r) => s + r.differences.filter(d => d.severity === 'high').length, 0),
  };

  const filterOptions: { label: string; value: FilterType; color?: string }[] = [
    { label: `Tất cả (${stats.total})`, value: 'TẤT CẢ' },
    { label: `✓ Khớp (${stats.khop})`,  value: 'KHỚP', color: '#10b981' },
    { label: `⚠ Lệch (${stats.lech})`,  value: 'LỆCH', color: '#ef4444' },
    { label: `? Không thấy (${stats.khongThay})`, value: 'KHÔNG THẤY', color: '#f59e0b' },
  ];

  return (
    <div className="app-container">
      {/* ── Global Top Progress Line (Hiệu ứng lướt trên đỉnh toàn màn hình khi đang xử lý) ── */}
      <GlobalTopProgressBar />

      {/* ── Menu Bar ── */}
      <nav className="menu-bar">
        <div className="menu-bar-brand" style={{ userSelect: 'none', cursor: 'pointer' }} onClick={() => setShowOemModal(true)} title="Bấm để tùy chỉnh thương hiệu phòng khám (OEM)">
          <img src="icon.png" alt="logo" style={{ width: 32, height: 32, borderRadius: 0, objectFit: 'cover', imageRendering: 'crisp-edges', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="logo-text" style={{ lineHeight: 1.1, fontSize: '0.95rem' }}>
              {oemConfig.clinicName && oemConfig.clinicName !== 'Hệ Thống Y Tế & Kỹ Thuật Máy Tính DMH'
                ? oemConfig.clinicName
                : 'DMH_Tools'}
            </span>
            <span style={{ fontSize: '0.62rem', color: '#94a3b8', letterSpacing: 0.3 }}>
              Y Khoa & Kỹ Thuật PC
            </span>
          </div>
          <span className="version-badge">v{CURRENT_APP_VERSION}</span>
          {updateResult?.hasUpdate && (
            <button
              onClick={() => setShowUpdateModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 12,
                fontSize: '0.68rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)',
                marginLeft: 4,
              }}
              title={`Nhấn để cập nhật phiên bản v${updateResult.latestVersion} ngay!`}
            >
              <RefreshCw size={11} />
              <span>Có bản v{updateResult.latestVersion}!</span>
            </button>
          )}
        </div>

        {/* ── Dropdown "Tất cả tính năng (15)" cho phép truy cập nhanh toàn bộ phân hệ ── */}
        <div className="all-tabs-container" style={{ position: 'relative', flexShrink: 0, marginLeft: 4 }}>
          <button
            onClick={() => setShowAllTabsMenu(!showAllTabsMenu)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1',
              background: showAllTabsMenu ? '#e0e7ff' : '#f8fafc',
              color: '#4338ca', fontSize: '0.74rem', fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap', height: 28
            }}
            title="Xem danh mục tất cả 15 tính năng phân nhóm rõ ràng"
          >
            <Grid size={13} color="#4f46e5" />
            <span>Tất cả (15)</span>
            <ChevronDown size={12} color="#6366f1" />
          </button>

          {showAllTabsMenu && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0,
              background: 'white', borderRadius: 10, border: '1px solid #e2e8f0',
              boxShadow: '0 12px 30px -5px rgba(0,0,0,0.25)', width: 340,
              maxHeight: '80vh', overflowY: 'auto', zIndex: 2100, padding: 8
            }}>
              <div style={{ padding: '4px 8px', fontSize: '0.72rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase' }}>
                Danh Mục 15 Phân Hệ DMH Suite
              </div>
              
              {/* Group 1: Y Khoa & Lâm Sàng */}
              <div style={{ marginTop: 6, fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', padding: '2px 8px', borderBottom: '1px solid #f1f5f9' }}>
                🏥 Y KHOA & LÂM SÀNG
              </div>
              {ALL_TAB_ITEMS.filter(item => item.category === 'Lâm Sàng').map(item => (
                <button
                  key={item.tab}
                  onClick={() => { handleTabClick(item.tab); setShowAllTabsMenu(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 8px', border: 'none', borderRadius: 6,
                    background: activeTab === item.tab ? '#eff6ff' : 'transparent',
                    color: activeTab === item.tab ? '#1d4ed8' : '#334155',
                    cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', fontWeight: activeTab === item.tab ? 700 : 500
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = activeTab === item.tab ? '#eff6ff' : 'transparent'}
                >
                  {item.icon}
                  <span style={{ flex: 1 }}>{item.fullLabel}</span>
                  {!canAccess(item.tab) && <span style={{ fontSize: 10 }}>🔒</span>}
                </button>
              ))}

              {/* Group 2: Nghiệp Vụ BHYT */}
              <div style={{ marginTop: 8, fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', padding: '2px 8px', borderBottom: '1px solid #f1f5f9' }}>
                🛡️ NGHIỆP VỤ BHYT & GIÁM ĐỊNH
              </div>
              {ALL_TAB_ITEMS.filter(item => item.category === 'BHYT').map(item => (
                <button
                  key={item.tab}
                  onClick={() => { handleTabClick(item.tab); setShowAllTabsMenu(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 8px', border: 'none', borderRadius: 6,
                    background: activeTab === item.tab ? '#eff6ff' : 'transparent',
                    color: activeTab === item.tab ? '#1d4ed8' : '#334155',
                    cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', fontWeight: activeTab === item.tab ? 700 : 500
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = activeTab === item.tab ? '#eff6ff' : 'transparent'}
                >
                  {item.icon}
                  <span style={{ flex: 1 }}>{item.fullLabel}</span>
                  {!canAccess(item.tab) && <span style={{ fontSize: 10 }}>🔒</span>}
                </button>
              ))}

              {/* Group 3: Kỹ Thuật PC & Tiện Ích */}
              <div style={{ marginTop: 8, fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', padding: '2px 8px', borderBottom: '1px solid #f1f5f9' }}>
                💻 KỸ THUẬT MÁY TÍNH & VĂN PHÒNG
              </div>
              {ALL_TAB_ITEMS.filter(item => item.category === 'Hệ Thống' || item.category === 'Văn Phòng').map(item => (
                <button
                  key={item.tab}
                  onClick={() => { handleTabClick(item.tab); setShowAllTabsMenu(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 8px', border: 'none', borderRadius: 6,
                    background: activeTab === item.tab ? '#eff6ff' : 'transparent',
                    color: activeTab === item.tab ? '#1d4ed8' : '#334155',
                    cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', fontWeight: activeTab === item.tab ? 700 : 500
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = activeTab === item.tab ? '#eff6ff' : 'transparent'}
                >
                  {item.icon}
                  <span style={{ flex: 1 }}>{item.fullLabel}</span>
                  {!canAccess(item.tab) && <span style={{ fontSize: 10 }}>🔒</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Dòng Biểu Tượng & Trạng Thái Đang Xử Lý Toàn Bộ Ứng Dụng ── */}
        <HeaderProcessingIndicator />

        {/* ── Cụm Bên Phải Siêu Gọn Gàng: Chỉ License Badge + Nút Menu Tiện Ích [⋮] ── */}
        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 0.25rem', flexShrink: 0, whiteSpace: 'nowrap'
        }}>
          {/* Điều Khiển Tự Động Làm Mới Thông Minh Toàn App */}
          <AutoRefreshControl />

          {/* Smart License Badge */}
          {license?.isTrial ? (
            <button
              onClick={() => setShowLicense(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 6, border: '1.5px solid #f59e0b', cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.25))',
                color: '#b45309', fontSize: '0.74rem', fontWeight: 800,
                whiteSpace: 'nowrap', flexShrink: 0, height: 28
              }}
              title="Chế độ dùng thử 3 ngày — Bấm để kích hoạt bản quyền chính thức"
            >
              <Clock size={13} color="#d97706" />
              <span>Trial: còn {license.trialDaysLeft ?? 0} ngày</span>
            </button>
          ) : license?.valid && !license.expired ? (
            <button
              onClick={() => setShowLicense(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 9px', borderRadius: 6, border: '1.5px solid #10b981', cursor: 'pointer',
                background: 'rgba(16,185,129,0.12)', color: '#059669',
                fontSize: '0.74rem', fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0, height: 28
              }}
              title={`Đã kích hoạt bản quyền chính hãng (${license.customerName || 'VIP'})`}
            >
              <ShieldCheck size={14} color="#10b981" />
              <span>{license.tier === 'HOSPITAL_ENTERPRISE' ? 'Enterprise' : license.tier === 'CLINIC_STANDARD' ? 'Clinic Pro' : 'IT Pro'}</span>
            </button>
          ) : (
            <button
              onClick={() => setShowLicense(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 6, border: '1px solid #ef4444', cursor: 'pointer',
                background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, height: 28
              }}
              title="Bản quyền chưa kích hoạt hoặc đã hết hạn"
            >
              <ShieldOff size={13} />
              <span>Chưa có License</span>
            </button>
          )}

          {/* Menu Tiện Ích Gọn Gàng [⋮] gom toàn bộ: Hướng dẫn, Thương hiệu, Gói Module, Lịch sử, Cập nhật */}
          <div className="utility-menu-container" style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUtilityMenu(!showUtilityMenu)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 6, border: '1px solid #cbd5e1',
                background: showUtilityMenu ? '#e2e8f0' : 'white',
                color: '#475569', cursor: 'pointer', flexShrink: 0, position: 'relative'
              }}
              title="Tiện ích & Cài đặt hệ thống (Hướng dẫn, Thương hiệu, Module, Lịch sử, Cập nhật)"
            >
              <MoreVertical size={16} />
              {updateResult?.hasUpdate && (
                <span style={{
                  position: 'absolute', top: 3, right: 3, width: 7, height: 7,
                  borderRadius: '50%', background: '#ef4444', border: '1px solid white'
                }} />
              )}
            </button>

            {showUtilityMenu && (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 5px)', right: 0,
                  background: 'white', borderRadius: 10, border: '1px solid #e2e8f0',
                  boxShadow: '0 12px 30px -5px rgba(0,0,0,0.22)', minWidth: 235,
                  zIndex: 2200, overflow: 'hidden', padding: '6px 0'
                }}
              >
                <div style={{ padding: '6px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Cài Đặt & Tiện Ích
                </div>
                <button
                  onClick={() => { setShowUtilityMenu(false); setShowQuickGuide(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 14px', border: 'none', background: 'none',
                    fontSize: '0.82rem', color: '#334155', cursor: 'pointer', textAlign: 'left'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <BookOpen size={15} color="#6366f1" />
                  <span>Hướng dẫn nhanh</span>
                </button>
                <button
                  onClick={() => { setShowUtilityMenu(false); setShowOemModal(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 14px', border: 'none', background: 'none',
                    fontSize: '0.82rem', color: '#334155', cursor: 'pointer', textAlign: 'left'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Building2 size={15} color="#10b981" />
                  <span>Cấu hình thương hiệu (OEM)</span>
                </button>
                <button
                  onClick={() => { setShowUtilityMenu(false); setShowModuleHub(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 14px', border: 'none', background: 'none',
                    fontSize: '0.82rem', color: '#334155', cursor: 'pointer', textAlign: 'left'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Boxes size={15} color="#6366f1" />
                  <span>Quản lý gói Module</span>
                </button>
                <button
                  onClick={() => { setShowUtilityMenu(false); setShowHistoryModal(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 14px', border: 'none', background: 'none',
                    fontSize: '0.82rem', color: '#334155', cursor: 'pointer', textAlign: 'left'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Clock size={15} color="#0ea5e9" />
                  <span>Lịch sử đối chiếu ({loadHistory().length})</span>
                </button>
                <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
                <button
                  onClick={() => { setShowUtilityMenu(false); handleManualCheckUpdate(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 14px', border: 'none', background: 'none',
                    fontSize: '0.82rem', color: updateResult?.hasUpdate ? '#0284c7' : '#334155', cursor: 'pointer', textAlign: 'left',
                    fontWeight: 600
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <RefreshCw size={15} color={updateResult?.hasUpdate ? '#0284c7' : '#64748b'} className={isCheckingUpdate ? 'animate-spin' : ''} />
                  <span>
                    {updateResult?.hasUpdate ? 'Cập nhật phiên bản mới!' : 'Kiểm tra bản cập nhật'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Modal Lịch sử khi mở từ menu */}
          <HistoryPanel
            onRestore={handleRestore}
            isOpen={showHistoryModal}
            onClose={() => setShowHistoryModal(false)}
            showTriggerButton={false}
          />
        </div>
      </nav>

      {/* ── Hàng 2: Thanh Tab Chuyên Biệt — Dàn Đầy Đủ 15 Tabs (flex-wrap: wrap) ── */}
      <div className="app-tab-bar" style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px 6px',
        padding: '6px 16px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {ALL_TAB_ITEMS.map(({ tab, icon, shortLabel, fullLabel, color }) => {
          const active   = activeTab === tab;
          const unlocked = canAccess(tab as typeof ALL_TABS[number]);
          return (
            <button
              key={tab}
              className={`app-tab-btn ${active ? 'active' : ''}`}
              onClick={() => handleTabClick(tab as AppTab)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                fontSize: '0.78rem',
                fontWeight: active ? 700 : 500,
                height: 29,
                borderRadius: 6,
                border: active ? '1px solid transparent' : '1px solid #cbd5e1',
                background: active ? (color || '#1d4ed8') : '#ffffff',
                color: active ? '#ffffff' : '#334155',
                boxShadow: active ? '0 2px 5px rgba(0,0,0,0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                flexShrink: 0,
                ...(!unlocked ? { opacity: 0.55 } : {})
              }}
              title={unlocked ? fullLabel : `🔒 ${fullLabel} — Cần kích hoạt License`}
              tabIndex={0}
            >
              {icon} <span>{shortLabel}</span>
              {!unlocked && (
                <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.7 }}>🔒</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Global Notifications & Dialogs ── */}
      <GlobalNotificationContainer />

      {/* ── Help Banner ── */}
      {showHelp && (
        <div className="help-banner">
          <strong>📌 Hướng dẫn nhanh:</strong>
          &nbsp;① Chọn file Cổng Giám Định (Excel/XML/CSV) &nbsp;→&nbsp;
          ② Chọn file 01/BH nội bộ &nbsp;→&nbsp;
          ③ Nhấn <strong>BẮT ĐẦU ĐỐI CHIẾU</strong> &nbsp;→&nbsp;
          ④ Xem kết quả & xuất báo cáo. Hệ thống tự nhận diện cột theo tên.
          <button onClick={() => setShowHelp(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <main className={`main-content ${activeTab === 'pctools' || activeTab === 'endoscopy' ? 'main-content-full' : ''}`}>
        {!canAccess(activeTab) && (
          <LockedFeatureGuard
            tab={activeTab as typeof ALL_TABS[number]}
            license={license}
            onOpenLicenseModal={() => setShowLicense(true)}
            onNavigateAllowedTab={(t) => handleTabClick(t as AppTab)}
          />
        )}

        <div
          key="tab-compare"
          style={{ display: canAccess(activeTab) && activeTab === 'compare' ? 'block' : 'none', width: '100%' }}
        >
            {/* ── Upload Section ── */}
            <div className="upload-section">
              <UploadCard
                title="Dữ liệu Cổng Giám Định"
                subtitle="Excel · XML · CSV — xuất từ Cổng giám định BHXH"
                exampleName="CongGiamDinh.xml"
                file={file1}
                format={format1}
                onFileChange={handleFile1}
                previewRows={preview1}
                color="#10b981"
              />

              <div className="action-center">
                <button
                  id="btn-start-compare"
                  className="btn-primary"
                  disabled={!file1 || !file2 || isProcessing}
                  onClick={() => handleProcess()}
                >
                  {isProcessing
                    ? <><div className="spinner"/> Đang xử lý...</>
                    : <><Play size={20} fill="currentColor"/> BẮT ĐẦU ĐỐI CHIẾU</>
                  }
                </button>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setShowMapping(true)}
                    disabled={!file1 || !file2 || isProcessing}
                  >
                    <Settings size={15}/> Tùy chỉnh cột
                  </button>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setShowRulesModal(true)}
                  >
                    <Settings size={15}/> Cài đặt Module
                  </button>
                  {results.length > 0 && (
                    <button className="btn-secondary" onClick={handleReset}>
                      <RotateCcw size={15}/> Làm mới
                    </button>
                  )}
                </div>
              </div>

              <UploadCard
                title="Dữ liệu Nội bộ (01/BH)"
                subtitle="Excel · XML · CSV — xuất từ phần mềm quản lý nội bộ"
                exampleName="Mau_01_BH.xlsx"
                file={file2}
                format={format2}
                onFileChange={handleFile2}
                previewRows={preview2}
                color="#6366f1"
              />
            </div>

            {isProcessing && <div className="progress-bar-wrap"><div className="progress-bar"/></div>}

            <Dashboard stats={stats} portalCount={portalCount} internalCount={internalCount} />

            <div className="results-section">
              <div className="results-header">
                <h2 className="results-title">
                  <Settings size={18} style={{ marginRight: 6 }} />
                  Danh sách đối soát chi tiết
                </h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatsBar stats={stats} />
                  {results.length > 0 && (
                    <button id="btn-export" className="btn-secondary" onClick={handleExport}>
                      <Download size={16}/> Xuất Excel
                    </button>
                  )}
                </div>
              </div>

              {results.length > 0 && (
                <div className="results-toolbar">
                  <div className="filter-tabs">
                    {filterOptions.map(opt => (
                      <button
                        key={opt.value}
                        className={`filter-tab ${filter === opt.value ? 'active' : ''}`}
                        onClick={() => { setFilter(opt.value); setPage(1); }}
                        style={filter === opt.value && opt.color ? { background: opt.color, color: 'white' } : {}}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="search-input-wrapper">
                    <Search size={15} className="search-icon"/>
                    <input
                      id="search-patient"
                      className="search-input"
                      type="text"
                      placeholder="Tìm tên, mã thẻ, trường lệch..."
                      value={searchQuery}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                  </div>
                </div>
              )}

              <ResultsTable
                results={results}
                filter={filter}
                searchQuery={searchQuery}
                page={page}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
        </div>

        {/* ── Các Phân Hệ Chuyên Biệt (Virtual Keep-Alive Tab Stack — Tốc Độ Chuyển Tab 0ms) ── */}
        {visitedTabs.has('reader') && (
          <div key="tab-reader" style={{ display: canAccess(activeTab) && activeTab === 'reader' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['reader']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['reader']} />}>
                <FileReaderTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('converter') && (
          <div key="tab-converter" style={{ display: canAccess(activeTab) && activeTab === 'converter' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['converter']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['converter']} />}>
                <ConverterTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('printer') && (
          <div key="tab-printer" style={{ display: canAccess(activeTab) && activeTab === 'printer' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['printer']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['printer']} />}>
                <PrinterTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('repair') && (
          <div key="tab-repair" style={{ display: canAccess(activeTab) && activeTab === 'repair' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['repair']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['repair']} />}>
                <FileRepairTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('filter') && (
          <div key="tab-filter" style={{ display: canAccess(activeTab) && activeTab === 'filter' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['filter']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['filter']} />}>
                <DataFilterTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('selfbuilt') && (
          <div key="tab-selfbuilt" style={{ display: canAccess(activeTab) && activeTab === 'selfbuilt' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['selfbuilt']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['selfbuilt']} />}>
                <SelfBuilt01Tab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('endoscopy') && (
          <div
            key="tab-endoscopy"
            className="tab-panel-fullbleed"
            style={{ display: canAccess(activeTab) && activeTab === 'endoscopy' ? 'flex' : 'none' }}
          >
            <ErrorBoundary inline tabTitle={TAB_LABELS['endoscopy']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['endoscopy']} />}>
                <EndoscopyTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('hiscall') && (
          <div key="tab-hiscall" style={{ display: canAccess(activeTab) && activeTab === 'hiscall' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['hiscall']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['hiscall']} />}>
                <HisCallTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('attendance') && (
          <div key="tab-attendance" style={{ display: canAccess(activeTab) && activeTab === 'attendance' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['attendance']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['attendance']} />}>
                <AttendanceTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('bhytcheck') && (
          <div key="tab-bhytcheck" style={{ display: canAccess(activeTab) && activeTab === 'bhytcheck' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['bhytcheck']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['bhytcheck']} />}>
                <BhytValidatorTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('signature') && (
          <div key="tab-signature" style={{ display: canAccess(activeTab) && activeTab === 'signature' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['signature']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['signature']} />}>
                <SignatureTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('dcbhyt') && (
          <div key="tab-dcbhyt" style={{ display: canAccess(activeTab) && activeTab === 'dcbhyt' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['dcbhyt']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['dcbhyt']} />}>
                <DcbhytTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('officeformulas') && (
          <div key="tab-officeformulas" style={{ display: canAccess(activeTab) && activeTab === 'officeformulas' ? 'block' : 'none', width: '100%' }}>
            <ErrorBoundary inline tabTitle={TAB_LABELS['officeformulas']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['officeformulas']} />}>
                <OfficeFormulasTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.has('pctools') && (
          <div
            key="tab-pctools"
            className="tab-panel-fullbleed"
            style={{ display: canAccess(activeTab) && activeTab === 'pctools' ? 'flex' : 'none' }}
          >
            <ErrorBoundary inline tabTitle={TAB_LABELS['pctools']} fallbackTab={() => setActiveTab('compare')}>
              <Suspense fallback={<TabLoadingSkeleton tabTitle={TAB_LABELS['pctools']} />}>
                <PcToolsTab />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {showMapping && (
          <FieldMappingModal
            portalCols={preview1.length > 0 ? Object.keys(preview1[0]) : []}
            internalCols={preview2.length > 0 ? Object.keys(preview2[0]) : []}
            initialPortal={customPortalMap}
            initialInternal={customInternalMap}
            onSave={(p, i) => {
              setCustomPortalMap(p);
              setCustomInternalMap(i);
              localStorage.setItem('dmh_portal_mapping', JSON.stringify(p));
              localStorage.setItem('dmh_internal_mapping', JSON.stringify(i));
              setShowMapping(false);
              addToast({ type: 'success', title: 'Đã lưu cấu hình', message: 'Cấu hình cột đã được lưu lại cho các lần đối chiếu sau. Bạn có thể bấm BẮT ĐẦU ĐỐI CHIẾU để chạy.' });
            }}
            onClose={() => setShowMapping(false)}
          />
        )}

        {/* ── Rules Modal ── */}
        {showRulesModal && (
          <RulesModal onClose={() => setShowRulesModal(false)} />
        )}

        {/* ── Quick Onboarding Guide Modal ── */}
        {showQuickGuide && (
          <QuickGuideModal
            onClose={() => setShowQuickGuide(false)}
            onOpenTab={(tab) => handleTabClick(tab as AppTab)}
          />
        )}

        {/* ── OEM / White-Label Settings Modal ── */}
        {showOemModal && (
          <OemSettingsModal
            onClose={() => setShowOemModal(false)}
            onSaved={(cfg) => {
              setOemConfig(cfg);
              addToast({
                type: 'success',
                title: 'Đã cập nhật thương hiệu',
                message: `Hệ thống đã nhận diện cơ sở y tế: ${cfg.clinicName}`,
              });
            }}
          />
        )}

        {/* ── DMH Modular Hub Modal ── */}
        {showModuleHub && (
          <ModuleHubModal
            isOpen={showModuleHub}
            onClose={() => {
              setShowModuleHub(false);
              setTargetModuleId(null);
            }}
            license={license}
            targetModuleId={targetModuleId}
          />
        )}

        {/* ── Auto-Update Notification Modal ── */}
        {showUpdateModal && updateResult && (
          <UpdateNotificationModal
            isOpen={showUpdateModal}
            onClose={() => setShowUpdateModal(false)}
            updateInfo={updateResult}
          />
        )}

        {/* ── License Modal ── */}
        {showLicense && (
          <LicenseModal
            onClose={() => setShowLicense(false)}
            onActivate={(r) => {
              setLicense(r);
              if (r.valid && !r.expired) {
                if (!r.tabs[activeTab as typeof ALL_TABS[number]]) setActiveTab('compare');
                runAutoDownloadLicensedModules(r);
                addToast({
                  type: 'success',
                  title: '✅ Kích hoạt thành công',
                  message: `Giấy phép ${TIER_LABELS[r.tier]} đã kích hoạt cho ${r.customerName || 'Máy tính này'} — Hệ thống đang tự động đồng bộ dữ liệu ngầm.`,
                });
              } else if (!r.valid) {
                setActiveTab('compare');
              }
            }}
            currentLicense={license}
          />
        )}
      </main>
    </div>
  );
}

export default App;
