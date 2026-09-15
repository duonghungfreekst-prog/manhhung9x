/**
 * DMH_Tools - Modular On-Demand Feature Manifest
 * Quản lý danh mục các module tải động theo bản quyền từ GitHub Releases
 */

import { TAB_BITS, type TabName } from './licenseManager';

export interface ModuleInfo {
  id: string;
  name: string;
  shortDesc: string;
  fullDesc: string;
  category: 'CLINICAL' | 'OFFICE' | 'SYSTEM' | 'AI';
  version: string;
  sizeMb: number;
  iconName: string;
  relatedTabs: TabName[];
  licenseBitRequired: number;
  releaseAssetFileName: string; // Tên tệp trên GitHub Releases, ví dụ: 'dmh-mod-endoscopy-v6.6.0.zip'
  requiredFiles: string[];       // Danh sách tệp cần có để xác nhận đã cài đặt hoàn tất
}

export const DEFAULT_GITHUB_REPO = 'duonghungfreekst-prog/manhhung9x';

export const MODULE_REGISTRY: Record<string, ModuleInfo> = {
  mod_endoscopy: {
    id: 'mod_endoscopy',
    name: 'Trạm Nội Soi AI 4K & Xử Lý Thị Giác',
    shortDesc: 'Bộ lọc quang học NBI, Thước Caliper ảo, HDMI Trigger & Python Server',
    fullDesc: 'Cung cấp toàn bộ máy chủ bắt hình độ phân giải 4K UHD DirectShow, bộ lọc màu NBI 415/540nm thời gian thực, thước đo polyp và thuật toán AI nhận diện cóc đạp máy soi qua cáp HDMI.',
    category: 'CLINICAL',
    version: '6.7.4',
    sizeMb: 62,
    iconName: 'Eye',
    relatedTabs: ['endoscopy'],
    licenseBitRequired: TAB_BITS.endoscopy,
    releaseAssetFileName: 'dmh-mod-endoscopy-v6.7.4.zip',
    requiredFiles: [
      'python_core/endoscopy_server/endoscopy_server.exe',
      'scripts/install_camera_driver.bat'
    ],
  },
  mod_hiscall: {
    id: 'mod_hiscall',
    name: 'Màn Chờ TV & Giọng Đọc Piper TTS Offline',
    shortDesc: 'Mô hình phát thanh âm thanh Neural Tiếng Việt & Màn hình hiển thị hàng đợi',
    fullDesc: 'Chứa mô hình trí tuệ nhân tạo phát âm tiếng Việt chuẩn y khoa (Piper ONNX) chạy 100% offline không cần mạng, cùng giao diện màn hình chờ Full HD cho phòng khám.',
    category: 'AI',
    version: '6.7.4',
    sizeMb: 101,
    iconName: 'Tv',
    relatedTabs: ['hiscall'],
    licenseBitRequired: TAB_BITS.hiscall,
    releaseAssetFileName: 'dmh-mod-hiscall-v6.7.4.zip',
    requiredFiles: [
      'vendor/piper/piper.exe',
      'scripts/tts_server.py'
    ],
  },
  mod_converter: {
    id: 'mod_converter',
    name: 'Bộ Chuyển Đổi & PDF Engine Chuyên Sâu',
    shortDesc: 'Engine trích xuất và chuyển đổi tài liệu y khoa định dạng cao',
    fullDesc: 'Bộ xử lý tệp tin nhị phân và tài liệu y bạ số, chuyển đổi hồ sơ bệnh án sang PDF bảo mật và nén tệp cận lâm sàng dung lượng lớn.',
    category: 'OFFICE',
    version: '6.7.4',
    sizeMb: 83,
    iconName: 'FileSpreadsheet',
    relatedTabs: ['converter'],
    licenseBitRequired: TAB_BITS.converter,
    releaseAssetFileName: 'dmh-mod-converter-v6.7.4.zip',
    requiredFiles: [
      'bin/convert_pdf.exe'
    ],
  },
  mod_compare: {
    id: 'mod_compare',
    name: 'Máy Chủ Đối Chiếu Hồ Sơ BHYT 3176 XML',
    shortDesc: 'Engine so khớp dữ liệu cổng giám định BHYT và HIS bệnh viện',
    fullDesc: 'Máy chủ so sánh đa luồng phân tích hàng trăm nghìn dòng dữ liệu chi phí khám chữa bệnh BHYT, phát hiện lệch tiền viện phí và xuất toán tức thì.',
    category: 'SYSTEM',
    version: '6.7.4',
    sizeMb: 14,
    iconName: 'GitCompare',
    relatedTabs: ['compare'],
    licenseBitRequired: TAB_BITS.compare,
    releaseAssetFileName: 'dmh-mod-compare-v6.7.4.zip',
    requiredFiles: [
      'python_core/compare_server/compare_server.exe',
      'python_core/xml3176_server/xml3176_server.exe'
    ],
  },
};

export const MODULE_LIST = Object.values(MODULE_REGISTRY);

/**
 * Kiểm tra xem một tab có yêu cầu tải module ngoài không
 */
export function getRequiredModuleForTab(tab: TabName): ModuleInfo | null {
  for (const mod of MODULE_LIST) {
    if (mod.relatedTabs.includes(tab)) {
      return mod;
    }
  }
  return null;
}

/**
 * Lấy cấu hình GitHub Repo lưu trữ
 */
export function getSavedGithubRepo(): string {
  try {
    return localStorage.getItem('dmh_module_github_repo') || DEFAULT_GITHUB_REPO;
  } catch {
    return DEFAULT_GITHUB_REPO;
  }
}

/**
 * Lưu cấu hình GitHub Repo
 */
export function saveGithubRepo(repo: string): void {
  try {
    localStorage.setItem('dmh_module_github_repo', repo.trim());
  } catch {}
}
