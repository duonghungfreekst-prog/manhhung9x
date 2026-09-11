/**
 * DMH_Tools License Manager v5.0 (Commercial Grade)
 * - AES-256-GCM + Bitmask + Base32 + Hardware ID Locking
 * - Chế độ dùng thử 3 ngày thông minh (Smart 3-Day Trial)
 * - Khóa bản quyền gắn chặt mã phần cứng (Anti-Piracy HWID Lock)
 * - Phân cấp gói thương mại (Tiers): IT_PRO, CLINIC_STANDARD, HOSPITAL_ENTERPRISE
 * - Payload: SALT-MASK-EXPIRY-MAXUSES-HWID-TIER-CUSTOMER
 */

// ─── Bitmask Tab Permissions ──────────────────────────────────────────────────
export const TAB_BITS = {
  compare:        1,     // 000000000000001 — Đối Chiếu Hồ Sơ BHYT
  reader:         2,     // 000000000000010 — Đọc XML / CSV
  converter:      4,     // 000000000000100 — Chuyển Đổi File
  filter:         8,     // 000000000001000 — Lọc Dữ Liệu
  printer:        16,    // 000000000010000 — Máy In & Spooler
  repair:         32,    // 000000000100000 — Sửa File
  selfbuilt:      64,    // 000000001000000 — Self-Built 01
  endoscopy:      128,   // 000000010000000 — Nội Soi AI 4K
  hiscall:        256,   // 000000100000000 — Gọi Bệnh Nhân HIS & Màn Chờ TV
  attendance:     512,   // 000001000000000 — Máy Chấm Công & Phân Ca
  bhytcheck:      1024,  // 000010000000000 — Kiểm Tra BHYT
  signature:      2048,  // 000100000000000 — Ký Số XML
  dcbhyt:         4096,  // 001000000000000 — Đối Chiếu 01BH
  officeformulas: 8192,  // 010000000000000 — Công Thức Office
  pctools:        16384, // 100000000000000 — Kỹ Thuật Máy Tính & Cứu Hộ PC
} as const;

export type TabName = keyof typeof TAB_BITS;
export const ALL_TABS: TabName[] = [
  'compare', 'reader', 'converter', 'filter', 'printer', 'repair',
  'selfbuilt', 'endoscopy', 'hiscall', 'attendance', 'bhytcheck',
  'signature', 'dcbhyt', 'officeformulas', 'pctools'
];
export const FULL_MASK = Object.values(TAB_BITS).reduce((a, b) => a | b, 0);

export const TAB_LABELS: Record<TabName, string> = {
  compare:        'Đối Chiếu Hồ Sơ BHYT',
  reader:         'Đọc XML / CSV',
  converter:      'Chuyển Đổi File',
  filter:         'Lọc Dữ Liệu',
  printer:        'Máy In & Spooler',
  repair:         'Sửa File Dữ Liệu',
  selfbuilt:      'Self-Built 01',
  endoscopy:      'Nội Soi AI 4K',
  hiscall:        'Gọi Bệnh Nhân HIS & TV',
  attendance:     'Máy Chấm Công & Phân Ca',
  bhytcheck:      'Kiểm Tra BHYT',
  signature:      'Ký Số XML',
  dcbhyt:         'Đối Chiếu 01BH',
  officeformulas: 'Công Thức Office',
  pctools:        'Kỹ Thuật Máy Tính & Cứu Hộ',
};

// ─── Commercial Tiers ────────────────────────────────────────────────────────
export type LicenseTier = 'TRIAL' | 'IT_PRO' | 'CLINIC_STANDARD' | 'HOSPITAL_ENTERPRISE' | 'CUSTOM';

export const TIER_LABELS: Record<LicenseTier, string> = {
  TRIAL:               'Dùng Thử 3 Ngày (Full Tính Năng)',
  IT_PRO:              'Bản Quyền Kỹ Thuật Viên IT (PC Pro)',
  CLINIC_STANDARD:     'Bản Quyền Phòng Khám Tiêu Chuẩn',
  HOSPITAL_ENTERPRISE: 'Bản Quyền Doanh Nghiệp & Bệnh Viện (Enterprise)',
  CUSTOM:              'Bản Quyền Tùy Chọn Từng Module Lẻ (Custom Features)',
};

export const TIER_MASKS: Record<LicenseTier, number> = {
  TRIAL: FULL_MASK,
  IT_PRO: (
    TAB_BITS.pctools | TAB_BITS.printer | TAB_BITS.repair |
    TAB_BITS.converter | TAB_BITS.reader | TAB_BITS.officeformulas | TAB_BITS.filter
  ),
  CLINIC_STANDARD: (
    TAB_BITS.endoscopy | TAB_BITS.hiscall | TAB_BITS.attendance |
    TAB_BITS.pctools | TAB_BITS.printer | TAB_BITS.reader |
    TAB_BITS.officeformulas | TAB_BITS.converter
  ),
  HOSPITAL_ENTERPRISE: FULL_MASK,
  CUSTOM: 0,
};

// ─── Lấy Mã Phần Cứng Duy Nhất (Hardware ID) ──────────────────────────────────
export async function getDeviceHardwareId(): Promise<string> {
  try {
    const eAPI = (window as any).electronAPI;
    if (eAPI?.getHWID) {
      const hw = await eAPI.getHWID();
      if (hw && typeof hw === 'string' && hw.length >= 8) {
        return hw.toUpperCase().trim();
      }
    }
  } catch {}

  let fallback = localStorage.getItem('dmh_client_hwid');
  if (!fallback) {
    fallback = 'HWID-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
    localStorage.setItem('dmh_client_hwid', fallback);
  }
  return fallback;
}

// ─── Dynamic Secret Key ───────────────────────────────────────────────────────
function _buildSecretKey(): string {
  const p1 = '\x44\x4d\x48'; // DMH
  const p2 = '\x5f\x54\x4f'; // _TO
  const p3 = '\x4f\x4c\x53'; // OLS
  const p4 = '\x5f\x53\x45'; // _SE
  const p5 = '\x43\x52\x45'; // CRE
  const p6 = '\x54\x5f\x32'; // T_2
  const p7 = '\x30\x32\x36'; // 026
  return p1 + p2 + p3 + p4 + p5 + p6 + p7;
}

// ─── Base32 ───────────────────────────────────────────────────────────────────
const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += B32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_CHARS[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str: string): Uint8Array {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const char of clean) {
    const idx = B32_CHARS.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

// ─── Format ───────────────────────────────────────────────────────────────────
function formatKey(raw: string): string {
  return raw.match(/.{1,4}/g)?.join('-') ?? raw;
}
function cleanKey(k: string): string {
  return k.replace(/-/g, '').toUpperCase();
}

// ─── Crypto ───────────────────────────────────────────────────────────────────
async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey(
    'raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('DMH2026SALT'), iterations: 100_000, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function randomSalt(len = 6): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length]).join('');
}

// ─── Payload Format: SALT-MASK-EXPIRY-MAXUSES-HWID-TIER-CUSTOMER ──────────────
export interface LicensePayload {
  salt:         string;
  mask:         number;
  expiry:       number; // Unix timestamp (giây), 0 = vĩnh viễn
  maxUses:      number; // Số lượng máy tối đa, 0 = không giới hạn
  targetHwid:   string; // 12-16 ký tự đầu của HWID hoặc 'ALL'
  tier:         LicenseTier;
  customerName: string; // Tên cơ sở y tế / khách hàng
}

function buildPayload(
  mask: number,
  expiry: number,
  maxUses: number,
  targetHwid: string = 'ALL',
  tier: LicenseTier = 'HOSPITAL_ENTERPRISE',
  customerName: string = 'KHACH HANG'
): string {
  const safeHwid = (targetHwid || 'ALL').trim().toUpperCase().slice(0, 16);
  const safeCustomer = encodeURIComponent(customerName.trim() || 'DMH_CLIENT');
  return `${randomSalt(6)}-${mask}-${expiry}-${maxUses}-${safeHwid}-${tier}-${safeCustomer}`;
}

function parsePayload(raw: string): LicensePayload | null {
  const parts = raw.split('-');
  if (parts.length < 3) return null;

  // Hỗ trợ cấu trúc cũ 3 và 4 phần tử
  if (parts.length === 3) {
    const salt = parts[0];
    const mask = parseInt(parts[1], 10);
    const expiry = parseInt(parts[2], 10);
    if (isNaN(mask) || isNaN(expiry)) return null;
    return { salt, mask, expiry, maxUses: 0, targetHwid: 'ALL', tier: 'HOSPITAL_ENTERPRISE', customerName: 'Khách hàng VIP' };
  }
  if (parts.length === 4) {
    const salt = parts[0];
    const mask = parseInt(parts[1], 10);
    const expiry = parseInt(parts[2], 10);
    const maxUses = parseInt(parts[3], 10);
    if (isNaN(mask) || isNaN(expiry) || isNaN(maxUses)) return null;
    return { salt, mask, expiry, maxUses, targetHwid: 'ALL', tier: 'HOSPITAL_ENTERPRISE', customerName: 'Khách hàng VIP' };
  }

  // Cấu trúc mới 7 phần tử
  try {
    const salt = parts[0];
    const mask = parseInt(parts[1], 10);
    const expiry = parseInt(parts[2], 10);
    const maxUses = parseInt(parts[3], 10);
    const targetHwid = parts[4] || 'ALL';
    const tier = (parts[5] as LicenseTier) || 'HOSPITAL_ENTERPRISE';
    const customerName = decodeURIComponent(parts.slice(6).join('-')) || 'Cơ sở Y tế';
    if (isNaN(mask) || isNaN(expiry) || isNaN(maxUses)) return null;
    return { salt, mask, expiry, maxUses, targetHwid, tier, customerName };
  } catch {
    return null;
  }
}

// ─── LocalStorage: đếm số lần đã kích hoạt theo key hash ────────────────────
const LS_USES_PREFIX = 'dmh_uses_';

/** Tạo key ID ngắn gọn để lưu số lần dùng (dùng 16 ký tự đầu của clean key) */
function keyId(key: string): string {
  return LS_USES_PREFIX + cleanKey(key).substring(0, 16);
}

export function getKeyUses(key: string): number {
  return parseInt(localStorage.getItem(keyId(key)) ?? '0', 10);
}

function incrementKeyUses(key: string): number {
  const next = getKeyUses(key) + 1;
  localStorage.setItem(keyId(key), String(next));
  return next;
}

// ─── ENCRYPT (Sinh Key Bản Quyền Thương Mại) ───────────────────────────────────
export async function generateLicenseKey(
  mask: number = FULL_MASK,
  expiry: number = 0,
  maxUses: number = 0,
  targetHwid: string = 'ALL',
  tier: LicenseTier = 'HOSPITAL_ENTERPRISE',
  customerName: string = 'Bệnh Viện Đa Khoa'
): Promise<string> {
  const payload   = buildPayload(mask, expiry, maxUses, targetHwid, tier, customerName);
  const enc       = new TextEncoder();
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await deriveKey(_buildSecretKey());
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc.encode(payload));
  const combined  = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);
  return formatKey(base32Encode(combined));
}

// ─── DECRYPT & VALIDATE ───────────────────────────────────────────────────────
export interface LicenseResult {
  valid:         boolean;
  mask:          number;
  expiry:        number;
  maxUses:       number;
  usedCount:     number;
  expired:       boolean;
  usesExhausted: boolean;
  targetHwid:    string;
  hwidMatched:   boolean;
  tier:          LicenseTier;
  customerName:  string;
  isTrial:       boolean;
  trialDaysLeft?: number;
  tabs:          Record<TabName, boolean>;
  errorMsg?:     string;
}

export async function validateLicenseKey(
  key: string,
  doIncrement = false,
  currentHwid?: string
): Promise<LicenseResult> {
  const FAIL = (msg: string): LicenseResult => ({
    valid: false, mask: 0, expiry: 0, maxUses: 0, usedCount: 0,
    expired: false, usesExhausted: false, targetHwid: '', hwidMatched: false,
    tier: 'TRIAL', customerName: '', isTrial: false,
    tabs: Object.fromEntries(ALL_TABS.map(t => [t, false])) as Record<TabName, boolean>,
    errorMsg: msg,
  });

  try {
    const raw = base32Decode(cleanKey(key));
    if (raw.length < 13) return FAIL('Mã Key không hợp lệ (độ dài không đủ)');

    const iv         = raw.slice(0, 12);
    const cipherData = raw.slice(12);
    const cryptoKey  = await deriveKey(_buildSecretKey());

    let decrypted: ArrayBuffer;
    try {
      decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, cipherData);
    } catch {
      return FAIL('Mã Key không hợp lệ hoặc đã bị chỉnh sửa bất hợp pháp!');
    }

    const payload = new TextDecoder().decode(decrypted);
    const parsed  = parsePayload(payload);
    if (!parsed) return FAIL('Cấu trúc bản quyền không xác định');

    // ── Kiểm tra Persistent Vault: Chống dùng lại key khi app từng bị xóa hoặc gỡ khỏi máy ──
    try {
      const eAPI = (window as any).electronAPI;
      if (eAPI?.checkLicenseRevocation) {
        const revCheck = await eAPI.checkLicenseRevocation(key);
        if (revCheck?.revoked) {
          return FAIL(revCheck.message || 'Mã Key này đã hết hiệu lực do ứng dụng đã từng bị xóa hoặc gỡ khỏi máy tính. Vui lòng liên hệ Admin để cấp mã mới!');
        }
      }
    } catch {}

    const now           = Math.floor(Date.now() / 1000);
    const expired       = parsed.expiry > 0 && now > parsed.expiry;

    // Kiểm tra khóa theo phần cứng (Hardware Lock)
    const machineHwid   = currentHwid || await getDeviceHardwareId();
    const shortMachineHwid = machineHwid.slice(0, 16);
    const targetHwid    = parsed.targetHwid || 'ALL';
    const hwidMatched   = (targetHwid === 'ALL') || (machineHwid.includes(targetHwid) || shortMachineHwid.includes(targetHwid));

    if (!hwidMatched) {
      return FAIL(`Key bản quyền này được cấp cho máy tính khác (Khóa HWID: ${targetHwid}). Vui lòng liên hệ nhà phát hành để cấp lại!`);
    }

    // Kiểm tra lượt dùng
    const currentUses   = getKeyUses(key);
    const usesExhausted = parsed.maxUses > 0 && currentUses >= parsed.maxUses;

    const usedCount = (doIncrement && !expired && !usesExhausted && hwidMatched)
      ? incrementKeyUses(key)
      : currentUses;

    const active = !expired && !usesExhausted && hwidMatched;

    // ── Nếu kích hoạt thành công: Khóa chặt key vào Instance ID phiên cài đặt hiện tại ──
    if (doIncrement && active) {
      try {
        const eAPI = (window as any).electronAPI;
        if (eAPI?.bindLicenseKey) {
          const bindRes = await eAPI.bindLicenseKey(key);
          if (bindRes && !bindRes.ok) {
            return FAIL(bindRes.error || 'Không thể liên kết bản quyền với thiết bị.');
          }
        }
      } catch {}
    }

    const tabs = Object.fromEntries(
      ALL_TABS.map(t => [t, active && (parsed.mask & TAB_BITS[t]) !== 0])
    ) as Record<TabName, boolean>;

    return {
      valid:         active,
      mask:          parsed.mask,
      expiry:        parsed.expiry,
      maxUses:       parsed.maxUses,
      usedCount,
      expired,
      usesExhausted,
      targetHwid,
      hwidMatched,
      tier:          parsed.tier,
      customerName:  parsed.customerName,
      isTrial:       false,
      tabs,
    };
  } catch {
    return FAIL('Lỗi trong quá trình giải mã giấy phép bản quyền');
  }
}

// ─── CHẾ ĐỘ DÙNG THỬ 3 NGÀY THÔNG MINH (SMART 3-DAY TRIAL) ───────────────────
const LS_TRIAL_INIT = 'dmh_trial_inittime_sec';
const TRIAL_DURATION_DAYS = 3;

export function getTrialStatus(persistentInitSec?: number): { isTrialActive: boolean; daysLeft: number; expiryTimestamp: number; initTimestamp: number } {
  let initSec = parseInt(localStorage.getItem(LS_TRIAL_INIT) || '0', 10);
  const nowSec = Math.floor(Date.now() / 1000);

  // Nếu localStorage bị xóa nhưng Persistent Vault còn lưu mốc dùng thử -> Khôi phục mốc cũ để chống cheat
  if (persistentInitSec && persistentInitSec > 0) {
    if (!initSec || initSec <= 0 || persistentInitSec < initSec) {
      initSec = persistentInitSec;
      localStorage.setItem(LS_TRIAL_INIT, String(initSec));
    }
  }

  if (!initSec || isNaN(initSec) || initSec <= 0) {
    initSec = nowSec;
    localStorage.setItem(LS_TRIAL_INIT, String(initSec));
  }

  // Chống lùi giờ hệ thống
  if (nowSec < initSec) {
    return { isTrialActive: false, daysLeft: 0, expiryTimestamp: initSec, initTimestamp: initSec };
  }

  const expiryTimestamp = initSec + (TRIAL_DURATION_DAYS * 86400);
  const secondsLeft = expiryTimestamp - nowSec;
  const daysLeft = Math.max(0, Math.ceil(secondsLeft / 86400));
  const isTrialActive = secondsLeft > 0;

  return { isTrialActive, daysLeft, expiryTimestamp, initTimestamp: initSec };
}

// ─── TỰ ĐỘNG KIỂM TRA BẢN QUYỀN HOẶC FALLBACK DÙNG THỬ ─────────────────────────
export async function checkLicenseOrTrial(): Promise<LicenseResult> {
  const savedKey = loadSavedLicense();
  const currentHwid = await getDeviceHardwareId();
  const eAPI = (window as any).electronAPI;

  if (savedKey) {
    if (eAPI?.checkLicenseRevocation) {
      const rev = await eAPI.checkLicenseRevocation(savedKey);
      if (rev?.revoked) {
        clearLicense();
      } else {
        const verified = await validateLicenseKey(savedKey, false, currentHwid);
        if (verified.valid && !verified.expired && verified.hwidMatched) {
          return verified;
        }
      }
    } else {
      const verified = await validateLicenseKey(savedKey, false, currentHwid);
      if (verified.valid && !verified.expired && verified.hwidMatched) {
        return verified;
      }
    }
  }

  // Nếu chưa kích hoạt bản quyền chính thức -> Sử dụng chế độ Dùng thử 3 ngày gắn chặt với HWID máy
  let hwidRecord: any = null;
  if (eAPI?.getHwidTrial) {
    try {
      hwidRecord = await eAPI.getHwidTrial(currentHwid);
    } catch {}
  }

  let persistentTrial = hwidRecord?.firstSeenSec || 0;
  if (!persistentTrial && eAPI?.getTrialInitSec) {
    try { persistentTrial = await eAPI.getTrialInitSec(currentHwid); } catch {}
  }

  const trial = getTrialStatus(persistentTrial);

  // Nếu Vault phần cứng báo lùi giờ hệ thống -> Khóa bảo vệ ngay
  if (hwidRecord?.clockTampered) {
    return {
      valid:         false,
      mask:          0,
      expiry:        hwidRecord.expirySec || trial.expiryTimestamp,
      maxUses:       1,
      usedCount:     1,
      expired:       true,
      usesExhausted: false,
      targetHwid:    currentHwid.slice(0, 16),
      hwidMatched:   true,
      tier:          'TRIAL',
      customerName:  'Dùng Thử Bị Khóa',
      isTrial:       true,
      trialDaysLeft: 0,
      tabs: Object.fromEntries(ALL_TABS.map(t => [t, false])) as Record<TabName, boolean>,
      errorMsg: 'Phát hiện can thiệp đồng hồ hệ thống! Chế độ dùng thử trên thiết bị này đã bị khóa vĩnh viễn.',
    };
  }

  // Nếu Vault phần cứng xác nhận máy tính này đã hết hạn dùng thử -> Khóa vĩnh viễn
  if (hwidRecord && (hwidRecord.expired || !hwidRecord.isTrialActive)) {
    return {
      valid:         false,
      mask:          0,
      expiry:        hwidRecord.expirySec || trial.expiryTimestamp,
      maxUses:       1,
      usedCount:     1,
      expired:       true,
      usesExhausted: false,
      targetHwid:    currentHwid.slice(0, 16),
      hwidMatched:   true,
      tier:          'TRIAL',
      customerName:  'Dùng Thử Hết Hạn',
      isTrial:       true,
      trialDaysLeft: 0,
      tabs: Object.fromEntries(ALL_TABS.map(t => [t, false])) as Record<TabName, boolean>,
      errorMsg: 'Thời gian dùng thử 3 ngày cho thiết bị này đã kết thúc. Vui lòng kích hoạt bản quyền để tiếp tục sử dụng!',
    };
  }

  if (eAPI?.saveTrialInitSec && trial.initTimestamp) {
    try { await eAPI.saveTrialInitSec(trial.initTimestamp, currentHwid); } catch {}
  }

  if (trial.isTrialActive) {
    return {
      valid:         true,
      mask:          FULL_MASK,
      expiry:        trial.expiryTimestamp,
      maxUses:       1,
      usedCount:     1,
      expired:       false,
      usesExhausted: false,
      targetHwid:    currentHwid.slice(0, 16),
      hwidMatched:   true,
      tier:          'TRIAL',
      customerName:  'Bản Dùng Thử Trải Nghiệm',
      isTrial:       true,
      trialDaysLeft: hwidRecord?.daysLeft ?? trial.daysLeft,
      tabs: Object.fromEntries(ALL_TABS.map(t => [t, true])) as Record<TabName, boolean>,
    };
  }

  // Nếu Trial đã hết hạn
  return {
    valid:         false,
    mask:          0,
    expiry:        trial.expiryTimestamp,
    maxUses:       1,
    usedCount:     1,
    expired:       true,
    usesExhausted: false,
    targetHwid:    currentHwid.slice(0, 16),
    hwidMatched:   true,
    tier:          'TRIAL',
    customerName:  'Dùng Thử Hết Hạn',
    isTrial:       true,
    trialDaysLeft: 0,
    tabs: Object.fromEntries(ALL_TABS.map(t => [t, false])) as Record<TabName, boolean>,
    errorMsg: 'Thời gian dùng thử 3 ngày đã kết thúc. Vui lòng kích hoạt bản quyền để tiếp tục sử dụng!',
  };
}

// ─── LocalStorage persistence ─────────────────────────────────────────────────
const LS_KEY = 'dmh_license_key';

export async function saveLicense(key: string) {
  localStorage.setItem(LS_KEY, key);
  try {
    const eAPI = (window as any).electronAPI;
    if (eAPI?.bindLicenseKey) {
      await eAPI.bindLicenseKey(key);
    }
  } catch {}
}
export function loadSavedLicense(): string | null {
  return localStorage.getItem(LS_KEY);
}
export function clearLicense() {
  localStorage.removeItem(LS_KEY);
}

// ─── Tiện ích ─────────────────────────────────────────────────────────────────
export function maskToTabList(mask: number): TabName[] {
  return ALL_TABS.filter(t => (mask & TAB_BITS[t]) !== 0);
}

export function expiryLabel(expiry: number): string {
  if (expiry === 0) return 'Vĩnh viễn (Trọn đời)';
  return new Date(expiry * 1000).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

export function usesLabel(maxUses: number, usedCount: number): string {
  if (maxUses === 0) return 'Không giới hạn máy';
  return `${usedCount}/${maxUses} máy`;
}
