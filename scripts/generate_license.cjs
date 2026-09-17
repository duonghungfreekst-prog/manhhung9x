/**
 * scripts/generate_license.cjs
 * Công cụ Quản trị viên (Admin) phát hành License Key Ed25519 cho DMH_Tools v7
 * Dùng Private Key để ký số chữ ký bất đối xứng Ed25519.
 * Client CHỈ CÓ Public Key để xác thực!
 */

const crypto = require('crypto');

// Cặp khóa Ed25519 của Nhà phát triển DMH_Tools
const ADMIN_PRIVATE_KEY_B64 = 'MC4CAQAwBQYDK2VwBCIEIOkS+S4YBm+8SupDTE2/Xe3T09k+CmgWui/ssX+cNtl6';
const PUBLIC_KEY_SPKI_B64   = 'MCowBQYDK2VwAyEAd+sO1Fu+IKcbWW8fdeXsJf9Taf9cUA7yx1SqLH3Tz5o=';

function generateLicense({ hwid = 'ALL', tier = 'HOSPITAL_ENTERPRISE', days = 365, client = 'Cơ sở Y Tế DMH', mask = 32767 }) {
  const exp = Date.now() + days * 24 * 60 * 60 * 1000;
  const payload = {
    v: 7,
    hwid: hwid.toUpperCase().trim(),
    tier,
    exp,
    client,
    mask,
    iat: Date.now()
  };

  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const payloadB64 = payloadBuf.toString('base64url');

  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.from(ADMIN_PRIVATE_KEY_B64, 'base64'),
    format: 'der',
    type: 'pkcs8'
  });

  const signature = crypto.sign(null, payloadBuf, privKeyObj);
  const sigB64 = signature.toString('base64url');

  const licenseKey = `DMH7-${payloadB64}-${sigB64}`;
  return { licenseKey, payload };
}

function verifyLicense(licenseKey, hwid) {
  if (!licenseKey.startsWith('DMH7-')) return { ok: false, error: 'Sai tiền tố' };
  const parts = licenseKey.substring(5).split('-');
  const payloadBuf = Buffer.from(parts[0], 'base64url');
  const sigBuf = Buffer.from(parts.slice(1).join('-'), 'base64url');

  const pubKeyObj = crypto.createPublicKey({
    key: Buffer.from(PUBLIC_KEY_SPKI_B64, 'base64'),
    format: 'der',
    type: 'spki'
  });

  const valid = crypto.verify(null, payloadBuf, pubKeyObj, sigBuf);
  if (!valid) return { ok: false, error: 'Chữ ký không hợp lệ' };

  const payload = JSON.parse(payloadBuf.toString('utf8'));
  if (payload.hwid !== 'ALL' && hwid && payload.hwid !== hwid.toUpperCase()) {
    return { ok: false, error: 'HWID không khớp' };
  }
  if (payload.exp < Date.now()) {
    return { ok: false, error: 'Đã hết hạn' };
  }
  return { ok: true, payload };
}

// Nếu chạy trực tiếp từ CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const targetHwid = args[0] || 'ALL';
  const targetDays = parseInt(args[1] || '365', 10);
  const targetClient = args[2] || 'Bệnh Viện Đa Khoa DMH';

  console.log('=== DMH_TOOLS v7 ED25519 LICENSE GENERATOR ===');
  const res = generateLicense({ hwid: targetHwid, days: targetDays, client: targetClient });
  console.log('\n[Thông Tin Bản Quyền]');
  console.log(' - Khách hàng:', res.payload.client);
  console.log(' - HWID Máy:', res.payload.hwid);
  console.log(' - Gói:', res.payload.tier);
  console.log(' - Hạn dùng:', new Date(res.payload.exp).toLocaleDateString('vi-VN'));
  console.log('\n[MÃ LICENSE KEY]');
  console.log(res.licenseKey);

  // Tự kiểm tra tính toàn vẹn
  const check = verifyLicense(res.licenseKey, targetHwid);
  console.log('\n[Tự Kiểm Tra]');
  console.log(' - Xác minh chữ ký Ed25519:', check.ok ? '✅ HỢP LỆ' : '❌ LỖI: ' + check.error);
}

module.exports = {
  generateLicense,
  verifyLicense,
  PUBLIC_KEY_SPKI_B64
};
