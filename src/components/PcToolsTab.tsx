import React, { useState, useEffect, useRef } from 'react';
import {
  Laptop, Monitor, User, Zap, Search, Cpu, Keyboard,
  Package, DownloadCloud, Box, Type, Rocket, Settings,
  RefreshCw, Trash2, Play, Volume2,
  Mic, Video, Shield, HardDrive, BatteryCharging,
  Terminal, Wrench, Thermometer, Clock, Activity,
  Wifi, Printer, FileText, Copy, Check, Eye, EyeOff, Tv, ExternalLink, X,
  Flame, Power, FolderDown, Award,
  Key, Network, History, Sparkles, FolderSearch, File, Server,
  AlertTriangle, CheckCircle2, ShieldCheck, ShieldAlert, FolderArchive
} from 'lucide-react';
import { registerTabRefreshHandler } from '../utils/autoRefreshManager';
import { showToast, showConfirm, showAlert } from '../utils/notificationSystem';
import { startGlobalLoading, stopGlobalLoading } from '../utils/globalLoading';

// ── Định dạng dữ liệu phần cứng ─────────────────────────────────────────────
interface HardwareData {
  CPUs?: Array<{
    Name: string;
    NumberOfCores: number;
    NumberOfLogicalProcessors: number;
    MaxClockSpeed: number;
    CurrentClockSpeed: number;
    LoadPercentage: number;
    SocketDesignation?: string;
    Manufacturer?: string;
    L2CacheSize?: number;
    L3CacheSize?: number;
  }>;
  RAMModules?: Array<{
    CapacityGB: number;
    SpeedMHz: number;
    Manufacturer: string;
    PartNumber: string;
    DeviceLocator: string;
    BankLabel?: string;
    FormFactor?: number;
    SMBIOSMemoryType?: number;
  }>;
  OS?: Array<{
    Caption: string;
    Version: string;
    OSArchitecture: string;
    BuildNumber: string;
    TotalPhysicalRAM_GB?: number;
    TotalVisibleMemoryGB: number;
    HardwareReservedMB?: number;
    FreePhysicalMemoryGB: number;
    InstallDate?: string;
    LastBootUpTime?: string;
  }>;
  Mainboard?: {
    Manufacturer: string;
    Product: string;
    SerialNumber: string;
    Version: string;
  };
  BIOS?: {
    SMBIOSBIOSVersion: string;
    ReleaseDate: string;
    Manufacturer: string;
    SerialNumber: string;
  };
  GPUs?: Array<{
    Name: string;
    VRAM_GB: number;
    DriverVersion: string;
    VideoProcessor: string;
    CurrentRefreshRate: number;
    VideoModeDescription: string;
  }>;
  Disks?: Array<{
    Model: string;
    SizeGB: number;
    MediaType: string;
    InterfaceType: string;
    SerialNumber: string;
    Partitions: number;
  }>;
  Volumes?: Array<{
    DeviceID: string;
    VolumeName: string;
    TotalGB: number;
    FreeGB: number;
    UsedGB: number;
    PercentUsed: number;
    FileSystem: string;
  }>;
  Battery?: Array<{
    EstimatedChargeRemaining: number;
    BatteryStatus: number;
    EstimatedRunTime: number;
    DesignCapacity: number;
    FullChargeCapacity: number;
    WearPercent: number;
  }>;
  Network?: Array<{
    Description: string;
    IPAddress: string;
    MACAddress: string;
    DNSHostName: string;
  }>;
  ComputerName?: string;
  UserName?: string;
}

// ── Định dạng dữ liệu Driver & PnP ──────────────────────────────────────────
export interface DriverItem {
  Name: string;
  Class: string;
  Manufacturer: string;
  Version: string;
  Date: string;
  HardwareId: string;
  IsSigned: boolean;
  InfName: string;
}

export interface ProblemDevice {
  Name: string;
  InstanceId: string;
  Class: string;
  Status: string;
  ErrorCode: number;
}

// ── Định nghĩa Danh mục DMH System Suite ────────────────────────────────────
export type SubTabId =
  | 'sys_info'           // Cấu Hình & Vi Xử Lý
  | 'driver_manager'      // Kiểm Tra & Quản Lý Driver
  | 'oem_custom'          // Thiết Lập Nhãn OEM
  | 'user_pc'             // Tài Khoản & Quản Trị PC
  | 'disk_benchmark'      // Đo Tốc Độ Ổ Đĩa (IOPS)
  | 'laptop_check'        // Chẩn Đoán Tính Toàn Vẹn
  | 'cpu_main_lookup'     // Tra Cứu Tương Thích Socket
  | 'peripherals_test'    // Kiểm Thử Thiết Bị Ngoại Vi
  | 'network_wifi'        // Mật Khẩu Wi-Fi & Sửa Mạng LAN
  | 'windows_shortcuts'   // Lối Tắt Cứu Hộ Windows
  | 'office_installer'    // Cài Đặt Microsoft Office
  | 'app_downloader'      // Kho Ứng Dụng Thiết Yếu
  | 'custom_app_installer'// Trình Cài Đặt Silent App
  | 'vietnamese_fonts'    // Thư Viện Font Tiếng Việt
  | 'system_optimizer'    // Dọn Rác & Tối Ưu RAM
  | 'windows_tweaks';     // Tinh Chỉnh Hiệu Năng Windows

interface MenuItem {
  id: SubTabId;
  label: string;
  tag?: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
}

interface MenuGroup {
  id: string;
  label: string;
  color: string;
  items: MenuItem[];
}

const DMH_MENU_GROUPS: MenuGroup[] = [
  {
    id: 'diagnostics',
    label: 'CHẨN ĐOÁN & PHẦN CỨNG',
    color: '#38bdf8',
    items: [
      { id: 'sys_info', label: 'Cấu Hình & Vi Xử Lý', icon: Laptop },
      { id: 'driver_manager', label: 'Kiểm Tra & Quản Lý Driver', tag: 'PnP', icon: Server },
      { id: 'oem_custom', label: 'Thiết Lập Nhãn OEM', icon: Monitor },
      { id: 'user_pc', label: 'Tài Khoản & Quản Trị PC', icon: User },
      { id: 'disk_benchmark', label: 'Đo Tốc Độ Ổ Đĩa (IOPS)', tag: 'Fast', icon: Zap },
      { id: 'laptop_check', label: 'Chẩn Đoán Tính Toàn Vẹn', icon: Search },
      { id: 'cpu_main_lookup', label: 'Tra Cứu Tương Thích Socket', icon: Cpu },
      { id: 'peripherals_test', label: 'Kiểm Thử Thiết Bị Ngoại Vi', icon: Keyboard },
    ]
  },
  {
    id: 'deployment',
    label: 'TRIỂN KHAI & CÀI ĐẶT',
    color: '#818cf8',
    items: [
      { id: 'office_installer', label: 'Cài Đặt Microsoft Office', tag: 'ODT', icon: Package },
      { id: 'app_downloader', label: 'Kho Ứng Dụng Thiết Yếu', icon: DownloadCloud },
      { id: 'custom_app_installer', label: 'Trình Cài Đặt Silent App', icon: Box },
      { id: 'vietnamese_fonts', label: 'Thư Viện Font Tiếng Việt', icon: Type },
    ]
  },
  {
    id: 'maintenance',
    label: 'BẢO TRÌ & CỨU HỘ',
    color: '#34d399',
    items: [
      { id: 'network_wifi', label: 'Mật Khẩu Wi-Fi & Sửa Mạng', tag: 'Wi-Fi', icon: Wifi },
      { id: 'windows_shortcuts', label: 'Lối Tắt Cứu Hộ Windows', icon: Terminal },
      { id: 'system_optimizer', label: 'Dọn Rác & Tối Ưu RAM', tag: 'Boost', icon: Rocket },
      { id: 'windows_tweaks', label: 'Tinh Chỉnh Hiệu Năng Windows', icon: Settings },
    ]
  }
];

// ── Kho ứng dụng DMH ────────────────────────────────────────────────────────
const ESSENTIAL_APPS = [
  {
    cat: 'Trình duyệt & Tìm kiếm',
    apps: [
      { name: 'Google Chrome', desc: 'Trình duyệt web chuẩn bảo mật quốc tế', winget: 'Google.Chrome', url: 'https://www.google.com/chrome/' },
      { name: 'Cốc Cốc Browser', desc: 'Trình duyệt tối ưu cho người Việt', winget: 'CocCoc.CocCoc', url: 'https://coccoc.com/' },
      { name: 'Mozilla Firefox', desc: 'Mã nguồn mở, an toàn quyền riêng tư', winget: 'Mozilla.Firefox', url: 'https://www.mozilla.org/firefox/' },
    ]
  },
  {
    cat: 'Bộ gõ & Văn phòng',
    apps: [
      { name: 'UniKey 4.3 RC5', desc: 'Bộ gõ tiếng Việt quốc gia', winget: 'PhamKimLong.UniKey', url: 'https://www.unikey.vn/' },
      { name: 'EVKey', desc: 'Bộ gõ tiếng Việt hiện đại chống đơ văn bản', winget: '', url: 'https://evkeyvn.com/' },
      { name: 'Foxit PDF Reader', desc: 'Xem, in và ghi chú tệp PDF nhanh gọn', winget: 'Foxit.FoxitReader', url: 'https://www.foxit.com/pdf-reader/' },
      { name: 'Adobe Acrobat Reader', desc: 'Trình đọc PDF tiêu chuẩn Adobe', winget: 'Adobe.Acrobat.Reader.64-bit', url: 'https://get.adobe.com/reader/' },
    ]
  },
  {
    cat: 'Giải nén & Tiện ích hệ thống',
    apps: [
      { name: 'WinRAR (64-bit)', desc: 'Phần mềm nén và giải nén RAR/ZIP', winget: 'RARLab.WinRAR', url: 'https://www.rarlab.com/download.htm' },
      { name: '7-Zip', desc: 'Trình giải nén mã nguồn mở dung lượng nhẹ', winget: '7zip.7zip', url: 'https://www.7-zip.org/' },
      { name: 'CrystalDiskInfo', desc: 'Chẩn đoán sức khỏe ổ cứng HDD/SSD', winget: 'CrystalDewWorld.CrystalDiskInfo', url: 'https://crystalmark.info/en/software/crystaldiskinfo/' },
      { name: 'CPU-Z', desc: 'Xem chi tiết phần cứng vi xử lý & bo mạch', winget: 'CPUID.CPU-Z', url: 'https://www.cpuid.com/softwares/cpu-z.html' },
      { name: 'Notepad++', desc: 'Trình soạn thảo mã nguồn & văn bản gọn nhẹ', winget: 'Notepad++.Notepad++', url: 'https://notepad-plus-plus.org/' },
    ]
  },
  {
    cat: 'Hỗ trợ từ xa & Liên lạc',
    apps: [
      { name: 'UltraViewer', desc: 'Hỗ trợ máy tính từ xa chuyên nghiệp', winget: 'DucFabulous.UltraViewer', url: 'https://ultraviewer.net/' },
      { name: 'AnyDesk', desc: 'Kết nối máy tính từ xa tốc độ cao', winget: 'AnyDeskSoftwareGmbH.AnyDesk', url: 'https://anydesk.com/' },
      { name: 'TeamViewer', desc: 'Điều khiển máy tính từ xa toàn cầu', winget: 'TeamViewer.TeamViewer', url: 'https://www.teamviewer.com/' },
      { name: 'Zalo PC', desc: 'Ứng dụng nhắn tin làm việc phổ biến', winget: 'VNG.Zalo', url: 'https://zalo.me/pc' },
      { name: 'Telegram Desktop', desc: 'Chat mã hóa bảo mật, gửi dữ liệu lớn', winget: 'Telegram.TelegramDesktop', url: 'https://desktop.telegram.org/' },
    ]
  },
  {
    cat: 'Thư viện Runtime & Công cụ Kỹ thuật',
    apps: [
      { name: 'Visual C++ All-in-One (2005-2022)', desc: 'Bộ thư viện C++ cần thiết để chạy mọi phần mềm & game', winget: 'Microsoft.VCRedist.2015+.x64', url: 'https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist' },
      { name: 'DirectX End-User Runtimes (June 2010)', desc: 'Thư viện đồ họa DirectX tương thích ngược cho game và app', winget: 'Microsoft.DirectX', url: 'https://www.microsoft.com/en-us/download/details.aspx?id=8109' },
      { name: 'PDF24 Creator', desc: 'Trình tạo, ghép nối, chuyển đổi và nén PDF miễn phí 100%', winget: 'GeekSoftwareGmbH.PDF24Creator', url: 'https://tools.pdf24.org/' },
      { name: 'LockHunter', desc: 'Mở khóa và xóa tệp tin cứng đầu bị phần mềm khác chiếm dụng', winget: 'CrystalRich.LockHunter', url: 'https://lockhunter.com/' },
    ]
  },
  {
    cat: 'Đa phương tiện (Media)',
    apps: [
      { name: 'VLC Media Player', desc: 'Trình phát mọi định dạng âm thanh & video', winget: 'VideoLAN.VLC', url: 'https://www.videolan.org/vlc/' },
      { name: 'K-Lite Mega Codec Pack', desc: 'Bộ thư viện giải mã video chuyên nghiệp', winget: 'CodecGuide.K-LiteCodecPack.Mega', url: 'https://codecguide.com/download_k-lite_codec_pack_mega.htm' },
      { name: 'PotPlayer', desc: 'Xem video chuẩn 4K/HDR của Daum', winget: 'Daum.PotPlayer', url: 'https://potplayer.daum.net/' }
    ]
  }
];

// ── Bảng Tinh Chỉnh DMH Windows 1-Click Optimizer (Phong cách Nguyễn Phi) ─────
interface OptimizerTweakItem {
  id: string;
  title: string;
  desc: string;
  recommended: boolean;
  group: 'interface' | 'debloat' | 'system';
}

const DMH_OPTIMIZER_TWEAKS: OptimizerTweakItem[] = [
  // ── Nhóm 1: Giao Diện & Thao Tác Chuẩn ──
  {
    id: 'thispc-desktop',
    title: 'Hiện This PC ra Desktop',
    desc: 'Hiển thị icon This PC / Computer quen thuộc ra màn hình chính',
    recommended: true,
    group: 'interface'
  },
  {
    id: 'show-file-ext',
    title: 'Hiện Đuôi Mở Rộng File',
    desc: 'Hiển thị rõ .exe, .docx, .xlsx... tránh bị lừa mở file virus',
    recommended: true,
    group: 'interface'
  },
  {
    id: 'show-hidden-files',
    title: 'Hiện Tệp & Thư Mục Ẩn',
    desc: 'Cho phép xem các thư mục ẩn AppData, ProgramData khi cài phần mềm',
    recommended: true,
    group: 'interface'
  },
  {
    id: 'numlock-startup',
    title: 'Bật NumLock Khi Khởi Động',
    desc: 'Tự động kích hoạt bàn phím số cho kế toán, thu ngân, văn phòng',
    recommended: true,
    group: 'interface'
  },
  {
    id: 'classic-context-win11',
    title: 'Chuột Phải Cổ Điển Win 11',
    desc: 'Khôi phục menu chuột phải Win 10, bỏ qua dòng "Show more options"',
    recommended: true,
    group: 'interface'
  },
  {
    id: 'add-take-ownership',
    title: 'Thêm Menu Take Ownership',
    desc: 'Thêm chuột phải chiếm quyền Admin cao nhất để xóa file cứng đầu',
    recommended: true,
    group: 'interface'
  },
  {
    id: 'disable-stickykeys',
    title: 'Tắt Dính Phím Sticky Keys',
    desc: 'Tắt hộp thoại và âm thanh bíp khó chịu khi bấm Shift 5 lần',
    recommended: true,
    group: 'interface'
  },

  // ── Nhóm 2: Tối Ưu Hiệu Năng & Tắt Rác (Debloat) ──
  {
    id: 'disable-copilot-bing',
    title: 'Tắt Copilot & Tìm Kiếm Bing',
    desc: 'Tắt AI Copilot và tìm kiếm web trên thanh tác vụ để nhẹ RAM',
    recommended: true,
    group: 'debloat'
  },
  {
    id: 'disable-widgets-news',
    title: 'Tắt Widgets & Bảng Tin Tức',
    desc: 'Ẩn bảng tin tức thời tiết Taskbar tránh tụt FPS và lag giật',
    recommended: true,
    group: 'debloat'
  },
  {
    id: 'disable-start-recommendations',
    title: 'Tắt Quảng Cáo Start Menu',
    desc: 'Không hiển thị gợi ý app rác và nội dung quảng cáo Microsoft',
    recommended: true,
    group: 'debloat'
  },
  {
    id: 'disable-edge-firstrun',
    title: 'Tắt Chào Mừng Edge First-Run',
    desc: 'Bỏ qua màn hình ép đăng nhập và giới thiệu của Microsoft Edge',
    recommended: true,
    group: 'debloat'
  },
  {
    id: 'disable-bitlocker-auto',
    title: 'Tắt Tự Mã Hóa BitLocker',
    desc: 'Cứu tinh tránh bị BitLocker tự khóa ổ mất dữ liệu khi update BIOS',
    recommended: true,
    group: 'debloat'
  },
  {
    id: 'disable-telemetry',
    title: 'Tắt Windows Telemetry',
    desc: 'Dừng dịch vụ theo dõi và gửi log ngầm về máy chủ Microsoft',
    recommended: true,
    group: 'debloat'
  },
  {
    id: 'disable-gamebar',
    title: 'Tắt Game Bar & DVR',
    desc: 'Tránh tụt khung hình khi làm đồ họa hoặc chơi game',
    recommended: false,
    group: 'debloat'
  },
  {
    id: 'ultimate-performance',
    title: 'Gói Nguồn Ultimate Performance',
    desc: 'Mở khóa gói năng lượng hiệu năng tối đa cho CPU & GPU',
    recommended: true,
    group: 'debloat'
  },
  {
    id: 'disable-hibernate',
    title: 'Tắt Hibernate (Ngủ Đông)',
    desc: 'Giải phóng 8 - 32 GB dung lượng file hiberfil.sys trên ổ C',
    recommended: false,
    group: 'debloat'
  },

  // ── Nhóm 3: Mạng & Hệ Thống Kỹ Thuật ──
  {
    id: 'enable-dotnet35',
    title: 'Kích Hoạt .NET Framework 3.5',
    desc: 'Kích hoạt .NET 3.5 để chạy phần mềm kế toán, phòng khám, thuế cũ',
    recommended: true,
    group: 'system'
  },
  {
    id: 'enable-smb1',
    title: 'Bật SMB 1.0 / CIFS Client',
    desc: 'Kết nối và chia sẻ máy in, tệp tin với máy Win 7 / Win XP cũ',
    recommended: true,
    group: 'system'
  },
  {
    id: 'enable-lan-sharing',
    title: 'Mở Khóa Ping & Chia Sẻ LAN',
    desc: 'Bật Firewall ICMP Echo và Network Discovery để các máy thấy nhau',
    recommended: true,
    group: 'system'
  },
  {
    id: 'disable-uac',
    title: 'Hạ Cảnh Báo UAC (Tắt Làm Tối)',
    desc: 'Không bị tối màn hình và chặn quyền khi chạy phần mềm kỹ thuật',
    recommended: false,
    group: 'system'
  },
  {
    id: 'reset-spooler',
    title: 'Reset Spooler & Dọn Hàng In',
    desc: 'Dọn sạch các lệnh in bị kẹt và khởi động lại dịch vụ máy in',
    recommended: false,
    group: 'system'
  },
  {
    id: 'rebuild-iconcache',
    title: 'Làm Mới Icon Cache',
    desc: 'Sửa lỗi các icon desktop bị trắng hoặc hiển thị sai biểu tượng',
    recommended: false,
    group: 'system'
  },
  {
    id: 'flush-dns',
    title: 'Xóa Bộ Đệm DNS (Flush DNS)',
    desc: 'Khắc phục sự cố không truy cập được web hoặc sau khi đổi DNS',
    recommended: false,
    group: 'system'
  },
  {
    id: 'disable-windows-update',
    title: 'Tạm Dừng Windows Update',
    desc: 'Tắt dịch vụ cập nhật tự động tránh lag máy và lỗi driver',
    recommended: false,
    group: 'system'
  }
];

// ── Bảng tra cứu Socket ─────────────────────────────────────────────────────
const CPU_MAIN_DATABASE = [
  { brand: 'Intel', socket: 'LGA 1700', gen: 'Gen 12, 13, 14 (Alder/Raptor Lake)', chipsets: 'H610, B660, B760, H670, H770, Z690, Z790', ram: 'DDR4 / DDR5', cpus: 'i3-12100, i5-12400, i5-13400, i5-13600K, i7-14700K, i9-14900K' },
  { brand: 'Intel', socket: 'LGA 1200', gen: 'Gen 10, 11 (Comet/Rocket Lake)', chipsets: 'H410, B460, H470, Z490, H510, B560, Z590', ram: 'DDR4 (2666-3200)', cpus: 'i3-10100, i5-10400, i7-10700, i5-11400, i7-11700K' },
  { brand: 'Intel', socket: 'LGA 1151 v2', gen: 'Gen 8, 9 (Coffee Lake)', chipsets: 'H310, B360, B365, H370, Z370, Z390', ram: 'DDR4 (2400-2666)', cpus: 'i3-8100, i5-8400, i7-8700, i3-9100F, i5-9400F, i7-9700K, i9-9900K' },
  { brand: 'Intel', socket: 'LGA 1151 v1', gen: 'Gen 6, 7 (Skylake/Kaby Lake)', chipsets: 'H110, B150, H170, Z170, B250, Z270', ram: 'DDR4 (2133-2400) / DDR3L', cpus: 'G4400, G4560, i3-6100, i5-6500, i7-6700, i5-7500, i7-7700K' },
  { brand: 'Intel', socket: 'LGA 1150', gen: 'Gen 4, 5 (Haswell/Broadwell)', chipsets: 'H81, B85, H87, Z87, H97, Z97', ram: 'DDR3 / DDR3L (1333-1600)', cpus: 'G3220, G3258, i3-4130, i5-4460, i5-4570, i7-4770, i7-4790K, Xeon E3-1231v3' },
  { brand: 'Intel', socket: 'LGA 1155', gen: 'Gen 2, 3 (Sandy/Ivy Bridge)', chipsets: 'H61, B75, H77, Z77, Z68', ram: 'DDR3 (1066-1600)', cpus: 'G620, G2030, i3-2100, i5-2400, i5-3470, i7-2600, i7-3770, Xeon E3-1230' },
  { brand: 'Intel', socket: 'LGA 775', gen: 'Core 2 Duo / Quad', chipsets: 'G31, G41, P43, P45, 945G', ram: 'DDR2 / DDR3', cpus: 'E5700, E8400, Q6600, Q8400, Q9550, Xeon X5460 mod' },
  { brand: 'AMD', socket: 'AM5', gen: 'Ryzen 7000, 8000, 9000 Series (Zen 4/5)', chipsets: 'A620, B650, B650E, X670, X670E, X870', ram: 'DDR5 (5200-6000+)', cpus: 'Ryzen 5 7500F, 7600X, Ryzen 7 7800X3D, Ryzen 9 7950X, Ryzen 7 9700X' },
  { brand: 'AMD', socket: 'AM4', gen: 'Ryzen 1000 - 5000 Series (Zen/Zen+/Zen2/Zen3)', chipsets: 'A320, B350, X370, B450, X470, A520, B550, X570', ram: 'DDR4 (2400-3600)', cpus: 'Ryzen 3 2200G, Ryzen 5 2600, 3600, 5600X, Ryzen 7 5700X, 5800X3D' },
];

interface SearchFeatureItem {
  id: SubTabId;
  name: string;
  category: string;
  keywords: string[];
  desc: string;
}

const SEARCHABLE_FEATURES: SearchFeatureItem[] = [
  { id: 'sys_info', name: 'Cấu Hình & Vi Xử Lý (CPU, RAM, GPU)', category: 'Chẩn đoán', keywords: ['cấu hình', 'cpu', 'ram', 'gpu', 'mainboard', 'bios', 'phần cứng', 'thông số'], desc: 'Xem chi tiết vi xử lý, thông số RAM từng khe, card màn hình và bo mạch chủ' },
  { id: 'sys_info', name: 'Sức Khỏe Ổ Cứng & Tỷ Lệ Bad Sector', category: 'Chẩn đoán', keywords: ['sức khỏe ổ cứng', 'ổ cứng', 'ssd', 'hdd', 'bad sector', 'crystaldiskinfo', 'nhiệt độ'], desc: 'Đo % sức khỏe ổ đĩa, nhiệt độ, cảnh báo Bad Sector chuẩn S.M.A.R.T' },
  { id: 'disk_benchmark', name: 'Đo Tốc Độ Ổ Đĩa (IOPS & Read/Write)', category: 'Chẩn đoán', keywords: ['iops', 'tốc độ ổ cứng', 'benchmark', 'đọc ghi', 'tốc độ ssd'], desc: 'Kiểm tra tốc độ đọc/ghi dữ liệu thực tế và chỉ số IOPS của ổ cứng' },
  { id: 'laptop_check', name: 'Chẩn Đoán Pin & Chu Kỳ Sạc (Cycle Count)', category: 'Chẩn đoán', keywords: ['pin', 'chai pin', 'cycle count', 'chu kỳ sạc', 'dung lượng pin', 'battery'], desc: 'Đo tỷ lệ chai pin, số lần sạc xả và xem báo cáo pin chính hãng Microsoft' },
  { id: 'laptop_check', name: 'Đối Chiếu Serial BIOS / Main / Khung Máy', category: 'Chẩn đoán', keywords: ['serial', 'số seri', 'luộc đồ', 'mainboard', 'chassis', 'uuid'], desc: 'Phát hiện linh kiện bị tráo đổi hoặc nạp lại firmware giả mạo' },
  { id: 'laptop_check', name: 'Xuất Biên Bản Bàn Giao Máy Tính A4', category: 'Chẩn đoán', keywords: ['biên bản', 'bàn giao', 'phiếu nhận máy', 'in biên bản', 'in a4'], desc: 'Tạo và in biên bản nghiệm thu kỹ thuật bàn giao cho khách hàng hoặc phòng khám' },
  { id: 'network_wifi', name: 'Trích Xuất Mật Khẩu Wi-Fi Đã Lưu (Bản Rõ)', category: 'Bảo trì & Mạng', keywords: ['wifi', 'pass wifi', 'mật khẩu wifi', 'xuất wifi txt'], desc: 'Xem toàn bộ mật khẩu Wi-Fi từng kết nối và xuất ra tệp TXT' },
  { id: 'network_wifi', name: 'Đo Độ Trễ Mạng & Ping Monitor (Google/Cloudflare)', category: 'Bảo trì & Mạng', keywords: ['ping', 'độ trễ', 'mạng', 'rớt gói', 'packet loss', 'google dns', 'cloudflare'], desc: 'Đo tốc độ phản hồi ms và tỷ lệ rớt gói tới Google DNS, Cloudflare và Gateway' },
  { id: 'network_wifi', name: '1-Click Mở Khóa Ping (ICMP) & Chia Sẻ LAN', category: 'Bảo trì & Mạng', keywords: ['icmp', 'mở khóa ping', 'chia sẻ lan', 'network discovery', 'fdrespub'], desc: 'Cấu hình Windows Firewall cho phép các máy tính trong phòng khám thấy nhau' },
  { id: 'network_wifi', name: '1-Click Sửa Lỗi Máy In Mạng LAN (0x0000011b)', category: 'Bảo trì & Mạng', keywords: ['máy in', 'lỗi in', '0x0000011b', 'spooler', 'sửa máy in'], desc: 'Khắc phục triệt để lỗi kết nối máy in mạng LAN trên Windows 10/11' },
  { id: 'network_wifi', name: '1-Click Xóa Sạch Kẹt Lệnh In (Print Spooler)', category: 'Bảo trì & Mạng', keywords: ['kẹt lệnh in', 'spooler', 'xóa in', 'hủy lệnh in', 'printers'], desc: 'Dọn sạch các tệp lệnh in bị kẹt trong C:\\Windows\\System32\\spool\\PRINTERS' },
  { id: 'driver_manager', name: 'Kiểm Tra Driver & Quản Lý Phần Cứng PnP', category: 'Chẩn đoán', keywords: ['driver', 'thiếu driver', 'lỗi driver', 'cài driver', 'sao lưu driver', 'pnp', 'chấm than vàng', 'code 28', 'code 43', 'hardware id'], desc: 'Quét tìm driver thiếu/lỗi, xuất driver OEM và nạp file .inf' },
  { id: 'network_wifi', name: 'Kiểm Tra Cổng Máy In Mạng LAN (Port 9100 RAW)', category: 'Bảo trì & Mạng', keywords: ['cổng máy in', 'port 9100', 'máy in lan', 'test máy in', 'raw 9100'], desc: 'Kiểm tra trạng thái sẵn sàng nhận lệnh in của máy in mạng Canon/HP/Brother' },
  { id: 'network_wifi', name: 'Quét Thiết Bị Trong Mạng LAN (IP / MAC)', category: 'Bảo trì & Mạng', keywords: ['quét lan', 'quét mạng', 'ip', 'mac', 'thiết bị online'], desc: 'Tìm kiếm danh sách các máy tính, máy in và điện thoại đang kết nối cùng mạng' },
  { id: 'system_optimizer', name: 'Master 1-Click Clinic Boost (Tối Ưu Thần Tốc)', category: 'Tối ưu hóa', keywords: ['tối ưu', 'boost', 'tăng tốc', 'dọn rác', 'dọn ram', 'nhanh máy'], desc: 'Chuỗi liên hoàn 1-Click dọn sạch rác, thu hồi RAM, flush DNS và bật High Performance' },
  { id: 'system_optimizer', name: 'Bác Sĩ Dịch Vụ Hệ Thống (Self-Healing Services)', category: 'Tối ưu hóa', keywords: ['dịch vụ', 'service', 'spooler', 'wmi', 'sửa service', 'tự phục hồi'], desc: 'Giám sát và 1-Click sửa chữa, kích hoạt lại 8 dịch vụ huyết mạch Windows' },
  { id: 'system_optimizer', name: 'Dọn Dẹp Tệp Tin Dung Lượng Lớn (>50MB)', category: 'Tối ưu hóa', keywords: ['tệp lớn', 'file lớn', 'dọn ổ c', 'đầy ổ', 'dung lượng'], desc: 'Tìm và dọn các tệp video, file nén, installer chiếm dụng dung lượng ổ C' },
  { id: 'system_optimizer', name: 'Quản Lý Ứng Dụng Khởi Động Cùng Windows', category: 'Tối ưu hóa', keywords: ['startup', 'khởi động', 'tắt app chạy cùng win', 'mở máy nhanh'], desc: 'Tắt các ứng dụng chạy ngầm giúp máy tính khởi động vào Windows trong vài giây' },
  { id: 'windows_shortcuts', name: 'Sao Lưu Nhanh Dữ Liệu Desktop & Profile (Robocopy)', category: 'Cứu hộ', keywords: ['sao lưu', 'backup', 'robocopy', 'desktop', 'documents', 'cài lại win', 'bookmarks'], desc: 'Tự động gom toàn bộ Desktop, Docs, Downloads và Bookmarks trình duyệt sang ổ D/E an toàn' },
  { id: 'windows_shortcuts', name: 'Sao Lưu Toàn Bộ Driver Phần Cứng Bằng DISM', category: 'Cứu hộ', keywords: ['driver', 'sao lưu driver', 'dism', 'backup driver'], desc: 'Trích xuất toàn bộ driver của máy bằng công cụ Microsoft DISM chuẩn' },
  { id: 'windows_shortcuts', name: 'Quản Lý Điểm Phục Hồi (System Restore)', category: 'Cứu hộ', keywords: ['restore', 'system restore', 'điểm khôi phục', 'cứu hộ'], desc: 'Tạo điểm sao lưu hệ thống và mở trình khôi phục Windows System Restore' },
  { id: 'windows_shortcuts', name: 'Khởi Động Thẳng Vào BIOS / UEFI (1-Click)', category: 'Cứu hộ', keywords: ['bios', 'uefi', 'vào bios', 'firmware'], desc: 'Khởi động máy tính vào giao diện BIOS setup không cần bấm phím tắt' },
  { id: 'office_installer', name: 'Cài Đặt Microsoft Office Tự Động (ODT)', category: 'Cài đặt', keywords: ['office', 'word', 'excel', 'powerpoint', 'cài office', 'office 365'], desc: 'Tải và cài đặt tự động Microsoft Office 365 / 2021 bằng bộ cài chính hãng' },
  { id: 'vietnamese_fonts', name: 'Cài Đặt Thư Viện Font Tiếng Việt Đầy Đủ', category: 'Cài đặt', keywords: ['font', 'tiếng việt', 'vni', 'tcvn3', 'font abc', 'lỗi font'], desc: 'Cài đặt trọn bộ Font Unicode, VNI, TCVN3 khắc phục 100% lỗi font văn bản' },
  { id: 'app_downloader', name: 'Kho Ứng Dụng Thiết Yếu (Silent / Winget)', category: 'Cài đặt', keywords: ['tải app', 'chrome', 'unikey', 'winrar', 'zalo', 'ultraviewer'], desc: 'Tải và cài đặt các phần mềm văn phòng, đọc PDF, gõ tiếng Việt và hỗ trợ từ xa' },
  { id: 'app_downloader', name: 'Cài Đặt Trọn Bộ Visual C++ Runtime (2005 - 2022)', category: 'Cài đặt', keywords: ['vcredist', 'visual c++', 'thiếu dll', 'msvcr100', 'vcruntime140', 'c++ redistributable'], desc: 'Cài đặt trọn bộ thư viện Microsoft Visual C++ giải quyết dứt điểm lỗi thiếu file DLL' },
  { id: 'user_pc', name: 'Quản Trị Tài Khoản & Mật Khẩu Windows', category: 'Quản trị', keywords: ['tài khoản', 'mật khẩu', 'password', 'administrator', 'đổi mật khẩu'], desc: 'Đổi mật khẩu tài khoản, tạo user mới và kích hoạt tài khoản Administrator ẩn' },
  { id: 'oem_custom', name: 'Thiết Lập Nhãn Thông Tin OEM & Logo Thương Hiệu', category: 'Quản trị', keywords: ['oem', 'logo', 'nhãn máy tính', 'thương hiệu phòng khám'], desc: 'Cá nhân hóa thông tin hỗ trợ kỹ thuật và logo phòng khám trong System Properties' },
  { id: 'windows_tweaks', name: 'Tinh Chỉnh Hiệu Năng Windows & Bảo Mật', category: 'Tinh chỉnh', keywords: ['tinh chỉnh', 'tắt telemetry', 'bảo mật', 'tweaks', 'tối ưu win'], desc: 'Tắt theo dõi người dùng, tối ưu hoạt ảnh đồ họa và khóa cập nhật không mong muốn' },
  { id: 'peripherals_test', name: 'Kiểm Thử Màn Hình, Phím, Chuột, Âm Thanh, Webcam', category: 'Kiểm thử', keywords: ['test phím', 'test chuột', 'test màn hình', 'điểm chết', 'camera', 'micro'], desc: 'Kiểm tra độ nhạy bàn phím, con lăn chuột, soi điểm chết màn hình LCD và test mic/cam' },
  { id: 'cpu_main_lookup', name: 'Tra Cứu Tương Thích Socket CPU & Bo Mạch Chủ', category: 'Tra cứu', keywords: ['socket', 'lga 1700', 'lga 1200', 'am4', 'am5', 'tương thích cpu'], desc: 'Tra cứu nhanh CPU phù hợp với bo mạch chủ và thế hệ RAM tương thích' }
];

export function PcToolsTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('sys_info');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // ── Hardware Info State ──
  const [hwData, setHwData] = useState<HardwareData | null>(null);
  const [isLoadingHw, setIsLoadingHw] = useState(false);
  const [hwError, setHwError] = useState<string | null>(null);

  // ── OEM State ──
  const [oemForm, setOemForm] = useState({
    manufacturer: '',
    model: '',
    supportHours: '24/7',
    supportPhone: '',
    supportUrl: '',
    computerName: ''
  });
  const [oemSaveStatus, setOemSaveStatus] = useState<string | null>(null);

  // ── User Management State ──
  const [users, setUsers] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userMsg, setUserMsg] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [changePassUser, setChangePassUser] = useState('');
  const [changePassNew, setChangePassNew] = useState('');
  const [newComputerNameInput, setNewComputerNameInput] = useState('');

  // ── Benchmark State ──
  const [selectedDrive, setSelectedDrive] = useState('C:');
  const [benchmarkSize, setBenchmarkSize] = useState(64);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<{
    writeSpeedMBps: number;
    readSpeedMBps: number;
    drive: string;
    sizeMB: number;
  } | null>(null);

  // ── Laptop Health State ──
  const [laptopHealth, setLaptopHealth] = useState<any | null>(null);
  const [isLoadingLaptopHealth, setIsLoadingLaptopHealth] = useState(false);

  // ── CPU Lookup State ──
  const [cpuQuery, setCpuQuery] = useState('');
  const [selectedSocketFilter, setSelectedSocketFilter] = useState('all');

  // ── Peripherals State ──
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscNodeRef = useRef<OscillatorNode | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [speakerError, setSpeakerError] = useState<string | null>(null);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [isRecording5s, setIsRecording5s] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isWebcamTesting, setIsWebcamTesting] = useState(false);
  const [webcamRes, setWebcamRes] = useState<string>('');
  const [webcamFps, setWebcamFps] = useState<number>(0);
  const [isMirror, setIsMirror] = useState(true);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [availableCams, setAvailableCams] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamId, setSelectedCamId] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const [isDeadPixelTest, setIsDeadPixelTest] = useState(false);
  const [deadPixelColorIndex, setDeadPixelColorIndex] = useState(0);
  const deadPixelColors = [
    { name: 'Đen tuyền (Soi điểm sáng / kẹt màu)', hex: '#000000' },
    { name: 'Trắng tinh (Soi điểm chết đen / ố lót)', hex: '#ffffff' },
    { name: 'Đỏ tươi (Soi sub-pixel Đỏ)', hex: '#ff0000' },
    { name: 'Xanh lá (Soi sub-pixel Xanh)', hex: '#00ff00' },
    { name: 'Xanh dương (Soi sub-pixel Lam)', hex: '#0000ff' },
    { name: 'Vàng rực (Kiểm tra pha màu)', hex: '#ffff00' },
    { name: 'Tím hồng (Magenta)', hex: '#ff00ff' },
    { name: 'Xanh lơ (Cyan)', hex: '#00ffff' },
    { name: 'Xám 50% (Soi hở sáng IPS Bleeding)', hex: '#808080' }
  ];

  // ── Wi-Fi & Network State ──
  const [savedWifiList, setSavedWifiList] = useState<any[]>([]);
  const [isLoadingWifi, setIsLoadingWifi] = useState(false);
  const [wifiSearchQuery, setWifiSearchQuery] = useState('');
  const [showWifiPass, setShowWifiPass] = useState<Record<string, boolean>>({});
  const [copiedWifiSsid, setCopiedWifiSsid] = useState<string | null>(null);
  const [isFixingNet, setIsFixingNet] = useState(false);
  const [netFixStatus, setNetFixStatus] = useState<string | null>(null);
  const [isFixingPrinter, setIsFixingPrinter] = useState(false);
  const [printerFixStatus, setPrinterFixStatus] = useState<string | null>(null);

  // ── Ping Test & LAN Sharing State ──
  const [pingTargets, setPingTargets] = useState<any[]>([]);
  const [customPingHost, setCustomPingHost] = useState('');
  const [isPinging, setIsPinging] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);
  const [isEnablingLanSharing, setIsEnablingLanSharing] = useState(false);
  const [lanSharingMsg, setLanSharingMsg] = useState<string | null>(null);

  // ── Battery Report State ──
  const [isGeneratingBatteryReport, setIsGeneratingBatteryReport] = useState(false);
  const [batteryReportResult, setBatteryReportResult] = useState<any | null>(null);

  // ── User Data Backup State ──
  const [isBackingUpUserData, setIsBackingUpUserData] = useState(false);
  const [backupUserDataResult, setBackupUserDataResult] = useState<any | null>(null);

  // ── Quick Command Palette State ──
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');

  // ── Master 1-Click Clinic Boost State ──
  const [isMasterBoosting, setIsMasterBoosting] = useState(false);
  const [masterBoostResult, setMasterBoostResult] = useState<any | null>(null);

  // ── Windows Services Doctor State ──
  const [windowsServices, setWindowsServices] = useState<any[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isRepairingServices, setIsRepairingServices] = useState(false);
  const [servicesRepairMsg, setServicesRepairMsg] = useState<string | null>(null);

  // ── Report Export State ──
  const [showExportReportModal, setShowExportReportModal] = useState(false);
  const [techName, setTechName] = useState('Kỹ thuật viên IT');
  const [customerName, setCustomerName] = useState('Khách hàng bàn giao');

  // ── License State ──
  const [licenseData, setLicenseData] = useState<{ windows: any; office: any } | null>(null);
  const [isLoadingLicense, setIsLoadingLicense] = useState(false);

  // ── CPU Stress Test State ──
  const [isCpuStressing, setIsCpuStressing] = useState(false);
  const [stressSecondsLeft, setStressSecondsLeft] = useState(60);
  const stressWorkersRef = useRef<Worker[]>([]);

  // ── Driver Manager (Kiểm tra & Quản lý Driver PnP) State ──
  const [driverList, setDriverList] = useState<DriverItem[]>([]);
  const [problemDevices, setProblemDevices] = useState<ProblemDevice[]>([]);
  const [totalDriverCount, setTotalDriverCount] = useState<number>(0);
  const [isLoadingDrivers, setIsLoadingDrivers] = useState<boolean>(false);
  const [driverError, setDriverError] = useState<string | null>(null);
  const [driverCategory, setDriverCategory] = useState<string>('ALL');
  const [driverSearch, setDriverSearch] = useState<string>('');
  const [isScanningHardware, setIsScanningHardware] = useState<boolean>(false);
  const [isExportingDrivers, setIsExportingDrivers] = useState<boolean>(false);
  const [driverActionMsg, setDriverActionMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [copiedHwId, setCopiedHwId] = useState<string | null>(null);
  const [driverDisplayLimit, setDriverDisplayLimit] = useState<number>(60);

  // ── Driver Backup State ──
  const [isBackingUpDrivers, setIsBackingUpDrivers] = useState(false);
  const [backupDriverMsg, setBackupDriverMsg] = useState<string | null>(null);
  const [backupDriverDir, setBackupDriverDir] = useState<string | null>(null);

  // ── Power & BIOS State ──
  const [shutdownMinutes, setShutdownMinutes] = useState(30);
  const [powerMsg, setPowerMsg] = useState<string | null>(null);

  // ── OEM Key State ──
  const [oemKeyData, setOemKeyData] = useState<{ key: string; isBios: boolean } | null>(null);
  const [isLoadingOemKey, setIsLoadingOemKey] = useState(false);
  const [copiedOemKey, setCopiedOemKey] = useState(false);

  // ── LAN Scanner State ──
  const [lanDevices, setLanDevices] = useState<any[]>([]);
  const [isScanningLan, setIsScanningLan] = useState(false);
  const [lanFilterQuery, setLanFilterQuery] = useState('');

  // ── System Restore State ──
  const [restorePoints, setRestorePoints] = useState<any[]>([]);
  const [isLoadingRestore, setIsLoadingRestore] = useState(false);
  const [newRestoreDesc, setNewRestoreDesc] = useState('DMH_Backup_' + new Date().toISOString().slice(0, 10));
  const [isCreatingRestore, setIsCreatingRestore] = useState(false);
  const [restoreStatusMsg, setRestoreStatusMsg] = useState<string | null>(null);

  // ── Startup Apps State ──
  const [startupApps, setStartupApps] = useState<any[]>([]);
  const [isLoadingStartup, setIsLoadingStartup] = useState(false);
  const [startupStatusMsg, setStartupStatusMsg] = useState<string | null>(null);

  // ── Large Files State ──
  const [largeFiles, setLargeFiles] = useState<any[]>([]);
  const [isScanningLargeFiles, setIsScanningLargeFiles] = useState(false);
  const [largeFileMsg, setLargeFileMsg] = useState<string | null>(null);

  // ── Office State ──
  const [officeVersion, setOfficeVersion] = useState<'365' | '2021' | '2019'>('365');
  const [officeArch, setOfficeArch] = useState<'64' | '32'>('64');
  const [officeApps, setOfficeApps] = useState<string[]>(['Word', 'Excel', 'PowerPoint', 'Outlook']);
  const [isInstallingOffice, setIsInstallingOffice] = useState(false);
  const [officeResultMsg, setOfficeResultMsg] = useState<string | null>(null);

  // ── App Downloader State ──
  const [installingApp, setInstallingApp] = useState<string | null>(null);
  const [appMsg, setAppMsg] = useState<string | null>(null);

  // ── Custom App State ──
  const [customAppPath, setCustomAppPath] = useState('');
  const [customAppArgs, setCustomAppArgs] = useState('/S');
  const [isInstallingCustom, setIsInstallingCustom] = useState(false);
  const [customInstallMsg, setCustomInstallMsg] = useState<string | null>(null);

  // ── Fonts State ──
  const [isInstallingFonts, setIsInstallingFonts] = useState(false);
  const [fontMsg, setFontMsg] = useState<string | null>(null);

  // ── Print Spooler & Network Printer State ──
  const [isClearingSpooler, setIsClearingSpooler] = useState(false);
  const [clearSpoolerMsg, setClearSpoolerMsg] = useState<string | null>(null);
  const [printerTestIp, setPrinterTestIp] = useState('192.168.1.200');
  const [isTestingPrinterPort, setIsTestingPrinterPort] = useState(false);
  const [printerPortResult, setPrinterPortResult] = useState<any | null>(null);

  // ── Visual C++ Runtime State ──
  const [isInstallingVcRedist, setIsInstallingVcRedist] = useState(false);
  const [vcRedistMsg, setVcRedistMsg] = useState<string | null>(null);

  // ── Optimizer State ──
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<{ DeletedFiles: number; FreedMB: number } | null>(null);
  const [isOptimizingRam, setIsOptimizingRam] = useState(false);
  const [ramResult, setRamResult] = useState<{ FreedMB: number; BeforeFreeMB?: number; AfterFreeMB?: number } | null>(null);

  // ── Tweaks State ──
  const [tweakStatus, setTweakStatus] = useState<Record<string, string>>({});
  const [selectedTweaks, setSelectedTweaks] = useState<string[]>(
    DMH_OPTIMIZER_TWEAKS.filter(t => t.recommended).map(t => t.id)
  );
  const [isApplyingBatchTweaks, setIsApplyingBatchTweaks] = useState(false);
  const [batchTweakResult, setBatchTweakResult] = useState<{ count: number; message: string; appliedList?: string[] } | null>(null);

  // ── Batch Apps State ──
  const [selectedApps, setSelectedApps] = useState<string[]>([
    'Google Chrome',
    'UniKey 4.3 RC5',
    'WinRAR (64-bit)',
    'Visual C++ All-in-One (2005-2022)',
    'Zalo PC',
    'UltraViewer'
  ]);
  const [isBatchInstallingApps, setIsBatchInstallingApps] = useState(false);
  const [batchInstallProgress, setBatchInstallProgress] = useState<{ index: number; total: number; currentApp: string; percent: number } | null>(null);
  const [batchInstallResults, setBatchInstallResults] = useState<Array<{ name: string; ok: boolean; message: string }> | null>(null);

  // ── Toggle Group ──
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // ── Fetch Hardware Info ──
  const fetchHardwareInfo = async () => {
    setIsLoadingHw(true);
    setHwError(null);
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.getHardwareInfo) {
        const res = await eAPI.pcTools.getHardwareInfo();
        if (res.ok && res.data) {
          setHwData(res.data);
          if (res.data.ComputerName) {
            setNewComputerNameInput(res.data.ComputerName);
            setOemForm(prev => ({
              ...prev,
              computerName: res.data.ComputerName,
              manufacturer: res.data.Mainboard?.Manufacturer || prev.manufacturer,
              model: res.data.Mainboard?.Product || prev.model
            }));
          }
        } else {
          setHwError(res.error || 'Không thể đọc thông tin phần cứng');
        }
      }
    } catch (err: any) {
      setHwError(err.message || 'Lỗi khi gọi WMI');
    } finally {
      setIsLoadingHw(false);
    }
  };

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.getUserAccounts) {
        const res = await eAPI.pcTools.getUserAccounts();
        if (res.ok && res.data) setUsers(res.data);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const fetchLaptopHealth = async () => {
    setIsLoadingLaptopHealth(true);
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.getLaptopHealth) {
        const res = await eAPI.pcTools.getLaptopHealth();
        if (res.ok && res.data) setLaptopHealth(res.data);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsLoadingLaptopHealth(false);
    }
  };

  // ── Driver Manager Handlers ──
  const fetchDriverInfo = async () => {
    setIsLoadingDrivers(true);
    setDriverError(null);
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.getDriverInfo) {
        const res = await eAPI.pcTools.getDriverInfo();
        if (res.ok) {
          setDriverList(res.drivers || []);
          setProblemDevices(res.problems || []);
          setTotalDriverCount(res.totalDrivers || 0);
        } else {
          setDriverError(res.error || 'Không thể đọc thông tin Driver');
        }
      }
    } catch (err: any) {
      setDriverError(err.message || 'Lỗi truy vấn Driver');
    } finally {
      setIsLoadingDrivers(false);
    }
  };

  const handleScanHardwareChanges = async () => {
    setIsScanningHardware(true);
    setDriverActionMsg({ text: 'Đang quét và đồng bộ lại toàn bộ phần cứng PnP...', type: 'info' });
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.scanHardwareChanges) {
        const res = await eAPI.pcTools.scanHardwareChanges();
        if (res.ok) {
          setDriverActionMsg({ text: '✓ Đã quét và làm mới danh sách phần cứng PnP thành công!', type: 'success' });
          await fetchDriverInfo();
        } else {
          setDriverActionMsg({ text: res.error || 'Quét phần cứng thất bại', type: 'error' });
        }
      }
    } catch (e: any) {
      setDriverActionMsg({ text: e.message || 'Lỗi quét phần cứng', type: 'error' });
    } finally {
      setIsScanningHardware(false);
    }
  };

  const handleExportDriverStore = async () => {
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.selectFolder) {
        const folderRes = await eAPI.pcTools.selectFolder('Chọn thư mục lưu bản sao lưu Driver OEM');
        if (folderRes.canceled || !folderRes.folderPath) return;

        setIsExportingDrivers(true);
        setDriverActionMsg({ text: `Đang trích xuất toàn bộ driver OEM vào: ${folderRes.folderPath}...`, type: 'info' });

        const backupRes = await eAPI.pcTools.backupDrivers(folderRes.folderPath);
        if (backupRes.ok) {
          setDriverActionMsg({ text: `✓ ${backupRes.message || 'Đã trích xuất thành công toàn bộ driver OEM!'}`, type: 'success' });
        } else {
          setDriverActionMsg({ text: backupRes.error || 'Lỗi sao lưu driver', type: 'error' });
        }
      }
    } catch (e: any) {
      setDriverActionMsg({ text: e.message || 'Lỗi trích xuất driver', type: 'error' });
    } finally {
      setIsExportingDrivers(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHwId(text);
    setTimeout(() => setCopiedHwId(null), 2500);
  };

  const handleInstallInf = async () => {
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.selectInfFile) {
        const fileRes = await eAPI.pcTools.selectInfFile();
        if (fileRes.canceled || !fileRes.filePath) return;

        setDriverActionMsg({ text: `Đang nạp và cài đặt driver từ: ${fileRes.filePath}...`, type: 'info' });
        const installRes = await eAPI.pcTools.installDriverInf(fileRes.filePath);
        if (installRes.ok) {
          setDriverActionMsg({ text: `✓ Đã nạp và cài đặt gói driver vào hệ thống thành công!`, type: 'success' });
          await fetchDriverInfo();
        } else {
          setDriverActionMsg({ text: installRes.error || 'Lỗi cài đặt driver', type: 'error' });
        }
      }
    } catch (e: any) {
      setDriverActionMsg({ text: e.message || 'Lỗi cài đặt driver', type: 'error' });
    }
  };

  const handleRestartNetAdapter = async () => {
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.restartNetworkAdapter) {
        setDriverActionMsg({ text: 'Đang khởi động lại toàn bộ Card mạng LAN & Wi-Fi...', type: 'info' });
        const res = await eAPI.pcTools.restartNetworkAdapter();
        if (res.ok) {
          setDriverActionMsg({ text: '✓ Đã khởi động lại toàn bộ Card mạng LAN & Wi-Fi thành công!', type: 'success' });
        } else {
          setDriverActionMsg({ text: res.error || 'Lỗi reset card mạng', type: 'error' });
        }
      }
    } catch (e: any) {
      setDriverActionMsg({ text: e.message || 'Lỗi reset card mạng', type: 'error' });
    }
  };

  useEffect(() => {
    fetchHardwareInfo();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'user_pc') fetchUsers();
    if (activeSubTab === 'laptop_check') fetchLaptopHealth();
    if (activeSubTab === 'driver_manager') fetchDriverInfo();
  }, [activeSubTab]);

  // ── Keyboard Listener ──
  useEffect(() => {
    if (activeSubTab !== 'peripherals_test') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'F12') e.preventDefault();
      setActiveKey(e.code);
      setPressedKeys(prev => {
        const next = new Set(prev);
        next.add(e.code);
        return next;
      });
    };
    const handleKeyUp = () => setActiveKey(null);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeSubTab]);

  // ── Audio Tester ──
  const stopAudio = () => {
    if (oscNodeRef.current) {
      try {
        oscNodeRef.current.stop();
        oscNodeRef.current.disconnect();
      } catch {}
      oscNodeRef.current = null;
    }
    setIsPlayingAudio(false);
  };

  const playTone = (pan: number = 0, freq: number = 440) => {
    stopAudio();
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtxClass();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, ctx.currentTime);

      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        osc.connect(gain);
        gain.connect(ctx.destination);
      }

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.start();
      oscNodeRef.current = osc;
      setIsPlayingAudio(true);
    } catch (e: any) {
      setSpeakerError(formatMediaError(e, 'audio'));
    }
  };

  // ── Format Media Error Sang Tiếng Việt Thân Thiện ──
  const formatMediaError = (err: any, type: 'mic' | 'cam' | 'audio') => {
    const msg = err?.message || String(err || '');
    const name = err?.name || '';
    if (name === 'NotFoundError' || msg.includes('Requested device not found') || msg.includes('DevicesNotFoundError')) {
      return type === 'mic'
        ? 'Không tìm thấy Microphone! Máy tính chưa cắm tai nghe/micro hoặc thiết bị đang bị vô hiệu hóa trong Windows.'
        : type === 'cam'
        ? 'Không tìm thấy Webcam! Máy tính chưa cắm Camera USB hoặc chưa bật công tắc camera.'
        : 'Không tìm thấy thiết bị phát âm thanh (Loa/Tai nghe)!';
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || msg.includes('Permission denied')) {
      return `Quyền truy cập ${type === 'mic' ? 'Microphone' : 'Webcam'} bị từ chối trong Cài đặt bảo mật Windows (Settings -> Privacy).`;
    }
    if (name === 'NotReadableError' || msg.includes('Could not start video source') || msg.includes('Device in use')) {
      return `Thiết bị ${type === 'mic' ? 'Microphone' : 'Webcam'} đang bị một ứng dụng khác (Zalo, Zoom, Teams...) chiếm dụng.`;
    }
    return `Lỗi ${type === 'mic' ? 'Micro' : type === 'cam' ? 'Webcam' : 'Âm thanh'}: ${msg}`;
  };

  const refreshMediaDevices = async () => {
    if (!navigator?.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      const cams = devices.filter(d => d.kind === 'videoinput');
      setAvailableMics(mics);
      setAvailableCams(cams);
      if (mics.length > 0 && !selectedMicId) setSelectedMicId(mics[0].deviceId);
      if (cams.length > 0 && !selectedCamId) setSelectedCamId(cams[0].deviceId);
    } catch (e) {
      console.error('Failed to enumerate devices', e);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'peripherals_test') {
      refreshMediaDevices();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab]); // intentional: refreshMediaDevices là stable ref

  // Đăng ký làm mới thông minh toàn app cho Tab Kỹ Thuật PC
  useEffect(() => {
    return registerTabRefreshHandler('pctools', async () => {
      if (activeSubTab === 'peripherals_test') {
        await refreshMediaDevices();
      }
    });
  }, [activeSubTab]);

  // ── Mic Tester ──
  const startMicTest = async () => {
    setMicError(null);
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
        video: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;
      setIsMicTesting(true);
      refreshMediaDevices();

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const micSource = ctx.createMediaStreamSource(stream);
      micSource.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!micStreamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
        requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (err: any) {
      setMicError(formatMediaError(err, 'mic'));
      setIsMicTesting(false);
    }
  };

  const stopMicTest = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setIsMicTesting(false);
    setMicVolume(0);
  };

  const record5Seconds = async () => {
    setMicError(null);
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mediaRecorderRef.current = recorder;
      setRecordedAudioUrl(null);
      setIsRecording5s(true);
      refreshMediaDevices();

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setRecordedAudioUrl(URL.createObjectURL(blob));
        setIsRecording5s(false);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 5000);
    } catch (e: any) {
      setMicError(formatMediaError(e, 'mic'));
      setIsRecording5s(false);
    }
  };

  // ── Webcam ──
  const startWebcamTest = async () => {
    setWebcamError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedCamId ? { deviceId: { exact: selectedCamId }, width: 1280, height: 720 } : { width: 1280, height: 720 },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      webcamStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsWebcamTesting(true);
      refreshMediaDevices();

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      setWebcamRes(`${settings.width || 1280} x ${settings.height || 720}`);
      setWebcamFps(Math.round(settings.frameRate || 30));
    } catch (err: any) {
      setWebcamError(formatMediaError(err, 'cam'));
      setIsWebcamTesting(false);
    }
  };

  const stopWebcamTest = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(t => t.stop());
      webcamStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsWebcamTesting(false);
  };

  useEffect(() => {
    return () => {
      stopAudio();
      stopMicTest();
      stopWebcamTest();
    };
  }, [activeSubTab]);

  // ── Test Màn Hình Phím Tắt ──
  useEffect(() => {
    if (!isDeadPixelTest) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDeadPixelTest(false);
      } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        setDeadPixelColorIndex(prev => (prev + 1) % deadPixelColors.length);
      } else if (e.key === 'ArrowLeft') {
        setDeadPixelColorIndex(prev => (prev - 1 + deadPixelColors.length) % deadPixelColors.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeadPixelTest, deadPixelColors.length]);

  // ── Wi-Fi & Network Handlers ──
  const handleFetchSavedWifi = async () => {
    setIsLoadingWifi(true);
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:get-saved-wifi');
      if (res?.ok && Array.isArray(res.data)) {
        setSavedWifiList(res.data);
      } else {
        setSavedWifiList([]);
      }
    } catch {
      setSavedWifiList([]);
    } finally {
      setIsLoadingWifi(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'network_wifi' && savedWifiList.length === 0) {
      handleFetchSavedWifi();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab]); // intentional: savedWifiList.length là guard chứ không phải trigger

  const handleNetworkFix = async () => {
    setIsFixingNet(true);
    setNetFixStatus(null);
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:network-fix');
      setNetFixStatus(res?.message || (res?.ok ? 'Đã đặt lại mạng thành công!' : 'Có lỗi khi đặt lại mạng'));
    } catch (err: any) {
      setNetFixStatus('Lỗi: ' + (err?.message || 'Không thể thực thi'));
    } finally {
      setIsFixingNet(false);
    }
  };

  const handleFixLanPrinter = async () => {
    setIsFixingPrinter(true);
    setPrinterFixStatus(null);
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:fix-lan-printer');
      setPrinterFixStatus(res?.message || (res?.ok ? 'Đã sửa lỗi máy in mạng LAN thành công!' : 'Có lỗi khi sửa lỗi'));
    } catch (err: any) {
      setPrinterFixStatus('Lỗi: ' + (err?.message || 'Không thể thực thi'));
    } finally {
      setIsFixingPrinter(false);
    }
  };

  const handleLaunchWinTool = async (toolId: string) => {
    try {
      await (window as any).electronAPI?.invoke('pctools:launch-win-tool', toolId);
    } catch (err) {
      console.error('Failed to launch tool', err);
    }
  };

  const exportWifiToTxt = () => {
    if (!savedWifiList.length) return;
    let content = '==================================================\r\n';
    content += 'DANH SÁCH MẬT KHẨU WI-FI ĐÃ LƯU TRÊN MÁY TÍNH\r\n';
    content += `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}\r\n`;
    content += `Số lượng mạng: ${savedWifiList.length} điểm truy cập\r\n`;
    content += 'Phát hành bởi: DMH Tools PC Suite\r\n';
    content += '==================================================\r\n\r\n';
    savedWifiList.forEach((w, i) => {
      content += `[${i + 1}] Tên Wi-Fi (SSID): ${w.SSID}\r\n`;
      content += `    Mật khẩu: ${w.Password || '(Mạng mở / Không có pass)'}\r\n`;
      content += `    Bảo mật : ${w.Auth || 'WPA2'}\r\n\r\n`;
    });
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Danh_Sach_Mat_Khau_WiFi_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Ping & LAN Sharing Handlers ──
  const handlePingTest = async (customHost?: string) => {
    setIsPinging(true);
    setPingError(null);
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI?.pcTools?.pingTest(customHost || customPingHost);
      const list = res?.targets || res?.results;
      if (res?.ok && Array.isArray(list)) {
        setPingTargets(list);
      } else {
        setPingError(res?.error || 'Không thể kiểm tra độ trễ mạng');
      }
    } catch (e: any) {
      setPingError(e.message);
    } finally {
      setIsPinging(false);
    }
  };

  const handleEnableLanSharing = async () => {
    setIsEnablingLanSharing(true);
    setLanSharingMsg(null);
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI?.pcTools?.enableLanSharing();
      if (res?.ok) {
        setLanSharingMsg(`✓ ${res.message}`);
      } else {
        setLanSharingMsg(`Lỗi: ${res?.error || 'Thất bại'}`);
      }
    } catch (e: any) {
      setLanSharingMsg(`Lỗi: ${e.message}`);
    } finally {
      setIsEnablingLanSharing(false);
    }
  };

  // ── Battery Report Handler ──
  const handleGenerateBatteryReport = async () => {
    setIsGeneratingBatteryReport(true);
    setBatteryReportResult(null);
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI?.pcTools?.generateBatteryReport();
      setBatteryReportResult(res);
    } catch (e: any) {
      setBatteryReportResult({ ok: false, error: e.message });
    } finally {
      setIsGeneratingBatteryReport(false);
    }
  };

  // ── User Data Backup Handler ──
  const handleBackupUserData = async () => {
    const confirmed = await showConfirm({
      title: 'Sao lưu dữ liệu cá nhân',
      message: 'Xác nhận tiến hành sao lưu toàn bộ Desktop, Documents và Downloads của bạn sang ổ đĩa thứ hai (D:\\ hoặc E:\\) bằng Robocopy?',
      type: 'info',
      confirmText: 'Bắt đầu sao lưu',
      cancelText: 'Hủy'
    });
    if (!confirmed) return;
    setIsBackingUpUserData(true);
    setBackupUserDataResult(null);
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI?.pcTools?.backupUserData();
      setBackupUserDataResult(res);
      if (res?.ok) {
        showToast.success(`Sao lưu dữ liệu người dùng thành công! (${res.backupDir || 'Thư mục backup'})`);
      } else {
        showToast.error(`Lỗi sao lưu dữ liệu: ${res?.error || 'Thất bại'}`);
      }
    } catch (e: any) {
      setBackupUserDataResult({ ok: false, error: e.message });
      showToast.error(`Lỗi sao lưu dữ liệu: ${e.message}`);
    } finally {
      setIsBackingUpUserData(false);
    }
  };

  // ── Print Spooler & LAN Printer Handlers ──
  const handleClearPrintQueue = async () => {
    setIsClearingSpooler(true);
    setClearSpoolerMsg(null);
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI?.pcTools?.clearPrintQueue();
      if (res?.ok) {
        setClearSpoolerMsg(`✓ ${res.message} (Đã dọn ${res.deletedCount || 0} tệp lệnh in kẹt)`);
      } else {
        setClearSpoolerMsg(`Lỗi: ${res?.error || 'Không thể dọn hàng đợi in'}`);
      }
    } catch (e: any) {
      setClearSpoolerMsg(`Lỗi: ${e.message}`);
    } finally {
      setIsClearingSpooler(false);
    }
  };

  const handleCheckPrinterPort = async () => {
    if (!printerTestIp.trim()) return;
    setIsTestingPrinterPort(true);
    setPrinterPortResult(null);
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI?.pcTools?.checkPrinterPort(printerTestIp.trim());
      setPrinterPortResult(res);
    } catch (e: any) {
      setPrinterPortResult({ ok: false, error: e.message });
    } finally {
      setIsTestingPrinterPort(false);
    }
  };

  // ── Visual C++ Runtime Installer Handler ──
  const handleInstallVcRedist = async () => {
    setIsInstallingVcRedist(true);
    setVcRedistMsg(null);
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI?.pcTools?.installVcRedist();
      if (res?.ok) {
        setVcRedistMsg(`✓ ${res.message}`);
      } else {
        setVcRedistMsg(`Lỗi: ${res?.error || 'Không thể cài đặt Visual C++ Runtime'}`);
      }
    } catch (e: any) {
      setVcRedistMsg(`Lỗi: ${e.message}`);
    } finally {
      setIsInstallingVcRedist(false);
    }
  };

  // ── Master 1-Click Clinic Boost Handler ──
  const handleMasterBoost = async () => {
    setIsMasterBoosting(true);
    setMasterBoostResult(null);
    const taskId = 'pc-master-boost';
    startGlobalLoading(taskId, 'Đang tiến hành tăng tốc hệ thống toàn diện 1-Click Clinic Boost...');
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI?.pcTools?.masterBoost();
      setMasterBoostResult(res);
      setTimeout(() => fetchHardwareInfo(), 1500);
    } catch (e: any) {
      setMasterBoostResult({ ok: false, error: e.message });
    } finally {
      setIsMasterBoosting(false);
      stopGlobalLoading(taskId);
    }
  };

  // ── Windows Services Doctor Handlers ──
  const handleGetServicesStatus = async () => {
    setIsLoadingServices(true);
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI?.pcTools?.getServicesStatus();
      if (res?.ok && Array.isArray(res.services)) {
        setWindowsServices(res.services);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingServices(false);
    }
  };

  const handleRepairServices = async () => {
    const ok = await showConfirm({
      title: 'Khôi Phục & Sửa Chữa Dịch Vụ Hệ Thống',
      message: 'Hệ thống sẽ tiến hành khởi động lại các dịch vụ cốt lõi của Windows (Windows Update, BITS, CryptSvc, Print Spooler, W32Time).\n\nBạn có muốn thực hiện ngay bây giờ?',
      type: 'warning',
      badge: 'QUẢN TRỊ VIÊN HỆ THỐNG',
      confirmText: 'Bắt đầu sửa chữa',
      cancelText: 'Hủy'
    });
    if (!ok) return;

    setIsRepairingServices(true);
    setServicesRepairMsg(null);
    const taskId = 'pc-repair-services';
    startGlobalLoading(taskId, 'Đang khôi phục và khởi động lại các dịch vụ cốt lõi Windows...');
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI?.pcTools?.repairServices();
      setServicesRepairMsg(res?.message || 'Đã sửa chữa và phục hồi toàn bộ dịch vụ hệ thống!');
      handleGetServicesStatus();
      setTimeout(() => setServicesRepairMsg(null), 5000);
    } catch (e: any) {
      setServicesRepairMsg('Lỗi sửa chữa: ' + e.message);
    } finally {
      setIsRepairingServices(false);
      stopGlobalLoading(taskId);
    }
  };

  // ── Phím tắt Ctrl + K mở Quick Command Palette ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsQuickSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isQuickSearchOpen) {
        setIsQuickSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQuickSearchOpen]);

  // ── License Handlers ──
  const handleCheckLicense = async () => {
    setIsLoadingLicense(true);
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:check-license');
      if (res?.ok && res.data) {
        setLicenseData(res.data);
      }
    } catch (e) {
      console.error('Check license error:', e);
    } finally {
      setIsLoadingLicense(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'sys_info') {
      if (!licenseData) handleCheckLicense();
      if (!oemKeyData) handleGetOemKey();
    }
    if (activeSubTab === 'network_wifi' && lanDevices.length === 0) {
      handleScanLan();
    }
    if (activeSubTab === 'system_optimizer') {
      if (startupApps.length === 0) handleGetStartupApps();
      if (largeFiles.length === 0) handleScanLargeFiles();
    }
    if ((activeSubTab === 'windows_shortcuts' || activeSubTab === 'windows_tweaks') && restorePoints.length === 0) {
      handleGetRestorePoints();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab]); // intentional: các biến còn lại là guard conditions, không phải trigger

  // ── CPU Stress Test Handlers ──
  const stopCpuStressTest = () => {
    if (stressWorkersRef.current.length) {
      stressWorkersRef.current.forEach(w => {
        try { w.terminate(); } catch {}
      });
      stressWorkersRef.current = [];
    }
    setIsCpuStressing(false);
  };

  const startCpuStressTest = (durationSec = 60) => {
    stopCpuStressTest();
    setIsCpuStressing(true);
    setStressSecondsLeft(durationSec);

    const workerCode = `
      self.onmessage = function(e) {
        if (e.data === 'burn') {
          while (true) {
            let x = 0;
            for (let i = 0; i < 100000; i++) {
              x += Math.sqrt(i * Math.random());
            }
          }
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const threads = navigator.hardwareConcurrency || 4;
    const workers: Worker[] = [];

    for (let i = 0; i < threads; i++) {
      try {
        const w = new Worker(workerUrl);
        w.postMessage('burn');
        workers.push(w);
      } catch (e) {
        console.error('Failed to spawn stress worker', e);
      }
    }
    stressWorkersRef.current = workers;
  };

  useEffect(() => {
    let timer: any = null;
    if (isCpuStressing && stressSecondsLeft > 0) {
      timer = setInterval(() => {
        setStressSecondsLeft(prev => {
          if (prev <= 1) {
            stopCpuStressTest();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isCpuStressing, stressSecondsLeft]);

  useEffect(() => {
    return () => {
      stopCpuStressTest();
    };
  }, []);

  // ── Driver Backup Handlers ──
  const handleBackupDrivers = async () => {
    setIsBackingUpDrivers(true);
    setBackupDriverMsg(null);
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:backup-drivers');
      if (res?.ok) {
        setBackupDriverDir(res.targetDir);
        setBackupDriverMsg(res.message || `Đã sao lưu thành công vào ${res.targetDir}`);
      } else {
        setBackupDriverMsg('Lỗi sao lưu: ' + (res?.error || 'Thất bại'));
      }
    } catch (e: any) {
      setBackupDriverMsg('Lỗi: ' + e.message);
    } finally {
      setIsBackingUpDrivers(false);
    }
  };

  // ── Power & BIOS Handlers ──
  const handlePowerAction = async (action: 'reboot-bios' | 'schedule-shutdown' | 'cancel-shutdown', minutes = 30) => {
    if (action === 'reboot-bios') {
      const confirmed = await showConfirm({
        title: 'Khởi động vào BIOS / UEFI',
        message: 'Xác nhận khởi động lại máy tính ngay lập tức và truy cập thẳng vào giao diện BIOS / UEFI Firmware?',
        type: 'warning',
        confirmText: 'Khởi động lại ngay',
        cancelText: 'Hủy'
      });
      if (!confirmed) return;
    }
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:power-action', { action, minutes });
      setPowerMsg(res?.message || 'Đã thực hiện lệnh thành công!');
      showToast.info(res?.message || 'Đã thực hiện lệnh nguồn thành công!');
      setTimeout(() => setPowerMsg(null), 5000);
    } catch (e: any) {
      setPowerMsg('Lỗi: ' + e.message);
      showToast.error('Lỗi thực thi lệnh nguồn: ' + e.message);
    }
  };

  // ── OEM Key Handler ──
  const handleGetOemKey = async () => {
    setIsLoadingOemKey(true);
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:get-oem-key');
      if (res?.ok && res.data) {
        setOemKeyData(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingOemKey(false);
    }
  };

  // ── LAN Scanner Handler ──
  const handleScanLan = async () => {
    setIsScanningLan(true);
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:scan-lan');
      if (res?.ok && Array.isArray(res.devices)) {
        setLanDevices(res.devices);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsScanningLan(false);
    }
  };

  // ── System Restore Handlers ──
  const handleGetRestorePoints = async () => {
    setIsLoadingRestore(true);
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:get-restore-points');
      if (res?.ok && Array.isArray(res.data)) {
        setRestorePoints(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingRestore(false);
    }
  };

  const handleCreateRestorePoint = async () => {
    if (!newRestoreDesc.trim()) return;
    setIsCreatingRestore(true);
    setRestoreStatusMsg('Đang tạo điểm khôi phục hệ thống...');
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:create-restore-point', newRestoreDesc.trim());
      setRestoreStatusMsg(res?.message || 'Đã tạo điểm phục hồi thành công!');
      handleGetRestorePoints();
      setTimeout(() => setRestoreStatusMsg(null), 5000);
    } catch (e: any) {
      setRestoreStatusMsg('Lỗi: ' + e.message);
    } finally {
      setIsCreatingRestore(false);
    }
  };

  const handleOpenRestoreGui = async () => {
    try {
      await (window as any).electronAPI?.invoke('pctools:open-restore-gui');
    } catch (e: any) {
      showAlert({
        title: 'System Restore GUI',
        message: 'Không thể mở giao diện System Restore: ' + e.message,
        type: 'warning'
      });
    }
  };

  // ── Startup Apps Handlers ──
  const handleGetStartupApps = async () => {
    setIsLoadingStartup(true);
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:get-startup-apps');
      if (res?.ok && Array.isArray(res.apps)) {
        setStartupApps(res.apps);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingStartup(false);
    }
  };

  const handleRemoveStartupApp = async (name: string, scope: string) => {
    const confirmed = await showConfirm({
      title: 'Xóa ứng dụng khởi động',
      message: `Xác nhận xóa ứng dụng "${name}" khỏi danh sách khởi động cùng Windows?`,
      type: 'warning',
      confirmText: 'Xóa khỏi khởi động',
      cancelText: 'Hủy'
    });
    if (!confirmed) return;
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:remove-startup-app', { name, scope });
      setStartupStatusMsg(res?.message || `Đã xóa ${name}`);
      showToast.success(res?.message || `Đã xóa ${name} khỏi khởi động Windows!`);
      handleGetStartupApps();
      setTimeout(() => setStartupStatusMsg(null), 4000);
    } catch (e: any) {
      setStartupStatusMsg('Lỗi: ' + e.message);
      showToast.error('Lỗi: ' + e.message);
    }
  };

  // ── Large Files Handlers ──
  const handleScanLargeFiles = async () => {
    setIsScanningLargeFiles(true);
    setLargeFileMsg(null);
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:scan-large-files');
      if (res?.ok && Array.isArray(res.files)) {
        setLargeFiles(res.files);
        if (res.files.length === 0) {
          setLargeFileMsg('Không tìm thấy tệp tin lớn hơn 50MB trong các thư mục chính.');
          showToast.info('Không tìm thấy tệp tin nào lớn hơn 50MB.');
        } else {
          showToast.success(`Đã phát hiện ${res.files.length} tệp tin có dung lượng lớn!`);
        }
      } else {
        const errMsg = 'Lỗi quét: ' + (res?.error || 'Thất bại');
        setLargeFileMsg(errMsg);
        showToast.error(errMsg);
      }
    } catch (e: any) {
      setLargeFileMsg('Lỗi: ' + e.message);
      showToast.error('Lỗi quét file: ' + e.message);
    } finally {
      setIsScanningLargeFiles(false);
    }
  };

  const handleOpenFileLocation = async (filePath: string) => {
    try {
      await (window as any).electronAPI?.invoke('pctools:open-file-location', filePath);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleDeleteLargeFile = async (filePath: string, fileName: string) => {
    const confirmed = await showConfirm({
      title: 'Chuyển vào Thùng rác',
      message: `Bạn có chắc chắn muốn chuyển tệp "${fileName}" vào Thùng rác (Recycle Bin)?`,
      type: 'warning',
      confirmText: 'Chuyển vào Thùng rác',
      cancelText: 'Hủy'
    });
    if (!confirmed) return;
    try {
      const res = await (window as any).electronAPI?.invoke('pctools:delete-file', filePath);
      if (res?.ok) {
        setLargeFiles(prev => prev.filter(f => f.FullName !== filePath));
        setLargeFileMsg(`✓ ${res.message}`);
        showToast.success(`Đã chuyển tệp "${fileName}" vào Thùng rác thành công!`);
        setTimeout(() => setLargeFileMsg(null), 4000);
      } else {
        const errMsg = 'Không thể xóa tệp: ' + (res?.error || 'Thất bại');
        showToast.error(errMsg);
      }
    } catch (e: any) {
      showToast.error('Lỗi xóa tệp: ' + e.message);
    }
  };

  // ── Benchmark Handler ──
  const handleRunBenchmark = async () => {
    setIsBenchmarking(true);
    setBenchmarkResult(null);
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.benchmarkDisk) {
        const res = await eAPI.pcTools.benchmarkDisk({ drive: selectedDrive, sizeMB: benchmarkSize });
        const resultData = res?.data || (res?.writeSpeedMBps ? res : null);
        if (res?.ok && resultData) {
          setBenchmarkResult(resultData);
          showToast.success(`Đo tốc độ ổ đĩa ${selectedDrive} thành công! Đọc: ${resultData.readSpeedMBps || resultData.readSpeed || 0} MB/s, Ghi: ${resultData.writeSpeedMBps || resultData.writeSpeed || 0} MB/s`);
        } else {
          const errMsg = 'Lỗi đo tốc độ: ' + (res?.error || 'Không thể đo tốc độ ổ đĩa');
          showToast.error(errMsg);
        }
      }
    } catch (err: any) {
      showToast.error('Lỗi chạy benchmark: ' + err.message);
    } finally {
      setIsBenchmarking(false);
    }
  };

  // ── OEM Save ──
  const handleSaveOem = async (e: React.FormEvent) => {
    e.preventDefault();
    setOemSaveStatus('Đang lưu...');
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.setOemInfo) {
        const res = await eAPI.pcTools.setOemInfo(oemForm);
        setOemSaveStatus(res.message || 'Đã lưu cấu hình OEM thành công!');
        setTimeout(() => setOemSaveStatus(null), 4000);
      }
    } catch (err: any) {
      setOemSaveStatus('Lỗi: ' + err.message);
    }
  };

  // ── User Management Handlers ──
  const handleRenamePC = async () => {
    if (!newComputerNameInput.trim()) return;
    const confirmed = await showConfirm({
      title: 'Đổi tên máy tính',
      message: `Xác nhận đổi tên máy tính thành "${newComputerNameInput}"? Cần khởi động lại máy để áp dụng.`,
      type: 'warning',
      confirmText: 'Đổi tên',
      cancelText: 'Hủy'
    });
    if (!confirmed) return;
    setUserMsg('Đang đổi tên máy tính...');
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI.pcTools.manageUser({ action: 'rename-computer', newComputerName: newComputerNameInput.trim() });
      setUserMsg(res.message || 'Thành công');
      showToast.success(res.message || `Đã đổi tên máy thành ${newComputerNameInput}!`);
    } catch (e: any) {
      setUserMsg('Lỗi: ' + e.message);
      showToast.error('Lỗi đổi tên: ' + e.message);
    }
  };

  const handleChangePassword = async (username: string) => {
    if (!changePassNew.trim()) {
      showToast.warning('Vui lòng nhập mật khẩu mới!');
      return;
    }
    const confirmed = await showConfirm({
      title: 'Đổi Mật Khẩu Tài Khoản Windows',
      message: `Bạn có chắc muốn cập nhật mật khẩu mới cho tài khoản "${username}" trên hệ thống Windows?`,
      type: 'warning',
      badge: 'QUẢN TRỊ TÀI KHOẢN',
      confirmText: 'Đổi mật khẩu',
      cancelText: 'Hủy'
    });
    if (!confirmed) return;

    setUserMsg(`Đang cập nhật mật khẩu cho ${username}...`);
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI.pcTools.manageUser({ action: 'change-password', username, password: changePassNew.trim() });
      setUserMsg(res.message || 'Thành công');
      showToast.success(res.message || `Đã cập nhật mật khẩu cho ${username}!`);
      setChangePassNew('');
      setChangePassUser('');
    } catch (e: any) {
      setUserMsg('Lỗi: ' + e.message);
      showToast.error('Lỗi đổi mật khẩu: ' + e.message);
    }
  };

  const handleToggleAccount = async (username: string, currentDisabled: boolean) => {
    const actionText = currentDisabled ? 'kích hoạt' : 'vô hiệu hóa';
    const confirmed = await showConfirm({
      title: `${currentDisabled ? 'Kích Hoạt' : 'Vô Hiệu Hóa'} Tài Khoản`,
      message: `Bạn có chắc muốn ${actionText} tài khoản "${username}" trên hệ thống Windows?${!currentDisabled ? '\n\nLưu ý: Nếu đây là tài khoản quản trị duy nhất, bạn có thể bị mất quyền truy cập máy tính!' : ''}`,
      type: currentDisabled ? 'info' : 'danger',
      badge: 'QUẢN TRỊ TÀI KHOẢN',
      confirmText: `Đồng ý ${actionText}`,
      cancelText: 'Hủy'
    });
    if (!confirmed) return;

    setUserMsg(`Đang ${currentDisabled ? 'kích hoạt' : 'vô hiệu hóa'} ${username}...`);
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI.pcTools.manageUser({ action: 'toggle-account', username, active: currentDisabled });
      setUserMsg(res.message || 'Thành công');
      showToast.info(res.message || `Đã thay đổi trạng thái tài khoản ${username}!`);
      fetchUsers();
    } catch (e: any) {
      setUserMsg('Lỗi: ' + e.message);
      showToast.error('Lỗi: ' + e.message);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserPass.trim()) {
      showToast.warning('Vui lòng nhập đầy đủ tên tài khoản và mật khẩu!');
      return;
    }
    const confirmed = await showConfirm({
      title: 'Tạo Tài Khoản Windows Mới',
      message: `Xác nhận tạo tài khoản "${newUserName.trim()}" với quyền ${newUserIsAdmin ? 'Quản trị viên (Administrator)' : 'Người dùng tiêu chuẩn (Standard User)'}?`,
      type: 'info',
      badge: 'QUẢN TRỊ TÀI KHOẢN',
      confirmText: 'Tạo tài khoản',
      cancelText: 'Hủy'
    });
    if (!confirmed) return;

    setUserMsg(`Đang khởi tạo tài khoản ${newUserName}...`);
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI.pcTools.manageUser({
        action: 'create-user',
        username: newUserName.trim(),
        password: newUserPass.trim(),
        isAdmin: newUserIsAdmin
      });
      setUserMsg(res.message || 'Thành công');
      showToast.success(res.message || `Đã tạo tài khoản ${newUserName} thành công!`);
      setNewUserName('');
      setNewUserPass('');
      fetchUsers();
    } catch (e: any) {
      setUserMsg('Lỗi: ' + e.message);
      showToast.error('Lỗi tạo tài khoản: ' + e.message);
    }
  };

  // ── Office Installer ──
  const handleInstallOffice = async () => {
    setIsInstallingOffice(true);
    setOfficeResultMsg('Đang tạo config XML và chạy Office Deployment Tool...');
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.installOffice) {
        const res = await eAPI.pcTools.installOffice({
          version: officeVersion,
          arch: officeArch,
          apps: officeApps
        });
        setOfficeResultMsg(res.message || 'Đã kích hoạt cài đặt Office');
      }
    } catch (e: any) {
      setOfficeResultMsg('Lỗi cài đặt: ' + e.message);
    } finally {
      setIsInstallingOffice(false);
    }
  };

  // ── App Downloader ──
  const handleInstallApp = async (app: { name: string; winget: string; url: string }) => {
    if (app.winget) {
      setInstallingApp(app.name);
      setAppMsg(`Đang tiến hành tải & cài đặt ${app.name} tự động qua Winget...`);
      try {
        const eAPI = (window as any).electronAPI;
        const res = await eAPI.pcTools.installCustomApp({ wingetId: app.winget });
        setAppMsg(res.message || `Đã hoàn tất cài đặt ${app.name}`);
      } catch (e: any) {
        setAppMsg(`Lỗi cài ${app.name}: ` + e.message);
      } finally {
        setInstallingApp(null);
      }
    } else {
      openUrl(app.url);
    }
  };

  // ── Custom App ──
  const handleInstallCustomApp = async () => {
    if (!customAppPath.trim()) {
      showToast.warning('Vui lòng nhập đường dẫn file cài đặt hoặc ID Winget!');
      return;
    }
    setIsInstallingCustom(true);
    setCustomInstallMsg('Đang thực thi cài đặt silent...');
    try {
      const eAPI = (window as any).electronAPI;
      const isWinget = !customAppPath.includes('\\') && !customAppPath.endsWith('.exe') && !customAppPath.endsWith('.msi');
      const res = await eAPI.pcTools.installCustomApp(isWinget ? { wingetId: customAppPath.trim() } : { filePath: customAppPath.trim(), args: customAppArgs });
      setCustomInstallMsg(res.message || 'Đã cài đặt thành công');
      showToast.success(res.message || 'Đã hoàn tất cài đặt ứng dụng tùy chỉnh!');
    } catch (e: any) {
      setCustomInstallMsg('Lỗi: ' + e.message);
      showToast.error('Lỗi cài đặt: ' + e.message);
    } finally {
      setIsInstallingCustom(false);
    }
  };

  // ── Font Installer ──
  const handleInstallFonts = async () => {
    setIsInstallingFonts(true);
    setFontMsg('Đang đăng ký và đồng bộ bộ font tiếng Việt vào hệ thống...');
    try {
      const eAPI = (window as any).electronAPI;
      const res = await eAPI.pcTools.installVietnameseFonts('all');
      setFontMsg(res.message || 'Đã mở thư mục Fonts hệ thống');
      showToast.success(res.message || 'Đã cài đặt thành công font tiếng Việt!');
    } catch (e: any) {
      setFontMsg('Lỗi cài font: ' + e.message);
      showToast.error('Lỗi cài đặt font: ' + e.message);
    } finally {
      setIsInstallingFonts(false);
    }
  };

  // ── Optimizer ──
  const handleCleanJunk = async () => {
    const ok = await showConfirm({
      title: 'Xác Nhận Dọn Rác Hệ Thống (Disk Junk)',
      message: 'Hệ thống sẽ quét và dọn sạch các tệp tạm thời trong thư mục %TEMP%, C:\\Windows\\Temp và làm trống Thùng rác (Recycle Bin).\n\nBạn có muốn tiếp tục?',
      type: 'warning',
      badge: 'BẢO TRÌ HỆ THỐNG',
      confirmText: 'Dọn rác ngay',
      cancelText: 'Hủy'
    });
    if (!ok) return;

    setIsCleaning(true);
    setCleanResult(null);
    const taskId = 'pc-clean-junk';
    startGlobalLoading(taskId, 'Đang quét và dọn sạch rác hệ thống (%TEMP%, Windows Temp, Recycle Bin)...');
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.cleanJunk) {
        const res = await eAPI.pcTools.cleanJunk();
        if (res.ok) {
          setCleanResult(res.data);
          showToast.success(`Dọn rác hệ thống thành công! Đã giải phóng ${(res.data?.totalCleanedMB || 0).toLocaleString()} MB.`);
        } else {
          showToast.error(`Lỗi dọn rác: ${res?.error || 'Thất bại'}`);
        }
      }
    } catch (e: any) {
      showToast.error('Lỗi dọn rác: ' + e.message);
    } finally {
      setIsCleaning(false);
      stopGlobalLoading(taskId);
    }
  };

  const handleOptimizeRam = async () => {
    setIsOptimizingRam(true);
    setRamResult(null);
    const taskId = 'pc-optimize-ram';
    startGlobalLoading(taskId, 'Đang tối ưu giải phóng bộ nhớ RAM đang bị chiếm dụng...');
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.optimizeRam) {
        const res = await eAPI.pcTools.optimizeRam();
        if (res.ok) {
          setRamResult(res.data);
          showToast.success(`Tối ưu RAM thành công! Bộ nhớ RAM trống tăng thêm: ${(res.data?.freedMB || 0).toLocaleString()} MB.`);
        } else {
          showToast.error(`Lỗi tối ưu RAM: ${res?.error || 'Thất bại'}`);
        }
      }
    } catch (e: any) {
      showToast.error('Lỗi tối ưu RAM: ' + e.message);
    } finally {
      setIsOptimizingRam(false);
      stopGlobalLoading(taskId);
    }
  };

  const handleApplyTweak = async (tweakId: string) => {
    setTweakStatus(prev => ({ ...prev, [tweakId]: 'Đang áp dụng...' }));
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.applyTweak) {
        const res = await eAPI.pcTools.applyTweak(tweakId);
        setTweakStatus(prev => ({ ...prev, [tweakId]: res.message || 'Thành công' }));
      }
    } catch (e: any) {
      setTweakStatus(prev => ({ ...prev, [tweakId]: 'Lỗi: ' + e.message }));
    }
  };

  // ── Optimizer Batch Tweaks Handlers ──
  const handleToggleTweakSelect = (id: string) => {
    setSelectedTweaks(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectRecommendedTweaks = () => {
    setSelectedTweaks(DMH_OPTIMIZER_TWEAKS.filter(t => t.recommended).map(t => t.id));
  };

  const handleSelectAllTweaks = () => {
    setSelectedTweaks(DMH_OPTIMIZER_TWEAKS.map(t => t.id));
  };

  const handleDeselectAllTweaks = () => {
    setSelectedTweaks([]);
  };

  const handleApplyBatchTweaks = async () => {
    if (selectedTweaks.length === 0) {
      showToast.warning('Vui lòng chọn ít nhất 1 tinh chỉnh để áp dụng!');
      return;
    }
    setIsApplyingBatchTweaks(true);
    setBatchTweakResult(null);
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.applyBatchTweaks) {
        const res = await eAPI.pcTools.applyBatchTweaks(selectedTweaks);
        if (res.ok) {
          setBatchTweakResult({
            count: res.count || selectedTweaks.length,
            message: res.message || 'Đã áp dụng thành công toàn bộ tinh chỉnh đã chọn!',
            appliedList: res.appliedList
          });
          showToast.success(`Đã áp dụng thành công ${res.count || selectedTweaks.length} tinh chỉnh tối ưu hệ thống!`);
        } else {
          const errMsg = 'Lỗi áp dụng tinh chỉnh: ' + (res.error || 'Thất bại');
          showToast.error(errMsg);
        }
      }
    } catch (e: any) {
      showToast.error('Lỗi thực thi: ' + e.message);
    } finally {
      setIsApplyingBatchTweaks(false);
    }
  };

  // ── Batch Apps Handlers ──
  const handleToggleAppSelect = (appName: string) => {
    setSelectedApps(prev =>
      prev.includes(appName) ? prev.filter(a => a !== appName) : [...prev, appName]
    );
  };

  const handleSelectBasicApps = () => {
    setSelectedApps([
      'Google Chrome',
      'UniKey 4.3 RC5',
      'WinRAR (64-bit)',
      'Visual C++ All-in-One (2005-2022)',
      'Zalo PC',
      'UltraViewer'
    ]);
  };

  const handleSelectAllApps = () => {
    const allWingetApps: string[] = [];
    ESSENTIAL_APPS.forEach(g => {
      g.apps.forEach(a => {
        if (a.winget) allWingetApps.push(a.name);
      });
    });
    setSelectedApps(allWingetApps);
  };

  const handleDeselectAllApps = () => {
    setSelectedApps([]);
  };

  const handleInstallBatchApps = async () => {
    if (selectedApps.length === 0) {
      showToast.warning('Vui lòng chọn ít nhất 1 ứng dụng để cài đặt tự động!');
      return;
    }

    const appsToInstall: Array<{ name: string; winget: string; url: string }> = [];
    ESSENTIAL_APPS.forEach(g => {
      g.apps.forEach(a => {
        if (selectedApps.includes(a.name) && a.winget) {
          appsToInstall.push(a);
        }
      });
    });

    if (appsToInstall.length === 0) {
      showToast.warning('Không có ứng dụng nào trong danh sách chọn hỗ trợ cài đặt tự động qua Winget.');
      return;
    }

    setIsBatchInstallingApps(true);
    setBatchInstallProgress({
      index: 0,
      total: appsToInstall.length,
      currentApp: 'Đang khởi tạo gói cài đặt...',
      percent: 0
    });
    setBatchInstallResults(null);

    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.pcTools?.installBatchApps) {
        const res = await eAPI.pcTools.installBatchApps(appsToInstall);
        if (res.ok) {
          setBatchInstallResults(res.results || []);
          showToast.success(`Đã hoàn tất quá trình cài đặt hàng loạt ${appsToInstall.length} ứng dụng!`);
        } else {
          const errMsg = 'Lỗi cài đặt hàng loạt: ' + (res.error || 'Thất bại');
          showToast.error(errMsg);
        }
      }
    } catch (e: any) {
      showToast.error('Lỗi cài đặt: ' + e.message);
    } finally {
      setIsBatchInstallingApps(false);
    }
  };

  // Listener lắng nghe tiến độ cài đặt hàng loạt
  useEffect(() => {
    const eAPI = (window as any).electronAPI;
    if (eAPI?.pcTools?.onBatchInstallProgress) {
      const removeListener = eAPI.pcTools.onBatchInstallProgress((data: any) => {
        if (data) setBatchInstallProgress(data);
      });
      return () => {
        if (typeof removeListener === 'function') removeListener();
      };
    }
  }, []);

  // ── Launch Tools ──
  const launchTool = (toolKey: string) => {
    const eAPI = (window as any).electronAPI;
    if (eAPI?.pcTools?.launchExternal) eAPI.pcTools.launchExternal(toolKey);
  };

  const openUrl = (url: string) => {
    const eAPI = (window as any).electronAPI;
    if (eAPI?.pcTools?.openDownloadUrl) eAPI.pcTools.openDownloadUrl(url);
    else window.open(url, '_blank');
  };

  // ── Virtual Keyboard ──
  const keyboardRows = [
    ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
    ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'],
    ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
    ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
    ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight'],
    ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ContextMenu', 'ControlRight'],
    ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']
  ];

  const getKeyLabel = (code: string) => {
    const map: Record<string, string> = {
      Escape: 'ESC', Backquote: '~', Minus: '-', Equal: '=', Backspace: '← Back',
      Tab: 'Tab', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
      CapsLock: 'Caps', Semicolon: ';', Quote: "'", Enter: 'Enter ↵',
      ShiftLeft: 'Shift', ShiftRight: 'Shift',
      ControlLeft: 'Ctrl', ControlRight: 'Ctrl', MetaLeft: 'Win', MetaRight: 'Win',
      AltLeft: 'Alt', AltRight: 'Alt', Space: 'Spacebar', ContextMenu: 'Menu',
      ArrowUp: '↑', ArrowLeft: '←', ArrowDown: '↓', ArrowRight: '→'
    };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.replace('Key', '');
    if (code.startsWith('Digit')) return code.replace('Digit', '');
    return code;
  };

  const filteredCpuMain = CPU_MAIN_DATABASE.filter(item => {
    if (selectedSocketFilter !== 'all' && item.brand.toLowerCase() !== selectedSocketFilter) return false;
    if (!cpuQuery.trim()) return true;
    const q = cpuQuery.toLowerCase();
    return item.socket.toLowerCase().includes(q) ||
      item.gen.toLowerCase().includes(q) ||
      item.chipsets.toLowerCase().includes(q) ||
      item.cpus.toLowerCase().includes(q);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', height: '100%', minHeight: 0, background: '#f1f5f9', color: '#0f172a', overflow: 'hidden' }}>
      
      {/* ── TOP HEADER: ĐẬM CHẤT DMH SYSTEM SUITE ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        flexShrink: 0
      }}>
        {/* Brand & Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', boxShadow: '0 4px 10px rgba(29,78,216,0.3)'
          }}>
            <Cpu size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              DMH Kỹ Thuật & Phần Cứng
              <span style={{
                fontSize: 10,
                background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%)',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                padding: '2px 8px',
                borderRadius: 12,
                fontWeight: 700
              }}>
                DMH Suite v6.5
              </span>
              <span style={{
                fontSize: 10,
                background: '#dcfce7',
                color: '#15803d',
                border: '1px solid #bbf7d0',
                padding: '2px 8px',
                borderRadius: 12,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                Online
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Bộ công cụ chẩn đoán phần cứng, đo kiểm hiệu năng, tối ưu và bảo trì hệ thống chuyên sâu
            </div>
          </div>
        </div>

        {/* Quick Tools & Command Palette */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setIsQuickSearchOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 8,
              background: '#f8fafc', border: '1px solid #cbd5e1',
              color: '#475569', fontSize: 12, cursor: 'pointer',
              fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}
            title="Tìm kiếm nhanh công cụ (Phím tắt: Ctrl + K)"
          >
            <Search size={14} color="#0284c7" />
            <span>Tìm kiếm công cụ...</span>
            <kbd style={{
              background: '#e2e8f0', color: '#334155',
              padding: '2px 6px', borderRadius: 4,
              fontSize: 10, fontWeight: 800, border: '1px solid #cbd5e1'
            }}>Ctrl K</kbd>
          </button>

          <button
            onClick={fetchHardwareInfo}
            disabled={isLoadingHw}
            className="btn-secondary"
            style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} className={isLoadingHw ? 'spin' : ''} />
            Quét lại
          </button>
          <button
            onClick={() => launchTool('taskmgr')}
            className="btn-secondary"
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            Task Manager
          </button>
          <button
            onClick={() => launchTool('devmgmt')}
            className="btn-secondary"
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            Device Manager
          </button>
          <button
            onClick={() => launchTool('cmd')}
            className="btn-secondary"
            style={{ fontSize: 12, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Terminal size={13} /> CMD
          </button>
        </div>
      </div>

      {/* ── SMART HEALTH ALERT BANNER ── */}
      {(() => {
        const disks = hwData?.Disks || [];
        const hasDiskWarning = (disks as any[]).some(d => d.HealthStatus && !['healthy', 'ok', 'good'].includes(d.HealthStatus.toLowerCase()));
        const battery = hwData?.Battery?.[0] || laptopHealth?.Battery;
        const isBatteryWorn = battery && battery.WearPercent > 35;

        if (!hasDiskWarning && !isBatteryWorn) return null;

        return (
          <div style={{
            background: hasDiskWarning ? '#fef2f2' : '#fffbeb',
            borderBottom: `1px solid ${hasDiskWarning ? '#fecaca' : '#fde68a'}`,
            padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 10, flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: hasDiskWarning ? '#991b1b' : '#92400e', fontWeight: 600 }}>
              <Shield size={16} color={hasDiskWarning ? '#dc2626' : '#d97706'} />
              <span>
                {hasDiskWarning ? (
                  <><strong>CẢNH BÁO NGUY CƠ DỮ LIỆU:</strong> Phát hiện ổ cứng có dấu hiệu bất thường / Bad Sector. Hãy lập tức sao lưu hồ sơ khám chữa bệnh để tránh mất mát!</>
                ) : (
                  <><strong>CẢNH BÁO PIN CHAI:</strong> Pin Laptop đã chai <strong>{battery?.WearPercent}%</strong> (vượt ngưỡng 35%). Khuyến nghị kiểm tra pin tránh phồng làm kênh bàn phím.</>
                )}
              </span>
            </div>
            <button
              onClick={() => setActiveSubTab('windows_shortcuts')}
              style={{
                background: hasDiskWarning ? '#dc2626' : '#d97706', color: '#fff',
                border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11.5,
                fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
              }}
            >
              <HardDrive size={13} /> Đi Tới Sao Lưu Ngay (Robocopy)
            </button>
          </div>
        );
      })()}

      {/* ── MAIN WORKSPACE: SIDEBAR (DARK SLATE) + CONTENT ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>

        {/* ── SIDEBAR ĐẶC TRƯNG DMH (DARK SLATE TECH LOOK) ── */}
        <div
          className="dark-slate-scrollbar"
          style={{
            width: 270,
            flexShrink: 0,
            height: '100%',
            background: '#0f172a', // Deep navy slate — cực ngầu và hiện đại
            color: '#e2e8f0',
            borderRight: '1px solid #1e293b',
            overflowY: 'auto',
            padding: '16px 10px 40px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            userSelect: 'none'
          }}
        >
          {/* Quick System Badge in Sidebar */}
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 11,
            color: '#94a3b8'
          }}>
            <div style={{ color: '#38bdf8', fontWeight: 700, marginBottom: 2 }}>
              💻 {hwData?.ComputerName || 'PC Local'}
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hwData?.CPUs?.[0]?.Name ? hwData.CPUs[0].Name.replace(/\(R\)|\(TM\)/g, '').trim() : 'Đang nhận diện...'}
            </div>
          </div>

          {DMH_MENU_GROUPS.map(group => {
            const isCollapsed = !!collapsedGroups[group.id];
            return (
              <div key={group.id}>
                {/* Group Accordion Header */}
                <div
                  onClick={() => toggleGroup(group.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: group.color,
                    letterSpacing: '0.8px',
                    cursor: 'pointer',
                    borderRadius: 6,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: group.color }} />
                    <span>{group.label}</span>
                  </div>
                  <span style={{ fontSize: 9, color: '#64748b', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}>
                    ▼
                  </span>
                </div>

                {/* Group Menu Items */}
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                    {group.items.map(item => {
                      const isActive = activeSubTab === item.id;
                      const IconComponent = item.icon;
                      return (
                        <div
                          key={item.id}
                          onClick={() => setActiveSubTab(item.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '9px 12px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 12.5,
                            fontWeight: isActive ? 700 : 500,
                            color: isActive ? '#ffffff' : '#cbd5e1',
                            background: isActive
                              ? 'linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%)'
                              : 'transparent',
                            boxShadow: isActive ? '0 4px 12px rgba(29,78,216,0.35)' : 'none',
                            transition: 'all 0.12s ease'
                          }}
                          onMouseEnter={e => {
                            if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                          }}
                          onMouseLeave={e => {
                            if (!isActive) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9, overflow: 'hidden' }}>
                            <IconComponent
                              size={15}
                              style={{
                                color: isActive ? '#ffffff' : group.color,
                                flexShrink: 0
                              }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.label}
                            </span>
                          </div>

                          {item.tag && (
                            <span style={{
                              fontSize: 9,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(56,189,248,0.15)',
                              color: isActive ? '#ffffff' : '#38bdf8',
                              fontWeight: 700
                            }}>
                              {item.tag}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Footer Info */}
          <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #1e293b', fontSize: 11, color: '#64748b', textAlign: 'center' }}>
            DMH Tools Ecosystem
          </div>
        </div>

        {/* ── CONTENT AREA (RIGHT) ── */}
        <div style={{ flex: 1, minHeight: 0, height: '100%', overflowY: 'auto', padding: '22px 24px 60px 24px', background: '#f8fafc' }}>

          {/* 1. CẤU HÌNH & VI XỬ LÝ */}
          {activeSubTab === 'sys_info' && (() => {
            const osItem = Array.isArray(hwData?.OS) ? hwData.OS[0] : (hwData?.OS || null);
            const cpuList = Array.isArray(hwData?.CPUs) ? hwData.CPUs : (hwData?.CPUs ? [hwData.CPUs] : []);
            const cpuItem = cpuList[0] || null;
            const totalCpuCores = cpuList.reduce((s: number, c: any) => s + (c.NumberOfCores || 0), 0);
            const totalCpuThreads = cpuList.reduce((s: number, c: any) => s + (c.NumberOfLogicalProcessors || 0), 0);
            const ramList = Array.isArray(hwData?.RAMModules) ? hwData.RAMModules : (hwData?.RAMModules ? [hwData.RAMModules] : []);
            const gpuList = Array.isArray(hwData?.GPUs) ? hwData.GPUs : (hwData?.GPUs ? [hwData.GPUs] : []);
            const volList = Array.isArray(hwData?.Volumes) ? hwData.Volumes : (hwData?.Volumes ? [hwData.Volumes] : []);
            const battItem = Array.isArray(hwData?.Battery) ? hwData.Battery[0] : (hwData?.Battery || null);
            const netItem = Array.isArray(hwData?.Network) ? hwData.Network[0] : (hwData?.Network || null);
            
            const physRamGB = osItem?.TotalPhysicalRAM_GB || (ramList.length > 0 ? Math.round(ramList.reduce((s: number, r: any) => s + (r.CapacityGB || 0), 0)) : (osItem?.TotalVisibleMemoryGB || 0));
            const visRamGB = osItem?.TotalVisibleMemoryGB || physRamGB;
            const hwReservedMB = osItem?.HardwareReservedMB || (physRamGB > visRamGB ? Math.round((physRamGB - visRamGB) * 1024) : 0);
            const freeRam = osItem?.FreePhysicalMemoryGB || 0;
            const usedRam = visRamGB > 0 && freeRam > 0 ? (visRamGB - freeRam).toFixed(1) : '0';
            const usedRamPct = visRamGB > 0 && freeRam > 0 ? Math.min(100, Math.round(((visRamGB - freeRam) / visRamGB) * 100)) : 0;

            // Nhận diện RAM Onboard (Row of chips)
            const isRowOfChips = ramList.some((r: any) => r.FormFactor === 12 || r.FormFactor === 23 || r.FormFactor === 24) ||
              (ramList.length >= 4 && ramList.every((r: any) => (r.CapacityGB <= 4) && (r.DeviceLocator?.includes('Motherboard') || !r.DeviceLocator)));
            const ramSpeed = ramList[0]?.SpeedMHz || 3733;

            const formatBiosDate = (d?: string) => {
              if (!d) return 'N/A';
              const m = d.match(/\/Date\((\d+)\)\//);
              if (m) {
                try { return new Date(Number(m[1])).toLocaleDateString('vi-VN'); } catch { return d; }
              }
              if (d.length >= 8 && /^\d{8}/.test(d)) {
                return `${d.substring(6, 8)}/${d.substring(4, 6)}/${d.substring(0, 4)}`;
              }
              return d;
            };

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Laptop size={18} color="#1d4ed8" />
                    Tổng Quan Phần Cứng & Hệ Điều Hành
                  </div>
                  <div style={{ fontSize: 13, color: '#475569' }}>
                    {osItem?.Caption || 'Windows'} ({osItem?.OSArchitecture || '64-bit'}) · Build {osItem?.BuildNumber || 'N/A'} · Thiết bị: <strong>{hwData?.ComputerName || 'PC'}</strong>
                  </div>
                  {hwError && (
                    <div style={{ marginTop: 10, padding: 10, background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: 13, border: '1px solid #fecaca' }}>
                      ⚠️ {hwError}
                    </div>
                  )}
                </div>

                {/* Grid cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
                  
                  {/* CPU Card */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1d4ed8', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Cpu size={16} /> Vi Xử Lý (CPU)
                      </div>
                      {cpuList.length > 1 && (
                        <span style={{ fontSize: 11, background: '#dbeafe', color: '#1d4ed8', padding: '1px 8px', borderRadius: 4, fontWeight: 700 }}>
                          Dual Socket ({cpuList.length} CPU)
                        </span>
                      )}
                    </div>
                    {cpuItem ? (
                      <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div><strong>Model:</strong> {cpuList.length > 1 ? `${cpuList.length}x ${cpuItem.Name}` : cpuItem.Name}</div>
                        <div>
                          <strong>Tổng nhân / Luồng:</strong>{' '}
                          <span style={{ color: '#1d4ed8', fontWeight: 800 }}>
                            {totalCpuCores > 0 ? totalCpuCores : cpuItem.NumberOfCores} Cores / {totalCpuThreads > 0 ? totalCpuThreads : cpuItem.NumberOfLogicalProcessors} Threads
                          </span>
                        </div>
                        <div>
                          <strong>Xung nhịp:</strong> {
                            cpuItem.Name?.includes('@')
                              ? `${cpuItem.Name.split('@')[1]?.trim()} (Hiện tại: ${(cpuItem.CurrentClockSpeed / 1000).toFixed(2)} GHz)`
                              : `${(cpuItem.MaxClockSpeed / 1000).toFixed(2)} GHz`
                          }
                        </div>
                        <div><strong>Mức tải:</strong> {cpuItem.LoadPercentage}%</div>
                        {cpuList.length > 1 && (
                          <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: 6, fontSize: 11.5, border: '1px solid #e2e8f0', marginTop: 2 }}>
                            {cpuList.map((c: any, idx: number) => (
                              <div key={idx} style={{ color: '#334155', marginTop: idx > 0 ? 3 : 0 }}>
                                • <strong>Socket {idx + 1} ({c.SocketDesignation || `CPU ${idx + 1}`}):</strong> {c.NumberOfCores} Cores / {c.NumberOfLogicalProcessors} Threads
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : <div>Đang đọc thông số CPU...</div>}
                  </div>

                  {/* RAM Card */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#16a34a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Zap size={16} /> Bộ Nhớ Trong (RAM)
                    </div>
                    {physRamGB > 0 || ramList.length > 0 ? (
                      <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div>
                          <strong>Tổng dung lượng:</strong> {physRamGB} GB
                          {hwReservedMB > 0 && (
                            <span style={{ fontSize: 11.5, color: '#64748b', marginLeft: 6 }}>
                              (Khả dụng: {visRamGB} GB · Phần cứng: {hwReservedMB} MB)
                            </span>
                          )}
                        </div>
                        {freeRam > 0 && <div><strong>Khả dụng (Trống):</strong> {freeRam} GB</div>}
                        {visRamGB > 0 && freeRam > 0 && (
                          <div><strong>Đang dùng:</strong> {usedRam} GB ({usedRamPct}%)</div>
                        )}
                        <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 6, marginTop: 4 }}>
                          {isRowOfChips ? (
                            <div style={{ background: '#f0fdf4', padding: '7px 10px', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 12 }}>
                              <div style={{ fontWeight: 700, color: '#166534' }}>⚡ RAM Onboard (Hàn Bo Mạch - Row of chips)</div>
                              <div style={{ color: '#15803d', marginTop: 2 }}>
                                Cấu hình: {ramList.length} chip nhớ x {ramList[0]?.CapacityGB || 2} GB · {ramSpeed} MHz LPDDR4x
                              </div>
                            </div>
                          ) : (
                            <>
                              <strong>Chi tiết khe cắm ({ramList.length} thanh):</strong>
                              {ramList.map((m: any, idx: number) => {
                                const mfg = m.Manufacturer && m.Manufacturer !== 'OEM' ? ` (${m.Manufacturer})` : '';
                                const part = m.PartNumber ? ` · ${m.PartNumber}` : '';
                                return (
                                  <div key={idx} style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                                    • Khe {m.DeviceLocator || `${idx + 1}`}: {m.CapacityGB} GB · {m.SpeedMHz || 'N/A'} MHz{mfg}{part}
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </div>
                      </div>
                    ) : <div>Đang đọc RAM...</div>}
                  </div>

                  {/* GPU Card */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#7c3aed', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Monitor size={16} /> Card Đồ Họa (GPU)
                    </div>
                    {gpuList.length > 0 ? gpuList.map((gpu: any, idx: number) => {
                      const cleanMode = (gpu.VideoModeDescription || 'N/A')
                        .replace(/x\s*4294967296\s*colors/i, '(32-bit Màu)')
                        .replace(/x\s*16777216\s*colors/i, '(24-bit Màu)');
                      return (
                        <div key={idx} style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8, paddingBottom: 8, borderBottom: idx < gpuList.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                          <div><strong>GPU {idx + 1}:</strong> {gpu.Name}</div>
                          <div><strong>VRAM:</strong> {gpu.VRAM_GB > 0 ? `${gpu.VRAM_GB} GB` : 'Share / Dynamic'}</div>
                          <div><strong>Driver:</strong> {gpu.DriverVersion || 'Mặc định'}</div>
                          <div><strong>Màn hình:</strong> {cleanMode} ({gpu.CurrentRefreshRate || 60}Hz)</div>
                        </div>
                      );
                    }) : <div>Đang đọc GPU...</div>}
                  </div>

                  {/* Bo Mạch & BIOS */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#d97706', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Wrench size={16} /> Bo Mạch Chủ & BIOS
                    </div>
                    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div><strong>Hãng sản xuất:</strong> {hwData?.Mainboard?.Manufacturer || 'OEM'}</div>
                      <div><strong>Bo mạch:</strong> {hwData?.Mainboard?.Product || 'N/A'}</div>
                      <div><strong>Serial Bo Mạch:</strong> {hwData?.Mainboard?.SerialNumber || 'N/A'}</div>
                      <div><strong>Phiên bản BIOS:</strong> {hwData?.BIOS?.SMBIOSBIOSVersion || 'N/A'}</div>
                      <div><strong>Ngày BIOS:</strong> {formatBiosDate(hwData?.BIOS?.ReleaseDate)}</div>
                    </div>
                  </div>

                  {/* Lưu Trữ */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0284c7', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <HardDrive size={16} /> Lưu Trữ & Ổ Đĩa
                    </div>
                    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Danh sách ổ cứng vật lý */}
                      {hwData?.Disks && hwData.Disks.length > 0 && (
                        <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
                            Ổ Cứng Vật Lý ({hwData.Disks.length} ổ):
                          </div>
                          {hwData.Disks.map((d: any, dIdx: number) => {
                            const isSSD = (d.MediaType && d.MediaType.toUpperCase().includes('SSD')) || d.Model?.toUpperCase().includes('SSD');
                            const isHealthy = !d.HealthStatus || d.HealthStatus === 'Healthy' || d.HealthStatus === 'OK';
                            return (
                              <div key={dIdx} style={{ fontSize: 12, color: '#0f172a', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{
                                    fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
                                    background: isSSD ? '#ede9fe' : '#ffedd5',
                                    color: isSSD ? '#6d28d9' : '#c2410c',
                                    border: `1px solid ${isSSD ? '#ddd6fe' : '#fed7aa'}`
                                  }}>
                                    {isSSD ? 'SSD' : 'HDD'}
                                  </span>
                                  <span style={{ fontWeight: 600 }}>{d.Model}</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  {d.SizeGB} GB · {d.InterfaceType || 'SATA'} ·{' '}
                                  <span style={{ color: isHealthy ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                                    {isHealthy ? '✓ Tốt' : '⚠ Cảnh báo'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Danh sách phân vùng */}
                      {volList.map((v: any, i: number) => {
                        const isCloud = v.IsCloud || v.VolumeName?.includes('Google Drive') || v.VolumeName?.includes('OneDrive');
                        return (
                          <div key={i} style={{ background: isCloud ? '#f8fafc' : 'transparent', padding: isCloud ? '4px 6px' : 0, borderRadius: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                              <span>
                                <strong>Ổ {v.DeviceID}</strong> {v.VolumeName?.trim() ? `[${v.VolumeName.trim()}]` : ''}
                                {isCloud && <span style={{ marginLeft: 5, fontSize: 10.5, color: '#0284c7', fontWeight: 700 }}>☁️ Đám Mây</span>}
                              </span>
                              <span>Còn trống {v.FreeGB} GB / {v.TotalGB} GB</span>
                            </div>
                            <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${v.PercentUsed}%`, background: isCloud ? '#0ea5e9' : (v.PercentUsed > 85 ? '#dc2626' : '#1d4ed8') }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pin & Mạng */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#059669', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BatteryCharging size={16} /> Nguồn Pin & Mạng LAN/Wi-Fi
                    </div>
                    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {battItem ? (
                        <div>
                          <strong>Pin:</strong> Mức pin {battItem.EstimatedChargeRemaining}%
                          {battItem.WearPercent !== undefined && battItem.WearPercent >= 0 && (
                            <span style={{ marginLeft: 6, color: battItem.WearPercent > 25 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                              · Độ chai: {battItem.WearPercent}% {battItem.DesignCapacity > 0 ? `(${Math.round(battItem.FullChargeCapacity / 1000)}/${Math.round(battItem.DesignCapacity / 1000)} Wh)` : ''}
                            </span>
                          )}
                        </div>
                      ) : <div><strong>Pin:</strong> Máy để bàn (PC)</div>}
                      <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 6, marginTop: 4 }}>
                        {netItem ? (
                          <>
                            <div><strong>IP Nội bộ:</strong> {netItem.IPAddress || 'N/A'}</div>
                            <div><strong>Địa chỉ MAC:</strong> {netItem.MACAddress || 'N/A'}</div>
                            <div><strong>Bộ điều hợp:</strong> {netItem.Description || 'N/A'}</div>
                          </>
                        ) : <div>Đang đọc thông tin mạng...</div>}
                      </div>
                    </div>
                  </div>

                  {/* Bản Quyền Windows & Office */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Award size={16} /> Bản Quyền Windows & Office
                      </div>
                      <button
                        onClick={handleCheckLicense}
                        disabled={isLoadingLicense}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px',
                          borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer'
                        }}
                        title="Quét lại bản quyền"
                      >
                        <RefreshCw size={12} className={isLoadingLicense ? 'spin' : ''} />
                        {isLoadingLicense ? 'Đang đọc...' : 'Kiểm tra'}
                      </button>
                    </div>
                    {licenseData ? (
                      <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>Windows OS</span>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                              background: licenseData.windows?.typeBg || (licenseData.windows?.isActivated ? '#dcfce7' : '#fee2e2'),
                              color: licenseData.windows?.typeColor || (licenseData.windows?.isActivated ? '#15803d' : '#b91c1c'),
                              border: `1px solid ${licenseData.windows?.typeColor ? licenseData.windows.typeColor + '33' : 'transparent'}`
                            }}>
                              {licenseData.windows?.typeLabel || (licenseData.windows?.isActivated ? (licenseData.windows?.isPermanent ? '✓ Vĩnh Viễn' : '✓ Kích Hoạt') : '✗ Chưa Kích Hoạt')}
                            </span>
                          </div>
                          <div style={{ color: '#475569', fontSize: 11.5, fontWeight: 600 }}>
                            {licenseData.windows?.edition || 'Windows'}
                            {licenseData.windows?.partialKey && (
                              <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 5, fontSize: 11 }}>
                                (Đuôi Key: <code>{licenseData.windows.partialKey}</code>)
                              </span>
                            )}
                          </div>
                          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                            Kênh: {licenseData.windows?.channel || 'Unknown'} · Hạn: {licenseData.windows?.expireDate || licenseData.windows?.expiration || 'N/A'}
                          </div>
                          {licenseData.windows?.verdictNote && (
                            <div style={{
                              fontSize: 10.5, marginTop: 5, padding: '4px 8px', borderRadius: 4,
                              background: licenseData.windows?.licenseType === 'CRACK_KMS' ? '#fff7ed' : licenseData.windows?.licenseType === 'DIGITAL_MAS' ? '#f5f3ff' : '#f0fdf4',
                              color: licenseData.windows?.licenseType === 'CRACK_KMS' ? '#c2410c' : licenseData.windows?.licenseType === 'DIGITAL_MAS' ? '#4338ca' : '#15803d',
                              borderLeft: `3px solid ${licenseData.windows?.licenseType === 'CRACK_KMS' ? '#f97316' : licenseData.windows?.licenseType === 'DIGITAL_MAS' ? '#6366f1' : '#22c55e'}`
                            }}>
                              ℹ <strong>Đánh giá:</strong> {licenseData.windows.verdictNote}
                            </div>
                          )}
                        </div>

                        <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>Microsoft Office</span>
                            {licenseData.office?.hasOffice ? (
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                                background: licenseData.office?.typeBg || (licenseData.office?.isActivated ? '#dcfce7' : '#fee2e2'),
                                color: licenseData.office?.typeColor || (licenseData.office?.isActivated ? '#15803d' : '#b91c1c'),
                                border: `1px solid ${licenseData.office?.typeColor ? licenseData.office.typeColor + '33' : 'transparent'}`
                              }}>
                                {licenseData.office?.typeLabel || (licenseData.office?.isActivated ? '✓ Đã Kích Hoạt' : '✗ Hết Hạn / Chưa Active')}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Chưa cài Office</span>
                            )}
                          </div>
                          {licenseData.office?.hasOffice ? (
                            <>
                              <div style={{ color: '#475569', fontSize: 11.5, fontWeight: 600 }}>{licenseData.office?.name || 'Office Suite'}</div>
                              <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                                Hạn dùng: {licenseData.office?.remainingDays || 'N/A'}
                              </div>
                              {licenseData.office?.verdictNote && (
                                <div style={{
                                  fontSize: 10.5, marginTop: 5, padding: '4px 8px', borderRadius: 4,
                                  background: licenseData.office?.licenseType === 'CRACK_KMS' ? '#fff1f2' : '#f0fdf4',
                                  color: licenseData.office?.licenseType === 'CRACK_KMS' ? '#be123c' : '#15803d',
                                  borderLeft: `3px solid ${licenseData.office?.licenseType === 'CRACK_KMS' ? '#f43f5e' : '#22c55e'}`
                                }}>
                                  ℹ <strong>Đánh giá:</strong> {licenseData.office.verdictNote}
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{ color: '#64748b', fontSize: 11 }}>Không tìm thấy bản Office cục bộ</div>
                          )}
                        </div>

                        {/* OEM Product Key từ BIOS */}
                        <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <Key size={13} color="#d97706" /> Product Key Gốc (OEM / BIOS)
                            </span>
                            <button
                              onClick={handleGetOemKey}
                              disabled={isLoadingOemKey}
                              style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                            >
                              {isLoadingOemKey ? 'Đang đọc...' : 'Đọc Key'}
                            </button>
                          </div>
                          {oemKeyData?.key ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                              <code style={{ fontSize: 11, fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '3px 8px', borderRadius: 4, letterSpacing: '0.5px' }}>
                                {oemKeyData.key}
                              </code>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(oemKeyData.key);
                                  setCopiedOemKey(true);
                                  setTimeout(() => setCopiedOemKey(false), 2000);
                                }}
                                style={{
                                  padding: '3px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #cbd5e1',
                                  background: copiedOemKey ? '#dcfce7' : '#fff',
                                  color: copiedOemKey ? '#15803d' : '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3
                                }}
                              >
                                {copiedOemKey ? <Check size={12} /> : <Copy size={12} />}
                                {copiedOemKey ? 'Đã chép' : 'Chép'}
                              </button>
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {oemKeyData ? 'Không tìm thấy Key nhúng trong BIOS (Thường gặp ở PC lắp ráp)' : 'Nhấn "Đọc Key" để trích xuất Key bản quyền'}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: '12px 0' }}>
                        {isLoadingLicense ? 'Đang truy vấn slmgr & ospp.vbs...' : 'Nhấn "Kiểm tra" để đọc bản quyền'}
                      </div>
                    )}
                  </div>

                  {/* CPU Stress Test Card */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#ea580c', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Flame size={16} color="#ea580c" /> Ép Tải CPU (Stress Test 60s)
                      </div>
                      {isCpuStressing && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: 6 }}>
                          🔥 Đang ép tải {stressSecondsLeft}s
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.4 }}>
                      Ép tải 100% tất cả luồng xử lý CPU qua Web Worker đa luồng để kiểm tra hiệu năng tản nhiệt, độ ổn định và phát hiện quá nhiệt.
                    </div>

                    {isCpuStressing && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          <span>Tiến trình test tản nhiệt</span>
                          <span style={{ color: '#dc2626' }}>{stressSecondsLeft} giây còn lại</span>
                        </div>
                        <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.round(((60 - stressSecondsLeft) / 60) * 100)}%`,
                            background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      {!isCpuStressing ? (
                        <button
                          onClick={() => startCpuStressTest(60)}
                          style={{
                            flex: 1, padding: '8px 14px', borderRadius: 8, border: 'none',
                            background: 'linear-gradient(135deg, #ea580c, #dc2626)', color: '#fff',
                            fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer'
                          }}
                        >
                          <Flame size={15} /> Bắt Đầu Ép Tải 60 Giây
                        </button>
                      ) : (
                        <button
                          onClick={stopCpuStressTest}
                          style={{
                            flex: 1, padding: '8px 14px', borderRadius: 8, border: 'none',
                            background: '#dc2626', color: '#fff',
                            fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer'
                          }}
                        >
                          <X size={15} /> Dừng Ngay Lập Tức
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}

          {/* PHÂN HỆ KIỂM TRA & QUẢN LÝ DRIVER (PNP DIAGNOSTICS & DRIVER STORE) */}
          {activeSubTab === 'driver_manager' && (() => {
            const getErrorCodeDesc = (code: number) => {
              switch (code) {
                case 1: return 'Code 1: Thiết bị chưa được cấu hình đúng';
                case 3: return 'Code 3: Driver của thiết bị này có thể bị hỏng';
                case 10: return 'Code 10: Thiết bị không thể khởi động (Lỗi phần cứng hoặc xung đột)';
                case 14: return 'Code 14: Cần khởi động lại máy để hoàn tất cài đặt driver';
                case 18: return 'Code 18: Cần cài đặt lại Driver cho thiết bị này';
                case 22: return 'Code 22: Thiết bị hiện đang bị vô hiệu hóa (Disabled)';
                case 28: return 'Code 28: Thiết bị chưa được cài đặt Driver (Thiếu Driver)';
                case 31: return 'Code 31: Windows không thể tải Driver cho thiết bị này';
                case 39: return 'Code 39: Windows không thể nạp tệp Driver vào bộ nhớ';
                case 43: return 'Code 43: Thiết bị bị dừng vì báo cáo lỗi phần cứng hoặc Driver bị crash';
                case 45: return 'Code 45: Thiết bị hiện không kết nối với máy tính';
                case 52: return 'Code 52: Driver không có chữ ký số xác thực hợp lệ';
                default: return `Mã lỗi Code ${code}: Cần kiểm tra lại thiết bị trong Device Manager`;
              }
            };

            const getClassBadge = (className: string) => {
              const c = (className || '').toUpperCase();
              if (['DISPLAY', 'MONITOR'].includes(c)) return { label: 'Đồ Họa / Màn Hình', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
              if (['NET'].includes(c)) return { label: 'Card Mạng / Wi-Fi', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' };
              if (['MEDIA', 'AUDIOENDPOINT'].includes(c)) return { label: 'Âm Thanh / Media', bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff' };
              if (['CAMERA', 'IMAGE'].includes(c)) return { label: 'Camera / Hình Ảnh', bg: '#fdf2f8', color: '#be185d', border: '#fbcfe8' };
              if (['USB'].includes(c)) return { label: 'Cổng USB & Hub', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' };
              if (['PORTS'].includes(c)) return { label: 'Cổng COM / LPT', bg: '#fefce8', color: '#a16207', border: '#fef08a' };
              if (['DISKDRIVE', 'SCSIADAPTER', 'HDC', 'VOLUME'].includes(c)) return { label: 'Ổ Đĩa / Lưu Trữ', bg: '#ecfeff', color: '#0e7490', border: '#a5f3fc' };
              if (['HIDCLASS', 'KEYBOARD', 'MOUSE'].includes(c)) return { label: 'Bàn Phím & Chuột', bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe' };
              if (['PRINTQUEUE', 'PRINTER'].includes(c)) return { label: 'Máy In / Spooler', bg: '#f8fafc', color: '#475569', border: '#cbd5e1' };
              if (['PROCESSOR'].includes(c)) return { label: 'Vi Xử Lý (CPU Core)', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
              return { label: className || 'Khác', bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
            };

            const filteredDrivers = driverList.filter(d => {
              if (driverCategory === 'DISPLAY' && !['DISPLAY', 'MONITOR'].includes((d.Class || '').toUpperCase())) return false;
              if (driverCategory === 'NET' && !['NET'].includes((d.Class || '').toUpperCase())) return false;
              if (driverCategory === 'MEDIA' && !['MEDIA', 'AUDIOENDPOINT'].includes((d.Class || '').toUpperCase())) return false;
              if (driverCategory === 'USB_PORTS' && !['USB', 'PORTS'].includes((d.Class || '').toUpperCase())) return false;
              if (driverCategory === 'CAMERA' && !['CAMERA', 'IMAGE'].includes((d.Class || '').toUpperCase())) return false;
              if (driverCategory === 'STORAGE' && !['DISKDRIVE', 'SCSIADAPTER', 'HDC', 'VOLUME'].includes((d.Class || '').toUpperCase())) return false;
              if (driverCategory === 'INPUT' && !['HIDCLASS', 'KEYBOARD', 'MOUSE'].includes((d.Class || '').toUpperCase())) return false;
              if (driverCategory === 'PRINT' && !['PRINTQUEUE', 'PRINTER'].includes((d.Class || '').toUpperCase())) return false;
              if (driverCategory === 'SYSTEM' && !['SYSTEM', 'PROCESSOR', 'FIRMWARE', 'COMPUTER'].includes((d.Class || '').toUpperCase())) return false;

              if (driverSearch.trim()) {
                const q = driverSearch.toLowerCase();
                const matchName = (d.Name || '').toLowerCase().includes(q);
                const matchMfg = (d.Manufacturer || '').toLowerCase().includes(q);
                const matchHw = (d.HardwareId || '').toLowerCase().includes(q);
                const matchClass = (d.Class || '').toLowerCase().includes(q);
                const matchInf = (d.InfName || '').toLowerCase().includes(q);
                return matchName || matchMfg || matchHw || matchClass || matchInf;
              }
              return true;
            });

            const displayedDrivers = filteredDrivers.slice(0, driverDisplayLimit);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200 }}>
                {/* Header & Công cụ 1-Click */}
                <div style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  padding: '20px 24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 16
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <Server size={22} color="#1d4ed8" />
                      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                        Kiểm Tra & Quản Lý Driver Hệ Thống (PnP Diagnostics)
                      </h2>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                        background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe'
                      }}>
                        v6.6.1 Professional
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                      Phát hiện thiết bị thiếu driver (chấm than vàng), sao lưu driver OEM và nạp gói cài đặt .INF chuẩn Microsoft
                    </p>
                  </div>

                  {/* Thanh công cụ 1-Click */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={handleScanHardwareChanges}
                      disabled={isScanningHardware || isLoadingDrivers}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 8,
                        background: '#f8fafc', border: '1px solid #cbd5e1',
                        color: '#1e293b', fontSize: 13, fontWeight: 600,
                        cursor: isScanningHardware ? 'not-allowed' : 'pointer'
                      }}
                      title="Quét lại toàn bộ phần cứng mới cắm vào máy"
                    >
                      <RefreshCw size={15} className={isScanningHardware ? 'animate-spin' : ''} color="#1d4ed8" />
                      {isScanningHardware ? 'Đang Quét...' : 'Quét Lại PnP'}
                    </button>

                    <button
                      onClick={() => (window as any).electronAPI?.pcTools?.launchExternal?.('devmgmt')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 8,
                        background: '#f8fafc', border: '1px solid #cbd5e1',
                        color: '#1e293b', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                      }}
                      title="Mở trình quản lý thiết bị Device Manager của Windows"
                    >
                      <ExternalLink size={15} color="#475569" />
                      Device Manager
                    </button>

                    <button
                      onClick={handleExportDriverStore}
                      disabled={isExportingDrivers}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 8,
                        background: '#059669', border: '1px solid #047857',
                        color: '#fff', fontSize: 13, fontWeight: 600,
                        cursor: isExportingDrivers ? 'not-allowed' : 'pointer'
                      }}
                      title="Sao lưu toàn bộ Driver OEM của máy ra thư mục để dành cài lại Win"
                    >
                      <FolderArchive size={15} color="#fff" />
                      {isExportingDrivers ? 'Đang Xuất Driver...' : 'Sao Lưu Driver Máy'}
                    </button>

                    <button
                      onClick={handleInstallInf}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 8,
                        background: '#1d4ed8', border: '1px solid #1e40af',
                        color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                      }}
                      title="Chọn và nạp file .INF driver vào máy tính"
                    >
                      <File size={15} color="#fff" />
                      Cài Driver (.INF)
                    </button>

                    <button
                      onClick={handleRestartNetAdapter}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 8,
                        background: '#f1f5f9', border: '1px solid #cbd5e1',
                        color: '#334155', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                      }}
                      title="Khởi động lại card mạng để sửa lỗi mạng"
                    >
                      <Wifi size={15} color="#0284c7" />
                      Reset Mạng
                    </button>
                  </div>
                </div>

                {/* Thông báo thao tác */}
                {driverActionMsg && (
                  <div style={{
                    padding: '12px 16px', borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: driverActionMsg.type === 'success' ? '#f0fdf4' : driverActionMsg.type === 'error' ? '#fef2f2' : '#f0f9ff',
                    border: `1px solid ${driverActionMsg.type === 'success' ? '#bbf7d0' : driverActionMsg.type === 'error' ? '#fecaca' : '#bae6fd'}`,
                    color: driverActionMsg.type === 'success' ? '#15803d' : driverActionMsg.type === 'error' ? '#b91c1c' : '#0369a1',
                    fontSize: 13, fontWeight: 600
                  }}>
                    <span>{driverActionMsg.text}</span>
                    <button
                      onClick={() => setDriverActionMsg(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* 4 Thẻ chỉ số tổng quan */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                  {/* Card 1: Lỗi / Thiếu */}
                  <div style={{
                    background: problemDevices.length > 0 ? '#fef2f2' : '#fff',
                    border: `1px solid ${problemDevices.length > 0 ? '#f87171' : '#e2e8f0'}`,
                    borderRadius: 12, padding: 18,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Thiết Bị Lỗi / Thiếu Driver</span>
                      {problemDevices.length > 0 ? (
                        <ShieldAlert size={22} color="#dc2626" />
                      ) : (
                        <CheckCircle2 size={22} color="#16a34a" />
                      )}
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: problemDevices.length > 0 ? '#dc2626' : '#16a34a', marginBottom: 4 }}>
                      {isLoadingDrivers ? '...' : `${problemDevices.length} Thiết bị`}
                    </div>
                    <div style={{ fontSize: 12, color: problemDevices.length > 0 ? '#b91c1c' : '#15803d', fontWeight: 600 }}>
                      {problemDevices.length > 0 ? '⚠️ Cần cài đặt bổ sung driver' : '✓ 100% phần cứng đã nhận đủ driver'}
                    </div>
                  </div>

                  {/* Card 2: Tổng số driver */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Tổng Driver Phần Cứng</span>
                      <HardDrive size={22} color="#0284c7" />
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
                      {isLoadingDrivers ? '...' : `${totalDriverCount || driverList.length} Driver`}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Đang đăng ký & nạp trong Driver Store
                    </div>
                  </div>

                  {/* Card 3: Driver ký số */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Driver Đã Ký Số WHQL</span>
                      <ShieldCheck size={22} color="#7c3aed" />
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#7c3aed', marginBottom: 4 }}>
                      {isLoadingDrivers ? '...' : `${driverList.filter(d => d.IsSigned).length} Driver`}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Chữ ký số Microsoft / OEM chính hãng
                    </div>
                  </div>

                  {/* Card 4: Trạng thái Bus PnP */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Trạng Thái PnP Bus</span>
                      <Cpu size={22} color="#059669" />
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: problemDevices.length === 0 ? '#16a34a' : '#d97706', marginBottom: 4 }}>
                      {problemDevices.length === 0 ? 'Hoạt Động Tốt' : 'Cảnh Báo'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Plug and Play Service: Sẵn sàng
                    </div>
                  </div>
                </div>

                {/* Khu vực Cảnh Báo Thiết Bị Lỗi / Thiếu Driver (Yellow Bang) */}
                {problemDevices.length > 0 ? (
                  <div style={{
                    background: '#fff5f5',
                    border: '2px solid #ef4444',
                    borderRadius: 12,
                    padding: 20,
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.1)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <AlertTriangle size={24} color="#dc2626" />
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#991b1b', margin: 0 }}>
                          PHÁT HIỆN {problemDevices.length} THIẾT BỊ ĐANG BỊ LỖI HOẶC CHƯA CÓ DRIVER
                        </h3>
                        <p style={{ fontSize: 13, color: '#7f1d1d', margin: 0 }}>
                          Các thiết bị dưới đây đang có dấu chấm than vàng trong Device Manager. Bạn có thể sao chép Hardware ID hoặc tra cứu trực tiếp trên Google để tải đúng Driver.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {problemDevices.map((prob, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: '#fff',
                            border: '1px solid #fca5a5',
                            borderRadius: 10,
                            padding: '12px 16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 12
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                              {prob.Name || 'Thiết bị không xác định'}
                            </div>
                            <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>
                              {getErrorCodeDesc(prob.ErrorCode)}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                              Hardware ID: {prob.InstanceId}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              onClick={() => copyToClipboard(prob.InstanceId)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '6px 12px', borderRadius: 6,
                                background: '#f1f5f9', border: '1px solid #cbd5e1',
                                fontSize: 12, fontWeight: 600, color: '#334155', cursor: 'pointer'
                              }}
                            >
                              {copiedHwId === prob.InstanceId ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                              {copiedHwId === prob.InstanceId ? 'Đã chép ID' : 'Chép Hardware ID'}
                            </button>

                            <button
                              onClick={() => {
                                const url = `https://www.google.com/search?q=${encodeURIComponent((prob.Name || '') + ' ' + prob.InstanceId + ' driver windows')}`;
                                (window as any).electronAPI?.pcTools?.openDownloadUrl?.(url);
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '6px 12px', borderRadius: 6,
                                background: '#1d4ed8', border: 'none',
                                fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer'
                              }}
                            >
                              <Search size={14} />
                              Tra Cứu Driver Google
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 12,
                    padding: '14px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    color: '#166534'
                  }}>
                    <CheckCircle2 size={24} color="#16a34a" />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        Trạng Thái Hoàn Hảo: 100% Thiết Bị Đều Nhận Đủ Driver!
                      </div>
                      <div style={{ fontSize: 12, color: '#15803d' }}>
                        Hệ thống không phát hiện bất kỳ thiết bị nào bị lỗi hoặc có dấu chấm than vàng trong Windows Device Manager.
                      </div>
                    </div>
                  </div>
                )}

                {/* Thanh tìm kiếm & Bộ lọc phân loại */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14
                }}>
                  {/* Ô tìm kiếm */}
                  <div style={{ position: 'relative', width: '100%' }}>
                    <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      value={driverSearch}
                      onChange={e => {
                        setDriverSearch(e.target.value);
                        setDriverDisplayLimit(60);
                      }}
                      placeholder="Tìm kiếm theo tên thiết bị, hãng sản xuất (Intel, Realtek, NVIDIA...), tên file .inf hoặc Hardware ID..."
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 42px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13.5,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {driverSearch && (
                      <button
                        onClick={() => setDriverSearch('')}
                        style={{
                          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8'
                        }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* Pills lọc danh mục */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { id: 'ALL', label: `Tất Cả (${driverList.length})` },
                      { id: 'DISPLAY', label: '🖥️ Đồ Họa & Màn Hình' },
                      { id: 'NET', label: '🌐 Card Mạng & Wi-Fi' },
                      { id: 'MEDIA', label: '🔊 Âm Thanh & Media' },
                      { id: 'CAMERA', label: '📷 Camera & Hình Ảnh' },
                      { id: 'STORAGE', label: '💾 Ổ Đĩa & Controller' },
                      { id: 'USB_PORTS', label: '🔌 Cổng USB & COM' },
                      { id: 'INPUT', label: '⌨️ Phím, Chuột & HID' },
                      { id: 'PRINT', label: '🖨️ Máy In' },
                      { id: 'SYSTEM', label: '⚙️ Bo Mạch & Chipset' },
                    ].map(tab => {
                      const isActive = driverCategory === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            setDriverCategory(tab.id);
                            setDriverDisplayLimit(60);
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 20,
                            fontSize: 12.5,
                            fontWeight: isActive ? 700 : 500,
                            cursor: 'pointer',
                            border: isActive ? '1px solid #1d4ed8' : '1px solid #e2e8f0',
                            background: isActive ? '#eff6ff' : '#f8fafc',
                            color: isActive ? '#1d4ed8' : '#475569',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bảng danh sách Driver chi tiết */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                  <div style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#334155' }}>
                      Danh Sách Driver Phần Cứng (Hiển thị {displayedDrivers.length} / {filteredDrivers.length} kết quả)
                    </span>
                    {isLoadingDrivers && (
                      <span style={{ fontSize: 12, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                        <RefreshCw size={14} className="animate-spin" /> Đang tải danh sách driver...
                      </span>
                    )}
                  </div>

                  {driverError ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
                      <AlertTriangle size={32} style={{ margin: '0 auto 10px' }} />
                      <div style={{ fontWeight: 700 }}>{driverError}</div>
                      <button
                        onClick={fetchDriverInfo}
                        style={{
                          marginTop: 12, padding: '6px 16px', borderRadius: 8,
                          background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600
                        }}
                      >
                        Thử Lại
                      </button>
                    </div>
                  ) : filteredDrivers.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                      <Search size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Không tìm thấy driver nào phù hợp với bộ lọc hiện tại</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>Thử xóa từ khóa tìm kiếm hoặc chọn danh mục khác</div>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                            <th style={{ padding: '12px 16px', width: '32%' }}>Thiết Bị & Nhà Sản Xuất</th>
                            <th style={{ padding: '12px 16px', width: '16%' }}>Phân Loại</th>
                            <th style={{ padding: '12px 16px', width: '16%' }}>Phiên Bản & Ngày</th>
                            <th style={{ padding: '12px 16px', width: '12%' }}>Chữ Ký Số</th>
                            <th style={{ padding: '12px 16px', width: '24%' }}>Hardware ID / Tệp INF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedDrivers.map((drv, i) => {
                            const badge = getClassBadge(drv.Class);
                            return (
                              <tr
                                key={i}
                                style={{
                                  borderBottom: '1px solid #f1f5f9',
                                  background: i % 2 === 0 ? '#fff' : '#fafafa',
                                  transition: 'background 0.1s ease'
                                }}
                              >
                                {/* Cột 1: Tên thiết bị & Nhà sản xuất */}
                                <td style={{ padding: '12px 16px' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                                    {drv.Name}
                                  </div>
                                  <div style={{ fontSize: 11.5, color: '#64748b' }}>
                                    {drv.Manufacturer || 'Hãng chuẩn Windows'}
                                  </div>
                                </td>

                                {/* Cột 2: Phân loại */}
                                <td style={{ padding: '12px 16px' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                    background: badge.bg,
                                    color: badge.color,
                                    border: `1px solid ${badge.border}`
                                  }}>
                                    {badge.label}
                                  </span>
                                </td>

                                {/* Cột 3: Phiên bản & Ngày */}
                                <td style={{ padding: '12px 16px' }}>
                                  <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                    {drv.Version || 'Mặc định'}
                                  </div>
                                  {drv.Date && (
                                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                                      {drv.Date}
                                    </div>
                                  )}
                                </td>

                                {/* Cột 4: Chữ ký số */}
                                <td style={{ padding: '12px 16px' }}>
                                  {drv.IsSigned ? (
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                      fontSize: 11, fontWeight: 700, color: '#16a34a',
                                      background: '#f0fdf4', padding: '2px 8px', borderRadius: 6,
                                      border: '1px solid #bbf7d0'
                                    }}>
                                      <Check size={12} /> WHQL
                                    </span>
                                  ) : (
                                    <span style={{
                                      fontSize: 11, fontWeight: 600, color: '#64748b',
                                      background: '#f1f5f9', padding: '2px 8px', borderRadius: 6
                                    }}>
                                      Tự ký / OEM
                                    </span>
                                  )}
                                </td>

                                {/* Cột 5: Hardware ID & Thao tác */}
                                <td style={{ padding: '12px 16px' }}>
                                  <div style={{
                                    fontSize: 11,
                                    fontFamily: 'monospace',
                                    color: '#475569',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 240,
                                    marginBottom: 4
                                  }} title={drv.HardwareId || drv.InfName}>
                                    {drv.HardwareId || drv.InfName || 'N/A'}
                                  </div>
                                  {drv.HardwareId && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <button
                                        onClick={() => copyToClipboard(drv.HardwareId)}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: 3,
                                          fontSize: 11, fontWeight: 600, padding: '2px 8px',
                                          borderRadius: 4, border: '1px solid #cbd5e1',
                                          background: '#fff', color: '#334155', cursor: 'pointer'
                                        }}
                                        title="Sao chép Hardware ID"
                                      >
                                        {copiedHwId === drv.HardwareId ? <Check size={11} color="#16a34a" /> : <Copy size={11} />}
                                        {copiedHwId === drv.HardwareId ? 'Đã chép' : 'Copy ID'}
                                      </button>
                                      <button
                                        onClick={() => {
                                          const url = `https://www.google.com/search?q=${encodeURIComponent(drv.Name + ' ' + drv.HardwareId + ' driver windows')}`;
                                          (window as any).electronAPI?.pcTools?.openDownloadUrl?.(url);
                                        }}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: 3,
                                          fontSize: 11, fontWeight: 600, padding: '2px 8px',
                                          borderRadius: 4, border: '1px solid #bfdbfe',
                                          background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer'
                                        }}
                                        title="Tra cứu Driver này trên Google"
                                      >
                                        <Search size={11} /> Tra cứu
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Nút xem thêm nếu danh sách còn nhiều */}
                  {filteredDrivers.length > driverDisplayLimit && (
                    <div style={{ padding: '14px', textAlign: 'center', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                      <button
                        onClick={() => setDriverDisplayLimit(prev => prev + 60)}
                        style={{
                          padding: '8px 20px', borderRadius: 8,
                          background: '#1d4ed8', color: '#fff', border: 'none',
                          fontWeight: 700, fontSize: 13, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 6
                        }}
                      >
                        Hiển Thị Thêm 60 Driver Tiếp Theo (Còn {filteredDrivers.length - driverDisplayLimit} Driver)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 2. THIẾT LẬP NHÃN OEM */}
          {activeSubTab === 'oem_custom' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24, maxWidth: 860 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Monitor size={18} color="#1d4ed8" />
                Thiết Lập Nhãn OEM & Thương Hiệu Máy Tính
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                Cập nhật thông tin nhà sản xuất, model và thông tin kỹ thuật hiển thị trong System Properties của Windows
              </div>

              <form onSubmit={handleSaveOem} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Hãng sản xuất (Manufacturer)</label>
                  <input
                    type="text"
                    value={oemForm.manufacturer}
                    onChange={e => setOemForm({ ...oemForm, manufacturer: e.target.value })}
                    placeholder="VD: DMH Computer, ASUS, Dell, HP..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Dòng máy / Model</label>
                  <input
                    type="text"
                    value={oemForm.model}
                    onChange={e => setOemForm({ ...oemForm, model: e.target.value })}
                    placeholder="VD: DMH Pro Workstation 2026..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Hotline hỗ trợ</label>
                    <input
                      type="text"
                      value={oemForm.supportPhone}
                      onChange={e => setOemForm({ ...oemForm, supportPhone: e.target.value })}
                      placeholder="VD: 1900 xxxx"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Thời gian hỗ trợ</label>
                    <input
                      type="text"
                      value={oemForm.supportHours}
                      onChange={e => setOemForm({ ...oemForm, supportHours: e.target.value })}
                      placeholder="VD: 24/7"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Website hỗ trợ</label>
                  <input
                    type="text"
                    value={oemForm.supportUrl}
                    onChange={e => setOemForm({ ...oemForm, supportUrl: e.target.value })}
                    placeholder="VD: https://dmh.vn"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <button type="submit" className="btn-primary" style={{ padding: '9px 20px', fontSize: 13, background: '#1d4ed8' }}>
                    Lưu Cấu Hình OEM
                  </button>
                  <button type="button" onClick={() => launchTool('sysdm')} className="btn-secondary" style={{ padding: '9px 14px', fontSize: 13 }}>
                    Xem Thuộc Tính Windows
                  </button>
                </div>

                {oemSaveStatus && (
                  <div style={{ padding: 10, background: '#f0fdf4', borderRadius: 8, color: '#166534', fontSize: 13, border: '1px solid #bbf7d0' }}>
                    {oemSaveStatus}
                  </div>
                )}
              </form>
            </div>
          )}

          {/* 3. TÀI KHOẢN & QUẢN TRỊ PC */}
          {activeSubTab === 'user_pc' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100 }}>
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>
                  🏷️ Đổi Tên Máy Tính Trong Mạng
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                  Tên máy hiện tại: <strong>{hwData?.ComputerName || 'PC'}</strong>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="text"
                    value={newComputerNameInput}
                    onChange={e => setNewComputerNameInput(e.target.value)}
                    placeholder="Nhập tên mới..."
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                  <button onClick={handleRenamePC} className="btn-primary" style={{ fontSize: 13, padding: '8px 18px', background: '#1d4ed8' }}>
                    Cập Nhật Tên Máy
                  </button>
                </div>
              </div>

              {/* Danh sách User */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                    👥 Quản Lý Người Dùng Windows ({users.length})
                  </div>
                  <button onClick={fetchUsers} disabled={isLoadingUsers} className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>
                    <RefreshCw size={12} className={isLoadingUsers ? 'spin' : ''} /> Làm mới
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '8px 10px' }}>Tên User</th>
                        <th style={{ padding: '8px 10px' }}>Quyền Hạn</th>
                        <th style={{ padding: '8px 10px' }}>Trạng Thái</th>
                        <th style={{ padding: '8px 10px' }}>Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.Name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>{u.Name}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: u.IsAdmin ? '#fee2e2' : '#f1f5f9', color: u.IsAdmin ? '#b91c1c' : '#475569', fontWeight: 600 }}>
                              {u.IsAdmin ? 'Quản Trị (Admin)' : 'Người dùng tiêu chuẩn'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: u.Disabled ? '#f3f4f6' : '#dcfce7', color: u.Disabled ? '#9ca3af' : '#15803d', fontWeight: 600 }}>
                              {u.Disabled ? 'Vô hiệu hóa' : 'Đang bật'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => { setChangePassUser(u.Name); setChangePassNew(''); }}
                              className="btn-secondary"
                              style={{ fontSize: 11, padding: '3px 8px' }}
                            >
                              Đổi mật khẩu
                            </button>
                            <button
                              onClick={() => handleToggleAccount(u.Name, u.Disabled)}
                              className="btn-secondary"
                              style={{ fontSize: 11, padding: '3px 8px', color: u.Disabled ? '#15803d' : '#b91c1c' }}
                            >
                              {u.Disabled ? 'Bật' : 'Khóa'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {changePassUser && (
                  <div style={{ marginTop: 14, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                      Đổi mật khẩu cho: <span style={{ color: '#1d4ed8' }}>{changePassUser}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={changePassNew}
                        onChange={e => setChangePassNew(e.target.value)}
                        placeholder="Nhập mật khẩu mới..."
                        style={{ flex: 1, padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                      <button onClick={() => handleChangePassword(changePassUser)} className="btn-primary" style={{ fontSize: 12, padding: '6px 14px', background: '#1d4ed8' }}>
                        Lưu Mật Khẩu
                      </button>
                      <button onClick={() => setChangePassUser('')} className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px' }}>
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Thêm User */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginBottom: 10 }}>
                  ➕ Tạo Tài Khoản Mới
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 10, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={e => setNewUserName(e.target.value)}
                    placeholder="Tên tài khoản..."
                    style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                  <input
                    type="password"
                    value={newUserPass}
                    onChange={e => setNewUserPass(e.target.value)}
                    placeholder="Mật khẩu..."
                    style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={newUserIsAdmin} onChange={e => setNewUserIsAdmin(e.target.checked)} />
                    Quyền Admin
                  </label>
                  <button onClick={handleCreateUser} className="btn-primary" style={{ fontSize: 13, padding: '8px 16px', background: '#16a34a' }}>
                    Tạo User
                  </button>
                </div>
              </div>

              {userMsg && (
                <div style={{ padding: 10, background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe', color: '#1e40af', fontSize: 13 }}>
                  {userMsg}
                </div>
              )}
            </div>
          )}

          {/* 4. ĐO TỐC ĐỘ Ổ ĐĨA (BENCHMARK) */}
          {activeSubTab === 'disk_benchmark' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24, maxWidth: 960 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} color="#1d4ed8" />
                Đo Tốc Độ Đọc / Ghi Ổ Đĩa (IO Benchmark)
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                Đo tốc độ tuần tự tuần hoàn thực tế trên phân vùng ổ đĩa (Sequential Read/Write MB/s)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 14, alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Phân vùng kiểm tra</label>
                  <select
                    value={selectedDrive}
                    onChange={e => setSelectedDrive(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                  >
                    {hwData?.Volumes?.map(v => (
                      <option key={v.DeviceID} value={v.DeviceID}>
                        Ổ {v.DeviceID} {v.VolumeName?.trim() ? `(${v.VolumeName.trim()})` : ''} · Trống {v.FreeGB} GB
                      </option>
                    )) || <option value="C:">Ổ C: (Mặc định)</option>}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Kích cỡ gói tin test</label>
                  <select
                    value={benchmarkSize}
                    onChange={e => setBenchmarkSize(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                  >
                    <option value={64}>64 MB (Tiêu chuẩn - Rất nhanh)</option>
                    <option value={128}>128 MB (Khuyên dùng)</option>
                    <option value={256}>256 MB (Độ chính xác cao)</option>
                    <option value={512}>512 MB (Chuyên sâu)</option>
                  </select>
                </div>

                <div style={{ paddingTop: 18 }}>
                  <button
                    onClick={handleRunBenchmark}
                    disabled={isBenchmarking}
                    className="btn-primary"
                    style={{ padding: '9px 22px', fontSize: 13, background: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {isBenchmarking ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                    {isBenchmarking ? 'Đang đo...' : 'Bắt Đầu Đo'}
                  </button>
                </div>
              </div>

              {benchmarkResult && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Tốc Độ Ghi (Write Speed)</div>
                    <div style={{ fontSize: 34, fontWeight: 900, color: '#15803d', margin: '8px 0' }}>
                      {benchmarkResult.writeSpeedMBps} <span style={{ fontSize: 14, fontWeight: 600 }}>MB/s</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#166534' }}>Gói tin test {benchmarkResult.sizeMB} MB trên ổ {benchmarkResult.drive}</div>
                  </div>

                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>Tốc Độ Đọc (Read Speed)</div>
                    <div style={{ fontSize: 34, fontWeight: 900, color: '#1d4ed8', margin: '8px 0' }}>
                      {benchmarkResult.readSpeedMBps} <span style={{ fontSize: 14, fontWeight: 600 }}>MB/s</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#1e40af' }}>Tốc độ đọc tuần tự từ ổ đĩa</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. CHẨN ĐOÁN TÍNH TOÀN VẸN */}
          {activeSubTab === 'laptop_check' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200 }}>
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Search size={18} color="#1d4ed8" />
                      Chẩn Đoán Tính Toàn Vẹn & Lịch Sử Thiết Bị
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      Đối chiếu số serial bo mạch, tình trạng pin zin/lô, số chu kỳ sạc và ngày BIOS để phát hiện linh kiện đã bị thay thế hoặc nạp lại firmware
                    </div>
                  </div>
                  <button
                    onClick={() => setShowExportReportModal(true)}
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 14px', background: '#059669', cursor: 'pointer' }}
                  >
                    <FileText size={15} /> Xuất Biên Bản Bàn Giao Máy
                  </button>
                </div>
              </div>

              {isLoadingLaptopHealth ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
                  Đang truy xuất thông số chuyên sâu...
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 14 }}>
                  
                  {/* Pin Health */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#059669', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BatteryCharging size={16} /> Đánh Giá Trạng Thái Pin
                    </div>
                    {laptopHealth?.Battery?.HasBattery ? (
                      <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div><strong>Model:</strong> {laptopHealth.Battery.DeviceName || 'Chính hãng'} ({laptopHealth.Battery.ManufactureName || 'OEM'})</div>
                        <div><strong>Dung lượng xuất xưởng:</strong> {laptopHealth.Battery.DesignedCapacity} mWh</div>
                        <div><strong>Dung lượng sạc đầy:</strong> {laptopHealth.Battery.FullChargedCapacity} mWh</div>
                        <div><strong>Độ chai pin:</strong> <span style={{ color: laptopHealth.Battery.WearPercent > 30 ? '#dc2626' : '#16a34a', fontWeight: 800 }}>{laptopHealth.Battery.WearPercent}%</span></div>
                        <div><strong>Số chu kỳ sạc:</strong> {laptopHealth.Battery.CycleCount} lần</div>
                        <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: laptopHealth.Battery.WearPercent < 20 ? '#f0fdf4' : '#fef2f2', fontSize: 12, color: laptopHealth.Battery.WearPercent < 20 ? '#166534' : '#991b1b' }}>
                          {laptopHealth.Battery.WearPercent < 20 ? '✓ Pin giữ dung lượng tốt, tỷ lệ chai thấp' : '⚠️ Pin có dấu hiệu chai, cân nhắc thay mới'}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: '#64748b' }}>Máy để bàn (PC) hoặc không kết nối Pin</div>
                    )}

                    {/* Nút Xuất Báo Cáo Pin Microsoft Chính Hãng */}
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                      <button
                        onClick={handleGenerateBatteryReport}
                        disabled={isGeneratingBatteryReport}
                        className="btn-secondary"
                        style={{
                          width: '100%', padding: '7px 12px', fontSize: 12, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', cursor: 'pointer', borderRadius: 6
                        }}
                      >
                        {isGeneratingBatteryReport ? <RefreshCw size={13} className="spin" /> : <FileText size={13} />}
                        {isGeneratingBatteryReport ? 'Đang trích xuất báo cáo pin Microsoft...' : 'Xuất Báo Cáo Pin Microsoft (Cycle Count HTML)'}
                      </button>
                      {batteryReportResult && (
                        <div style={{
                          marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 11.5,
                          background: batteryReportResult.ok ? '#f0fdf4' : '#fef2f2',
                          color: batteryReportResult.ok ? '#166534' : '#991b1b',
                          border: `1px solid ${batteryReportResult.ok ? '#bbf7d0' : '#fecaca'}`
                        }}>
                          {batteryReportResult.ok ? (
                            <div>
                              <div>✓ {batteryReportResult.message}</div>
                              {batteryReportResult.cycleCount && <div>• Số chu kỳ sạc (Cycle Count): <strong>{batteryReportResult.cycleCount} lần</strong></div>}
                            </div>
                          ) : (
                            <div>⚠️ {batteryReportResult.message || batteryReportResult.error}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Serial Integrity */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1d4ed8', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Shield size={16} /> Đối Chiếu Serial & Firmware
                    </div>
                    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>Serial BIOS:</span>
                        {(() => {
                          const s = laptopHealth?.BIOS?.SerialNumber || 'N/A';
                          const isDef = !s || ['default string', 'to be filled by o.e.m.', 'none', 'system serial number', '0123456789'].includes(s.toLowerCase().trim());
                          return isDef ? (
                            <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 4 }}>
                              Default string <span style={{ color: '#94a3b8' }}>(Mainboard DIY/OEM)</span>
                            </span>
                          ) : (
                            <code style={{ background: '#f0fdf4', color: '#166534', padding: '2px 8px', borderRadius: 4, fontWeight: 700, border: '1px solid #bbf7d0' }}>{s}</code>
                          );
                        })()}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>Serial Bo Mạch:</span>
                        {(() => {
                          const s = laptopHealth?.BaseBoard?.SerialNumber || 'N/A';
                          const isDef = !s || ['default string', 'to be filled by o.e.m.', 'none', 'system serial number', '0123456789'].includes(s.toLowerCase().trim());
                          return isDef ? (
                            <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 4 }}>
                              Default string <span style={{ color: '#94a3b8' }}>(Mainboard DIY/OEM)</span>
                            </span>
                          ) : (
                            <code style={{ background: '#f0fdf4', color: '#166534', padding: '2px 8px', borderRadius: 4, fontWeight: 700, border: '1px solid #bbf7d0' }}>{s}</code>
                          );
                        })()}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>Serial Khung Máy:</span>
                        {(() => {
                          const s = laptopHealth?.Chassis?.SerialNumber || 'N/A';
                          const isDef = !s || ['default string', 'to be filled by o.e.m.', 'none', 'system serial number', '0123456789'].includes(s.toLowerCase().trim());
                          return isDef ? (
                            <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 4 }}>
                              Default string <span style={{ color: '#94a3b8' }}>(Mainboard DIY/OEM)</span>
                            </span>
                          ) : (
                            <code style={{ background: '#f0fdf4', color: '#166534', padding: '2px 8px', borderRadius: 4, fontWeight: 700, border: '1px solid #bbf7d0' }}>{s}</code>
                          );
                        })()}
                      </div>

                      {laptopHealth?.SystemProduct?.UUID && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                          <span style={{ fontWeight: 600 }}>UUID Thiết Bị:</span>
                          <code style={{ background: '#f8fafc', color: '#334155', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                            {laptopHealth.SystemProduct.UUID}
                          </code>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>Ngày xuất xưởng BIOS:</span>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                          {(() => {
                            const raw = laptopHealth?.BIOS?.ReleaseDate;
                            if (!raw) return 'N/A';
                            const str = String(raw).trim();
                            if (str.startsWith('/Date(')) {
                              const ts = parseInt(str.replace(/[^0-9]/g, ''), 10);
                              if (!isNaN(ts)) {
                                const d = new Date(ts);
                                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                              }
                            }
                            return str;
                          })()}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>Ngày cài Windows:</span>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                          {(() => {
                            const raw = laptopHealth?.OS?.InstallDate;
                            if (!raw) return 'N/A';
                            const str = String(raw).trim();
                            if (str.startsWith('/Date(')) {
                              const ts = parseInt(str.replace(/[^0-9]/g, ''), 10);
                              if (!isNaN(ts)) {
                                const d = new Date(ts);
                                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                              }
                            }
                            return str;
                          })()}
                        </span>
                      </div>

                      <div style={{ marginTop: 4, paddingTop: 6, borderTop: '1px dashed #e2e8f0', fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                        💡 Lưu ý: Trên PC lắp ráp (DIY) hoặc main OEM, số serial mặc định là "Default string" do nhà sản xuất không khóa số seri cố định vào chip BIOS.
                      </div>
                    </div>
                  </div>

                  {/* RAM Modules */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#7c3aed', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Zap size={16} /> Đồng Bộ Module RAM
                    </div>
                    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div><strong>Số thanh cắm:</strong> {laptopHealth?.RAM?.length || 0} thanh</div>
                      {laptopHealth?.RAM?.map((r: any, idx: number) => (
                        <div key={idx} style={{ fontSize: 12, color: '#475569', background: '#f8fafc', padding: 6, borderRadius: 6 }}>
                          • Khe {r.Slot}: <strong>{r.CapacityGB} GB</strong> · {r.Speed}MHz · {r.Manufacturer} ({r.PartNumber})
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Disk Status */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#d97706', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <HardDrive size={16} /> Tình Trạng & Sức Khỏe Ổ Cứng Vật Lý
                    </div>
                    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {laptopHealth?.Disks?.map((d: any, idx: number) => {
                        const healthPct = typeof d.HealthPercent === 'number' ? d.HealthPercent : (d.HealthStatus === 'Healthy' ? 100 : (d.HealthStatus === 'Warning' ? 70 : 30));
                        const isGood = healthPct >= 90;
                        const isWarn = healthPct >= 70 && healthPct < 90;
                        const healthColor = isGood ? '#16a34a' : isWarn ? '#d97706' : '#dc2626';
                        const healthBg = isGood ? '#dcfce7' : isWarn ? '#fef3c7' : '#fee2e2';
                        const healthText = isGood ? 'Tốt (Good)' : isWarn ? 'Cảnh báo (Warning)' : 'Kém / Lỗi (Bad)';

                        return (
                          <div key={idx} style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                              <div>
                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{d.Name}</span>
                                <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>({d.SizeGB} GB · {d.MediaType || 'Ổ đĩa'})</span>
                              </div>
                              <div style={{
                                padding: '3px 10px',
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 700,
                                background: healthBg,
                                color: healthColor,
                                border: `1px solid ${healthColor}40`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}>
                                <span>Sức khỏe: {healthPct}%</span>
                                <span style={{ fontSize: 11, fontWeight: 500 }}>({healthText})</span>
                              </div>
                            </div>

                            {/* Health Progress Bar */}
                            <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.min(100, Math.max(0, healthPct))}%`,
                                height: '100%',
                                background: healthColor,
                                borderRadius: 999,
                                transition: 'width 0.5s ease'
                              }} />
                            </div>

                            {/* Stats row */}
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#475569', paddingTop: 2 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Thermometer size={13} color={d.Temperature && d.Temperature > 50 ? '#dc2626' : '#64748b'} />
                                <span>Nhiệt độ: <strong style={{ color: d.Temperature && d.Temperature > 50 ? '#dc2626' : '#1e293b' }}>{d.Temperature != null ? `${d.Temperature}°C` : 'Không hỗ trợ'}</strong></span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Clock size={13} color="#64748b" />
                                <span>Thời gian chạy: <strong>{d.PowerOnHours != null ? `${d.PowerOnHours.toLocaleString()} giờ (~${Math.round(d.PowerOnHours / 24)} ngày)` : 'Không hỗ trợ'}</strong></span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Activity size={13} color="#64748b" />
                                <span>SMART Status: <strong style={{ color: d.HealthStatus === 'Healthy' ? '#16a34a' : '#d97706' }}>{d.HealthStatus === 'Healthy' ? '✓ Bình thường (Healthy)' : d.HealthStatus}</strong></span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* 6. TRA CỨU SOCKET */}
          {activeSubTab === 'cpu_main_lookup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1300 }}>
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Cpu size={18} color="#1d4ed8" />
                  Tra Cứu Tương Thích Socket CPU & Chipset
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                  Cơ sở dữ liệu tương thích vi xử lý Intel / AMD và thế hệ chipset bo mạch chủ
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={cpuQuery}
                    onChange={e => setCpuQuery(e.target.value)}
                    placeholder="Tìm theo tên CPU, Socket (LGA1700, AM4), Chipset (B760, B450)..."
                    style={{ flex: 1, minWidth: 260, padding: '8px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setSelectedSocketFilter('all')}
                      className="btn-secondary"
                      style={{ fontSize: 12, background: selectedSocketFilter === 'all' ? '#1d4ed8' : '#fff', color: selectedSocketFilter === 'all' ? '#fff' : '#334155' }}
                    >
                      Tất cả
                    </button>
                    <button
                      onClick={() => setSelectedSocketFilter('intel')}
                      className="btn-secondary"
                      style={{ fontSize: 12, background: selectedSocketFilter === 'intel' ? '#1d4ed8' : '#fff', color: selectedSocketFilter === 'intel' ? '#fff' : '#334155' }}
                    >
                      Intel
                    </button>
                    <button
                      onClick={() => setSelectedSocketFilter('amd')}
                      className="btn-secondary"
                      style={{ fontSize: 12, background: selectedSocketFilter === 'amd' ? '#1d4ed8' : '#fff', color: selectedSocketFilter === 'amd' ? '#fff' : '#334155' }}
                    >
                      AMD
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredCpuMain.map((item, idx) => (
                  <div key={idx} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: item.brand === 'Intel' ? '#1d4ed8' : '#dc2626' }}>
                        {item.brand} · Socket {item.socket} ({item.gen})
                      </div>
                      <span style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                        {item.ram}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#334155', marginBottom: 4 }}>
                      <strong>Chipset tương thích:</strong> <span style={{ color: '#0f766e' }}>{item.chipsets}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      <strong>CPU tiêu biểu:</strong> {item.cpus}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7. KIỂM THỬ THIẾT BỊ NGOẠI VI */}
          {activeSubTab === 'peripherals_test' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Virtual Keyboard */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>⌨️ Kiểm Thử Bàn Phím (Keyboard Test)</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Nhấn các phím thực tế để phát hiện phím liệt, kẹt phím</div>
                  </div>
                  <button onClick={() => setPressedKeys(new Set())} className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>
                    Reset Phím ({pressedKeys.size})
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: '#0f172a', padding: 14, borderRadius: 10, overflowX: 'auto' }}>
                  {keyboardRows.map((row, rIdx) => (
                    <div key={rIdx} style={{ display: 'flex', gap: 4, justifyContent: rIdx === 6 ? 'flex-end' : 'flex-start' }}>
                      {row.map(code => {
                        const isHit = pressedKeys.has(code);
                        const isCurrent = activeKey === code;
                        return (
                          <div
                            key={code}
                            style={{
                              padding: '7px 8px',
                              minWidth: code.length > 4 ? 48 : 30,
                              textAlign: 'center',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              background: isCurrent ? '#f59e0b' : (isHit ? '#10b981' : '#1e293b'),
                              color: isCurrent || isHit ? '#000' : '#94a3b8',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                              transition: 'all 0.08s'
                            }}
                          >
                            {getKeyLabel(code)}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Loa, Mic, Camera */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
                {/* Loa */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Volume2 size={16} color="#1d4ed8" /> Kiểm Thử Loa Stereo
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Phát âm tần kiểm tra kênh loa Trái / Phải</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => playTone(-1, 440)} className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>Loa Trái (L)</button>
                    <button onClick={() => playTone(1, 440)} className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>Loa Phải (R)</button>
                    <button onClick={() => playTone(0, 440)} className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>Cả 2 Loa</button>
                    {isPlayingAudio && (
                      <button onClick={stopAudio} className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', background: '#dc2626' }}>
                        Dừng
                      </button>
                    )}
                  </div>
                  {speakerError && (
                    <div style={{ marginTop: 10, padding: '7px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                      <div>⚠️ {speakerError}</div>
                      <button onClick={() => setSpeakerError(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', padding: 0 }}>
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Mic */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Mic size={16} color="#16a34a" /> Kiểm Thử Microphone
                    </div>
                    {availableMics.length === 0 ? (
                      <span style={{ fontSize: 10, padding: '2px 6px', background: '#fef2f2', color: '#dc2626', borderRadius: 4, border: '1px solid #fee2e2' }}>
                        Chưa thấy Micro
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, padding: '2px 6px', background: '#f0fdf4', color: '#16a34a', borderRadius: 4, border: '1px solid #dcfce7' }}>
                        {availableMics.length} Micro sẵn sàng
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Đo âm lượng trực tiếp & thu âm nghe lại</div>
                  
                  {availableMics.length > 1 && (
                    <select
                      value={selectedMicId}
                      onChange={e => setSelectedMicId(e.target.value)}
                      style={{ width: '100%', marginBottom: 10, padding: '5px 8px', fontSize: 11, borderRadius: 6, border: '1px solid #cbd5e1' }}
                    >
                      {availableMics.map(m => (
                        <option key={m.deviceId} value={m.deviceId}>{m.label || `Microphone (${m.deviceId.slice(0, 8)})`}</option>
                      ))}
                    </select>
                  )}

                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {!isMicTesting ? (
                      <button onClick={startMicTest} className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>Bật Đo Mic</button>
                    ) : (
                      <button onClick={stopMicTest} className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px', color: '#dc2626' }}>Tắt Mic</button>
                    )}
                    <button onClick={record5Seconds} disabled={isRecording5s} className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', background: '#16a34a' }}>
                      {isRecording5s ? 'Đang thu 5s...' : 'Thu Âm 5s'}
                    </button>
                  </div>
                  {isMicTesting && (
                    <div style={{ height: 10, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${micVolume}%`, background: micVolume > 70 ? '#dc2626' : '#16a34a', transition: 'width 0.1s' }} />
                    </div>
                  )}
                  {recordedAudioUrl && (
                    <audio src={recordedAudioUrl} controls style={{ width: '100%', marginTop: 8, height: 32 }} />
                  )}
                  {micError && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ lineHeight: 1.4 }}>⚠️ {micError}</div>
                      <button onClick={() => setMicError(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', padding: 0 }}>
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Camera */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Video size={16} color="#7c3aed" /> Kiểm Thử Webcam
                    </div>
                    {availableCams.length === 0 ? (
                      <span style={{ fontSize: 10, padding: '2px 6px', background: '#fef2f2', color: '#dc2626', borderRadius: 4, border: '1px solid #fee2e2' }}>
                        Chưa thấy Cam
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, padding: '2px 6px', background: '#f5f3ff', color: '#7c3aed', borderRadius: 4, border: '1px solid #ede9fe' }}>
                        {availableCams.length} Camera sẵn sàng
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Kiểm tra chất lượng ống kính, độ phân giải & FPS</div>
                  
                  {availableCams.length > 1 && (
                    <select
                      value={selectedCamId}
                      onChange={e => setSelectedCamId(e.target.value)}
                      style={{ width: '100%', marginBottom: 10, padding: '5px 8px', fontSize: 11, borderRadius: 6, border: '1px solid #cbd5e1' }}
                    >
                      {availableCams.map(c => (
                        <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera (${c.deviceId.slice(0, 8)})`}</option>
                      ))}
                    </select>
                  )}

                  <div style={{ display: 'flex', gap: 6 }}>
                    {!isWebcamTesting ? (
                      <button onClick={startWebcamTest} className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>Bật Camera</button>
                    ) : (
                      <button onClick={stopWebcamTest} className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px', color: '#dc2626' }}>Tắt Camera</button>
                    )}
                    {isWebcamTesting && (
                      <button onClick={() => setIsMirror(!isMirror)} className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px' }}>
                        {isMirror ? 'Lật: Bật' : 'Lật: Tắt'}
                      </button>
                    )}
                  </div>
                  {isWebcamTesting && (
                    <div style={{ marginTop: 10, borderRadius: 8, overflow: 'hidden', background: '#000', position: 'relative' }}>
                      <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: 160, objectFit: 'cover', transform: isMirror ? 'scaleX(-1)' : 'none' }} />
                      <div style={{ position: 'absolute', bottom: 4, left: 6, fontSize: 11, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 4 }}>
                        {webcamRes} @ {webcamFps}fps
                      </div>
                    </div>
                  )}
                  {webcamError && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ lineHeight: 1.4 }}>⚠️ {webcamError}</div>
                      <button onClick={() => setWebcamError(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', padding: 0 }}>
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Screen Dead Pixel */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tv size={16} color="#0284c7" /> Soi Điểm Chết Màn Hình
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Phát hiện điểm chết, điểm kẹt màu và viền hở sáng IPS</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <button
                      onClick={() => { setDeadPixelColorIndex(0); setIsDeadPixelTest(true); }}
                      className="btn-primary"
                      style={{ fontSize: 12, padding: '6px 14px', background: '#0284c7', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                    >
                      <Tv size={14} /> Bắt Đầu Test Toàn Màn Hình
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Bảng màu:</span>
                    {deadPixelColors.map((c, i) => (
                      <div
                        key={i}
                        onClick={() => { setDeadPixelColorIndex(i); setIsDeadPixelTest(true); }}
                        style={{ width: 20, height: 20, borderRadius: 4, background: c.hex, border: '1px solid #cbd5e1', cursor: 'pointer' }}
                        title={`Xem màu: ${c.name}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 8. CÀI ĐẶT OFFICE */}
          {activeSubTab === 'office_installer' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24, maxWidth: 960 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={18} color="#1d4ed8" />
                Triển Khai Tự Động Microsoft Office (ODT)
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                Tải và cài đặt tự động bộ Microsoft Office bản chuẩn trực tiếp từ máy chủ Microsoft
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Phiên bản Office</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[
                      { id: '365', label: 'Office 365 ProPlus' },
                      { id: '2021', label: 'Office 2021 Pro Plus' },
                      { id: '2019', label: 'Office 2019 Pro Plus' },
                    ].map(v => (
                      <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input type="radio" name="offVer" checked={officeVersion === v.id} onChange={() => setOfficeVersion(v.id as any)} />
                        {v.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Kiến trúc cài đặt</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="radio" name="offArch" checked={officeArch === '64'} onChange={() => setOfficeArch('64')} />
                      64-bit (Tối ưu)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="radio" name="offArch" checked={officeArch === '32'} onChange={() => setOfficeArch('32')} />
                      32-bit (Tương thích)
                    </label>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ứng dụng chọn lọc</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {['Word', 'Excel', 'PowerPoint', 'Outlook', 'Access', 'Publisher', 'OneNote', 'Teams'].map(app => (
                      <label key={app} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={officeApps.includes(app)}
                          onChange={e => {
                            if (e.target.checked) setOfficeApps([...officeApps, app]);
                            else setOfficeApps(officeApps.filter(a => a !== app));
                          }}
                        />
                        {app}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ paddingTop: 10 }}>
                  <button
                    onClick={handleInstallOffice}
                    disabled={isInstallingOffice}
                    className="btn-primary"
                    style={{ padding: '10px 24px', fontSize: 13, background: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    {isInstallingOffice ? <RefreshCw size={15} className="spin" /> : <DownloadCloud size={15} />}
                    {isInstallingOffice ? 'Đang tạo config & tải Office...' : 'Khởi Chạy Cài Đặt Office'}
                  </button>
                </div>

                {officeResultMsg && (
                  <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
                    {officeResultMsg}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 9. KHO ỨNG DỤNG THIẾT YẾU & CÀI ĐẶT SILENT HÀNG LOẠT */}
          {activeSubTab === 'app_downloader' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Header */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <DownloadCloud size={20} color="#1d4ed8" />
                      KHO PHẦN MỀM THIẾT YẾU & CÀI ĐẶT SILENT TỰ ĐỘNG (1-CLICK BATCH)
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      Tích chọn danh sách các ứng dụng cần thiết và cài đặt ngầm tự động 100% qua Winget (không cần bấm Next/Finish)
                    </div>
                  </div>

                  {/* Nút Cài Đặt Hàng Loạt */}
                  <button
                    onClick={handleInstallBatchApps}
                    disabled={isBatchInstallingApps || selectedApps.length === 0}
                    className="btn-primary"
                    style={{
                      padding: '12px 24px',
                      fontSize: 14,
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      border: 'none',
                      borderRadius: 10,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: selectedApps.length === 0 ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)'
                    }}
                  >
                    <DownloadCloud size={18} className={isBatchInstallingApps ? 'spin' : ''} />
                    {isBatchInstallingApps ? 'Đang cài đặt hàng loạt...' : `⚡ CÀI ĐẶT ${selectedApps.length} PHẦN MỀM ĐÃ CHỌN`}
                  </button>
                </div>

                {/* Batch Selector Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginRight: 4 }}>
                    Chọn nhanh:
                  </span>
                  <button
                    onClick={handleSelectBasicApps}
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '5px 12px', background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <Sparkles size={13} /> Bộ Cơ Bản (Chrome, UniKey, WinRAR, VC++, Zalo, UltraViewer)
                  </button>
                  <button
                    onClick={handleSelectAllApps}
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '5px 12px' }}
                  >
                    Chọn Tất Cả Hỗ Trợ Tự Động
                  </button>
                  <button
                    onClick={handleDeselectAllApps}
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '5px 12px', color: '#64748b' }}
                  >
                    Bỏ Chọn Hết
                  </button>

                  <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#1e293b', fontWeight: 700, background: '#f8fafc', padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    Đã chọn: <span style={{ color: '#059669' }}>{selectedApps.length}</span> ứng dụng
                  </div>
                </div>
              </div>

              {/* Tiến độ Cài Đặt Hàng Loạt */}
              {isBatchInstallingApps && batchInstallProgress && (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #93c5fd', padding: 18, boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <RefreshCw size={16} className="spin" />
                      Đang cài đặt ({batchInstallProgress.index} / {batchInstallProgress.total}): {batchInstallProgress.currentApp}
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 14, color: '#1d4ed8' }}>
                      {batchInstallProgress.percent}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ width: '100%', height: 10, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{
                      width: `${batchInstallProgress.percent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #3b82f6, #059669)',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                    Vui lòng không tắt ứng dụng. Trình cài đặt đang chạy ngầm và tự động cấp quyền hệ thống.
                  </div>
                </div>
              )}

              {/* Bảng Kết Quả Sau Cài Đặt */}
              {batchInstallResults && (
                <div style={{ background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', padding: 18 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#166534', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={18} color="#16a34a" /> Kết Quả Cài Đặt Hàng Loạt
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                    {batchInstallResults.map((r, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: 6,
                        background: r.ok ? '#fff' : '#fef2f2',
                        border: `1px solid ${r.ok ? '#bbf7d0' : '#fecaca'}`
                      }}>
                        <span style={{ fontWeight: 700, fontSize: 12.5, color: r.ok ? '#15803d' : '#991b1b' }}>
                          {r.name}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: r.ok ? '#15803d' : '#b91c1c' }}>
                          {r.ok ? '✓ Thành công' : '✕ ' + r.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* VC++ Runtime Hero Card */}
              <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', borderRadius: 12, border: '1px solid #4338ca', padding: 20, color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ maxWidth: 650 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#a5b4fc', marginBottom: 4 }}>
                      <Package size={20} color="#818cf8" /> Cài Đặt Trọn Bộ Visual C++ Redistributable Runtime (2005 - 2022)
                    </div>
                    <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                      Tự động tải và cài đặt trọn gói thư viện Microsoft Visual C++ từ phiên bản 2005 đến 2022 (x86 & x64). Khắc phục triệt để lỗi thiếu file DLL hệ thống kinh điển (<code>MSVCR100.dll</code>, <code>VCRUNTIME140.dll</code>, <code>MSVCP140.dll</code>...) cho mọi phần mềm y tế, ứng dụng văn phòng và đồ họa.
                    </div>
                  </div>

                  <div>
                    <button
                      onClick={handleInstallVcRedist}
                      disabled={isInstallingVcRedist}
                      className="btn-primary"
                      style={{
                        padding: '10px 20px', fontSize: 13, fontWeight: 700,
                        background: '#4f46e5', color: '#fff', border: '1px solid #6366f1',
                        borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)'
                      }}
                    >
                      <RefreshCw size={15} className={isInstallingVcRedist ? 'spin' : ''} />
                      {isInstallingVcRedist ? 'Đang tải & cài Visual C++...' : '1-Click Cài Đặt Trọn Bộ VC++'}
                    </button>
                  </div>
                </div>

                {vcRedistMsg && (
                  <div style={{
                    marginTop: 14, padding: '10px 14px', borderRadius: 8,
                    background: vcRedistMsg.startsWith('✓') ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${vcRedistMsg.startsWith('✓') ? '#22c55e' : '#ef4444'}`,
                    color: vcRedistMsg.startsWith('✓') ? '#86efac' : '#fca5a5', fontSize: 13
                  }}>
                    {vcRedistMsg}
                  </div>
                )}
              </div>

              {appMsg && (
                <div style={{ padding: 10, background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe', color: '#1e40af', fontSize: 13 }}>
                  {appMsg}
                </div>
              )}

              {/* Danh sách nhóm phần mềm có Checkbox */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {ESSENTIAL_APPS.map((group, idx) => (
                  <div key={idx} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {group.cat}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
                      {group.apps.map(app => {
                        const isSelected = selectedApps.includes(app.name);
                        return (
                          <div
                            key={app.name}
                            onClick={() => app.winget && handleToggleAppSelect(app.name)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: isSelected ? '#f0fdf4' : '#f8fafc',
                              padding: '10px 14px',
                              borderRadius: 8,
                              border: isSelected ? '1px solid #86efac' : '1px solid #f1f5f9',
                              cursor: app.winget ? 'pointer' : 'default',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                              {app.winget ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // handled by parent onClick
                                  style={{ cursor: 'pointer', width: 16, height: 16 }}
                                />
                              ) : (
                                <div style={{ width: 16 }} />
                              )}
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#15803d' : '#1e293b' }}>
                                  {app.name}
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>{app.desc}</div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                              {app.winget ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleInstallApp(app);
                                  }}
                                  disabled={installingApp === app.name}
                                  className="btn-primary"
                                  style={{ fontSize: 11, padding: '5px 10px', background: '#1d4ed8', whiteSpace: 'nowrap' }}
                                >
                                  {installingApp === app.name ? 'Đang cài...' : 'Cài lẻ'}
                                </button>
                              ) : null}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openUrl(app.url);
                                }}
                                className="btn-secondary"
                                style={{ fontSize: 11, padding: '5px 8px', whiteSpace: 'nowrap' }}
                              >
                                Tải web
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 10. TRÌNH CÀI ĐẶT SILENT */}
          {activeSubTab === 'custom_app_installer' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24, maxWidth: 900 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Box size={18} color="#1d4ed8" />
                Trình Cài Đặt Phần Mềm Tùy Chỉnh (Silent Installer)
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                Thực thi cài đặt ngầm file .exe, .msi hoặc mã gói Winget mà không cần bấm Next/Finish thủ công
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    Đường dẫn file cài đặt (.exe, .msi) hoặc ID Winget
                  </label>
                  <input
                    type="text"
                    value={customAppPath}
                    onChange={e => setCustomAppPath(e.target.value)}
                    placeholder="VD: D:\Setup\app.exe hoặc Google.Chrome"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    Tham số cài đặt im lặng (Silent Switches)
                  </label>
                  <input
                    type="text"
                    value={customAppArgs}
                    onChange={e => setCustomAppArgs(e.target.value)}
                    placeholder="VD: /S hoặc /silent hoặc /qn"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div style={{ paddingTop: 10 }}>
                  <button
                    onClick={handleInstallCustomApp}
                    disabled={isInstallingCustom}
                    className="btn-primary"
                    style={{ padding: '9px 22px', fontSize: 13, background: '#1d4ed8' }}
                  >
                    {isInstallingCustom ? 'Đang chạy cài đặt...' : 'Thực Thi Cài Đặt'}
                  </button>
                </div>

                {customInstallMsg && (
                  <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', color: '#1e293b', fontSize: 13 }}>
                    {customInstallMsg}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 11. THƯ VIỆN FONT TIẾNG VIỆT */}
          {activeSubTab === 'vietnamese_fonts' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24, maxWidth: 900 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Type size={18} color="#1d4ed8" />
                Bộ Thư Viện Font Tiếng Việt Hệ Thống
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                Hỗ trợ hiển thị chuẩn cho các văn bản cũ, hồ sơ bảo hiểm y tế và phần mềm nghiệp vụ bệnh viện
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                  <strong>1. Font TCVN3 (ABC):</strong> .VnTime, .VnTimeH, .VnArial, .VnCourier... chuyên đọc hồ sơ y tế & công văn cũ.
                </div>
                <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                  <strong>2. Font VNI:</strong> VNI-Times, VNI-Aptima, VNI-Helve... thông dụng trong đồ họa và văn bản miền Nam.
                </div>
                <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                  <strong>3. Font Unicode Mở Rộng:</strong> UTM fonts, UVN fonts giúp hiển thị tiếng Việt chuẩn đẹp.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleInstallFonts}
                  disabled={isInstallingFonts}
                  className="btn-primary"
                  style={{ padding: '9px 20px', fontSize: 13, background: '#1d4ed8' }}
                >
                  {isInstallingFonts ? 'Đang cài đặt font...' : 'Cài Đặt Bộ Font Hệ Thống'}
                </button>
                <button
                  onClick={() => {
                    const eAPI = (window as any).electronAPI;
                    if (eAPI?.pcTools?.openFolder) eAPI.pcTools.openFolder('fonts');
                  }}
                  className="btn-secondary"
                  style={{ padding: '9px 14px', fontSize: 13 }}
                >
                  Mở Thư Mục Fonts
                </button>
              </div>

              {fontMsg && (
                <div style={{ marginTop: 14, padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
                  {fontMsg}
                </div>
              )}
            </div>
          )}

          {/* 12. DỌN RÁC & TỐI ƯU RAM */}
          {activeSubTab === 'system_optimizer' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100 }}>
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Rocket size={18} color="#1d4ed8" />
                  Dọn Dẹp Dữ Liệu Rác & Giải Phóng Bộ Nhớ RAM
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  Làm sạch thư mục tạm %TEMP%, dọn dẹp Recycle Bin và thu hồi Working Set của các tiến trình đang chiếm RAM
                </div>
              </div>

              {/* MASTER 1-CLICK CLINIC BOOST */}
              <div style={{
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e293b 100%)',
                borderRadius: 14, padding: 22, color: '#fff',
                boxShadow: '0 10px 25px -5px rgba(49, 46, 129, 0.4)',
                border: '1px solid #4338ca'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                  <div style={{ maxWidth: 650 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 16, color: '#a5b4fc', marginBottom: 6 }}>
                      <Sparkles size={20} color="#fbbf24" />
                      Master 1-Click Clinic Boost (Tối Ưu Thần Tốc Toàn Hệ Thống)
                    </div>
                    <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.5 }}>
                      Tự động hóa chuỗi hành động chuẩn phòng khám: Xóa sạch rác sâu (User Temp, Windows Temp, Prefetch) + Thu hồi RAM + Xóa DNS Cache + Đặt chế độ nguồn hiệu năng cao (High Performance) chỉ trong 3 giây.
                    </div>
                  </div>

                  <button
                    onClick={handleMasterBoost}
                    disabled={isMasterBoosting}
                    style={{
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      color: '#000', fontWeight: 800, fontSize: 13,
                      padding: '12px 24px', borderRadius: 10, border: 'none',
                      cursor: isMasterBoosting ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)'
                    }}
                  >
                    {isMasterBoosting ? <RefreshCw size={17} className="spin" /> : <Flame size={17} />}
                    {isMasterBoosting ? 'Đang tối ưu thần tốc...' : 'TỐI ƯU THẦN TỐC NGAY'}
                  </button>
                </div>

                {masterBoostResult && (
                  <div style={{
                    marginTop: 16, padding: '12px 16px', borderRadius: 8,
                    background: masterBoostResult.ok ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.2)',
                    border: `1px solid ${masterBoostResult.ok ? '#059669' : '#dc2626'}`,
                    fontSize: 12.5, color: '#e2e8f0'
                  }}>
                    {masterBoostResult.ok ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontWeight: 700, color: '#34d399' }}>✓ {masterBoostResult.message}</div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4, color: '#cbd5e1' }}>
                          <div>• Rác đã dọn: <strong style={{ color: '#fff' }}>{masterBoostResult.freedTrashMB} MB</strong> ({masterBoostResult.deletedFiles} tệp tin)</div>
                          <div>• RAM giải phóng: <strong style={{ color: '#fff' }}>{masterBoostResult.freedRamMB} MB</strong></div>
                          <div>• DNS Cache: <strong style={{ color: '#34d399' }}>Đã làm mới sạch sẽ</strong></div>
                          <div>• Chế độ nguồn: <strong style={{ color: '#fbbf24' }}>{masterBoostResult.powerPlan}</strong></div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: '#f87171' }}>⚠️ Lỗi tối ưu: {masterBoostResult.error}</div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Dọn Rác */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#dc2626', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={16} /> Dọn Rác Ổ C (Disk Junk)
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                    Quét sạch các file tạm thời trong %TEMP%, C:\Windows\Temp và dọn sạch thùng rác
                  </div>
                  <button
                    onClick={handleCleanJunk}
                    disabled={isCleaning}
                    className="btn-primary"
                    style={{ width: '100%', padding: '10px 14px', fontSize: 13, background: '#dc2626' }}
                  >
                    {isCleaning ? 'Đang quét và dọn rác...' : 'Dọn Rác Ngay'}
                  </button>
                  {cleanResult && (
                    <div style={{ marginTop: 12, padding: 10, background: '#f0fdf4', borderRadius: 8, fontSize: 12, color: '#166534' }}>
                      ✓ Đã xóa {cleanResult.DeletedFiles} file, giải phóng {cleanResult.FreedMB} MB ổ C!
                    </div>
                  )}
                </div>

                {/* Tối ưu RAM */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#16a34a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={16} /> Giải Phóng Bộ Nhớ RAM
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                    Thu hồi Working Set bộ nhớ dư thừa của các ứng dụng chạy ngầm
                  </div>
                  <button
                    onClick={handleOptimizeRam}
                    disabled={isOptimizingRam}
                    className="btn-primary"
                    style={{ width: '100%', padding: '10px 14px', fontSize: 13, background: '#16a34a' }}
                  >
                    {isOptimizingRam ? 'Đang tối ưu RAM...' : 'Giải Phóng RAM Tức Thì'}
                  </button>
                  {ramResult && (
                    <div style={{ marginTop: 12, padding: 10, background: '#f0fdf4', borderRadius: 8, fontSize: 12, color: '#166534' }}>
                      ✓ Đã giải phóng {ramResult.FreedMB} MB RAM khả dụng!
                    </div>
                  )}
                </div>
              </div>

              {/* BÁC SĨ DỊCH VỤ HỆ THỐNG (SELF-HEALING SERVICES DOCTOR) */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Shield size={17} color="#0284c7" /> Bác Sĩ Dịch Vụ Hệ Thống (Self-Healing Services Doctor)
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Tự động kiểm tra và phục hồi 8 dịch vụ Windows huyết mạch (In ấn Spooler, WMI, Chia sẻ tệp LAN, DNS Client, Windows Update)
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleGetServicesStatus}
                      disabled={isLoadingServices}
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                    >
                      <RefreshCw size={12} className={isLoadingServices ? 'spin' : ''} /> Quét Dịch Vụ
                    </button>
                    <button
                      onClick={handleRepairServices}
                      disabled={isRepairingServices}
                      className="btn-primary"
                      style={{ fontSize: 12, padding: '5px 14px', background: '#0284c7', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                    >
                      <Wrench size={12} className={isRepairingServices ? 'spin' : ''} />
                      {isRepairingServices ? 'Đang sửa chữa...' : '1-Click Sửa Chữa & Khởi Động Lại Tất Cả'}
                    </button>
                  </div>
                </div>

                {servicesRepairMsg && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 12 }}>
                    ✓ {servicesRepairMsg}
                  </div>
                )}

                {isLoadingServices ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                    <RefreshCw size={18} className="spin" style={{ margin: '0 auto 8px' }} />
                    Đang truy vấn trạng thái các dịch vụ hệ thống...
                  </div>
                ) : windowsServices.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8, fontSize: 12.5 }}>
                    Chưa quét dịch vụ. Nhấn <strong>"Quét Dịch Vụ"</strong> để kiểm tra hoặc <strong>"1-Click Sửa Chữa"</strong> để kích hoạt lại toàn bộ.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
                    {windowsServices.map((s, idx) => (
                      <div key={idx} style={{
                        padding: 12, borderRadius: 8,
                        background: s.isHealthy ? '#f8fafc' : '#fef2f2',
                        border: `1px solid ${s.isHealthy ? '#e2e8f0' : '#fecaca'}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{s.desc}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            Mã: <code>{s.name}</code> • Khởi động: {s.startType || 'Auto'}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                          background: s.isHealthy ? '#dcfce7' : '#fee2e2',
                          color: s.isHealthy ? '#15803d' : '#b91c1c'
                        }}>
                          {s.isHealthy ? '● Đang chạy' : '○ Bị dừng / Lỗi'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* STARTUP APPS BOOSTER */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Rocket size={17} color="#2563eb" /> Quản Lý Khởi Động Cùng Windows ({startupApps.length})
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Dọn dẹp các ứng dụng tự ý khởi động ngầm trong Registry làm chậm quá trình boot máy
                    </div>
                  </div>
                  <button
                    onClick={handleGetStartupApps}
                    disabled={isLoadingStartup}
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                  >
                    <RefreshCw size={12} className={isLoadingStartup ? 'spin' : ''} /> Quét Lại
                  </button>
                </div>

                {startupStatusMsg && (
                  <div style={{ marginBottom: 10, padding: 8, borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 12 }}>
                    ✓ {startupStatusMsg}
                  </div>
                )}

                {isLoadingStartup ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                    Đang đọc danh sách Registry Run...
                  </div>
                ) : startupApps.length === 0 ? (
                  <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                    Không có ứng dụng nào khởi động cùng Windows hoặc danh sách trống.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', maxHeight: 220, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px', color: '#475569' }}>Tên Ứng Dụng</th>
                          <th style={{ padding: '8px 10px', color: '#475569' }}>Phạm Vi</th>
                          <th style={{ padding: '8px 10px', color: '#475569' }}>Lệnh / Đường Dẫn Thực Thi</th>
                          <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'center' }}>Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {startupApps.map((app, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>{app.name}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{
                                fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                background: app.scope === 'System' ? '#fef3c7' : '#e0f2fe',
                                color: app.scope === 'System' ? '#92400e' : '#0369a1'
                              }}>
                                {app.scope}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#64748b', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={app.command}>
                              <code>{app.command}</code>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <button
                                onClick={() => handleRemoveStartupApp(app.name, app.scope)}
                                className="btn-secondary"
                                style={{ padding: '3px 8px', fontSize: 11, color: '#dc2626', border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer' }}
                                title="Xóa khởi động"
                              >
                                <Trash2 size={12} /> Xóa
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* LARGE FILES ANALYZER */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <FolderSearch size={18} color="#ea580c" /> Soi Tệp Tin Khủng Chiếm Dung Lượng Ổ C ({largeFiles.length})
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Quét nhanh các tệp tin có dung lượng lớn hơn 50MB trong Downloads, Temp, Desktop để dọn sạch ổ C
                    </div>
                  </div>
                  <button
                    onClick={handleScanLargeFiles}
                    disabled={isScanningLargeFiles}
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '6px 14px', background: '#ea580c', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <RefreshCw size={13} className={isScanningLargeFiles ? 'spin' : ''} />
                    {isScanningLargeFiles ? 'Đang soi tệp tin khủng...' : 'Quét Tệp Khủng Ngay'}
                  </button>
                </div>

                {largeFileMsg && (
                  <div style={{ marginBottom: 10, padding: 8, borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 12 }}>
                    ℹ️ {largeFileMsg}
                  </div>
                )}

                {isScanningLargeFiles ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                    <RefreshCw size={22} className="spin" style={{ margin: '0 auto 8px', color: '#ea580c' }} />
                    Đang phân tích các thư mục Downloads, Temp, Videos...
                  </div>
                ) : largeFiles.length === 0 ? (
                  <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                    Chưa quét hoặc không tìm thấy tệp tin nào lớn hơn 50MB.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px', color: '#475569' }}>#</th>
                          <th style={{ padding: '8px 10px', color: '#475569' }}>Tên Tệp Tin</th>
                          <th style={{ padding: '8px 10px', color: '#475569' }}>Dung Lượng</th>
                          <th style={{ padding: '8px 10px', color: '#475569' }}>Đường Dẫn Đầy Đủ</th>
                          <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'center' }}>Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {largeFiles.map((file, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{idx + 1}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <File size={14} color="#64748b" />
                                <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.Name}>
                                  {file.Name}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{
                                fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                                background: file.SizeMB > 500 ? '#fee2e2' : '#fef3c7',
                                color: file.SizeMB > 500 ? '#b91c1c' : '#b45309'
                              }}>
                                {file.SizeMB > 1024 ? `${(file.SizeMB / 1024).toFixed(2)} GB` : `${file.SizeMB} MB`}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#64748b', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.FullName}>
                              <code>{file.FullName}</code>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                <button
                                  onClick={() => handleOpenFileLocation(file.FullName)}
                                  className="btn-secondary"
                                  style={{ padding: '3px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                                  title="Mở trong File Explorer"
                                >
                                  <ExternalLink size={12} /> Mở Thư Mục
                                </button>
                                <button
                                  onClick={() => handleDeleteLargeFile(file.FullName, file.Name)}
                                  className="btn-secondary"
                                  style={{ padding: '3px 8px', fontSize: 11, color: '#dc2626', border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer' }}
                                  title="Xóa vào thùng rác"
                                >
                                  <Trash2 size={12} /> Xóa
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 13. TINH CHỈNH WINDOWS - DMH 1-CLICK OPTIMIZER (PHONG CÁCH NGUYỄN PHI) */}
          {activeSubTab === 'windows_tweaks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200 }}>
              {/* Header & Controls Toolbar */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Settings size={20} color="#1d4ed8" />
                      WINDOWS 1-CLICK OPTIMIZER (TỐI ƯU & TINH CHỈNH WINDOWS 10 / 11)
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      Kích hoạt thiết lập Registry chuẩn, dọn dẹp các tính năng rác, hiện icon This PC, bật NumLock và tối ưu hoá hệ thống chuẩn kỹ thuật viên
                    </div>
                  </div>

                  {/* Nút Áp Dụng Toàn Bộ Hàng Loạt */}
                  <button
                    onClick={handleApplyBatchTweaks}
                    disabled={isApplyingBatchTweaks || selectedTweaks.length === 0}
                    className="btn-primary"
                    style={{
                      padding: '12px 24px',
                      fontSize: 14,
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%)',
                      border: 'none',
                      borderRadius: 10,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: selectedTweaks.length === 0 ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(29, 78, 216, 0.35)'
                    }}
                  >
                    <Zap size={18} className={isApplyingBatchTweaks ? 'spin' : ''} />
                    {isApplyingBatchTweaks ? 'Đang áp dụng hệ thống...' : `⚡ ÁP DỤNG ${selectedTweaks.length} TINH CHỈNH ĐÃ CHỌN`}
                  </button>
                </div>

                {/* Quick Selection Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginRight: 4 }}>
                    Lựa chọn nhanh:
                  </span>
                  <button
                    onClick={handleSelectRecommendedTweaks}
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '5px 12px', background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <Sparkles size={13} /> Khuyên Dùng ({DMH_OPTIMIZER_TWEAKS.filter(t => t.recommended).length})
                  </button>
                  <button
                    onClick={handleSelectAllTweaks}
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '5px 12px' }}
                  >
                    Chọn Tất Cả ({DMH_OPTIMIZER_TWEAKS.length})
                  </button>
                  <button
                    onClick={handleDeselectAllTweaks}
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '5px 12px', color: '#64748b' }}
                  >
                    Bỏ Chọn Hết
                  </button>

                  <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#1e293b', fontWeight: 700, background: '#f8fafc', padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    Đã chọn: <span style={{ color: '#1d4ed8' }}>{selectedTweaks.length}</span> / {DMH_OPTIMIZER_TWEAKS.length} mục
                  </div>
                </div>
              </div>

              {/* Thông báo kết quả sau khi áp dụng */}
              {batchTweakResult && (
                <div style={{
                  padding: 16, borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534',
                  boxShadow: '0 2px 6px rgba(22, 101, 52, 0.08)'
                }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={18} color="#16a34a" /> {batchTweakResult.message}
                  </div>
                  {batchTweakResult.appliedList && batchTweakResult.appliedList.length > 0 && (
                    <div style={{ fontSize: 12, color: '#15803d', marginTop: 6, lineHeight: 1.5 }}>
                      <strong>Các mục đã thực thi:</strong> {batchTweakResult.appliedList.join(' • ')}
                    </div>
                  )}
                </div>
              )}

              {/* 3 Nhóm Tinh Chỉnh */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16 }}>
                {[
                  {
                    key: 'interface',
                    title: '1. GIAO DIỆN & THAO TÁC CHUẨN',
                    sub: 'Hiện This PC, đuôi file, menu chuột phải cổ điển Win 11, bật NumLock',
                    badgeColor: '#0284c7',
                    bgHeader: '#f0f9ff',
                    borderHeader: '#bae6fd'
                  },
                  {
                    key: 'debloat',
                    title: '2. TỐI ƯU HIỆU NĂNG & TẮT RÁC (DEBLOAT)',
                    sub: 'Tắt Copilot, tắt Widgets thời tiết, tắt BitLocker tự động, Ultimate Power',
                    badgeColor: '#7c3aed',
                    bgHeader: '#faf5ff',
                    borderHeader: '#e9d5ff'
                  },
                  {
                    key: 'system',
                    title: '3. MẠNG & HỆ THỐNG KỸ THUẬT',
                    sub: 'Bật .NET 3.5, SMB 1.0 chia sẻ máy in Win 7/XP, sửa lỗi Spooler, tắt UAC',
                    badgeColor: '#059669',
                    bgHeader: '#f0fdf4',
                    borderHeader: '#bbf7d0'
                  }
                ].map(group => {
                  const groupTweaks = DMH_OPTIMIZER_TWEAKS.filter(t => t.group === group.key);
                  return (
                    <div key={group.key} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      {/* Group Header */}
                      <div style={{ padding: '14px 16px', background: group.bgHeader, borderBottom: `1px solid ${group.borderHeader}` }}>
                        <div style={{ fontWeight: 800, fontSize: 13.5, color: group.badgeColor, letterSpacing: '0.3px' }}>
                          {group.title}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                          {group.sub}
                        </div>
                      </div>

                      {/* Items List */}
                      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                        {groupTweaks.map(twk => {
                          const isSelected = selectedTweaks.includes(twk.id);
                          return (
                            <div
                              key={twk.id}
                              onClick={() => handleToggleTweakSelect(twk.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: isSelected ? '1px solid #93c5fd' : '1px solid #f1f5f9',
                                background: isSelected ? '#eff6ff' : '#f8fafc',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {/* Checkbox input */}
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}} // handled by parent onClick
                                style={{ marginTop: 3, cursor: 'pointer', width: 16, height: 16 }}
                              />

                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#1e40af' : '#1e293b' }}>
                                    {twk.title}
                                  </span>
                                  {twk.recommended && (
                                    <span style={{ fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: 4 }}>
                                      Khuyên dùng
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                  {twk.desc}
                                </div>

                                {/* Status if single-applied */}
                                {tweakStatus[twk.id] && (
                                  <div style={{ fontSize: 11, color: '#2563eb', marginTop: 4, fontWeight: 600 }}>
                                    {tweakStatus[twk.id]}
                                  </div>
                                )}
                              </div>

                              {/* Nút chạy lẻ */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApplyTweak(twk.id);
                                }}
                                className="btn-secondary"
                                style={{ fontSize: 10.5, padding: '3px 8px', whiteSpace: 'nowrap', alignSelf: 'center' }}
                                title="Chạy ngay tinh chỉnh này"
                              >
                                Chạy lẻ
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 14. MẬT KHẨU WI-FI & SỬA MẠNG LAN */}
          {activeSubTab === 'network_wifi' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200 }}>
              {/* Header */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wifi size={18} color="#0284c7" />
                  Trợ Lý Quản Trị Mạng Wi-Fi & Cứu Hộ Kết Nối LAN
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  Trích xuất toàn bộ mật khẩu Wi-Fi đã lưu trên máy tính, khôi phục cài đặt mạng và khắc phục lỗi chia sẻ máy in mạng LAN
                </div>
              </div>

              {/* 1-Click Toolkit */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                {/* Reset Network */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={16} color="#d97706" /> 1-Click Khôi Phục Cài Đặt Mạng & Xóa DNS
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                    Xóa sạch DNS cache (Flush DNS), đặt lại Winsock và TCP/IP stack để khắc phục lỗi không vào được mạng, "No Internet Secured".
                  </div>
                  <button
                    onClick={handleNetworkFix}
                    disabled={isFixingNet}
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '7px 14px', background: '#d97706', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <RefreshCw size={14} className={isFixingNet ? 'spin' : ''} />
                    {isFixingNet ? 'Đang đặt lại mạng...' : 'Đặt Lại Mạng & Flush DNS'}
                  </button>
                  {netFixStatus && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', background: '#f0fdf4', padding: '6px 10px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                      ✓ {netFixStatus}
                    </div>
                  )}
                </div>

                {/* Fix LAN Printer */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Printer size={16} color="#059669" /> 1-Click Sửa Lỗi Máy In Mạng LAN (0x0000011b)
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                    Kích hoạt chia sẻ máy in qua mạng LAN Windows 10/11, sửa mã lỗi kết nối máy in 0x0000011b và khởi động lại Print Spooler.
                  </div>
                  <button
                    onClick={handleFixLanPrinter}
                    disabled={isFixingPrinter}
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '7px 14px', background: '#059669', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <Wrench size={14} className={isFixingPrinter ? 'spin' : ''} />
                    {isFixingPrinter ? 'Đang sửa máy in LAN...' : 'Sửa Lỗi Máy In LAN Ngay'}
                  </button>
                  {printerFixStatus && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', background: '#f0fdf4', padding: '6px 10px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                      ✓ {printerFixStatus}
                    </div>
                  )}
                </div>

                {/* Enable LAN Ping & Sharing */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Shield size={16} color="#2563eb" /> 1-Click Mở Khóa Ping (ICMP) & Chia Sẻ LAN
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                    Mở Windows Firewall cho phép Ping phản hồi (ICMP Echo), kích hoạt Network Discovery và dịch vụ FDResPub để các máy khác thấy nhau trong LAN.
                  </div>
                  <button
                    onClick={handleEnableLanSharing}
                    disabled={isEnablingLanSharing}
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '7px 14px', background: '#2563eb', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <RefreshCw size={14} className={isEnablingLanSharing ? 'spin' : ''} />
                    {isEnablingLanSharing ? 'Đang cấu hình Firewall...' : 'Mở Khóa Ping & Chia Sẻ LAN'}
                  </button>
                  {lanSharingMsg && (
                    <div style={{ marginTop: 8, fontSize: 12, color: lanSharingMsg.startsWith('✓') ? '#16a34a' : '#dc2626', background: lanSharingMsg.startsWith('✓') ? '#f0fdf4' : '#fef2f2', padding: '6px 10px', borderRadius: 6, border: `1px solid ${lanSharingMsg.startsWith('✓') ? '#bbf7d0' : '#fecaca'}` }}>
                      {lanSharingMsg}
                    </div>
                  )}
                </div>

                {/* Clear Print Spooler Queue */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={16} color="#e11d48" /> 1-Click Xóa Kẹt Lệnh In (Print Spooler)
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                    Dừng Spooler, dọn sạch vĩnh viễn các tệp in kẹt trong <code>spool\PRINTERS</code> và khởi động lại dịch vụ in ấn.
                  </div>
                  <button
                    onClick={handleClearPrintQueue}
                    disabled={isClearingSpooler}
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '7px 14px', background: '#e11d48', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <RefreshCw size={14} className={isClearingSpooler ? 'spin' : ''} />
                    {isClearingSpooler ? 'Đang dọn hàng đợi in...' : 'Xóa Sạch Kẹt Lệnh In'}
                  </button>
                  {clearSpoolerMsg && (
                    <div style={{ marginTop: 8, fontSize: 12, color: clearSpoolerMsg.startsWith('✓') ? '#16a34a' : '#dc2626', background: clearSpoolerMsg.startsWith('✓') ? '#f0fdf4' : '#fef2f2', padding: '6px 10px', borderRadius: 6, border: `1px solid ${clearSpoolerMsg.startsWith('✓') ? '#bbf7d0' : '#fecaca'}` }}>
                      {clearSpoolerMsg}
                    </div>
                  )}
                </div>

                {/* Test Network Printer Port 9100 */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Server size={16} color="#7c3aed" /> Kiểm Tra Cổng In Mạng LAN (Port 9100 RAW)
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                    Kiểm tra máy in mạng Canon/HP/Brother có đang online và cổng RAW Port 9100 có mở sẵn sàng nhận lệnh in hay không.
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      type="text"
                      value={printerTestIp}
                      onChange={e => setPrinterTestIp(e.target.value)}
                      placeholder="Nhập IP máy in (VD: 192.168.1.200)"
                      style={{ flex: 1, padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                    <button
                      onClick={handleCheckPrinterPort}
                      disabled={isTestingPrinterPort || !printerTestIp.trim()}
                      className="btn-primary"
                      style={{ fontSize: 12, padding: '6px 12px', background: '#7c3aed', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      <Activity size={13} className={isTestingPrinterPort ? 'spin' : ''} />
                      {isTestingPrinterPort ? 'Đang test...' : 'Kiểm Tra Cổng'}
                    </button>
                  </div>
                  {printerPortResult && (
                    <div style={{
                      fontSize: 12, padding: '7px 10px', borderRadius: 6,
                      background: printerPortResult.portOpen ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${printerPortResult.portOpen ? '#bbf7d0' : '#fecaca'}`,
                      color: printerPortResult.portOpen ? '#166534' : '#991b1b'
                    }}>
                      <div style={{ fontWeight: 700 }}>
                        {printerPortResult.portOpen ? '✓ Máy in Sẵn Sàng (Cổng 9100 MỞ)' : '⚠ Cổng 9100 ĐÓNG hoặc Máy In OFFLINE'}
                      </div>
                      <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                        Ping: {printerPortResult.pingOk ? 'Thành công' : 'Không phản hồi'} | IP: {printerPortResult.ip}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Ping Latency & Network Quality Monitor */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Activity size={18} color="#059669" />
                      Kiểm Tra Độ Trễ & Chất Lượng Mạng (Ping Monitor)
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Đo tốc độ phản hồi (ms), tỷ lệ rớt gói (Packet Loss %) tới DNS Google, Cloudflare và Router Gateway
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="IP hoặc Domain phụ (vd: dantri.com.vn)..."
                      value={customPingHost}
                      onChange={e => setCustomPingHost(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', width: 220 }}
                    />
                    <button
                      onClick={() => handlePingTest()}
                      disabled={isPinging}
                      className="btn-primary"
                      style={{ fontSize: 12, padding: '7px 14px', background: '#059669', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                    >
                      <RefreshCw size={13} className={isPinging ? 'spin' : ''} />
                      {isPinging ? 'Đang đo độ trễ mạng...' : 'Đo Độ Trễ Ngay'}
                    </button>
                  </div>
                </div>

                {pingError && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', color: '#991b1b', borderRadius: 6, fontSize: 12, border: '1px solid #fecaca' }}>
                    ⚠️ {pingError}
                  </div>
                )}

                {isPinging ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px', color: '#059669' }} />
                    Đang gửi 4 gói tin ICMP tới các máy chủ Google, Cloudflare và Gateway Router...
                  </div>
                ) : pingTargets.length === 0 ? (
                  <div style={{ padding: 18, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
                    Chưa thực hiện đo. Nhấn <strong>"Đo Độ Trễ Ngay"</strong> để kiểm tra chất lượng đường truyền Internet & LAN.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Máy Chủ Đích</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Địa Chỉ IP</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Độ Trễ Trung Bình</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Min / Max (ms)</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Rớt Gói (Loss)</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Đánh Giá Chất Lượng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pingTargets.map((t, idx) => {
                          const isSuccess = t.status === 'OK';
                          const latency = t.avgMs || 0;
                          let qualityBadge = { bg: '#ecfdf5', color: '#065f46', text: 'Cực tốt / Ổn định' };
                          if (!isSuccess || t.lossPercent > 20) {
                            qualityBadge = { bg: '#fef2f2', color: '#991b1b', text: 'Mất kết nối / Rớt gói' };
                          } else if (latency > 100 || t.lossPercent > 0) {
                            qualityBadge = { bg: '#fffbeb', color: '#b45309', text: 'Trung bình / Lag nhẹ' };
                          }

                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>{t.name}</td>
                              <td style={{ padding: '10px 12px' }}>
                                <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{t.ip}</code>
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: 800, color: isSuccess ? (latency < 50 ? '#16a34a' : '#d97706') : '#dc2626' }}>
                                {isSuccess ? `${latency} ms` : 'Timeout'}
                              </td>
                              <td style={{ padding: '10px 12px', color: '#64748b' }}>
                                {isSuccess ? `${t.minMs} ms / ${t.maxMs} ms` : '---'}
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: 700, color: t.lossPercent === 0 ? '#16a34a' : '#dc2626' }}>
                                {t.lossPercent}% ({t.received}/{t.sent})
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4, background: qualityBadge.bg, color: qualityBadge.color }}>
                                  {qualityBadge.text}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Wi-Fi Password Manager */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>Danh Sách Mật Khẩu Wi-Fi Đã Lưu ({savedWifiList.length})</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Trích xuất mật khẩu bản rõ của các mạng Wi-Fi máy từng kết nối</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Tìm tên Wi-Fi (SSID)..."
                      value={wifiSearchQuery}
                      onChange={e => setWifiSearchQuery(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', width: 180 }}
                    />
                    <button onClick={handleFetchSavedWifi} disabled={isLoadingWifi} className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <RefreshCw size={13} className={isLoadingWifi ? 'spin' : ''} /> Quét Lại
                    </button>
                    <button onClick={exportWifiToTxt} disabled={!savedWifiList.length} className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, background: '#1d4ed8', cursor: 'pointer' }}>
                      <FileText size={13} /> Xuất File TXT
                    </button>
                  </div>
                </div>

                {isLoadingWifi ? (
                  <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
                    Đang quét danh sách hồ sơ Wi-Fi trên máy tính...
                  </div>
                ) : savedWifiList.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 8 }}>
                    Không tìm thấy cấu hình Wi-Fi nào đã lưu hoặc máy tính không trang bị card Wi-Fi.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>#</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Tên Mạng Wi-Fi (SSID)</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Chuẩn Bảo Mật</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Mật Khẩu (Password)</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {savedWifiList
                          .filter(w => !wifiSearchQuery || (w.SSID && w.SSID.toLowerCase().includes(wifiSearchQuery.toLowerCase())))
                          .map((w, idx) => {
                            const isRevealed = !!showWifiPass[w.SSID];
                            const isCopied = copiedWifiSsid === w.SSID;
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{idx + 1}</td>
                                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Wifi size={14} color="#0284c7" />
                                    {w.SSID}
                                  </div>
                                </td>
                                <td style={{ padding: '10px 12px', color: '#64748b' }}>
                                  <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                                    {w.Auth || 'WPA2'}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                  {w.Password ? (
                                    <code style={{
                                      background: isRevealed ? '#ecfdf5' : '#f1f5f9',
                                      color: isRevealed ? '#065f46' : '#334155',
                                      padding: '3px 8px',
                                      borderRadius: 4,
                                      fontWeight: 700,
                                      fontSize: 12
                                    }}>
                                      {isRevealed ? w.Password : '••••••••••••'}
                                    </code>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: 12 }}>Mạng mở (Không pass)</span>
                                  )}
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                    {w.Password && (
                                      <button
                                        onClick={() => setShowWifiPass(prev => ({ ...prev, [w.SSID]: !prev[w.SSID] }))}
                                        className="btn-secondary"
                                        style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                        title={isRevealed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                                      >
                                        {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                                      </button>
                                    )}
                                    {w.Password && (
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(w.Password);
                                          setCopiedWifiSsid(w.SSID);
                                          setTimeout(() => setCopiedWifiSsid(null), 2000);
                                        }}
                                        className="btn-secondary"
                                        style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: isCopied ? '#16a34a' : '#334155', cursor: 'pointer' }}
                                        title="Sao chép mật khẩu"
                                      >
                                        {isCopied ? <Check size={13} /> : <Copy size={13} />}
                                        {isCopied ? 'Đã chép' : 'Chép'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* LAN IP & Device Scanner */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Network size={18} color="#0284c7" /> Quét Toàn Bộ Thiết Bị Mạng LAN Nội Bộ ({lanDevices.length})
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Tự động dò tìm tất cả máy tính, máy in mạng, camera, máy siêu âm, điện thoại và router trong mạng nội bộ
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Lọc theo IP / Hostname / MAC..."
                      value={lanFilterQuery}
                      onChange={e => setLanFilterQuery(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', width: 220 }}
                    />
                    <button
                      onClick={handleScanLan}
                      disabled={isScanningLan}
                      className="btn-primary"
                      style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, background: '#0284c7', cursor: 'pointer' }}
                    >
                      <RefreshCw size={13} className={isScanningLan ? 'spin' : ''} />
                      {isScanningLan ? 'Đang quét toàn mạng LAN...' : 'Quét Mạng LAN Ngay'}
                    </button>
                  </div>
                </div>

                {isScanningLan ? (
                  <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px', color: '#0284c7' }} />
                    Đang quét bảng ARP và các địa chỉ IP trong mạng nội bộ...
                  </div>
                ) : lanDevices.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 8 }}>
                    Chưa quét thiết bị hoặc không tìm thấy thiết bị nào trong dải mạng hiện tại. Nhấn "Quét Mạng LAN Ngay".
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>#</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Địa Chỉ IP</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Tên Thiết Bị (Hostname)</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Địa Chỉ MAC</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Trạng Thái</th>
                          <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lanDevices
                          .filter(d => {
                            if (!lanFilterQuery) return true;
                            const q = lanFilterQuery.toLowerCase();
                            return (d.ip && d.ip.includes(q)) || (d.hostname && d.hostname.toLowerCase().includes(q)) || (d.mac && d.mac.toLowerCase().includes(q));
                          })
                          .map((d, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{idx + 1}</td>
                              <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
                                  <code>{d.ip}</code>
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px', color: '#334155', fontWeight: 600 }}>
                                {d.hostname}
                              </td>
                              <td style={{ padding: '10px 12px', color: '#64748b' }}>
                                <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                                  {d.mac}
                                </code>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#ecfdf5', color: '#065f46' }}>
                                  Online
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                  <a
                                    href={`http://${d.ip}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      padding: '4px 8px', fontSize: 11, borderRadius: 4, textDecoration: 'none',
                                      background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1d4ed8',
                                      display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600
                                    }}
                                    title="Mở giao diện Web quản trị thiết bị này"
                                  >
                                    <ExternalLink size={12} /> Mở Web
                                  </a>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(d.ip);
                                      showToast.success(`Đã sao chép địa chỉ IP: ${d.ip}`);
                                    }}
                                    style={{
                                      padding: '4px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #cbd5e1',
                                      background: '#fff', color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3
                                    }}
                                    title="Sao chép IP"
                                  >
                                    <Copy size={12} /> Chép IP
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 15. LỐI TẮT CỨU HỘ WINDOWS */}
          {activeSubTab === 'windows_shortcuts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200 }}>
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Terminal size={18} color="#1d4ed8" />
                  Trung Tâm Lối Tắt Công Cụ Cứu Hộ Windows
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  Kích hoạt tức thì các bảng điều khiển hệ thống và chẩn đoán phần cứng chuyên sâu của Microsoft Windows chỉ bằng 1 click
                </div>
              </div>

              {/* Hộp Tiện Ích Đỉnh Cao: Sao Lưu Driver & Điều Khiển Nguồn / BIOS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
                {/* Sao lưu Driver DISM */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <FolderDown size={17} color="#0284c7" /> Sao Lưu Toàn Bộ Driver Bằng DISM
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.4 }}>
                    Trích xuất tất cả driver phần cứng của máy (Mainboard, Card màn hình, Wi-Fi, Âm thanh...) bằng công nghệ Microsoft DISM chính hãng ra thư mục ổ D hoặc E.
                  </div>

                  <button
                    onClick={handleBackupDrivers}
                    disabled={isBackingUpDrivers}
                    style={{
                      width: '100%', padding: '9px 14px', borderRadius: 8, border: 'none',
                      background: 'linear-gradient(135deg, #0284c7, #0369a1)', color: '#fff',
                      fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer'
                    }}
                  >
                    {isBackingUpDrivers ? <RefreshCw size={15} className="spin" /> : <FolderDown size={15} />}
                    {isBackingUpDrivers ? 'Đang trích xuất Driver bằng DISM...' : 'Sao Lưu Toàn Bộ Driver Ngay'}
                  </button>

                  {backupDriverMsg && (
                    <div style={{
                      marginTop: 10, padding: 10, borderRadius: 8, fontSize: 11.5,
                      background: backupDriverDir ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${backupDriverDir ? '#bbf7d0' : '#fecaca'}`,
                      color: backupDriverDir ? '#166534' : '#991b1b',
                      wordBreak: 'break-all'
                    }}>
                      {backupDriverMsg}
                    </div>
                  )}
                </div>

                {/* Khởi Động Vào BIOS & Hẹn Giờ Tắt Máy */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#e11d48', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Power size={17} color="#e11d48" /> Khởi Động Vào BIOS & Hẹn Giờ Nguồn
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.4 }}>
                    Khởi động thẳng vào màn hình BIOS/UEFI không cần bấm phím tắt, hoặc hẹn giờ tự động tắt máy thông minh.
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      onClick={() => handlePowerAction('reboot-bios')}
                      style={{
                        width: '100%', padding: '8px 14px', borderRadius: 8, border: '1px solid #fecdd3',
                        background: '#fff1f2', color: '#be123c',
                        fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer'
                      }}
                    >
                      <Power size={14} /> Khởi Động Thẳng Vào BIOS / UEFI (1-Click)
                    </button>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        max="720"
                        value={shutdownMinutes}
                        onChange={e => setShutdownMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: 75, padding: '7px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, textAlign: 'center' }}
                        title="Số phút hẹn giờ"
                      />
                      <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>phút</span>
                      <button
                        onClick={() => handlePowerAction('schedule-shutdown', shutdownMinutes)}
                        style={{
                          flex: 1, padding: '7px 10px', borderRadius: 6, border: 'none',
                          background: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}
                      >
                        Hẹn Giờ Tắt
                      </button>
                      <button
                        onClick={() => handlePowerAction('cancel-shutdown')}
                        style={{
                          padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1',
                          background: '#f8fafc', color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}
                      >
                        Hủy
                      </button>
                    </div>
                  </div>

                  {powerMsg && (
                    <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 11.5, fontWeight: 600 }}>
                      ℹ️ {powerMsg}
                    </div>
                  )}
                </div>

                {/* Sao Lưu Nhanh Dữ Liệu Profile Người Dùng */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#059669', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <HardDrive size={17} color="#059669" /> Sao Lưu Nhanh Dữ Liệu Desktop & Profile
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.4 }}>
                    Tự động sao chép toàn bộ thư mục Màn hình (Desktop), Tài liệu (Documents) và Tải về (Downloads) sang ổ D hoặc E bằng Robocopy trước khi cài lại Windows.
                  </div>

                  <button
                    onClick={handleBackupUserData}
                    disabled={isBackingUpUserData}
                    style={{
                      width: '100%', padding: '9px 14px', borderRadius: 8, border: 'none',
                      background: 'linear-gradient(135deg, #059669, #047857)', color: '#fff',
                      fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer'
                    }}
                  >
                    {isBackingUpUserData ? <RefreshCw size={15} className="spin" /> : <HardDrive size={15} />}
                    {isBackingUpUserData ? 'Đang sao lưu Desktop / Docs / Downloads...' : 'Sao Lưu Dữ Liệu Người Dùng Ngay'}
                  </button>

                  {backupUserDataResult && (
                    <div style={{
                      marginTop: 10, padding: 10, borderRadius: 8, fontSize: 11.5,
                      background: backupUserDataResult.ok ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${backupUserDataResult.ok ? '#bbf7d0' : '#fecaca'}`,
                      color: backupUserDataResult.ok ? '#166534' : '#991b1b',
                      wordBreak: 'break-all'
                    }}>
                      {backupUserDataResult.ok ? (
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>✓ {backupUserDataResult.message}</div>
                          <div>• Thư mục lưu trữ: <code>{backupUserDataResult.targetDir}</code></div>
                          {backupUserDataResult.folders && (
                            <div style={{ marginTop: 4 }}>
                              • Các thư mục đã gom: {backupUserDataResult.folders.map((f: any) => f.name).join(', ')}
                            </div>
                          )}
                          <div style={{ marginTop: 6 }}>
                            <button
                              onClick={() => {
                                const eAPI = (window as any).electronAPI;
                                if (eAPI?.pcTools?.openFileLocation) eAPI.pcTools.openFileLocation(backupUserDataResult.targetDir);
                              }}
                              style={{
                                padding: '3px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #a7f3d0',
                                background: '#fff', color: '#065f46', cursor: 'pointer', fontWeight: 600
                              }}
                            >
                              Mở thư mục sao lưu
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>⚠️ {backupUserDataResult.error || 'Thất bại khi sao lưu'}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Trung Tâm Điểm Phục Hồi Hệ Thống */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <History size={18} color="#7c3aed" /> Quản Lý Điểm Phục Hồi Hệ Thống (System Restore)
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Tạo điểm sao lưu trước khi cài app lạ hoặc tinh chỉnh hệ thống, giúp khôi phục máy tính khi gặp sự cố
                    </div>
                  </div>
                  <button
                    onClick={handleOpenRestoreGui}
                    style={{
                      padding: '6px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1',
                      background: '#f8fafc', color: '#1e293b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'
                    }}
                  >
                    <ExternalLink size={13} /> Mở Trình Khôi Phục (rstrui.exe)
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={newRestoreDesc}
                    onChange={e => setNewRestoreDesc(e.target.value)}
                    placeholder="Nhập tên điểm phục hồi..."
                    style={{ flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                  />
                  <button
                    onClick={handleCreateRestorePoint}
                    disabled={isCreatingRestore}
                    className="btn-primary"
                    style={{ padding: '8px 16px', fontSize: 12, background: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <Sparkles size={14} className={isCreatingRestore ? 'spin' : ''} />
                    {isCreatingRestore ? 'Đang tạo điểm khôi phục...' : 'Tạo Điểm Khôi Phục Ngay'}
                  </button>
                  <button
                    onClick={handleGetRestorePoints}
                    disabled={isLoadingRestore}
                    className="btn-secondary"
                    style={{ padding: '8px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                  >
                    <RefreshCw size={13} className={isLoadingRestore ? 'spin' : ''} /> Làm Mới
                  </button>
                </div>

                {restoreStatusMsg && (
                  <div style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#5b21b6', fontSize: 12, fontWeight: 600 }}>
                    ℹ️ {restoreStatusMsg}
                  </div>
                )}

                {isLoadingRestore ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                    Đang truy vấn danh sách điểm khôi phục...
                  </div>
                ) : restorePoints.length === 0 ? (
                  <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                    Chưa có điểm phục hồi nào trên máy tính. Bạn nên nhấn nút "Tạo Điểm Khôi Phục Ngay" để dự phòng.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {restorePoints.map((pt, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #f1f5f9', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, color: '#7c3aed' }}>#{pt.SequenceNumber}</span>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{pt.Description}</span>
                        </div>
                        <span style={{ color: '#64748b', fontSize: 11 }}>
                          {pt.CreationTime ? pt.CreationTime.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$3/$2/$1') : 'Gần đây'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {[
                  { id: 'devmgmt', title: 'Device Manager', code: 'devmgmt.msc', desc: 'Quản lý thiết bị phần cứng, cập nhật & khắc phục xung đột driver', color: '#1d4ed8' },
                  { id: 'diskmgmt', title: 'Disk Management', code: 'diskmgmt.msc', desc: 'Quản lý ổ đĩa, phân vùng, định dạng NTFS/FAT32, gán ký tự ổ', color: '#059669' },
                  { id: 'ncpa', title: 'Network Connections', code: 'ncpa.cpl', desc: 'Cấu hình card mạng LAN / Wi-Fi, đặt IP tĩnh, DNS và xem tốc độ link', color: '#0284c7' },
                  { id: 'services', title: 'Windows Services', code: 'services.msc', desc: 'Quản lý toàn bộ tiến trình dịch vụ ngầm khởi động cùng hệ thống', color: '#7c3aed' },
                  { id: 'regedit', title: 'Registry Editor', code: 'regedit.exe', desc: 'Trình chỉnh sửa cơ sở dữ liệu đăng ký cấu hình chuyên sâu của Windows', color: '#dc2626' },
                  { id: 'dxdiag', title: 'DirectX Diagnostic', code: 'dxdiag.exe', desc: 'Kiểm tra chi tiết chip đồ họa, card màn hình, âm thanh & Direct3D', color: '#ea580c' },
                  { id: 'msinfo32', title: 'System Information', code: 'msinfo32.exe', desc: 'Báo cáo toàn cảnh thông số phần cứng, BIOS và xung đột IRQ', color: '#2563eb' },
                  { id: 'taskmgr', title: 'Task Manager', code: 'taskmgr.exe', desc: 'Giám sát mức tải CPU, RAM, Disk, GPU và tiến trình khởi động', color: '#0891b2' },
                  { id: 'resmon', title: 'Resource Monitor', code: 'resmon.exe', desc: 'Theo dõi tài nguyên chi tiết từng luồng mạng, ổ đĩa và bộ nhớ', color: '#4f46e5' },
                  { id: 'msconfig', title: 'System Configuration', code: 'msconfig.exe', desc: 'Cấu hình Safe Mode, quản lý Boot Loader và khởi động an toàn', color: '#d97706' },
                  { id: 'cleanmgr', title: 'Disk Cleanup', code: 'cleanmgr.exe', desc: 'Dọn dẹp file rác, file cập nhật Windows Update cũ trên ổ đĩa C', color: '#16a34a' },
                  { id: 'control', title: 'Control Panel', code: 'control.exe', desc: 'Mở bảng điều khiển hệ điều hành giao diện cổ điển truyền thống', color: '#475569' },
                  { id: 'sysdm', title: 'System Properties', code: 'sysdm.cpl', desc: 'Cài đặt biến môi trường Environment, bảo vệ hệ thống System Restore', color: '#6366f1' },
                  { id: 'firewall', title: 'Windows Firewall', code: 'firewall.cpl', desc: 'Cấu hình luật tường lửa, mở cổng port inbound/outbound mạng', color: '#be123c' },
                  { id: 'appwiz', title: 'Programs & Features', code: 'appwiz.cpl', desc: 'Cửa sổ gỡ cài đặt phần mềm và kích hoạt tính năng Windows Features', color: '#0d9488' }
                ].map(tool => (
                  <div key={tool.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{tool.title}</span>
                        <code style={{ fontSize: 11, background: '#f1f5f9', color: tool.color, padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                          {tool.code}
                        </code>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12, lineHeight: 1.4 }}>
                        {tool.desc}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLaunchWinTool(tool.id)}
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', cursor: 'pointer' }}
                    >
                      <ExternalLink size={13} /> Mở Công Cụ
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* FULLSCREEN DEAD PIXEL TEST OVERLAY */}
      {isDeadPixelTest && (
        <div
          onClick={() => setDeadPixelColorIndex(prev => (prev + 1) % deadPixelColors.length)}
          onContextMenu={e => { e.preventDefault(); setDeadPixelColorIndex(prev => (prev - 1 + deadPixelColors.length) % deadPixelColors.length); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: deadPixelColors[deadPixelColorIndex].hex,
            cursor: 'none',
            userSelect: 'none'
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setIsDeadPixelTest(false); }}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '999px',
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <X size={14} /> Thoát (ESC)
          </button>

          <div
            style={{
              position: 'absolute',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.7)',
              color: '#fff',
              padding: '8px 18px',
              borderRadius: 20,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              pointerEvents: 'none'
            }}
          >
            <span>Màu: <strong>{deadPixelColors[deadPixelColorIndex].name}</strong> ({deadPixelColorIndex + 1}/{deadPixelColors.length})</span>
            <span style={{ opacity: 0.7 }}>· Click chuột / Phím cách: Đổi màu · Phím ESC: Thoát</span>
          </div>
        </div>
      )}

      {/* EXPORT REPORT MODAL */}
      {showExportReportModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 840,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} color="#059669" />
                Phiếu Kiểm Định & Bàn Giao Thiết Bị Máy Tính
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => window.print()}
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 14px', background: '#059669', cursor: 'pointer' }}
                >
                  <Printer size={14} /> In Phiếu / Lưu PDF
                </button>
                <button
                  onClick={() => setShowExportReportModal(false)}
                  className="btn-secondary"
                  style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
                >
                  Đóng
                </button>
              </div>
            </div>

            {/* Printable Content */}
            <div id="print-area" style={{ padding: 24, overflowY: 'auto', fontSize: 12, color: '#1e293b' }}>
              <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #0f172a', paddingBottom: 14 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#64748b' }}>DMH PC DIAGNOSTIC & MANAGEMENT SUITE</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: '4px 0' }}>BIÊN BẢN KIỂM ĐỊNH KỸ THUẬT & BÀN GIAO THIẾT BỊ</div>
                <div style={{ fontSize: 11, color: '#475569' }}>Thời gian lập: {new Date().toLocaleString('vi-VN')}</div>
              </div>

              {/* People Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, border: '1px solid #e2e8f0' }}>
                <div>
                  <label style={{ fontWeight: 700, display: 'block', fontSize: 11, color: '#475569' }}>Kỹ thuật viên thực hiện:</label>
                  <input
                    type="text"
                    value={techName}
                    onChange={e => setTechName(e.target.value)}
                    style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #cbd5e1', marginTop: 2 }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: 'block', fontSize: 11, color: '#475569' }}>Người nhận thiết bị:</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #cbd5e1', marginTop: 2 }}
                  />
                </div>
              </div>

              {/* Hardware Summary */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#1d4ed8', borderBottom: '1px solid #bfdbfe', paddingBottom: 4, marginBottom: 8 }}>
                  1. CẤU HÌNH PHẦN CỨNG CHI TIẾT
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 8px', width: 140, fontWeight: 700, color: '#475569' }}>Vi xử lý (CPU):</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{hwData?.CPUs?.[0]?.Name || 'N/A'} ({hwData?.CPUs?.[0]?.NumberOfCores || 0} nhân {hwData?.CPUs?.[0]?.NumberOfLogicalProcessors || 0} luồng)</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#475569' }}>Bộ nhớ (RAM):</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                        {laptopHealth?.RAM?.reduce((sum: number, r: any) => sum + (r.CapacityGB || 0), 0) || 0} GB tổng cộng · {laptopHealth?.RAM?.length || 0} thanh cắm ({laptopHealth?.RAM?.map((r: any) => `${r.CapacityGB}GB ${r.Manufacturer}`).join(', ')})
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#475569' }}>Bo mạch chủ:</td>
                      <td style={{ padding: '6px 8px' }}>{laptopHealth?.BaseBoard?.Manufacturer || ''} {laptopHealth?.BaseBoard?.Product || ''} (BIOS: {laptopHealth?.BIOS?.SMBIOSBIOSVersion || ''} - {laptopHealth?.BIOS?.ReleaseDate || ''})</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#475569' }}>Card màn hình (GPU):</td>
                      <td style={{ padding: '6px 8px' }}>{hwData?.GPUs?.map(g => `${g.Name} (${(g as any).VRAM_GB || (g as any).AdapterRAMGB || 0}GB)`).join(' | ') || 'N/A'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#475569' }}>Hệ điều hành:</td>
                      <td style={{ padding: '6px 8px' }}>{laptopHealth?.OS?.Caption || 'Windows'} (Ngày cài: {laptopHealth?.OS?.InstallDate || 'N/A'})</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Disk Health */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#d97706', borderBottom: '1px solid #fde68a', paddingBottom: 4, marginBottom: 8 }}>
                  2. SỨC KHỎE Ổ CỨNG VẬT LÝ (SMART HEALTH & WEAR)
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px' }}>Tên Ổ Cứng</th>
                      <th style={{ padding: '6px 8px' }}>Dung Lượng</th>
                      <th style={{ padding: '6px 8px' }}>Phân Loại</th>
                      <th style={{ padding: '6px 8px' }}>Sức Khỏe (%)</th>
                      <th style={{ padding: '6px 8px' }}>Nhiệt Độ</th>
                      <th style={{ padding: '6px 8px' }}>Thời Gian Đã Chạy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laptopHealth?.Disks?.map((d: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 700 }}>{d.Name}</td>
                        <td style={{ padding: '6px 8px' }}>{d.SizeGB} GB</td>
                        <td style={{ padding: '6px 8px' }}>{d.MediaType || 'Ổ đĩa'}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 800, color: (d.HealthPercent || 100) >= 90 ? '#16a34a' : '#dc2626' }}>
                          {d.HealthPercent || 100}% ({d.HealthStatus === 'Healthy' ? 'Tốt' : d.HealthStatus})
                        </td>
                        <td style={{ padding: '6px 8px' }}>{d.Temperature ? `${d.Temperature}°C` : 'N/A'}</td>
                        <td style={{ padding: '6px 8px' }}>{d.PowerOnHours ? `${d.PowerOnHours.toLocaleString()}h (~${Math.round(d.PowerOnHours / 24)}d)` : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Battery & Serials */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 12, color: '#059669', borderBottom: '1px solid #bbf7d0', paddingBottom: 4, marginBottom: 6 }}>
                    3. TÌNH TRẠNG PIN
                  </div>
                  {laptopHealth?.Battery?.HasBattery ? (
                    <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div>• Dung lượng thiết kế: <strong>{laptopHealth.Battery.DesignedCapacity} mWh</strong></div>
                      <div>• Dung lượng sạc đầy: <strong>{laptopHealth.Battery.FullChargedCapacity} mWh</strong></div>
                      <div>• Độ chai pin: <strong style={{ color: laptopHealth.Battery.WearPercent < 20 ? '#16a34a' : '#dc2626' }}>{laptopHealth.Battery.WearPercent}%</strong></div>
                      <div>• Số chu kỳ sạc: <strong>{laptopHealth.Battery.CycleCount} lần</strong></div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#64748b' }}>Máy tính để bàn (PC) / Không sử dụng pin</div>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 800, fontSize: 12, color: '#7c3aed', borderBottom: '1px solid #ddd6fe', paddingBottom: 4, marginBottom: 6 }}>
                    4. ĐỐI CHIẾU ĐỊNH DANH SERIAL
                  </div>
                  <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div>• Serial BIOS: <strong>{laptopHealth?.BIOS?.SerialNumber || 'N/A'}</strong></div>
                    <div>• Serial Bo mạch: <strong>{laptopHealth?.BaseBoard?.SerialNumber || 'N/A'}</strong></div>
                    <div>• UUID Thiết Bị: <code style={{ fontSize: 10 }}>{laptopHealth?.SystemProduct?.UUID || 'N/A'}</code></div>
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 30, textAlign: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 50 }}>KỸ THUẬT VIÊN KIỂM ĐỊNH</div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{techName}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>(Ký và ghi rõ họ tên)</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 50 }}>NGƯỜI NHẬN THIẾT BỊ</div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{customerName}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>(Ký xác nhận tình trạng)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── QUICK COMMAND PALETTE MODAL (CTRL + K) ── */}
      {isQuickSearchOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)', zIndex: 9999,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: '10vh'
        }} onClick={() => setIsQuickSearchOpen(false)}>
          <div style={{
            background: '#fff', width: '92%', maxWidth: 640, borderRadius: 14,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '1px solid #cbd5e1', overflow: 'hidden',
            display: 'flex', flexDirection: 'column'
          }} onClick={e => e.stopPropagation()}>
            
            {/* Input Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
              borderBottom: '1px solid #e2e8f0', background: '#f8fafc'
            }}>
              <Search size={20} color="#0284c7" />
              <input
                type="text"
                autoFocus
                placeholder="Tìm nhanh công cụ hoặc gõ: pin, wifi, ram, máy in, sao lưu, office..."
                value={quickSearchQuery}
                onChange={e => setQuickSearchQuery(e.target.value)}
                style={{
                  flex: 1, border: 'none', background: 'transparent', outline: 'none',
                  fontSize: 15, color: '#0f172a', fontWeight: 600
                }}
              />
              <span style={{ fontSize: 11, background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                ESC để đóng
              </span>
            </div>

            {/* Results List */}
            <div style={{ maxHeight: 380, overflowY: 'auto', padding: 8 }}>
              {(() => {
                const q = quickSearchQuery.trim().toLowerCase();
                const filtered = SEARCHABLE_FEATURES.filter(item => {
                  if (!q) return true;
                  return (
                    item.name.toLowerCase().includes(q) ||
                    item.desc.toLowerCase().includes(q) ||
                    item.keywords.some(k => k.toLowerCase().includes(q))
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                      Không tìm thấy công cụ nào phù hợp với từ khóa "{quickSearchQuery}".
                    </div>
                  );
                }

                return filtered.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setActiveSubTab(item.id);
                      setIsQuickSearchOpen(false);
                      setQuickSearchQuery('');
                    }}
                    style={{
                      padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>
                        <span>{item.name}</span>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
                          {item.category}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{item.desc}</div>
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>
                      Mở ↵
                    </span>
                  </div>
                ));
              })()}
            </div>

            {/* Footer */}
            <div style={{
              padding: '8px 16px', background: '#f1f5f9', borderTop: '1px solid #e2e8f0',
              fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between'
            }}>
              <span>DMH Quick Command Palette (Phím tắt: Ctrl + K)</span>
              <span>Tổng cộng {SEARCHABLE_FEATURES.length} tính năng thực chiến</span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
