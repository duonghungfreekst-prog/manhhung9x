const test = require('node:test');
const assert = require('node:assert');
const { generateLicense, verifyLicense } = require('../../scripts/generate_license.cjs');
const licenseVault = require('../../electron/licenseVault.cjs');

test('Ed25519 Asymmetric License & Hardware Locking', () => {
  const hwid = 'TEST-MACHINE-HWID-2026';
  const { licenseKey, payload } = generateLicense({
    hwid,
    tier: 'HOSPITAL_ENTERPRISE',
    days: 30,
    client: 'Bệnh Viện Kiểm Thử DMH'
  });

  // 1. Xác thực thành công với đúng HWID
  const verified = licenseVault.verifyEd25519LicenseKey(licenseKey, hwid);
  assert.strictEqual(verified.valid, true, 'License phải hợp lệ với đúng HWID');
  assert.strictEqual(verified.payload.client, 'Bệnh Viện Kiểm Thử DMH');

  // 2. Từ chối kích hoạt nếu mang sang máy có HWID khác
  const wrongMachine = licenseVault.verifyEd25519LicenseKey(licenseKey, 'DIFFERENT-MACHINE-HWID');
  assert.strictEqual(wrongMachine.valid, false, 'Phải từ chối kích hoạt nếu sai HWID');

  // 3. Từ chối chữ ký bị làm giả hoặc sửa đổi dữ liệu
  const tamperedKey = licenseKey.slice(0, -4) + 'AAAA';
  const tamperedCheck = licenseVault.verifyEd25519LicenseKey(tamperedKey, hwid);
  assert.strictEqual(tamperedCheck.valid, false, 'Phải từ chối chữ ký số đã bị can thiệp');

  // 4. Kiểm tra lưu trữ bản quyền dự phòng mã hóa AES-256-GCM bound với HWID
  licenseVault.saveBackupKey(licenseKey, hwid);
  const restoredKey = licenseVault.getBackupKey(hwid);
  assert.strictEqual(restoredKey, licenseKey, 'Bản quyền giải mã phải khớp 100% với key ban đầu');

  // 5. Nếu đọc bằng HWID khác -> không thể giải mã
  const wrongHwidKey = licenseVault.getBackupKey('ANOTHER-HWID');
  assert.notStrictEqual(wrongHwidKey, licenseKey, 'Không thể giải mã bản quyền bằng HWID khác');
});
