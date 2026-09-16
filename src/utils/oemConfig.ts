/**
 * Quản lý Cấu hình Thương hiệu OEM / White-Label cho DMH Tools
 * Cho phép phòng khám / bệnh viện cá nhân hóa Tên, Slogan, Hotline, Logo
 */

export interface OemConfig {
  clinicName: string;
  slogan:     string;
  hotline:    string;
  address:    string;
  techSupport: string;
  logoUrl?:   string; // Data URL Base64 hoặc đường dẫn ảnh
}

export const DEFAULT_OEM_CONFIG: OemConfig = {
  clinicName:  'Hệ Thống Y Tế & Kỹ Thuật Máy Tính DMH',
  slogan:      'Giải Pháp Công Nghệ Y Khoa & Quản Trị Hạ Tầng IT Toàn Diện',
  hotline:     '0342041517',
  address:     'Thái Nguyên',
  techSupport: 'Trung tâm Hỗ trợ Kỹ thuật & Cứu hộ Phần Mềm DMH',
};

const LS_OEM_KEY = 'dmh_oem_branding_config';

export function loadOemConfig(): OemConfig {
  // Cấu hình thương hiệu mặc định cố định theo bản quyền DMH
  return DEFAULT_OEM_CONFIG;
}

export function saveOemConfig(_config?: Partial<OemConfig>): OemConfig { // eslint-disable-line @typescript-eslint/no-unused-vars
  // Khóa cố định: không thể thay đổi thông tin thương hiệu mặc định
  return DEFAULT_OEM_CONFIG;
}

export function resetOemConfig(): OemConfig {
  localStorage.removeItem(LS_OEM_KEY);
  return DEFAULT_OEM_CONFIG;
}
