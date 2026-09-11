/**
 * DMH_Tools - Admin License Key Generator (Độc Lập & Bảo Mật)
 * Chỉ dùng cho Chủ Phần Mềm / Admin để tạo mã bản quyền cấp cho khách hàng
 * Chạy: node scripts/keygen_admin.mjs
 */

import readline from 'readline';
import { execSync } from 'child_process';
import { webcrypto } from 'crypto';

const crypto = webcrypto;

// ─── Bitmask Tab Permissions ──────────────────────────────────────────────────
export const TAB_BITS = {
  compare:        1,
  reader:         2,
  converter:      4,
  filter:         8,
  printer:        16,
  repair:         32,
  selfbuilt:      64,
  endoscopy:      128,
  hiscall:        256,
  attendance:     512,
  bhytcheck:      1024,
  signature:      2048,
  dcbhyt:         4096,
  officeformulas: 8192,
  pctools:        16384,
};

export const ALL_TABS = Object.keys(TAB_BITS);
export const FULL_MASK = Object.values(TAB_BITS).reduce((a, b) => a | b, 0);

export const TIER_MASKS = {
  HOSPITAL_ENTERPRISE: FULL_MASK,
  CLINIC_STANDARD: (
    TAB_BITS.endoscopy | TAB_BITS.hiscall | TAB_BITS.attendance |
    TAB_BITS.pctools | TAB_BITS.printer | TAB_BITS.reader |
    TAB_BITS.officeformulas | TAB_BITS.converter
  ),
  IT_PRO: (
    TAB_BITS.pctools | TAB_BITS.printer | TAB_BITS.repair |
    TAB_BITS.converter | TAB_BITS.reader | TAB_BITS.officeformulas | TAB_BITS.filter
  ),
};

const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes) {
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

function formatKey(raw) {
  return raw.match(/.{1,4}/g)?.join('-') ?? raw;
}

function _buildSecretKey() {
  const p1 = '\x44\x4d\x48'; // DMH
  const p2 = '\x5f\x54\x4f'; // _TO
  const p3 = '\x4f\x4c\x53'; // OLS
  const p4 = '\x5f\x53\x45'; // _SE
  const p5 = '\x43\x52\x45'; // CRE
  const p6 = '\x5f\x54\x5f\x32'; // T_2
  const p7 = '\x30\x32\x36'; // 026
  return p1 + p2 + p3 + p4 + p5 + p6 + p7;
}

async function deriveKey(secret) {
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

function randomSalt(len = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length]).join('');
}

function buildPayload(mask, expiry, maxUses, targetHwid, tier, customerName) {
  const safeHwid = (targetHwid || 'ALL').trim().toUpperCase().slice(0, 16);
  const safeCustomer = encodeURIComponent(customerName.trim() || 'DMH_CLIENT');
  return `${randomSalt(6)}-${mask}-${expiry}-${maxUses}-${safeHwid}-${tier}-${safeCustomer}`;
}

async function generateLicenseKey(mask, expiry, maxUses, targetHwid, tier, customerName) {
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

// ─── Giao diện dòng lệnh tương tác ───────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (q) => new Promise(res => rl.question(q, res));

async function main() {
  console.log('======================================================================');
  console.log('🔑 DMH TOOLS - CÔNG CỤ SINH KEY BẢN QUYỀN (DÀNH RIÊNG CHO ADMIN)');
  console.log('🛡️  Chuẩn mã hóa: AES-256-GCM + Khóa cứng Phần Cứng HWID');
  console.log('======================================================================\n');

  const hwidInput = await ask('1. Nhập Mã Máy HWID của khách (Dán từ Zalo, hoặc gõ ALL để không khóa máy): ');
  const targetHwid = hwidInput.trim().toUpperCase() || 'ALL';

  const custInput = await ask('2. Tên Khách Hàng / Phòng Khám (VD: BS Nguyễn Văn A): ');
  const customerName = custInput.trim() || 'Khách Hàng VIP';

  console.log('\n--- Chọn Gói Bản Quyền ---');
  console.log('  [1] Bệnh Viện & Enterprise (Full toàn bộ 15 Module)');
  console.log('  [2] Phòng Khám Tiêu Chuẩn (Nội Soi + Gọi Khám TV + BHYT)');
  console.log('  [3] Kỹ Thuật Viên IT (Cứu Hộ PC + Sửa File + Máy In LAN)');
  console.log('  [4] Tùy chọn lẻ: Chỉ Nội Soi AI 4K');
  console.log('  [5] Tùy chọn lẻ: Chỉ Gọi Khám Bệnh Nhân HIS & TV');
  const tierChoice = (await ask('Chọn gói (1-5, mặc định 1): ')).trim() || '1';

  let mask = FULL_MASK;
  let tierName = 'HOSPITAL_ENTERPRISE';

  if (tierChoice === '2') {
    mask = TIER_MASKS.CLINIC_STANDARD;
    tierName = 'CLINIC_STANDARD';
  } else if (tierChoice === '3') {
    mask = TIER_MASKS.IT_PRO;
    tierName = 'IT_PRO';
  } else if (tierChoice === '4') {
    mask = TAB_BITS.endoscopy;
    tierName = 'CUSTOM';
  } else if (tierChoice === '5') {
    mask = TAB_BITS.hiscall;
    tierName = 'CUSTOM';
  }

  console.log('\n--- Chọn Thời Hạn ---');
  console.log('  [1] 30 Ngày (1 Tháng)');
  console.log('  [2] 90 Ngày (3 Tháng)');
  console.log('  [3] 365 Ngày (1 Năm)');
  console.log('  [4] Vĩnh Viễn (Trọn Đời)');
  const expChoice = (await ask('Chọn thời hạn (1-4, mặc định 4 - Vĩnh viễn): ')).trim() || '4';

  let days = 0;
  if (expChoice === '1') days = 30;
  else if (expChoice === '2') days = 90;
  else if (expChoice === '3') days = 365;

  const nowSec = Math.floor(Date.now() / 1000);
  const expiryTimestamp = days === 0 ? 0 : nowSec + (days * 86400);

  const maxUsesInput = await ask('3. Số máy tối đa được dùng key này (Mặc định: 1): ');
  const maxUses = parseInt(maxUsesInput.trim(), 10) || 1;

  console.log('\n⏳ Đang sinh mã bản quyền chuẩn AES-256-GCM...');
  const key = await generateLicenseKey(mask, expiryTimestamp, maxUses, targetHwid, tierName, customerName);

  console.log('\n======================================================================');
  console.log('🎉 TẠO KEY BẢN QUYỀN THÀNH CÔNG!');
  console.log('----------------------------------------------------------------------');
  console.log('👤 Khách hàng  :', customerName);
  console.log('💻 Khóa HWID   :', targetHwid);
  console.log('📦 Gói cấp phép:', tierName);
  console.log('⏰ Thời hạn    :', days === 0 ? 'Vĩnh Viễn (Trọn Đời)' : `${days} Ngày`);
  console.log('🔢 Số máy tối đa:', maxUses);
  console.log('----------------------------------------------------------------------');
  console.log('👉 MÃ KEY GỬI KHÁCH:');
  console.log('\n   ' + key + '\n');
  console.log('======================================================================');

  try {
    // Tự động copy vào Clipboard trên Windows
    execSync('clip', { input: key });
    console.log('📋 ĐÃ TỰ ĐỘNG COPY KEY VÀO BỘ NHỚ TẠM (CLIPBOARD)!');
    console.log('👉 Bạn chỉ cần sang Zalo / Tin nhắn ấn Ctrl + V để gửi cho khách.\n');
  } catch {}

  rl.close();
}

main();
