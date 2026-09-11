import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, Users, Calendar, BarChart2, Grid, List,
  Download, Search, RefreshCw, ChevronDown, X, Clock,
  Settings, CheckCircle2, AlertTriangle, AlertCircle,
  Plus, Trash2, Edit2, RotateCcw, FileSpreadsheet, Filter,
  Stethoscope, Wifi, Save, Zap,
  Volume2, Unlock, Power, Key, Wrench
} from 'lucide-react';
import type {
  ShiftPreset,
  ScheduleConfig,
  RawPunchLog,
  EmployeeMonthlySummary,
} from '../utils/biometricAttendance';
import {
  DEFAULT_SHIFTS,
  DEFAULT_WEEKLY_TEMPLATE,
  parseBiometricExcelOrCsv,
  parseBiometricTextOrDat,
  evaluateMonthlyAttendance,
  exportMonthlyTimesheetExcel,
  exportDetailedPunchLogsExcel,
} from '../utils/biometricAttendance';

// ── Định nghĩa kiểu dữ liệu cũ của Chấm Công Lượt Khám (HIS) ────────────────
interface RawDoctorRow { doctor: string; datetime: Date | null; }
interface DoctorSummary {
  name: string;
  totalWorkDays: number;
  totalSessions: number;
  workDays: string[]; // 'dd/mm/yyyy'
}

function parseHisDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S);
  }
  if (typeof val === 'string') {
    const d = new Date(val.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function toDateKey(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function computeHisSummaries(rows: RawDoctorRow[]): DoctorSummary[] {
  const map = new Map<string, { sessions: number; days: Set<string> }>();
  for (const r of rows) {
    if (!r.doctor || !r.datetime) continue;
    const name = r.doctor.trim();
    if (!map.has(name)) map.set(name, { sessions: 0, days: new Set() });
    const entry = map.get(name)!;
    entry.sessions++;
    entry.days.add(toDateKey(r.datetime));
  }
  return Array.from(map.entries())
    .map(([name, { sessions, days }]) => ({
      name, totalSessions: sessions,
      totalWorkDays: days.size,
      workDays: Array.from(days).sort((a, b) => {
        const toTs = (s: string) => { const [d, m, y] = s.split('/'); return +new Date(+y, +m - 1, +d); };
        return toTs(a) - toTs(b);
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

// ── COMPONENT CHÍNH ATTENDANCE TAB ──────────────────────────────────────────

export function AttendanceTab() {
  // ── Phân hệ con (Sub-Tabs) ──
  const [activeSubTab, setActiveSubTab] = useState<'biometric' | 'device_setup' | 'shifts' | 'schedule' | 'his_counter'>('biometric');

  // ── Cấu hình Ca làm việc (Shifts) ──
  const [shifts, setShifts] = useState<ShiftPreset[]>(() => {
    try {
      const saved = localStorage.getItem('dmh_shift_presets');
      return saved ? JSON.parse(saved) : DEFAULT_SHIFTS;
    } catch {
      return DEFAULT_SHIFTS;
    }
  });

  // ── Cấu hình Lịch biểu & Phân ca (Schedules) ──
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>(() => {
    try {
      const saved = localStorage.getItem('dmh_shift_schedules');
      return saved ? JSON.parse(saved) : {
        weeklyTemplate: DEFAULT_WEEKLY_TEMPLATE,
        employeeRosters: {},
      };
    } catch {
      return {
        weeklyTemplate: DEFAULT_WEEKLY_TEMPLATE,
        employeeRosters: {},
      };
    }
  });

  // Lưu cấu hình khi có thay đổi
  useEffect(() => {
    try {
      localStorage.setItem('dmh_shift_presets', JSON.stringify(shifts));
    } catch {}
  }, [shifts]);

  useEffect(() => {
    try {
      localStorage.setItem('dmh_shift_schedules', JSON.stringify(scheduleConfig));
    } catch {}
  }, [scheduleConfig]);

  // ── Dữ liệu Máy Chấm Công (Biometric Data) ──
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [rawPunchLogs, setRawPunchLogs] = useState<RawPunchLog[]>([]);
  const [bioFileName, setBioFileName] = useState('');
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError] = useState('');
  const [bioSearch, setBioSearch] = useState('');
  const [bioStatusFilter, setBioStatusFilter] = useState<'ALL' | 'LATE' | 'EARLY' | 'MISSING' | 'OT'>('ALL');
  const [bioViewMode, setBioViewMode] = useState<'grid' | 'details'>('grid');
  const [selectedBioEmp, setSelectedBioEmp] = useState<EmployeeMonthlySummary | null>(null);
  const bioFileRef = useRef<HTMLInputElement>(null);

  // ── Phương thức nạp dữ liệu: 'lan' (IP mạng) hoặc 'file' (USB / Excel) ──
  const [dataInputMode, setDataInputMode] = useState<'lan' | 'file'>('lan');
  const [lanIp, setLanIp] = useState(() => localStorage.getItem('dmh_bio_last_ip') || '192.168.3.250');
  const [lanPort, setLanPort] = useState<number>(() => +(localStorage.getItem('dmh_bio_last_port') || 4370));
  const [lanMachineName, setLanMachineName] = useState(() => localStorage.getItem('dmh_bio_last_name') || 'Máy Phòng Khám (Ronald Jack)');
  const [lanLoading, setLanLoading] = useState(false);
  const [lanStatus, setLanStatus] = useState<{ ok: boolean; message: string; details?: any } | null>(null);
  const [lanScanning, setLanScanning] = useState(false);
  const [scanResults, setScanResults] = useState<Array<{ ip: string; port: number }>>([]);
  const [savedMachines, setSavedMachines] = useState<Array<{ id: string; name: string; ip: string; port: number }>>(() => {
    try {
      const saved = localStorage.getItem('dmh_saved_biometric_machines');
      return saved ? JSON.parse(saved) : [
        { id: 'm1', name: 'Máy Phòng Khám (Ronald Jack)', ip: '192.168.3.250', port: 4370 },
        { id: 'm2', name: 'Máy Cổng Chính (ZKTeco)', ip: '192.168.1.201', port: 4370 },
      ];
    } catch {
      return [];
    }
  });

  // Tự động phát hiện dải mạng LAN khi vào tab
  useEffect(() => {
    const eAPI = (window as any).electronAPI?.biometric;
    if (eAPI?.getLocalIp) {
      eAPI.getLocalIp().then((res: any) => {
        const savedIp = localStorage.getItem('dmh_bio_last_ip');
        if (savedIp) {
          setLanIp(savedIp);
        } else if (res?.defaultSubnet) {
          if (res.defaultSubnet === '192.168.3') {
            setLanIp('192.168.3.250');
          } else {
            setLanIp(`${res.defaultSubnet}.250`);
          }
        }
      }).catch(() => {});
    }
  }, []);

  const handleTestLanConnection = async (overrideIp?: string, overridePort?: number) => {
    const targetIp = (overrideIp || lanIp).trim();
    const targetPort = overridePort || lanPort;
    setLanLoading(true);
    setLanStatus(null);
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.testConnection) {
        setLanStatus({ ok: false, message: 'Tính năng kết nối IP chỉ khả dụng trên ứng dụng Desktop DMH_Tools.' });
        return;
      }
      const res = await eAPI.testConnection(targetIp, targetPort, 4000);
      if (res.ok) {
        setLanStatus({
          ok: true,
          message: `Kết nối máy chấm công ${targetIp}:${targetPort} thành công! (${res.userCount ?? 0} nhân viên, ${res.logCount ?? 0} bản ghi trên máy)`,
          details: res
        });
      } else {
        setLanStatus({
          ok: false,
          message: res.error || `Không kết nối được tới máy chấm công tại ${targetIp}:${targetPort}.`
        });
      }
    } catch (e: any) {
      setLanStatus({ ok: false, message: e.message || 'Lỗi kiểm tra kết nối.' });
    } finally {
      setLanLoading(false);
    }
  };

  const handlePullLanLogs = async (overrideIp?: string, overridePort?: number) => {
    const targetIp = (overrideIp || lanIp).trim();
    const targetPort = overridePort || lanPort;
    setLanLoading(true);
    setLanStatus({ ok: true, message: `Đang kết nối tới ${targetIp}:${targetPort} và tải dữ liệu chấm công...` });
    setBioError('');
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.pullLogs) {
        setLanStatus({ ok: false, message: 'Tính năng kết nối IP chỉ khả dụng trên ứng dụng Desktop DMH_Tools.' });
        return;
      }
      const res = await eAPI.pullLogs(targetIp, targetPort, 15000);
      if (res.ok && res.logs) {
        const punchLogs: RawPunchLog[] = res.logs.map((l: any) => ({
          empId: l.empId,
          empName: l.empName,
          timestamp: new Date(l.timestamp),
          punchType: l.punchType || 'UNKNOWN',
          deviceId: l.deviceId,
        }));

        if (!punchLogs.length) {
          setLanStatus({
            ok: true,
            message: `Đã kết nối thành công máy ${targetIp}:${targetPort} nhưng chưa có dữ liệu quẹt thẻ mới.`,
          });
        } else {
          setRawPunchLogs(punchLogs);
          const lastLog = punchLogs[punchLogs.length - 1];
          setSelectedMonth(lastLog.timestamp.getMonth() + 1);
          setSelectedYear(lastLog.timestamp.getFullYear());
          setBioFileName(`Máy ${targetIp}:${targetPort} (${punchLogs.length} lượt quẹt)`);
          setLanStatus({
            ok: true,
            message: `🎉 Đã kéo thành công ${punchLogs.length} lượt quẹt thẻ từ máy ${targetIp}!`,
          });
          setLanIp(targetIp);
          setLanPort(targetPort);
          localStorage.setItem('dmh_bio_last_ip', targetIp);
          localStorage.setItem('dmh_bio_last_port', String(targetPort));
          localStorage.setItem('dmh_bio_last_name', lanMachineName);
        }
      } else {
        setLanStatus({
          ok: false,
          message: res.error || `Lỗi khi kéo dữ liệu từ máy chấm công tại ${targetIp}:${targetPort}.`,
        });
      }
    } catch (e: any) {
      setLanStatus({ ok: false, message: e.message || 'Lỗi trong quá trình kéo dữ liệu.' });
    } finally {
      setLanLoading(false);
    }
  };

  const handleScanLan = async () => {
    setLanScanning(true);
    setScanResults([]);
    setLanStatus({ ok: true, message: 'Đang quét toàn bộ dải mạng LAN để tìm máy chấm công...' });
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.scanLan) {
        setLanStatus({ ok: false, message: 'Tính năng quét mạng LAN chỉ hỗ trợ trên ứng dụng Electron.' });
        return;
      }
      const parts = lanIp.split('.');
      const subnet = parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}` : '';
      const res = await eAPI.scanLan(subnet, lanPort);
      if (res?.devices && res.devices.length > 0) {
        setScanResults(res.devices);
        
        // TỰ ĐỘNG ĐẨY MÁY TÌM THẤY VÀO Ô IP & PORT VÀ KÉO DỮ LIỆU TỰ ĐỘNG:
        const primaryDev = res.devices[0];
        setLanIp(primaryDev.ip);
        setLanPort(primaryDev.port);
        localStorage.setItem('dmh_bio_last_ip', primaryDev.ip);
        localStorage.setItem('dmh_bio_last_port', String(primaryDev.port));

        setLanStatus({
          ok: true,
          message: `🎯 Đã tìm thấy máy ${primaryDev.ip}:${primaryDev.port}! Tự động đẩy IP vào và đang kéo dữ liệu...`
        });

        // Tự động kéo dữ liệu chấm công ngay lập tức!
        await handlePullLanLogs(primaryDev.ip, primaryDev.port);
      } else {
        setLanStatus({
          ok: false,
          message: `Không phát hiện máy chấm công nào đang mở cổng ${lanPort} trong dải mạng ${res?.subnet || subnet}.x.`
        });
      }
    } catch (e: any) {
      setLanStatus({ ok: false, message: e.message || 'Lỗi khi quét mạng LAN.' });
    } finally {
      setLanScanning(false);
    }
  };

  const handleSaveCurrentMachine = () => {
    if (!lanIp.trim()) return;
    const newMachine = {
      id: `m_${Date.now()}`,
      name: lanMachineName.trim() || `Máy ${lanIp}`,
      ip: lanIp.trim(),
      port: lanPort,
    };
    const updated = [newMachine, ...savedMachines.filter(m => m.ip !== newMachine.ip)];
    setSavedMachines(updated);
    localStorage.setItem('dmh_saved_biometric_machines', JSON.stringify(updated));
    setLanStatus({ ok: true, message: `Đã lưu cấu hình máy "${newMachine.name}" vào danh mục!` });
  };

  const handleDeleteSavedMachine = (id: string) => {
    const updated = savedMachines.filter(m => m.id !== id);
    setSavedMachines(updated);
    localStorage.setItem('dmh_saved_biometric_machines', JSON.stringify(updated));
  };

  // ── Quản trị & Cài đặt máy chấm công từ xa ──
  const [deviceStatusLoading, setDeviceStatusLoading] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<any>(null);
  const [deviceUsersLoading, setDeviceUsersLoading] = useState(false);
  const [deviceUsers, setDeviceUsers] = useState<any[]>([]);
  const [deviceUserSearch, setDeviceUserSearch] = useState('');
  const [deviceActionLoading, setDeviceActionLoading] = useState<string | null>(null);
  const [deviceActionMsg, setDeviceActionMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [unlockDuration, setUnlockDuration] = useState(5);

  const fetchDeviceStatus = async (silent = false) => {
    if (!silent) setDeviceStatusLoading(true);
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.getDeviceStatus) return;
      const res = await eAPI.getDeviceStatus(lanIp.trim(), lanPort, 5000);
      if (res.ok) {
        setDeviceStatus(res);
      } else if (!silent) {
        setDeviceActionMsg({ ok: false, message: res.error || 'Không đọc được trạng thái máy chấm công.' });
      }
    } catch (e: any) {
      if (!silent) setDeviceActionMsg({ ok: false, message: e.message || 'Lỗi khi đọc trạng thái máy.' });
    } finally {
      if (!silent) setDeviceStatusLoading(false);
    }
  };

  const fetchDeviceUsers = async () => {
    setDeviceUsersLoading(true);
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.getUsers) return;
      const res = await eAPI.getUsers(lanIp.trim(), lanPort, 10000);
      if (res.ok && res.users) {
        setDeviceUsers(res.users);
      } else {
        setDeviceActionMsg({ ok: false, message: res.error || 'Không đọc được danh sách nhân viên từ máy.' });
      }
    } catch (e: any) {
      setDeviceActionMsg({ ok: false, message: e.message || 'Lỗi khi tải danh sách nhân viên máy.' });
    } finally {
      setDeviceUsersLoading(false);
    }
  };

  const handleSyncTime = async () => {
    setDeviceActionLoading('syncTime');
    setDeviceActionMsg(null);
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.syncTime) return;
      const res = await eAPI.syncTime(lanIp.trim(), lanPort, 5000);
      if (res.ok) {
        setDeviceActionMsg({ ok: true, message: res.message || 'Đồng bộ thời gian thành công!' });
        fetchDeviceStatus(true);
      } else {
        setDeviceActionMsg({ ok: false, message: res.error || 'Lỗi khi đồng bộ thời gian.' });
      }
    } catch (e: any) {
      setDeviceActionMsg({ ok: false, message: e.message || 'Lỗi khi gửi lệnh đồng bộ giờ.' });
    } finally {
      setDeviceActionLoading(null);
    }
  };

  const handleTestVoice = async () => {
    setDeviceActionLoading('testVoice');
    setDeviceActionMsg(null);
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.testVoice) return;
      const res = await eAPI.testVoice(lanIp.trim(), lanPort, 5000);
      if (res.ok) {
        setDeviceActionMsg({ ok: true, message: res.message || 'Đã phát câu chào trên máy chấm công thành công!' });
      } else {
        setDeviceActionMsg({ ok: false, message: res.error || 'Lỗi khi gửi lệnh thử loa.' });
      }
    } catch (e: any) {
      setDeviceActionMsg({ ok: false, message: e.message || 'Lỗi thử loa máy chấm công.' });
    } finally {
      setDeviceActionLoading(null);
    }
  };

  const handleRebootDevice = async () => {
    if (!window.confirm(`Xác nhận khởi động lại máy chấm công tại ${lanIp}:${lanPort}?\n\nThiết bị sẽ khởi động lại và tạm ngắt kết nối trong khoảng 20-30 giây.`)) {
      return;
    }
    setDeviceActionLoading('reboot');
    setDeviceActionMsg(null);
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.reboot) return;
      const res = await eAPI.reboot(lanIp.trim(), lanPort, 5000);
      if (res.ok) {
        setDeviceActionMsg({ ok: true, message: res.message || 'Đã gửi lệnh khởi động lại máy chấm công!' });
      } else {
        setDeviceActionMsg({ ok: false, message: res.error || 'Lỗi khi gửi lệnh khởi động lại.' });
      }
    } catch (e: any) {
      setDeviceActionMsg({ ok: false, message: e.message || 'Lỗi khởi động lại máy.' });
    } finally {
      setDeviceActionLoading(null);
    }
  };

  const handleClearAdmin = async () => {
    if (!window.confirm('CẢNH BÁO QUAN TRỌNG: Bạn có chắc muốn XÓA QUYỀN ADMIN trên máy chấm công?\n\nChức năng này giúp cứu hộ khi quên mật khẩu hoặc quản trị viên cũ nghỉ việc. Sau khi xóa, bạn có thể nhấn trực tiếp phím M/OK để vào Menu cài đặt máy mà không cần xác thực.')) {
      return;
    }
    setDeviceActionLoading('clearAdmin');
    setDeviceActionMsg(null);
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.clearAdmin) return;
      const res = await eAPI.clearAdmin(lanIp.trim(), lanPort, 5000);
      if (res.ok) {
        setDeviceActionMsg({ ok: true, message: res.message || 'Đã xóa quyền quản trị viên trên máy chấm công thành công!' });
        fetchDeviceUsers();
      } else {
        setDeviceActionMsg({ ok: false, message: res.error || 'Lỗi khi xóa quyền admin máy.' });
      }
    } catch (e: any) {
      setDeviceActionMsg({ ok: false, message: e.message || 'Lỗi xóa quyền admin máy.' });
    } finally {
      setDeviceActionLoading(null);
    }
  };

  const handleUnlockDoor = async () => {
    setDeviceActionLoading('unlockDoor');
    setDeviceActionMsg(null);
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.unlockDoor) return;
      const res = await eAPI.unlockDoor(lanIp.trim(), lanPort, unlockDuration, 5000);
      if (res.ok) {
        setDeviceActionMsg({ ok: true, message: res.message || `Đã mở chốt cửa trong ${unlockDuration} giây!` });
      } else {
        setDeviceActionMsg({ ok: false, message: res.error || 'Lỗi khi gửi lệnh mở khóa cửa.' });
      }
    } catch (e: any) {
      setDeviceActionMsg({ ok: false, message: e.message || 'Lỗi kích hoạt mở khóa cửa.' });
    } finally {
      setDeviceActionLoading(null);
    }
  };

  const handleDeleteDeviceUser = async (uid: number, name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa nhân viên "${name || `UID ${uid}`}" khỏi máy chấm công?\n\nThao tác này sẽ xóa hồ sơ nhân viên và vân tay/thẻ khỏi máy chấm công!`)) {
      return;
    }
    setDeviceActionLoading(`del_${uid}`);
    setDeviceActionMsg(null);
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.deleteUser) return;
      const res = await eAPI.deleteUser(lanIp.trim(), lanPort, uid, 5000);
      if (res.ok) {
        setDeviceActionMsg({ ok: true, message: res.message || `Đã xóa nhân viên UID ${uid} khỏi máy!` });
        fetchDeviceUsers();
        fetchDeviceStatus(true);
      } else {
        setDeviceActionMsg({ ok: false, message: res.error || 'Lỗi xóa nhân sự trên máy.' });
      }
    } catch (e: any) {
      setDeviceActionMsg({ ok: false, message: e.message || 'Lỗi xóa nhân sự trên máy.' });
    } finally {
      setDeviceActionLoading(null);
    }
  };

  const handleClearDeviceLogs = async () => {
    if (!window.confirm('CẢNH BÁO QUAN TRỌNG: Thao tác này sẽ XÓA SẠCH toàn bộ dữ liệu lịch sử quẹt thẻ đang lưu trên máy chấm công để giải phóng bộ nhớ.\n\nHãy đảm bảo bạn đã bấm nút "KÉO DỮ LIỆU CHẤM CÔNG" về phần mềm DMH_Tools trước khi thực hiện xóa!\n\nBạn có muốn tiếp tục?')) {
      return;
    }
    if (!window.confirm('XÁC NHẬN LẦN 2: Bạn thực sự muốn XÓA VĨNH VIỄN toàn bộ nhật ký quẹt thẻ trên máy chấm công?')) {
      return;
    }
    setDeviceActionLoading('clearLogs');
    setDeviceActionMsg(null);
    try {
      const eAPI = (window as any).electronAPI?.biometric;
      if (!eAPI?.clearLogs) return;
      const res = await eAPI.clearLogs(lanIp.trim(), lanPort, 8000);
      if (res.ok) {
        setDeviceActionMsg({ ok: true, message: res.message || 'Đã dọn dẹp bộ nhớ quẹt thẻ trên máy thành công!' });
        fetchDeviceStatus(true);
      } else {
        setDeviceActionMsg({ ok: false, message: res.error || 'Lỗi khi dọn dẹp bộ nhớ máy.' });
      }
    } catch (e: any) {
      setDeviceActionMsg({ ok: false, message: e.message || 'Lỗi khi gửi lệnh xóa log máy.' });
    } finally {
      setDeviceActionLoading(null);
    }
  };

  // Tự động tải thông số máy khi người dùng chuyển sang tab Cài Đặt Máy Chấm Công
  useEffect(() => {
    if (activeSubTab === 'device_setup') {
      fetchDeviceStatus();
      fetchDeviceUsers();
    }
  }, [activeSubTab]);

  // ── Tính toán tổng hợp Bảng công tháng ──
  const monthlySummaries = useMemo(() => {
    if (!rawPunchLogs.length) return [];
    return evaluateMonthlyAttendance(rawPunchLogs, shifts, scheduleConfig, selectedMonth, selectedYear);
  }, [rawPunchLogs, shifts, scheduleConfig, selectedMonth, selectedYear]);

  // Bộ lọc tìm kiếm & trạng thái máy chấm công
  const filteredSummaries = useMemo(() => {
    return monthlySummaries.filter(s => {
      const matchName = !bioSearch || s.empName.toLowerCase().includes(bioSearch.toLowerCase()) || s.empId.toLowerCase().includes(bioSearch.toLowerCase());
      if (!matchName) return false;
      if (bioStatusFilter === 'LATE') return s.totalLateCount > 0;
      if (bioStatusFilter === 'EARLY') return s.totalEarlyCount > 0;
      if (bioStatusFilter === 'MISSING') return s.totalMissingCount > 0;
      if (bioStatusFilter === 'OT') return s.totalOtHours > 0;
      return true;
    });
  }, [monthlySummaries, bioSearch, bioStatusFilter]);

  // ── Đọc File Máy Chấm Công ──
  const handleBioFileUpload = useCallback((file: File) => {
    setBioLoading(true);
    setBioError('');
    setBioFileName(file.name);

    const isTextOrDat = file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.dat');

    if (isTextOrDat) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = String(e.target?.result ?? '');
          const result = parseBiometricTextOrDat(text);
          if (!result.punchLogs.length) {
            setBioError('Không tìm thấy dữ liệu quẹt thẻ hợp lệ trong file!');
          } else {
            setRawPunchLogs(result.punchLogs);
            // Tự động cập nhật tháng/năm theo lần quẹt gần nhất
            const lastLog = result.punchLogs[result.punchLogs.length - 1];
            setSelectedMonth(lastLog.timestamp.getMonth() + 1);
            setSelectedYear(lastLog.timestamp.getFullYear());
          }
        } catch {
          setBioError('Lỗi phân tích file văn bản/DAT từ máy chấm công.');
        }
        setBioLoading(false);
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buf = e.target?.result as ArrayBuffer;
          const result = parseBiometricExcelOrCsv(buf);
          if (!result.punchLogs.length) {
            setBioError('Không tìm thấy dữ liệu quẹt thẻ hợp lệ trong file Excel/CSV!');
          } else {
            setRawPunchLogs(result.punchLogs);
            const firstLog = result.punchLogs[0];
            setSelectedMonth(firstLog.timestamp.getMonth() + 1);
            setSelectedYear(firstLog.timestamp.getFullYear());
          }
        } catch {
          setBioError('Không đọc được file. Vui lòng kiểm tra định dạng (.xlsx, .xls, .csv, .txt, .dat).');
        }
        setBioLoading(false);
      };
      reader.readAsArrayBuffer(file);
    }
  }, []);

  // ── Quản lý Form Ca làm việc (Add/Edit Modal) ──
  const [editingShift, setEditingShift] = useState<ShiftPreset | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);

  const handleOpenAddShift = () => {
    setEditingShift({
      id: `shift_${Date.now()}`,
      code: 'NEW',
      name: 'Ca Mới',
      startTime: '08:00',
      endTime: '17:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      workUnits: 1.0,
      graceLateMinutes: 15,
      graceEarlyMinutes: 15,
      checkInWindowStart: '06:30',
      checkInWindowEnd: '09:30',
      checkOutWindowStart: '16:00',
      checkOutWindowEnd: '21:00',
      overtimeThresholdMinutes: 30,
      color: '#3b82f6',
    });
    setShowShiftModal(true);
  };

  const handleSaveShift = () => {
    if (!editingShift) return;
    setShifts(prev => {
      const exists = prev.some(s => s.id === editingShift.id);
      if (exists) {
        return prev.map(s => s.id === editingShift.id ? editingShift : s);
      }
      return [...prev, editingShift];
    });
    setShowShiftModal(false);
    setEditingShift(null);
  };

  const handleDeleteShift = (id: string) => {
    if (confirm('Bạn có chắc muốn xóa ca làm việc này?')) {
      setShifts(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleResetDefaultShifts = () => {
    if (confirm('Khôi phục danh mục ca chuẩn mặc định?')) {
      setShifts(DEFAULT_SHIFTS);
    }
  };

  // ── Dữ liệu & Logic Chấm Công Lượt Khám (HIS cũ) ─────────────────────────
  const [hisSummaries, setHisSummaries] = useState<DoctorSummary[]>([]);
  const [hisRawCount, setHisRawCount] = useState(0);
  const [hisFileName, setHisFileName] = useState('');
  const [hisLoading, setHisLoading] = useState(false);
  const [hisError, setHisError] = useState('');
  const [hisSearch, setHisSearch] = useState('');
  const [hisSelected, setHisSelected] = useState<DoctorSummary | null>(null);
  const [hisColDoctor, setHisColDoctor] = useState('');
  const [hisColDatetime, setHisColDatetime] = useState('');
  const [hisHeaders, setHisHeaders] = useState<string[]>([]);
  const [hisPreviewValues, setHisPreviewValues] = useState<Record<string, string>>({});
  const [hisSheetData, setHisSheetData] = useState<Record<string, unknown>[]>([]);
  const [hisViewMode, setHisViewMode] = useState<'summary' | 'grid'>('summary');
  const [hisGridMonth, setHisGridMonth] = useState(now.getMonth() + 1);
  const [hisGridYear, setHisGridYear] = useState(now.getFullYear());
  const [hisFixedDoctors, setHisFixedDoctors] = useState('');
  const hisFileRef = useRef<HTMLInputElement>(null);

  const processHisData = (rows: Record<string, unknown>[], dCol: string, tCol: string) => {
    const raw: RawDoctorRow[] = rows.map(r => ({
      doctor: String(r[dCol] ?? ''),
      datetime: parseHisDate(r[tCol]),
    }));
    setHisRawCount(raw.filter(r => r.datetime).length);
    setHisSummaries(computeHisSummaries(raw));
    setHisSelected(null);
  };

  const handleHisFile = useCallback((file: File) => {
    setHisLoading(true); setHisError(''); setHisSummaries([]); setHisSelected(null);
    setHisFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawArr: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
        if (!rawArr.length) { setHisError('File không có dữ liệu!'); setHisLoading(false); return; }

        let headerRowIdx = 0;
        let maxNonEmpty = 0;
        rawArr.slice(0, 10).forEach((row, idx) => {
          const nonEmpty = (row as unknown[]).filter(c => c !== '' && c != null).length;
          if (nonEmpty > maxNonEmpty) { maxNonEmpty = nonEmpty; headerRowIdx = idx; }
        });

        const headerRow = rawArr[headerRowIdx] as unknown[];
        const colLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const hdrs: string[] = headerRow.map((h, i) => {
          const raw = String(h ?? '').trim();
          return raw || `Cột ${i < 26 ? colLetters[i] : i + 1}`;
        });

        const dataRows: Record<string, unknown>[] = rawArr
          .slice(headerRowIdx + 1)
          .map(row => {
            const obj: Record<string, unknown> = {};
            hdrs.forEach((h, i) => { obj[h] = (row as unknown[])[i] ?? ''; });
            return obj;
          })
          .filter(r => Object.values(r).some(v => v !== '' && v != null));

        if (!dataRows.length) { setHisError('File không có dữ liệu sau hàng tiêu đề!'); setHisLoading(false); return; }

        setHisHeaders(hdrs);
        setHisSheetData(dataRows);

        const preview: Record<string, string> = {};
        hdrs.forEach(h => {
          const sample = dataRows.slice(0, 5).map(r => String(r[h] ?? '')).find(v => v.trim() !== '') ?? '';
          preview[h] = sample.length > 60 ? sample.slice(0, 60) + '…' : sample;
        });
        setHisPreviewValues(preview);

        const dCol = hdrs.find(h => /bác\s*s[iĩ]|tên|doctor|staff|nhân\s*viên/i.test(h)) ?? '';
        const tCol = hdrs.find(h => /ngày|giờ|date|time|datetime|khám/i.test(h)) ?? '';
        setHisColDoctor(dCol);
        setHisColDatetime(tCol);
        if (dCol && tCol) {
          processHisData(dataRows, dCol, tCol);
        }
      } catch {
        setHisError('Không đọc được file. Vui lòng kiểm tra định dạng (xlsx, csv).');
      }
      setHisLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const exportHisExcel = () => {
    const header = ['Bác sĩ', 'Ngày làm việc', 'Tổng ngày công', 'Tổng ca khám'];
    const dataRows = hisSummaries.flatMap(s =>
      s.workDays.map((d, i) => [
        i === 0 ? s.name : '',
        d,
        i === 0 ? s.totalWorkDays : '',
        i === 0 ? s.totalSessions : '',
      ])
    );
    const aoa = [header, ...dataRows];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'ChamCong');
    XLSX.writeFile(wb, 'BaoCaoChamCong_HIS.xlsx');
  };

  const exportHisGrid = () => {
    const daysInM = new Date(hisGridYear, hisGridMonth, 0).getDate();
    const days = Array.from({ length: daysInM }, (_, i) => i + 1);
    const fixedL = hisFixedDoctors.split('\n').map(s => s.trim()).filter(Boolean);
    const exportRows = fixedL.length > 0
      ? fixedL.map(name => hisSummaries.find(s => s.name === name) ?? { name, totalWorkDays: 0, totalSessions: 0, workDays: [] })
      : hisSummaries;

    const headerRow = [
      'Bác sĩ',
      ...days.map(d => `${String(d).padStart(2,'0')}/${String(hisGridMonth).padStart(2,'0')}`),
      'Tổng',
    ];

    const dataRows = exportRows.map(s => {
      const monthTotal = s.workDays.filter(w => {
        const [, mm, yyyy] = w.split('/');
        return +mm === hisGridMonth && +yyyy === hisGridYear;
      }).length;
      return [
        s.name,
        ...days.map(d => {
          const key = `${String(d).padStart(2,'0')}/${String(hisGridMonth).padStart(2,'0')}/${hisGridYear}`;
          return s.workDays.includes(key) ? 'X' : '';
        }),
        monthTotal,
      ];
    });

    const aoa = [headerRow, ...dataRows];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'ChamCong');
    XLSX.writeFile(wb, `ChamCong_HIS_T${hisGridMonth}_${hisGridYear}.xlsx`);
  };

  const hisFixedList = hisFixedDoctors.split('\n').map(s => s.trim()).filter(Boolean);
  const hisDoctorRows = hisFixedList.length > 0
    ? hisFixedList.map(name => hisSummaries.find(s => s.name === name) ?? { name, totalWorkDays: 0, totalSessions: 0, workDays: [] })
    : hisSummaries;
  const hisFiltered = hisDoctorRows.filter(s =>
    !hisSearch || s.name.toLowerCase().includes(hisSearch.toLowerCase())
  );

  const cardStyle: React.CSSProperties = {
    background: 'white',
    borderRadius: 8,
    padding: '1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', overflow: 'hidden' }}>

      {/* ── THANH ĐIỀU HƯỚNG PHÂN HỆ SUB-TABS ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.65rem 1rem',
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: 0,
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '3px', borderRadius: 8 }}>
          {[
            { id: 'biometric' as const, label: 'Máy Chấm Công & Bảng Công', icon: <Clock size={15} /> },
            { id: 'device_setup' as const, label: 'Cài Đặt Máy Chấm Công', icon: <Wrench size={15} /> },
            { id: 'shifts' as const, label: 'Cài Đặt Ca Làm Việc', icon: <Settings size={15} /> },
            { id: 'schedule' as const, label: 'Lịch Biểu & Phân Ca', icon: <Calendar size={15} /> },
            { id: 'his_counter' as const, label: 'Chấm Công Khám Bệnh (HIS)', icon: <Stethoscope size={15} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: activeSubTab === tab.id ? 700 : 500,
                background: activeSubTab === tab.id ? '#3b82f6' : 'transparent',
                color: activeSubTab === tab.id ? 'white' : '#475569',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Nút hành động theo từng tab */}
        {activeSubTab === 'biometric' && monthlySummaries.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => exportMonthlyTimesheetExcel(monthlySummaries, selectedMonth, selectedYear)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: '#10b981',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem'
              }}
            >
              <Download size={14} /> Xuất Bảng Công Tháng
            </button>
            <button
              onClick={() => exportDetailedPunchLogsExcel(monthlySummaries, selectedMonth, selectedYear)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: 'white',
                color: '#334155',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem'
              }}
            >
              <FileSpreadsheet size={14} color="#10b981" /> Xuất Chi Tiết Quẹt Thẻ
            </button>
          </div>
        )}

        {activeSubTab === 'device_setup' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { fetchDeviceStatus(); fetchDeviceUsers(); }}
              disabled={deviceStatusLoading || deviceUsersLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: 'white',
                color: '#334155',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem'
              }}
            >
              <RefreshCw size={13} style={{ animation: (deviceStatusLoading || deviceUsersLoading) ? 'spin 1s linear infinite' : 'none' }} />
              Làm Mới Thông Số Máy
            </button>
          </div>
        )}

        {activeSubTab === 'shifts' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleResetDefaultShifts}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: 'white',
                color: '#64748b',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '0.8rem'
              }}
            >
              <RotateCcw size={13} /> Khôi Phục Mặc Định
            </button>
            <button
              onClick={handleOpenAddShift}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem'
              }}
            >
              <Plus size={15} /> Thêm Ca Mới
            </button>
          </div>
        )}
      </div>

      {/* ── NỘI DUNG TỪNG PHÂN HỆ ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0.75rem', gap: '0.75rem', minHeight: 0 }}>

        {/* ══════════════════════════════════════════════════════════════════════
            SUB-TAB 1: MÁY CHẤM CÔNG & BẢNG CÔNG
        ══════════════════════════════════════════════════════════════════════ */}
        {activeSubTab === 'biometric' && (
          <div style={{ flex: 1, display: 'flex', gap: '0.75rem', overflow: 'hidden', minWidth: 0 }}>

            {/* Cột trái: Tải file & Thống kê */}
            <div style={{ width: 330, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
              {/* Thẻ Nạp Dữ Liệu: LAN IP & File USB */}
              <div style={cardStyle}>
                {/* Header chuyển chế độ LAN / File */}
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: 7, marginBottom: 12 }}>
                  <button
                    onClick={() => setDataInputMode('lan')}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '6px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
                      fontSize: '0.78rem', fontWeight: dataInputMode === 'lan' ? 700 : 500,
                      background: dataInputMode === 'lan' ? '#3b82f6' : 'transparent',
                      color: dataInputMode === 'lan' ? 'white' : '#475569',
                      boxShadow: dataInputMode === 'lan' ? '0 1px 3px rgba(59,130,246,0.3)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Wifi size={13} /> Kéo Qua Mạng LAN
                  </button>
                  <button
                    onClick={() => setDataInputMode('file')}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '6px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
                      fontSize: '0.78rem', fontWeight: dataInputMode === 'file' ? 700 : 500,
                      background: dataInputMode === 'file' ? '#3b82f6' : 'transparent',
                      color: dataInputMode === 'file' ? 'white' : '#475569',
                      boxShadow: dataInputMode === 'file' ? '0 1px 3px rgba(59,130,246,0.3)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Upload size={13} /> Tệp USB / Excel
                  </button>
                </div>

                {dataInputMode === 'lan' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>
                        🌐 Máy Chấm Công IP
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                        ZKTeco / Ronald Jack
                      </span>
                    </div>

                    {/* Danh sách máy đã lưu */}
                    {savedMachines.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 3, fontWeight: 600 }}>
                          Chọn máy đã cấu hình:
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <select
                            id="saved-machines-sel"
                            onChange={(e) => {
                              const found = savedMachines.find(m => m.id === e.target.value);
                              if (found) {
                                setLanIp(found.ip);
                                setLanPort(found.port);
                                setLanMachineName(found.name);
                                localStorage.setItem('dmh_bio_last_ip', found.ip);
                                localStorage.setItem('dmh_bio_last_port', String(found.port));
                                localStorage.setItem('dmh_bio_last_name', found.name);
                                handlePullLanLogs(found.ip, found.port);
                              }
                            }}
                            style={{
                              flex: 1, padding: '5px 8px', borderRadius: 6,
                              border: '1px solid #cbd5e1', fontSize: '0.78rem', background: '#f8fafc'
                            }}
                          >
                            <option value="">-- Danh mục máy đã lưu ({savedMachines.length}) --</option>
                            {savedMachines.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.ip}:{m.port})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const sel = document.getElementById('saved-machines-sel') as HTMLSelectElement | null;
                              if (sel && sel.value) {
                                handleDeleteSavedMachine(sel.value);
                              }
                            }}
                            title="Xóa máy đã chọn khỏi danh mục"
                            style={{
                              padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1',
                              background: '#f8fafc', color: '#94a3b8', cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Nhập IP & Port */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 2, fontWeight: 600 }}>
                          Địa chỉ IP máy:
                        </div>
                        <input
                          type="text"
                          value={lanIp}
                          onChange={e => { setLanIp(e.target.value); setLanStatus(null); }}
                          placeholder="VD: 192.168.1.201"
                          style={{
                            width: '100%', padding: '6px 8px', borderRadius: 6,
                            border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div style={{ width: 75 }}>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 2, fontWeight: 600 }}>
                          Cổng:
                        </div>
                        <input
                          type="number"
                          value={lanPort}
                          onChange={e => setLanPort(+e.target.value)}
                          placeholder="4370"
                          style={{
                            width: '100%', padding: '6px 8px', borderRadius: 6,
                            border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>

                    {/* Tên gợi nhớ */}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 2, fontWeight: 600 }}>
                        Tên máy gợi nhớ:
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input
                          type="text"
                          value={lanMachineName}
                          onChange={e => setLanMachineName(e.target.value)}
                          placeholder="VD: Máy Cửa Chính, Máy Tầng 2"
                          style={{
                            flex: 1, padding: '5px 8px', borderRadius: 6,
                            border: '1px solid #cbd5e1', fontSize: '0.78rem'
                          }}
                        />
                        <button
                          onClick={handleSaveCurrentMachine}
                          title="Lưu cấu hình máy này để dùng lại lần sau"
                          style={{
                            padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1',
                            background: '#f8fafc', color: '#475569', cursor: 'pointer', fontSize: '0.72rem',
                            display: 'flex', alignItems: 'center', gap: 3
                          }}
                        >
                          <Save size={12} /> Lưu
                        </button>
                      </div>
                    </div>

                    {/* Hàng nút Thao tác: Kiểm tra, Quét LAN & Cài Đặt */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleTestLanConnection()}
                        disabled={lanLoading || lanScanning}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          padding: '6px 6px', borderRadius: 6, border: '1px solid #cbd5e1',
                          background: '#f8fafc', color: '#334155', cursor: 'pointer',
                          fontSize: '0.74rem', fontWeight: 600
                        }}
                      >
                        {lanLoading ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} color="#eab308" />}
                        Kiểm Tra
                      </button>

                      <button
                        onClick={handleScanLan}
                        disabled={lanLoading || lanScanning}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          padding: '6px 6px', borderRadius: 6, border: '1px solid #cbd5e1',
                          background: '#f8fafc', color: '#334155', cursor: 'pointer',
                          fontSize: '0.74rem', fontWeight: 600
                        }}
                        title="Tự động dò tìm tất cả máy chấm công mở cổng 4370 trong mạng LAN"
                      >
                        {lanScanning ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={12} color="#3b82f6" />}
                        {lanScanning ? 'Đang dò...' : 'Quét Dò IP'}
                      </button>

                      <button
                        onClick={() => setActiveSubTab('device_setup')}
                        disabled={lanLoading || lanScanning}
                        style={{
                          flex: 1.1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          padding: '6px 6px', borderRadius: 6, border: '1px solid #c7d2fe',
                          background: '#eef2ff', color: '#4338ca', cursor: 'pointer',
                          fontSize: '0.74rem', fontWeight: 700
                        }}
                        title="Chuyển sang tab cài đặt đồng bộ giờ, điều khiển máy từ xa, thử chuông, xóa quyền admin, quản lý nhân viên trên máy"
                      >
                        <Settings size={12} color="#4f46e5" />
                        Cài Đặt Máy
                      </button>
                    </div>

                    {/* NÚT CHÍNH: KÉO DỮ LIỆU TỪ MÁY */}
                    <button
                      onClick={() => handlePullLanLogs()}
                      disabled={lanLoading || lanScanning}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '10px 12px', borderRadius: 7, border: 'none',
                        background: lanLoading ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                        color: 'white', cursor: lanLoading ? 'not-allowed' : 'pointer',
                        fontSize: '0.86rem', fontWeight: 700,
                        boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {lanLoading ? (
                        <>
                          <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                          <span>Đang kết nối & tải dữ liệu...</span>
                        </>
                      ) : (
                        <>
                          <Download size={16} />
                          <span>KÉO DỮ LIỆU CHẤM CÔNG</span>
                        </>
                      )}
                    </button>

                    {/* Hiển thị kết quả quét dò LAN nếu có */}
                    {scanResults.length > 0 && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 8px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', marginBottom: 4 }}>
                          🔍 Tìm thấy {scanResults.length} máy chấm công trong mạng:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {scanResults.map(dev => (
                            <div
                              key={dev.ip}
                              onClick={() => {
                                setLanIp(dev.ip);
                                setLanPort(dev.port);
                                localStorage.setItem('dmh_bio_last_ip', dev.ip);
                                localStorage.setItem('dmh_bio_last_port', String(dev.port));
                                handlePullLanLogs(dev.ip, dev.port);
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '6px 8px', background: lanIp === dev.ip ? '#dcfce7' : 'white',
                                borderRadius: 6, border: `1px solid ${lanIp === dev.ip ? '#16a34a' : '#86efac'}`,
                                cursor: 'pointer', fontSize: '0.76rem',
                                transition: 'all 0.15s ease'
                              }}
                              title="Bấm để chọn máy này và tự động kéo dữ liệu về phần mềm ngay"
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                                <span style={{ fontWeight: 700, color: '#15803d' }}>{dev.ip}:{dev.port}</span>
                                {lanIp === dev.ip && (
                                  <span style={{ fontSize: '0.66rem', color: '#166534', background: '#bbf7d0', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                    ✓ Đang chọn
                                  </span>
                                )}
                              </div>
                              <span style={{
                                fontSize: '0.7rem', color: 'white', background: '#16a34a',
                                padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                                display: 'inline-flex', alignItems: 'center', gap: 3
                              }}>
                                <Download size={11} /> Chọn & Kéo
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hộp trạng thái kết nối */}
                    {lanStatus && (
                      <div style={{
                        padding: '8px', borderRadius: 6, fontSize: '0.75rem',
                        background: lanStatus.ok ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${lanStatus.ok ? '#bbf7d0' : '#fecaca'}`,
                        color: lanStatus.ok ? '#15803d' : '#b91c1c',
                        display: 'flex', alignItems: 'flex-start', gap: 6
                      }}>
                        {lanStatus.ok ? (
                          <CheckCircle2 size={15} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
                        ) : (
                          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                        )}
                        <div style={{ wordBreak: 'break-word', lineHeight: 1.35 }}>
                          {lanStatus.message}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Giao diện Upload File USB/Excel */
                  <div>
                    <div
                      onClick={() => bioFileRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleBioFileUpload(f); }}
                      style={{
                        border: '2px dashed #93c5fd',
                        borderRadius: 8,
                        padding: '1.25rem 0.75rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: '#eff6ff',
                        transition: 'border .2s'
                      }}
                    >
                      <Clock size={32} color="#3b82f6" style={{ margin: '0 auto 8px', display: 'block' }} />
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1d4ed8' }}>
                        {bioFileName || 'Kéo thả hoặc nhấp để chọn tệp'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>
                        Excel (.xlsx, .xls), CSV, hoặc Text/DAT từ USB ZKTeco/Ronald Jack
                      </div>
                    </div>
                    <input
                      ref={bioFileRef}
                      type="file"
                      accept=".xlsx,.xls,.csv,.txt,.dat"
                      style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleBioFileUpload(f); }}
                    />

                    {bioLoading && (
                      <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Đang xử lý dữ liệu...
                      </div>
                    )}
                    {bioError && (
                      <div style={{ marginTop: 8, padding: '8px', background: '#fef2f2', borderRadius: 6, fontSize: '0.75rem', color: '#dc2626', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                        <div>{bioError}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Chọn Tháng/Năm */}
              <div style={cardStyle}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 8, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} color="#3b82f6" /> Chọn Tháng Chấm Công
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(+e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(+e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  >
                    {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Thống kê tháng */}
              {monthlySummaries.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 10, color: '#1e293b' }}>
                    📊 Tổng Quan Tháng {selectedMonth}/{selectedYear}
                  </div>
                  {[
                    { label: 'Tổng số nhân sự', value: monthlySummaries.length, color: '#3b82f6' },
                    { label: 'Tổng ngày công', value: monthlySummaries.reduce((acc, s) => acc + s.totalWorkUnits, 0).toFixed(1), color: '#10b981' },
                    { label: 'Tổng giờ làm thực tế', value: monthlySummaries.reduce((acc, s) => acc + s.totalWorkHours, 0).toFixed(1) + 'h', color: '#6366f1' },
                    { label: 'Số lượt đi muộn', value: monthlySummaries.reduce((acc, s) => acc + s.totalLateCount, 0), color: '#f59e0b' },
                    { label: 'Số lượt về sớm', value: monthlySummaries.reduce((acc, s) => acc + s.totalEarlyCount, 0), color: '#ec4899' },
                    { label: 'Số lần quên quẹt', value: monthlySummaries.reduce((acc, s) => acc + s.totalMissingCount, 0), color: '#dc2626' },
                    { label: 'Giờ tăng ca (OT)', value: monthlySummaries.reduce((acc, s) => acc + s.totalOtHours, 0).toFixed(1) + 'h', color: '#8b5cf6' },
                  ].map(st => (
                    <div key={st.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: '5px 8px', background: '#f8fafc', borderRadius: 5 }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{st.label}</span>
                      <strong style={{ fontSize: '0.88rem', color: st.color }}>{st.value}</strong>
                    </div>
                  ))}
                </div>
              )}

              {/* Chú giải các loại ca */}
              <div style={cardStyle}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 8, color: '#475569' }}>
                  🏷️ CHÚ GIẢI MÃ CA
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {shifts.map(s => (
                    <span
                      key={s.id}
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: `${s.color}15`,
                        color: s.color,
                        fontWeight: 700,
                        border: `1px solid ${s.color}40`,
                      }}
                      title={`${s.name} (${s.startTime} - ${s.endTime})`}
                    >
                      {s.code}: {s.name}
                    </span>
                  ))}
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12, background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>
                    V: Vắng
                  </span>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12, background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>
                    Nghỉ: Lịch OFF
                  </span>
                </div>
              </div>
            </div>

            {/* Cột giữa: Bảng Lưới / Chi tiết chấm công */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
              {monthlySummaries.length === 0 ? (
                <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                  <Clock size={56} opacity={0.25} style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#475569' }}>Chưa Có Dữ Liệu Máy Chấm Công</div>
                  <div style={{ fontSize: '0.82rem', marginTop: 6, color: '#64748b' }}>
                    Hãy tải tệp sự kiện quẹt thẻ (.xlsx, .csv, .txt hoặc .dat từ máy chấm công) để bắt đầu phân tích.
                  </div>
                </div>
              ) : (
                <>
                  {/* Toolbar lọc & chuyển chế độ xem */}
                  <div style={{ ...cardStyle, padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: '#f1f5f9', padding: '5px 10px', borderRadius: 6 }}>
                      <Search size={14} color="#64748b" />
                      <input
                        value={bioSearch}
                        onChange={e => setBioSearch(e.target.value)}
                        placeholder="Tìm theo Mã NV hoặc Tên nhân sự..."
                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', width: '100%' }}
                      />
                      {bioSearch && (
                        <button onClick={() => setBioSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                          <X size={13} color="#94a3b8" />
                        </button>
                      )}
                    </div>

                    {/* Bộ lọc trạng thái */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Filter size={13} color="#64748b" />
                      <select
                        value={bioStatusFilter}
                        onChange={e => setBioStatusFilter(e.target.value as any)}
                        style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.78rem', color: '#334155' }}
                      >
                        <option value="ALL">Tất cả ({monthlySummaries.length})</option>
                        <option value="LATE">Có đi muộn</option>
                        <option value="EARLY">Có về sớm</option>
                        <option value="MISSING">Thiếu quẹt ra/vào</option>
                        <option value="OT">Có tăng ca (OT)</option>
                      </select>
                    </div>

                    {/* Switch Grid / Details */}
                    <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                      <button
                        onClick={() => setBioViewMode('grid')}
                        style={{
                          padding: '5px 10px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: bioViewMode === 'grid' ? '#3b82f6' : 'white',
                          color: bioViewMode === 'grid' ? 'white' : '#475569',
                        }}
                      >
                        <Grid size={13} /> Lưới Tháng
                      </button>
                      <button
                        onClick={() => setBioViewMode('details')}
                        style={{
                          padding: '5px 10px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: bioViewMode === 'details' ? '#3b82f6' : 'white',
                          color: bioViewMode === 'details' ? 'white' : '#475569',
                        }}
                      >
                        <List size={13} /> Chi Tiết
                      </button>
                    </div>
                  </div>

                  {/* ── CHẾ ĐỘ XEM 1: LƯỚI THÁNG 1..31 (GRID VIEW) ── */}
                  {bioViewMode === 'grid' ? (
                    <div style={{ ...cardStyle, flex: 1, overflow: 'auto', padding: 0 }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', width: '100%', minWidth: 1000 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 3, minWidth: 160 }}>
                              Nhân Viên
                            </th>
                            {monthDays.map(d => {
                              const dow = new Date(selectedYear, selectedMonth - 1, d).getDay();
                              const isWeekend = dow === 0 || dow === 6;
                              return (
                                <th
                                  key={d}
                                  style={{
                                    padding: '6px 3px',
                                    textAlign: 'center',
                                    minWidth: 32,
                                    color: isWeekend ? '#dc2626' : '#1e293b',
                                    background: isWeekend ? '#fef2f2' : 'transparent',
                                    borderLeft: '1px solid #f1f5f9',
                                  }}
                                >
                                  <div>{d}</div>
                                  <div style={{ fontSize: '0.62rem', fontWeight: 400, opacity: 0.7 }}>
                                    {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow]}
                                  </div>
                                </th>
                              );
                            })}
                            <th style={{ padding: '8px 6px', textAlign: 'center', background: '#ecfdf5', color: '#065f46', minWidth: 55, position: 'sticky', right: 110, zIndex: 2 }}>
                              Công
                            </th>
                            <th style={{ padding: '8px 6px', textAlign: 'center', background: '#f0fdf4', color: '#166534', minWidth: 55, position: 'sticky', right: 55, zIndex: 2 }}>
                              Giờ Làm
                            </th>
                            <th style={{ padding: '8px 6px', textAlign: 'center', background: '#fffbeb', color: '#b45309', minWidth: 55, position: 'sticky', right: 0, zIndex: 2 }}>
                              Muộn (L)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSummaries.map((s, idx) => {
                            const isSelected = selectedBioEmp?.empId === s.empId;
                            return (
                              <tr
                                key={s.empId}
                                onClick={() => setSelectedBioEmp(isSelected ? null : s)}
                                style={{
                                  background: isSelected ? '#eff6ff' : idx % 2 === 0 ? 'white' : '#f8fafc',
                                  cursor: 'pointer',
                                  borderBottom: '1px solid #f1f5f9',
                                  transition: 'background 0.15s',
                                }}
                              >
                                <td style={{
                                  padding: '8px 10px',
                                  fontWeight: 600,
                                  position: 'sticky',
                                  left: 0,
                                  background: isSelected ? '#eff6ff' : idx % 2 === 0 ? 'white' : '#f8fafc',
                                  zIndex: 2,
                                  borderRight: '2px solid #e2e8f0',
                                }}>
                                  <div style={{ color: '#0f172a' }}>{s.empName}</div>
                                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Mã: {s.empId}</div>
                                </td>

                                {monthDays.map(d => {
                                  const rec = s.days[d];
                                  const dow = new Date(selectedYear, selectedMonth - 1, d).getDay();
                                  const isWeekend = dow === 0 || dow === 6;

                                  if (!rec) return <td key={d} style={{ borderLeft: '1px solid #f1f5f9' }} />;

                                  let cellBg = isWeekend ? '#fafafa' : 'transparent';
                                  let cellText = '';
                                  let cellColor = '#94a3b8';
                                  let tooltip = `${rec.dateDisplay} (${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][rec.dayOfWeek]})`;

                                  if (rec.status === 'OFF') {
                                    cellText = '-';
                                    cellColor = '#cbd5e1';
                                  } else if (rec.status === 'ABSENT') {
                                    cellText = 'V';
                                    cellColor = '#ef4444';
                                    tooltip += ' - Vắng mặt';
                                  } else if (rec.workUnitsEarned > 0) {
                                    cellText = rec.assignedShift?.code || String(rec.workUnitsEarned);
                                    cellColor = rec.assignedShift?.color || '#10b981';
                                    cellBg = `${cellColor}18`;
                                    tooltip += `\nCa: ${rec.assignedShift?.name || 'Tự do'}`;
                                    tooltip += `\nVào: ${rec.firstIn || '--:--'} | Ra: ${rec.lastOut || '--:--'}`;
                                    if (rec.lateMinutes > 0) tooltip += `\nĐi muộn: ${rec.lateMinutes}p`;
                                    if (rec.earlyMinutes > 0) tooltip += `\nVề sớm: ${rec.earlyMinutes}p`;
                                    if (rec.overtimeHours > 0) tooltip += `\nTăng ca: ${rec.overtimeHours}h`;
                                  }

                                  return (
                                    <td
                                      key={d}
                                      title={tooltip}
                                      style={{
                                        textAlign: 'center',
                                        padding: '4px 2px',
                                        background: cellBg,
                                        borderLeft: '1px solid #f1f5f9',
                                        fontWeight: 700,
                                        color: cellColor,
                                        fontSize: '0.72rem',
                                      }}
                                    >
                                      {cellText}
                                      {rec.lateMinutes > 0 && (
                                        <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: '#f59e0b', marginLeft: 2, verticalAlign: 'top' }} />
                                      )}
                                    </td>
                                  );
                                })}

                                <td style={{ textAlign: 'center', fontWeight: 800, color: '#059669', background: '#ecfdf5', position: 'sticky', right: 110, zIndex: 1, borderLeft: '2px solid #a7f3d0' }}>
                                  {s.totalWorkUnits}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 700, color: '#15803d', background: '#f0fdf4', position: 'sticky', right: 55, zIndex: 1 }}>
                                  {s.totalWorkHours}h
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 700, color: s.totalLateCount > 0 ? '#b45309' : '#94a3b8', background: '#fffbeb', position: 'sticky', right: 0, zIndex: 1 }}>
                                  {s.totalLateCount}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* ── CHẾ ĐỘ XEM 2: CHI TIẾT TỪNG LẦN QUẸT (DETAILS VIEW) ── */
                    <div style={{ ...cardStyle, flex: 1, overflow: 'auto', padding: 0 }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem', width: '100%' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Nhân Viên</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Ngày</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Ca Áp Dụng</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Giờ Vào</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Giờ Ra</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Muộn (phút)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Về Sớm</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Giờ Làm</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Tăng Ca</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Số Công</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Trạng Thái</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSummaries.flatMap(s =>
                            monthDays.map(d => {
                              const rec = s.days[d];
                              if (!rec || (rec.status === 'OFF' && rec.allPunches.length === 0)) return null;

                              let badgeColor = '#10b981';
                              let badgeBg = '#ecfdf5';
                              let badgeText = 'Đúng giờ';
                              if (rec.status === 'LATE') { badgeColor = '#f59e0b'; badgeBg = '#fffbeb'; badgeText = 'Đi muộn'; }
                              else if (rec.status === 'EARLY') { badgeColor = '#ec4899'; badgeBg = '#fdf2f8'; badgeText = 'Về sớm'; }
                              else if (rec.status === 'LATE_EARLY') { badgeColor = '#ea580c'; badgeBg = '#fff7ed'; badgeText = 'Muộn & Sớm'; }
                              else if (rec.status === 'MISSING_OUT') { badgeColor = '#dc2626'; badgeBg = '#fef2f2'; badgeText = 'Quên quẹt ra'; }
                              else if (rec.status === 'ABSENT') { badgeColor = '#94a3b8'; badgeBg = '#f1f5f9'; badgeText = 'Vắng mặt'; }

                              return (
                                <tr key={`${s.empId}_${d}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                                    {s.empName} <span style={{ fontSize: '0.7rem', color: '#64748b' }}>({s.empId})</span>
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', color: '#334155' }}>
                                    {rec.dateDisplay}
                                  </td>
                                  <td style={{ padding: '8px 10px' }}>
                                    {rec.assignedShift ? (
                                      <span style={{ padding: '2px 8px', borderRadius: 4, background: `${rec.assignedShift.color}15`, color: rec.assignedShift.color, fontWeight: 600, fontSize: '0.72rem' }}>
                                        {rec.assignedShift.name}
                                      </span>
                                    ) : '-'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: rec.lateMinutes > 0 ? '#dc2626' : '#0f172a' }}>
                                    {rec.firstIn || '--:--'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: rec.earlyMinutes > 0 ? '#dc2626' : '#0f172a' }}>
                                    {rec.lastOut || '--:--'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', color: rec.lateMinutes > 0 ? '#d97706' : '#94a3b8', fontWeight: rec.lateMinutes > 0 ? 700 : 400 }}>
                                    {rec.lateMinutes > 0 ? `${rec.lateMinutes}p` : '-'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', color: rec.earlyMinutes > 0 ? '#db2777' : '#94a3b8', fontWeight: rec.earlyMinutes > 0 ? 700 : 400 }}>
                                    {rec.earlyMinutes > 0 ? `${rec.earlyMinutes}p` : '-'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>
                                    {rec.workHours > 0 ? `${rec.workHours}h` : '-'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', color: rec.overtimeHours > 0 ? '#7c3aed' : '#94a3b8', fontWeight: rec.overtimeHours > 0 ? 700 : 400 }}>
                                    {rec.overtimeHours > 0 ? `${rec.overtimeHours}h` : '-'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#059669' }}>
                                    {rec.workUnitsEarned}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                    <span style={{ padding: '2px 8px', borderRadius: 12, background: badgeBg, color: badgeColor, fontWeight: 700, fontSize: '0.7rem' }}>
                                      {badgeText}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Cột phải: Chi tiết nhân viên được chọn */}
            {selectedBioEmp && (
              <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ ...cardStyle, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>HỒ SƠ CHẤM CÔNG THÁNG</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{selectedBioEmp.empName}</div>
                      <div style={{ fontSize: '0.72rem', color: '#3b82f6' }}>Mã NV: {selectedBioEmp.empId}</div>
                    </div>
                    <button onClick={() => setSelectedBioEmp(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                      <X size={16} color="#94a3b8" />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                    <div style={{ background: '#ecfdf5', padding: '8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>{selectedBioEmp.totalWorkUnits}</div>
                      <div style={{ fontSize: '0.68rem', color: '#047857' }}>Tổng Ngày Công</div>
                    </div>
                    <div style={{ background: '#eff6ff', padding: '8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb' }}>{selectedBioEmp.totalWorkHours}h</div>
                      <div style={{ fontSize: '0.68rem', color: '#1d4ed8' }}>Tổng Giờ Làm</div>
                    </div>
                    <div style={{ background: '#fffbeb', padding: '8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>{selectedBioEmp.totalLateMinutes}p</div>
                      <div style={{ fontSize: '0.68rem', color: '#b45309' }}>Phút Đi Muộn</div>
                    </div>
                    <div style={{ background: '#f5f3ff', padding: '8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed' }}>{selectedBioEmp.totalOtHours}h</div>
                      <div style={{ fontSize: '0.68rem', color: '#6d28d9' }}>Tăng Ca (OT)</div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    NHẬT KÝ QUẸT THẺ TỪNG NGÀY
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {monthDays.map(d => {
                      const rec = selectedBioEmp.days[d];
                      if (!rec || (rec.status === 'OFF' && rec.allPunches.length === 0)) return null;
                      return (
                        <div key={d} style={{ padding: '6px 8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #f1f5f9', fontSize: '0.72rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontWeight: 700, color: '#1e293b' }}>
                              Ngày {d}/{selectedMonth} ({['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][rec.dayOfWeek]})
                            </span>
                            <span style={{ fontWeight: 700, color: rec.workUnitsEarned > 0 ? '#059669' : '#dc2626' }}>
                              {rec.workUnitsEarned} công
                            </span>
                          </div>
                          <div style={{ color: '#64748b' }}>
                            Vào: <strong style={{ color: rec.lateMinutes > 0 ? '#d97706' : '#0f172a' }}>{rec.firstIn || '--:--'}</strong>
                            {' '} | Ra: <strong style={{ color: rec.earlyMinutes > 0 ? '#db2777' : '#0f172a' }}>{rec.lastOut || '--:--'}</strong>
                          </div>
                          {rec.allPunches.length > 2 && (
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2 }}>
                              Các lần quẹt: {rec.allPunches.join(', ')}
                            </div>
                          )}
                          {rec.notes.length > 0 && (
                            <div style={{ fontSize: '0.65rem', color: '#b45309', marginTop: 2 }}>
                              ⚠️ {rec.notes.join('; ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SUB-TAB: CÀI ĐẶT MÁY CHẤM CÔNG (HARDWARE CONTROL & SETUP)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeSubTab === 'device_setup' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', minWidth: 0 }}>
            {/* Thanh cấu hình IP kết nối & Trạng thái hoạt động */}
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '0.75rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                  <Wrench size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>Trung Tâm Cài Đặt & Điều Khiển Máy Chấm Công</strong>
                    <span style={{ fontSize: '0.72rem', background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                      ZKTeco / Ronald Jack (Protocol UDP/TCP 4370)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                    Đồng bộ thời gian chuẩn, kiểm tra loa, mở cửa, cứu hộ phá khóa Admin và quản lý danh sách nhân viên trực tiếp trên thiết bị.
                  </div>
                </div>
              </div>

              {/* Nhập IP & Port nhanh để điều khiển */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>IP Thiết Bị:</span>
                  <input
                    type="text"
                    value={lanIp}
                    onChange={e => setLanIp(e.target.value)}
                    placeholder="192.168.3.250"
                    style={{ width: 115, border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', outline: 'none' }}
                  />
                  <span style={{ color: '#cbd5e1' }}>:</span>
                  <input
                    type="number"
                    value={lanPort}
                    onChange={e => setLanPort(parseInt(e.target.value, 10) || 4370)}
                    style={{ width: 50, border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', outline: 'none' }}
                  />
                </div>

                <button
                  onClick={() => { fetchDeviceStatus(); fetchDeviceUsers(); }}
                  disabled={deviceStatusLoading || deviceUsersLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1',
                    background: 'white', color: '#1e293b', cursor: 'pointer',
                    fontSize: '0.78rem', fontWeight: 600,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                  }}
                  title="Kết nối và cập nhật toàn bộ thông số máy"
                >
                  <RefreshCw size={13} style={{ animation: (deviceStatusLoading || deviceUsersLoading) ? 'spin 1s linear infinite' : 'none' }} />
                  {deviceStatusLoading ? 'Đang đọc...' : 'Kiểm Tra & Đọc Máy'}
                </button>
              </div>
            </div>

            {/* Thông báo kết quả thao tác thiết bị (nếu có) */}
            {deviceActionMsg && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.65rem 1rem', borderRadius: 8, fontSize: '0.82rem', fontWeight: 500,
                background: deviceActionMsg.ok ? '#ecfdf5' : '#fef2f2',
                border: `1px solid ${deviceActionMsg.ok ? '#a7f3d0' : '#fecaca'}`,
                color: deviceActionMsg.ok ? '#065f46' : '#991b1b',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {deviceActionMsg.ok ? <CheckCircle2 size={16} color="#059669" /> : <AlertCircle size={16} color="#dc2626" />}
                  <span>{deviceActionMsg.message}</span>
                </div>
                <button
                  onClick={() => setDeviceActionMsg(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Hàng 4 Thẻ Thống Kê Nhanh Về Thiết Bị */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              <div style={{ ...cardStyle, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                  <Wifi size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>Trạng Thái Kết Nối</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: deviceStatus ? '#16a34a' : '#ea580c', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: deviceStatus ? '#16a34a' : '#ea580c', display: 'inline-block' }} />
                    {deviceStatus ? 'Đang Kết Nối (Online)' : (deviceStatusLoading ? 'Đang kiểm tra...' : 'Chưa Kết Nối')}
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                  <Users size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>Nhân Viên Trên Máy</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
                    {deviceUsersLoading ? '...' : (deviceUsers.length || deviceStatus?.usersCount || 0)} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>người</span>
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea' }}>
                  <Clock size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>Lịch Sử Quẹt Thẻ Trong Máy</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
                    {deviceStatusLoading ? '...' : (deviceStatus?.logsCount?.toLocaleString() || rawPunchLogs.length.toLocaleString() || '0')} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>lượt</span>
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
                  <BarChart2 size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>Dung Lượng Bộ Nhớ Máy</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
                    {deviceStatus?.logsCount ? `${((deviceStatus.logsCount / 200000) * 100).toFixed(1)}%` : 'Ổn định'} <span style={{ fontSize: '0.72rem', fontWeight: 400, color: '#94a3b8' }}>(max 200k)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bố cục 2 Cột chính: Cột trái Điều Khiển - Cột phải Quản trị Danh Sách Nhân Viên */}
            <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              
              {/* CỘT TRÁI: ĐỒNG BỘ GIỜ & ĐIỀU KHIỂN THIẾT BỊ TỪ XA */}
              <div style={{ width: 440, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
                
                {/* Khối 1: ĐỒNG BỘ THỜI GIAN */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                      <Clock size={16} />
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>Đồng Bộ Thời Gian Chuẩn (Clock Sync)</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Đồng bộ tức thì giờ máy chấm công theo đồng hồ máy tính</div>
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.76rem', color: '#64748b' }}>🕒 Giờ Máy Tính (PC):</span>
                      <strong style={{ fontSize: '0.85rem', color: '#0f172a', fontFamily: 'monospace' }}>
                        {new Date().toLocaleTimeString('vi-VN')} ({new Date().toLocaleDateString('vi-VN')})
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.76rem', color: '#64748b' }}>📟 Giờ Trên Máy Chấm Công:</span>
                      <strong style={{ fontSize: '0.85rem', color: deviceStatus?.deviceTime ? '#059669' : '#d97706', fontFamily: 'monospace' }}>
                        {deviceStatus?.deviceTime ? new Date(deviceStatus.deviceTime).toLocaleTimeString('vi-VN') + ' (' + new Date(deviceStatus.deviceTime).toLocaleDateString('vi-VN') + ')' : '(Nhấn đồng bộ để lấy giờ)'}
                      </strong>
                    </div>
                  </div>

                  <button
                    onClick={handleSyncTime}
                    disabled={deviceActionLoading === 'syncTime'}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '10px 14px', borderRadius: 7, border: 'none',
                      background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                      color: 'white', cursor: deviceActionLoading === 'syncTime' ? 'not-allowed' : 'pointer',
                      fontSize: '0.84rem', fontWeight: 700,
                      boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {deviceActionLoading === 'syncTime' ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={15} />}
                    {deviceActionLoading === 'syncTime' ? 'Đang đồng bộ giờ sang máy...' : '⚡ ĐỒNG BỘ GIỜ PC SANG MÁY CHẤM CÔNG'}
                  </button>
                  <p style={{ margin: '8px 0 0', fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
                    * Giúp loại bỏ hoàn toàn sai lệch giờ, đảm bảo chấm công đi muộn / về sớm chính xác 100%.
                  </p>
                </div>

                {/* Khối 2: CÁC LỆNH ĐIỀU KHIỂN TỪ XA */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
                      <Settings size={16} />
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>Điều Khiển Phần Cứng Thiết Bị (Remote Control)</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Gửi tín hiệu trực tiếp qua giao thức mạng LAN</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Thử loa */}
                    <button
                      onClick={handleTestVoice}
                      disabled={deviceActionLoading === 'testVoice'}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '9px 12px', borderRadius: 7, border: '1px solid #cbd5e1',
                        background: '#f8fafc', color: '#1e293b', cursor: 'pointer',
                        fontSize: '0.8rem', fontWeight: 600
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Volume2 size={16} color="#2563eb" />
                        <span>Thử Loa Máy ("Xin Cảm Ơn")</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Kiểm tra âm thanh & phản hồi</span>
                    </button>

                    {/* Khởi động lại máy */}
                    <button
                      onClick={handleRebootDevice}
                      disabled={deviceActionLoading === 'reboot'}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '9px 12px', borderRadius: 7, border: '1px solid #fed7aa',
                        background: '#fffaf5', color: '#c2410c', cursor: 'pointer',
                        fontSize: '0.8rem', fontWeight: 600
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Power size={16} color="#ea580c" />
                        <span>Khởi Động Lại Máy (Reboot)</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#ea580c' }}>Khắc phục máy đơ / treo</span>
                    </button>

                    {/* Phá khóa Admin */}
                    <button
                      onClick={handleClearAdmin}
                      disabled={deviceActionLoading === 'clearAdmin'}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '9px 12px', borderRadius: 7, border: '1px solid #fecaca',
                        background: '#fef2f2', color: '#b91c1c', cursor: 'pointer',
                        fontSize: '0.8rem', fontWeight: 600
                      }}
                      title="Cứu hộ khi máy bị khóa mật khẩu admin không vào được menu"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Key size={16} color="#dc2626" />
                        <span>Xóa Quyền Admin (Phá Khóa Menu)</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#dc2626' }}>Cứu hộ quên mật khẩu</span>
                    </button>

                    {/* Kích hoạt Mở Khóa Cửa Access Control */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                      <Unlock size={16} color="#16a34a" />
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b', flex: 1 }}>
                        Mở Chốt Cửa Ra Vào:
                      </span>
                      <select
                        value={unlockDuration}
                        onChange={e => setUnlockDuration(Number(e.target.value))}
                        style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.75rem', background: 'white' }}
                      >
                        <option value={3}>3 giây</option>
                        <option value={5}>5 giây</option>
                        <option value={10}>10 giây</option>
                        <option value={15}>15 giây</option>
                      </select>
                      <button
                        onClick={handleUnlockDoor}
                        disabled={deviceActionLoading === 'unlockDoor'}
                        style={{
                          padding: '5px 10px', borderRadius: 5, border: 'none',
                          background: '#16a34a', color: 'white', cursor: 'pointer',
                          fontSize: '0.74rem', fontWeight: 700
                        }}
                      >
                        Mở Ngay
                      </button>
                    </div>

                    {/* Dọn Dẹp Bộ Nhớ / Xóa Nhật Ký Quẹt Thẻ */}
                    <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                      <button
                        onClick={handleClearDeviceLogs}
                        disabled={deviceActionLoading === 'clearLogs'}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1',
                          background: 'white', color: '#64748b', cursor: 'pointer',
                          fontSize: '0.76rem', fontWeight: 600
                        }}
                        title="Chỉ thực hiện sau khi đã tải hết dữ liệu chấm công về máy tính"
                      >
                        <Trash2 size={13} color="#94a3b8" />
                        <span>Dọn Dẹp & Xóa Lịch Sử Quẹt Thẻ Trên Máy</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI: BẢNG QUẢN TRỊ DANH SÁCH NHÂN VIÊN TRÊN MÁY */}
              <div style={{ ...cardStyle, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                {/* Header Bảng */}
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                      <Users size={15} />
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>
                        Danh Sách Nhân Viên Đang Lưu Trên Máy ({deviceUsers.length})
                      </strong>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Đồng bộ trực tiếp từ bộ nhớ ROM máy chấm công</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ position: 'relative', width: 200 }}>
                      <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input
                        type="text"
                        value={deviceUserSearch}
                        onChange={e => setDeviceUserSearch(e.target.value)}
                        placeholder="Tìm tên hoặc mã..."
                        style={{
                          width: '100%', padding: '5px 8px 5px 26px', borderRadius: 6,
                          border: '1px solid #cbd5e1', fontSize: '0.76rem', boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <button
                      onClick={fetchDeviceUsers}
                      disabled={deviceUsersLoading}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1',
                        background: '#f8fafc', color: '#334155', cursor: 'pointer',
                        fontSize: '0.76rem', fontWeight: 600
                      }}
                    >
                      <RefreshCw size={12} style={{ animation: deviceUsersLoading ? 'spin 1s linear infinite' : 'none' }} />
                      Làm Mới
                    </button>
                  </div>
                </div>

                {/* Bảng Danh Sách Nhân Viên */}
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  {deviceUsersLoading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                      <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block', color: '#3b82f6' }} />
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Đang tải danh sách nhân viên từ máy chấm công...</div>
                    </div>
                  ) : deviceUsers.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                      <Users size={32} style={{ margin: '0 auto 8px', opacity: 0.5, display: 'block' }} />
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>Chưa có dữ liệu nhân viên</div>
                      <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Bấm nút "Kiểm Tra & Đọc Máy" hoặc "Làm Mới" để tải danh sách từ thiết bị.</div>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left', position: 'sticky', top: 0, zIndex: 2 }}>
                          <th style={{ padding: '8px 12px', width: 60, fontWeight: 600 }}>UID</th>
                          <th style={{ padding: '8px 12px', width: 110, fontWeight: 600 }}>Mã Chấm Công</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600 }}>Họ Tên Trên Máy</th>
                          <th style={{ padding: '8px 12px', width: 120, fontWeight: 600 }}>Quyền Hạn</th>
                          <th style={{ padding: '8px 12px', width: 100, fontWeight: 600 }}>Mật Khẩu</th>
                          <th style={{ padding: '8px 12px', width: 80, textAlign: 'center', fontWeight: 600 }}>Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deviceUsers
                          .filter(u => {
                            if (!deviceUserSearch) return true;
                            const s = deviceUserSearch.toLowerCase();
                            return (u.name && u.name.toLowerCase().includes(s)) || (u.userId && u.userId.toLowerCase().includes(s)) || String(u.uid).includes(s);
                          })
                          .map((u, idx) => (
                            <tr key={u.uid || idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                              <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#64748b' }}>#{u.uid}</td>
                              <td style={{ padding: '7px 12px', fontWeight: 700, color: '#1e293b' }}>{u.userId}</td>
                              <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>{u.name || '(Chưa đặt tên)'}</td>
                              <td style={{ padding: '7px 12px' }}>
                                {u.role === 'ADMIN' || u.privilege === 14 || u.role === 14 ? (
                                  <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}>
                                    Quản Trị Viên
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>
                                    Nhân Viên
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '7px 12px', color: '#64748b', fontSize: '0.72rem' }}>
                                {u.password ? '••••••' : <span style={{ color: '#cbd5e1' }}>Không</span>}
                              </td>
                              <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                <button
                                  onClick={() => handleDeleteDeviceUser(u.uid, u.name || u.userId)}
                                  disabled={deviceActionLoading === `del_${u.uid}`}
                                  title="Xóa nhân viên khỏi máy chấm công"
                                  style={{
                                    border: 'none', background: 'transparent', cursor: 'pointer',
                                    padding: '4px', borderRadius: 4, color: '#ef4444',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                  }}
                                >
                                  {deviceActionLoading === `del_${u.uid}` ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SUB-TAB 2: CÀI ĐẶT CA LÀM VIỆC (SHIFTS MANAGEMENT)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeSubTab === 'shifts' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>Danh Mục Ca Làm Việc</strong>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Cài đặt khung giờ làm việc, thời gian ân hạn đi muộn / về sớm (Grace Period) và hệ số công quy đổi.
                </p>
              </div>
              <button
                onClick={handleOpenAddShift}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.82rem'
                }}
              >
                <Plus size={15} /> Thêm Ca Mới
              </button>
            </div>

            {/* Grid danh sách các Ca */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
              {shifts.map(shift => (
                <div
                  key={shift.id}
                  style={{
                    ...cardStyle,
                    borderTop: `4px solid ${shift.color}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: `${shift.color}20`, color: shift.color }}>
                          {shift.code}
                        </span>
                        <h4 style={{ margin: '6px 0 2px', fontSize: '0.95rem', color: '#1e293b' }}>{shift.name}</h4>
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '3px 8px', borderRadius: 6 }}>
                        {shift.workUnits} công
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.78rem', color: '#475569', marginTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={13} color="#3b82f6" />
                        <span>Giờ làm việc: <strong>{shift.startTime}</strong> đến <strong>{shift.endTime}</strong> {shift.isOvernight && <span style={{ color: '#8b5cf6', fontWeight: 700 }}>(Ca trực qua đêm)</span>}</span>
                      </div>
                      {shift.breakStart && shift.breakEnd && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 13, textAlign: 'center' }}>☕</span>
                          <span>Nghỉ giữa ca: {shift.breakStart} - {shift.breakEnd}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={13} color="#10b981" />
                        <span>Ân hạn đi muộn / về sớm: <strong>{shift.graceLateMinutes}p / {shift.graceEarlyMinutes}p</strong></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={13} color="#f59e0b" />
                        <span>Ngưỡng tính tăng ca (OT): sau <strong>{shift.overtimeThresholdMinutes} phút</strong></span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                    <button
                      onClick={() => { setEditingShift(shift); setShowShiftModal(true); }}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        padding: '6px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: 'white',
                        color: '#334155',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}
                    >
                      <Edit2 size={13} /> Sửa
                    </button>
                    <button
                      onClick={() => handleDeleteShift(shift.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #fecaca',
                        background: '#fef2f2',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SUB-TAB 3: LỊCH BIỂU & PHÂN CA (ROSTER & SCHEDULING)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeSubTab === 'schedule' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
            {/* Card 1: Lịch tuần chuẩn */}
            <div style={cardStyle}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                📅 Cấu Hình Lịch Biểu Tuần Mẫu (Weekly Template)
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 12 }}>
                Thiết lập ca làm việc mặc định cho từng thứ trong tuần. Khi nạp dữ liệu máy chấm công, hệ thống sẽ tự động áp dụng ca tương ứng.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                {[
                  { day: 1, label: 'Thứ Hai' },
                  { day: 2, label: 'Thứ Ba' },
                  { day: 3, label: 'Thứ Tư' },
                  { day: 4, label: 'Thứ Năm' },
                  { day: 5, label: 'Thứ Sáu' },
                  { day: 6, label: 'Thứ Bảy' },
                  { day: 0, label: 'Chủ Nhật' },
                ].map(d => (
                  <div key={d.day} style={{ padding: '8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: d.day === 0 ? '#dc2626' : '#1e293b', marginBottom: 6 }}>
                      {d.label}
                    </div>
                    <select
                      value={scheduleConfig.weeklyTemplate[d.day] || 'AUTO'}
                      onChange={e => {
                        const val = e.target.value;
                        setScheduleConfig(prev => ({
                          ...prev,
                          weeklyTemplate: { ...prev.weeklyTemplate, [d.day]: val },
                        }));
                      }}
                      style={{ width: '100%', padding: '5px 6px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
                    >
                      <option value="AUTO">⚡ Tự động so khớp</option>
                      <option value="OFF">⛔ Nghỉ (OFF)</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: Danh sách nhân sự & Phân ca riêng */}
            <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                    👥 Phân Ca Theo Nhân Sự (Employee Roster)
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>
                    Tùy chỉnh ca mặc định hoặc phân ca riêng cho từng Bác sĩ / Nhân viên.
                  </p>
                </div>
              </div>

              {monthlySummaries.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                  Chưa có danh sách nhân sự. Hãy tải file máy chấm công lên ở Tab "Máy Chấm Công & Bảng Công" để hệ thống tự động nạp danh sách nhân viên.
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Mã NV</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Họ và Tên</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Phòng Ban / Khoa</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Ca Làm Việc Mặc Định</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlySummaries.map(s => {
                        const curRoster = scheduleConfig.employeeRosters[s.empId];
                        return (
                          <tr key={s.empId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 600, color: '#3b82f6' }}>{s.empId}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.empName}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                value={curRoster?.department || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setScheduleConfig(prev => ({
                                    ...prev,
                                    employeeRosters: {
                                      ...prev.employeeRosters,
                                      [s.empId]: {
                                        empId: s.empId,
                                        empName: s.empName,
                                        department: val,
                                        defaultShiftId: curRoster?.defaultShiftId || 'AUTO',
                                        customShifts: curRoster?.customShifts || {},
                                      },
                                    },
                                  }));
                                }}
                                placeholder="Nhập khoa phòng..."
                                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.78rem', width: 140 }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <select
                                value={curRoster?.defaultShiftId || 'AUTO'}
                                onChange={e => {
                                  const val = e.target.value;
                                  setScheduleConfig(prev => ({
                                    ...prev,
                                    employeeRosters: {
                                      ...prev.employeeRosters,
                                      [s.empId]: {
                                        empId: s.empId,
                                        empName: s.empName,
                                        department: curRoster?.department || '',
                                        defaultShiftId: val,
                                        customShifts: curRoster?.customShifts || {},
                                      },
                                    },
                                  }));
                                }}
                                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                              >
                                <option value="AUTO">Theo Lịch Tuần / Khớp Giờ Quẹt</option>
                                {shifts.map(sh => (
                                  <option key={sh.id} value={sh.id}>
                                    Cố định: {sh.name} ({sh.startTime} - {sh.endTime})
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SUB-TAB 4: CHẤM CÔNG KHÁM BỆNH (HIS CŨ - NGUYÊN BẢN 100%)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeSubTab === 'his_counter' && (
          <div style={{ flex: 1, display: 'flex', gap: '0.75rem', overflow: 'hidden', minWidth: 0 }}>
            {/* Trái: Upload file HIS & Thống kê */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: 280, flexShrink: 0, overflowY: 'auto' }}>
              <div style={cardStyle}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Upload size={14} color="#3b82f6" /> Tải File Lịch Sử Khám
                </div>
                <div
                  onClick={() => hisFileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleHisFile(f); }}
                  style={{ border: '2px dashed #bfdbfe', borderRadius: 8, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', background: '#eff6ff' }}>
                  <Upload size={28} color="#3b82f6" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: '0.82rem', color: '#1d4ed8', fontWeight: 600 }}>
                    {hisFileName || 'Kéo thả hoặc nhấp để chọn file'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>Excel (.xlsx, .xls) hoặc CSV</div>
                </div>
                <input ref={hisFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleHisFile(f); }} />
                {hisLoading && <div style={{ textAlign: 'center', marginTop: 8, fontSize: '0.8rem', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Đang đọc file...</div>}
                {hisError && <div style={{ marginTop: 8, padding: '6px 10px', background: '#fef2f2', borderRadius: 6, fontSize: '0.78rem', color: '#dc2626' }}>{hisError}</div>}
              </div>

              {/* Column mapping */}
              {hisHeaders.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChevronDown size={14} /> Chọn Cột Dữ Liệu
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 3, fontWeight: 500 }}>CỘT TÊN BÁC SĨ</div>
                      <select value={hisColDoctor} onChange={e => setHisColDoctor(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.82rem' }}>
                        <option value="">-- Chọn cột --</option>
                        {hisHeaders.map(h => (
                          <option key={h} value={h}>
                            {h}{hisPreviewValues[h] ? ` — ${hisPreviewValues[h]}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 3, fontWeight: 500 }}>CỘT NGÀY GIỜ KHÁM</div>
                      <select value={hisColDatetime} onChange={e => setHisColDatetime(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.82rem' }}>
                        <option value="">-- Chọn cột --</option>
                        {hisHeaders.map(h => (
                          <option key={h} value={h}>
                            {h}{hisPreviewValues[h] ? ` — ${hisPreviewValues[h]}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button onClick={() => processHisData(hisSheetData, hisColDoctor, hisColDatetime)} style={{ padding: '8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>
                      ⚡ Tính Ngày Công
                    </button>
                  </div>
                </div>
              )}

              {/* Stats box */}
              {hisSummaries.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>
                    📊 Tổng Quan Khám Bệnh
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 6, padding: '4px 6px', background: '#f8fafc', borderRadius: 4 }}>
                    <span style={{ color: '#64748b' }}>Tổng số bác sĩ:</span>
                    <strong>{hisSummaries.length}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 6, padding: '4px 6px', background: '#f8fafc', borderRadius: 4 }}>
                    <span style={{ color: '#64748b' }}>Tổng bản ghi/ca khám:</span>
                    <strong style={{ color: '#2563eb' }}>{hisRawCount}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', padding: '4px 6px', background: '#f8fafc', borderRadius: 4 }}>
                    <span style={{ color: '#64748b' }}>Tổng ngày công:</span>
                    <strong style={{ color: '#10b981' }}>{hisSummaries.reduce((a, b) => a + b.totalWorkDays, 0)}</strong>
                  </div>
                </div>
              )}

              {/* Fixed doctors config */}
              <div style={cardStyle}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={14} color="#6366f1" /> Danh Sách Bác Sĩ Cố Định
                </div>
                <textarea
                  value={hisFixedDoctors}
                  onChange={e => setHisFixedDoctors(e.target.value)}
                  placeholder={"Nguyễn Văn A\nTrần Thị B\nLê Văn C\n..."}
                  style={{ width: '100%', height: 90, padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.78rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Giữa: Kết quả bảng công bác sĩ HIS */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
              {hisSummaries.length === 0 ? (
                <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                  <BarChart2 size={48} opacity={0.2} style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Chưa có dữ liệu lượt khám</div>
                  <div style={{ fontSize: '0.82rem', marginTop: 6 }}>Tải file Excel lịch sử khám để đếm ngày công duy nhất</div>
                </div>
              ) : (
                <>
                  <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {/* Tìm kiếm bác sĩ */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '5px 10px', borderRadius: 6, width: 220 }}>
                      <Search size={14} color="#64748b" />
                      <input
                        value={hisSearch}
                        onChange={e => setHisSearch(e.target.value)}
                        placeholder="Tìm bác sĩ..."
                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8rem', width: '100%' }}
                      />
                      {hisSearch && (
                        <button onClick={() => setHisSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                          <X size={13} color="#94a3b8" />
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #d1d5db' }}>
                      <button onClick={() => setHisViewMode('summary')}
                        style={{ padding: '5px 10px', border: 'none', cursor: 'pointer', background: hisViewMode === 'summary' ? '#3b82f6' : 'white', color: hisViewMode === 'summary' ? 'white' : '#374151', fontSize: '0.78rem', fontWeight: 600 }}>
                        Tóm tắt
                      </button>
                      <button onClick={() => setHisViewMode('grid')}
                        style={{ padding: '5px 10px', border: 'none', cursor: 'pointer', background: hisViewMode === 'grid' ? '#3b82f6' : 'white', color: hisViewMode === 'grid' ? 'white' : '#374151', fontSize: '0.78rem', fontWeight: 600 }}>
                        Lưới chấm công
                      </button>
                    </div>

                    {hisViewMode === 'grid' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={13} color="#3b82f6" />
                        <select
                          value={hisGridMonth}
                          onChange={e => setHisGridMonth(+e.target.value)}
                          style={{ padding: '4px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.75rem' }}
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={m}>Tháng {m}</option>
                          ))}
                        </select>
                        <select
                          value={hisGridYear}
                          onChange={e => setHisGridYear(+e.target.value)}
                          style={{ padding: '4px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.75rem' }}
                        >
                          {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button onClick={hisViewMode === 'grid' ? exportHisGrid : exportHisExcel}
                      style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>
                      <Download size={14} /> Xuất Excel
                    </button>
                  </div>

                  {hisViewMode === 'grid' ? (
                    <div style={{ ...cardStyle, flex: 1, overflow: 'auto', padding: 0 }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: '100%' }}>
                        <thead>
                          <tr style={{ background: '#eff6ff' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: 160, position: 'sticky', left: 0, zIndex: 2 }}>Bác Sĩ</th>
                            {Array.from({ length: new Date(hisGridYear, hisGridMonth, 0).getDate() }, (_, i) => i + 1).map(d => (
                              <th key={d} style={{ padding: '6px 4px', textAlign: 'center', minWidth: 28 }}>{d}</th>
                            ))}
                            <th style={{ padding: '8px 10px', textAlign: 'center', background: '#dcfce7', color: '#15803d', minWidth: 50, position: 'sticky', right: 0, zIndex: 2 }}>Tổng</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hisDoctorRows.map((s, i) => {
                            const daysInM = new Date(hisGridYear, hisGridMonth, 0).getDate();
                            const mDays = s.workDays.filter(w => { const [,mm,yy] = w.split('/'); return +mm === hisGridMonth && +yy === hisGridYear; });
                            return (
                              <tr key={s.name} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                                <td style={{ padding: '6px 8px', fontWeight: 600, position: 'sticky', left: 0, background: i % 2 === 0 ? 'white' : '#f9fafb', zIndex: 1 }}>{s.name}</td>
                                {Array.from({ length: daysInM }, (_, idx) => idx + 1).map(d => {
                                  const key = `${String(d).padStart(2,'0')}/${String(hisGridMonth).padStart(2,'0')}/${hisGridYear}`;
                                  const worked = s.workDays.includes(key);
                                  return (
                                    <td key={d} style={{ textAlign: 'center', padding: '4px 2px', background: worked ? '#dcfce7' : 'transparent', color: worked ? '#15803d' : '#9ca3af', fontWeight: worked ? 900 : 400 }}>
                                      {worked ? 'X' : ''}
                                    </td>
                                  );
                                })}
                                <td style={{ textAlign: 'center', fontWeight: 800, color: '#15803d', background: '#f0fdf4', position: 'sticky', right: 0, zIndex: 1 }}>{mDays.length}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ ...cardStyle, flex: 1, overflow: 'auto', padding: 0 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead style={{ background: '#eff6ff', position: 'sticky', top: 0 }}>
                          <tr>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>#</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Bác Sĩ</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Ngày Công</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Tổng Ca Khám</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hisFiltered.map((s, i) => (
                            <tr key={s.name} style={{ borderBottom: '1px solid #f3f4f6', background: hisSelected?.name === s.name ? '#eff6ff' : 'white' }}
                              onClick={() => setHisSelected(hisSelected?.name === s.name ? null : s)}>
                              <td style={{ padding: '8px 10px', color: '#9ca3af' }}>{i + 1}</td>
                              <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.name}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#1e40af' }}>{s.totalWorkDays}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{s.totalSessions}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL THÊM / SỬA CA LÀM VIỆC ── */}
      {showShiftModal && editingShift && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 10,
            width: 520,
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.25rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                {editingShift.id.startsWith('shift_') ? 'Cài Đặt Ca Làm Việc' : 'Sửa Ca Làm Việc'}
              </div>
              <button onClick={() => setShowShiftModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={18} color="#94a3b8" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Tên Ca Làm Việc *
                  </label>
                  <input
                    value={editingShift.name}
                    onChange={e => setEditingShift({ ...editingShift, name: e.target.value })}
                    placeholder="Ví dụ: Ca Hành Chính, Ca Sáng..."
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Mã Viết Tắt *
                  </label>
                  <input
                    value={editingShift.code}
                    onChange={e => setEditingShift({ ...editingShift, code: e.target.value.toUpperCase() })}
                    placeholder="HC, S, C..."
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Giờ Bắt Đầu (Vào) *
                  </label>
                  <input
                    type="time"
                    value={editingShift.startTime}
                    onChange={e => setEditingShift({ ...editingShift, startTime: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Giờ Kết Thúc (Ra) *
                  </label>
                  <input
                    type="time"
                    value={editingShift.endTime}
                    onChange={e => setEditingShift({ ...editingShift, endTime: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Nghỉ Trưa Bắt Đầu (tùy chọn)
                  </label>
                  <input
                    type="time"
                    value={editingShift.breakStart || ''}
                    onChange={e => setEditingShift({ ...editingShift, breakStart: e.target.value || undefined })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Nghỉ Trưa Kết Thúc
                  </label>
                  <input
                    type="time"
                    value={editingShift.breakEnd || ''}
                    onChange={e => setEditingShift({ ...editingShift, breakEnd: e.target.value || undefined })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Số Công Quy Đổi *
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={editingShift.workUnits}
                    onChange={e => setEditingShift({ ...editingShift, workUnits: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Ân Hạn Muộn (phút)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingShift.graceLateMinutes}
                    onChange={e => setEditingShift({ ...editingShift, graceLateMinutes: parseInt(e.target.value, 10) || 0 })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Ân Hạn Sớm (phút)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingShift.graceEarlyMinutes}
                    onChange={e => setEditingShift({ ...editingShift, graceEarlyMinutes: parseInt(e.target.value, 10) || 0 })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingShift.isOvernight || false}
                    onChange={e => setEditingShift({ ...editingShift, isOvernight: e.target.checked })}
                  />
                  <span>Ca trực qua đêm (sang sáng hôm sau)</span>
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Màu nhận diện:</span>
                  {['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'].map(c => (
                    <div
                      key={c}
                      onClick={() => setEditingShift({ ...editingShift, color: c })}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: c,
                        cursor: 'pointer',
                        border: editingShift.color === c ? '2px solid #0f172a' : '2px solid white',
                        boxShadow: '0 0 2px rgba(0,0,0,0.3)'
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                <button
                  onClick={() => setShowShiftModal(false)}
                  style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', color: '#475569', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveShift}
                  style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  Lưu Ca Làm Việc
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal chỉnh sửa Ca làm việc đã đóng ở trên */}

    </div>
  );
}
