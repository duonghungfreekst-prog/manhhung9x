/**
 * DMH_Tools - Persistent License Vault
 * Bảo vệ bản quyền bền vững, chống kích hoạt lại khi app bị xóa hoặc gỡ bỏ khỏi máy.
 * Sử dụng kết hợp Windows Registry (HKCU) và tệp hệ thống ẩn trong ProgramData.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const REG_KEY = 'HKCU\\Software\\DMH_Tools\\License';
const REG_CLSID_KEY = 'HKCU\\Software\\Classes\\CLSID\\{B7E4F281-9C3A-4D88-921A-5E28492048D1}';
const PROGRAM_DATA_DIR = path.join(process.env.ProgramData || 'C:\\ProgramData', 'DMH_Tools');
const VAULT_FILE = path.join(PROGRAM_DATA_DIR, '.lic_sys');
const HWID_VAULT_FILE = path.join(PROGRAM_DATA_DIR, '.hwid_sys');
const PUBLIC_DATA_DIR = path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Documents');
const PUBLIC_VAULT_FILE = path.join(PUBLIC_DATA_DIR, '.sys_dmh_lic');

const HWID_SECRET = 'DMH_TRIAL_HWID_IMMUTABLE_2026';
const TRIAL_DURATION_DAYS = 3;

function cleanKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return '';
  return rawKey.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function hashKey(rawKey) {
  const clean = cleanKey(rawKey);
  return crypto.createHash('sha256').update(clean).digest('hex');
}

function execRegSafe(cmd) {
  try {
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], timeout: 3000 }).toString();
  } catch {
    return '';
  }
}

function readRegistryValue(name) {
  return readRegistryKey(REG_KEY, name);
}

function writeRegistryValue(name, value) {
  writeRegistryKey(REG_KEY, name, value);
}

function readRegistryKey(fullKey, name) {
  try {
    const out = execRegSafe(`reg query "${fullKey}" /v "${name}"`);
    const match = out.match(new RegExp(`${name}\\s+REG_SZ\\s+(.*)`, 'i'));
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function writeRegistryKey(fullKey, name, value) {
  try {
    execRegSafe(`reg add "${fullKey}" /v "${name}" /t REG_SZ /d "${value}" /f`);
  } catch (e) {
    console.error(`[Vault] Lỗi ghi Registry ${fullKey}:`, e.message);
  }
}

function loadVaultState() {
  let fileState = {
    instances: {},
    revokedKeys: [],
    activeKeyHash: null,
    activeInstanceId: null,
    trialInitSec: 0,
    uninstalledAt: 0,
  };

  // 1. Đọc từ ProgramData
  try {
    if (fs.existsSync(VAULT_FILE)) {
      const content = fs.readFileSync(VAULT_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        fileState = {
          instances: parsed.instances || {},
          revokedKeys: Array.isArray(parsed.revokedKeys) ? parsed.revokedKeys : [],
          activeKeyHash: parsed.activeKeyHash || null,
          activeInstanceId: parsed.activeInstanceId || null,
          trialInitSec: parseInt(parsed.trialInitSec, 10) || 0,
          uninstalledAt: parseInt(parsed.uninstalledAt, 10) || 0,
        };
      }
    }
  } catch (e) {
    console.error('[Vault] Lỗi đọc file ProgramData:', e.message);
  }

  // 2. Đọc từ Registry HKCU để đồng bộ 2 chiều
  try {
    const regRevoked = readRegistryValue('RevokedKeys');
    if (regRevoked) {
      const list = regRevoked.split(',').map(s => s.trim()).filter(Boolean);
      for (const h of list) {
        if (!fileState.revokedKeys.includes(h)) {
          fileState.revokedKeys.push(h);
        }
      }
    }

    const regUninstalledAt = readRegistryValue('UninstalledAt');
    if (regUninstalledAt) {
      const u = parseInt(regUninstalledAt, 10);
      if (u > fileState.uninstalledAt) fileState.uninstalledAt = u;
    }

    const regTrial = readRegistryValue('TrialInitSec');
    if (regTrial) {
      const t = parseInt(regTrial, 10);
      if (t > 0 && (!fileState.trialInitSec || t < fileState.trialInitSec)) {
        fileState.trialInitSec = t;
      }
    }

    const regActiveHash = readRegistryValue('ActiveKeyHash');
    const regInstanceId = readRegistryValue('ActiveInstanceId');
    if (regActiveHash && regInstanceId) {
      if (!fileState.instances[regActiveHash]) {
        fileState.instances[regActiveHash] = {
          instanceId: regInstanceId,
          boundAt: Date.now(),
          status: 'ACTIVE'
        };
      }
    }
  } catch (e) {
    console.error('[Vault] Lỗi đồng bộ Registry:', e.message);
  }

  return fileState;
}

function saveVaultState(state) {
  // 1. Lưu vào ProgramData
  try {
    if (!fs.existsSync(PROGRAM_DATA_DIR)) {
      fs.mkdirSync(PROGRAM_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(VAULT_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('[Vault] Lỗi ghi file ProgramData:', e.message);
  }

  // 2. Đồng bộ vào Windows Registry
  try {
    if (state.revokedKeys && state.revokedKeys.length > 0) {
      writeRegistryValue('RevokedKeys', state.revokedKeys.join(','));
    }
    if (state.uninstalledAt > 0) {
      writeRegistryValue('UninstalledAt', String(state.uninstalledAt));
    }
    if (state.trialInitSec > 0) {
      writeRegistryValue('TrialInitSec', String(state.trialInitSec));
    }
    if (state.activeKeyHash) {
      writeRegistryValue('ActiveKeyHash', state.activeKeyHash);
    }
    if (state.activeInstanceId) {
      writeRegistryValue('ActiveInstanceId', state.activeInstanceId);
    }
  } catch (e) {
    console.error('[Vault] Lỗi ghi Registry:', e.message);
  }
}

/**
 * Lấy hoặc sinh mới Instance ID của phiên cài đặt hiện tại trong userData.
 * Nếu thư mục app / userData bị xóa hoặc gỡ bỏ, file này sẽ mất và phiên mới sẽ sinh ra ID khác!
 */
function getAppInstanceId(userDataPath) {
  if (!userDataPath) {
    userDataPath = path.join(process.env.APPDATA || '', 'dmh-tools');
  }
  const idFile = path.join(userDataPath, 'dmh_instance.id');
  try {
    if (fs.existsSync(idFile)) {
      const id = fs.readFileSync(idFile, 'utf8').trim();
      if (id.startsWith('INST-') && id.length >= 16) {
        return id;
      }
    }
  } catch {}

  // Sinh instance ID mới cho phiên cài đặt này
  const newId = `INST-${crypto.randomBytes(6).toString('hex').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  try {
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    fs.writeFileSync(idFile, newId, 'utf8');
  } catch (e) {
    console.error('[Vault] Lỗi lưu dmh_instance.id:', e.message);
  }
  return newId;
}

/**
 * Kiểm tra xem mã key này có bị thu hồi do gỡ bỏ/xóa app trước đó không.
 */
function checkKeyRevocation(rawKey, userDataPath) {
  if (!rawKey) return { revoked: false };
  const kHash = hashKey(rawKey);
  const currentInstanceId = getAppInstanceId(userDataPath);
  const vault = loadVaultState();

  // A. Đã nằm trong danh sách đen bị thu hồi
  if (vault.revokedKeys.includes(kHash)) {
    return {
      revoked: true,
      reason: 'ALREADY_REVOKED',
      message: 'Mã Key này đã hết hiệu lực do ứng dụng đã từng bị xóa hoặc gỡ cài đặt khỏi máy tính. Vui lòng liên hệ Admin để được cấp mã mới!'
    };
  }

  // B. Kiểm tra xem key này trước đó đã từng được bind vào một Instance ID khác chưa
  const existingBind = vault.instances[kHash];
  if (existingBind && existingBind.instanceId && existingBind.instanceId !== currentInstanceId) {
    // Phiên cài đặt cũ đã bị xóa khỏi máy -> Đưa ngay key này vào danh sách đen!
    console.warn(`[Vault] Phát hiện Instance ID thay đổi (${existingBind.instanceId} -> ${currentInstanceId}). Khóa vĩnh viễn Key ${kHash}`);
    if (!vault.revokedKeys.includes(kHash)) {
      vault.revokedKeys.push(kHash);
    }
    saveVaultState(vault);
    return {
      revoked: true,
      reason: 'PREVIOUS_INSTANCE_DELETED',
      message: 'Mã Key này đã hết hiệu lực do ứng dụng đã từng bị xóa khỏi máy tính này. Vui lòng liên hệ Admin để được cấp mã mới!'
    };
  }

  // C. Kiểm tra nếu app đã từng bị Uninstaller gỡ sau thời điểm bind key
  if (vault.uninstalledAt > 0 && existingBind && existingBind.boundAt && existingBind.boundAt <= vault.uninstalledAt) {
    if (!vault.revokedKeys.includes(kHash)) {
      vault.revokedKeys.push(kHash);
    }
    saveVaultState(vault);
    return {
      revoked: true,
      reason: 'UNINSTALLED_REVOCATION',
      message: 'Mã Key này đã hết hiệu lực do ứng dụng đã từng bị gỡ cài đặt khỏi máy tính. Vui lòng liên hệ Admin để được cấp mã mới!'
    };
  }

  return {
    revoked: false,
    instanceId: currentInstanceId,
  };
}

/**
 * Liên kết (bind) mã key với phiên cài đặt hiện tại
 */
function bindKeyToInstance(rawKey, userDataPath) {
  const check = checkKeyRevocation(rawKey, userDataPath);
  if (check.revoked) {
    return { ok: false, error: check.message, reason: check.reason };
  }

  const kHash = hashKey(rawKey);
  const currentInstanceId = getAppInstanceId(userDataPath);
  const vault = loadVaultState();

  vault.instances[kHash] = {
    instanceId: currentInstanceId,
    boundAt: Date.now(),
    status: 'ACTIVE'
  };
  vault.activeKeyHash = kHash;
  vault.activeInstanceId = currentInstanceId;

  saveVaultState(vault);
  return { ok: true, instanceId: currentInstanceId };
}

/**
 * Đánh dấu gỡ cài đặt (được gọi khi Uninstaller chạy hoặc phát hiện app bị xóa)
 */
function markUninstalled() {
  const vault = loadVaultState();
  vault.uninstalledAt = Date.now();

  // Hủy toàn bộ các key đang gắn với máy này
  if (vault.activeKeyHash && !vault.revokedKeys.includes(vault.activeKeyHash)) {
    vault.revokedKeys.push(vault.activeKeyHash);
  }
  for (const kHash of Object.keys(vault.instances)) {
    if (!vault.revokedKeys.includes(kHash)) {
      vault.revokedKeys.push(kHash);
    }
  }

  saveVaultState(vault);
  writeRegistryValue('Status', 'REVOKED_UNINSTALLED');
  return { ok: true, revokedCount: vault.revokedKeys.length };
}

/**
 * Ký điện tử HMAC-SHA256 bảo vệ tính toàn vẹn của mốc dùng thử HWID
 */
function signHWIDRecord(hwid, firstSeenSec, lastSeenSec, expired) {
  return crypto.createHmac('sha256', HWID_SECRET)
    .update(`${hwid}:${firstSeenSec}:${lastSeenSec}:${expired ? 1 : 0}`)
    .digest('hex');
}

/**
 * Xác minh chữ ký HMAC sử dụng constant-time compare chống Timing Attack (Rule 3.6)
 */
function verifyHWIDRecord(record) {
  if (!record || !record.hwid || !record.firstSeenSec || !record.sig) return false;
  const expected = signHWIDRecord(record.hwid, record.firstSeenSec, record.lastSeenSec || record.firstSeenSec, !!record.expired);
  try {
    const a = Buffer.from(record.sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function getHwidSubKey(hwid, prefix) {
  const hash = crypto.createHash('md5').update(hwid).digest('hex').substring(0, 20).toUpperCase();
  return prefix + hash;
}

/**
 * Ghi đồng bộ bản ghi dùng thử vào cả 4 tầng lưu trữ độc lập (Self-Healing Backup)
 */
function saveRecordToAllLayers(hwid, record) {
  const hexData = Buffer.from(JSON.stringify(record), 'utf8').toString('hex');

  // Tầng 1: Windows Registry HKCU DMH
  writeRegistryKey(REG_KEY, getHwidSubKey(hwid, 'HWID_Trial_'), hexData);

  // Tầng 2: Windows Registry CLSID ẩn (Chống uninstaller / ccleaner)
  writeRegistryKey(REG_CLSID_KEY, getHwidSubKey(hwid, 'Sys_'), hexData);

  // Tầng 3: Tệp hệ thống ẩn trong ProgramData dùng chung toàn máy
  try {
    if (!fs.existsSync(PROGRAM_DATA_DIR)) {
      fs.mkdirSync(PROGRAM_DATA_DIR, { recursive: true });
    }
    let store = {};
    if (fs.existsSync(HWID_VAULT_FILE)) {
      try {
        execRegSafe(`attrib -h -s "${HWID_VAULT_FILE}"`);
        store = JSON.parse(fs.readFileSync(HWID_VAULT_FILE, 'utf8'));
      } catch {}
    }
    store[hwid] = record;
    fs.writeFileSync(HWID_VAULT_FILE, JSON.stringify(store, null, 2), 'utf8');
    try { execRegSafe(`attrib +h "${HWID_VAULT_FILE}"`); } catch {}
  } catch (e) {
    console.error('[Vault] Lỗi lưu HWID ProgramData:', e.message);
  }

  // Tầng 4: Tệp dự phòng trong Public Documents
  try {
    if (!fs.existsSync(PUBLIC_DATA_DIR)) {
      fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
    }
    let store = {};
    if (fs.existsSync(PUBLIC_VAULT_FILE)) {
      try {
        execRegSafe(`attrib -h -s "${PUBLIC_VAULT_FILE}"`);
        store = JSON.parse(fs.readFileSync(PUBLIC_VAULT_FILE, 'utf8'));
      } catch {}
    }
    store[hwid] = record;
    fs.writeFileSync(PUBLIC_VAULT_FILE, JSON.stringify(store, null, 2), 'utf8');
    try { execRegSafe(`attrib +h "${PUBLIC_VAULT_FILE}"`); } catch {}
  } catch (e) {
    console.error('[Vault] Lỗi lưu HWID Public:', e.message);
  }

  // Đồng bộ cả trialInitSec cũ nếu máy thật
  try {
    if (!hwid.startsWith('TEST_')) {
      const vault = loadVaultState();
      if (!vault.trialInitSec || record.firstSeenSec < vault.trialInitSec) {
        vault.trialInitSec = record.firstSeenSec;
        saveVaultState(vault);
      }
    }
  } catch {}
}

/**
 * Đọc và kiểm tra trạng thái dùng thử gắn chặt với HWID máy tính
 * Tự động phục hồi (Self-Healing) nếu phát hiện bất kỳ tầng nào bị xóa hoặc can thiệp
 */
function getHWIDTrialRecord(rawHwid) {
  const hwid = (rawHwid || '').trim().toUpperCase();
  if (!hwid || hwid.length < 8) {
    return { isTrialActive: false, daysLeft: 0, firstSeenSec: 0, lastSeenSec: 0, expirySec: 0, expired: true, error: 'INVALID_HWID' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const records = [];

  // 1. Đọc Tầng 1: Registry HKCU DMH
  try {
    const r1Hex = readRegistryKey(REG_KEY, getHwidSubKey(hwid, 'HWID_Trial_'));
    if (r1Hex) {
      const parsed = JSON.parse(Buffer.from(r1Hex, 'hex').toString('utf8'));
      if (parsed && parsed.hwid === hwid && verifyHWIDRecord(parsed)) records.push(parsed);
    }
  } catch {}

  // 2. Đọc Tầng 2: Registry CLSID ẩn
  try {
    const r2Hex = readRegistryKey(REG_CLSID_KEY, getHwidSubKey(hwid, 'Sys_'));
    if (r2Hex) {
      const parsed = JSON.parse(Buffer.from(r2Hex, 'hex').toString('utf8'));
      if (parsed && parsed.hwid === hwid && verifyHWIDRecord(parsed)) records.push(parsed);
    }
  } catch {}

  // 3. Đọc Tầng 3: ProgramData
  try {
    if (fs.existsSync(HWID_VAULT_FILE)) {
      const store = JSON.parse(fs.readFileSync(HWID_VAULT_FILE, 'utf8'));
      if (store && store[hwid] && verifyHWIDRecord(store[hwid])) {
        records.push(store[hwid]);
      }
    }
  } catch {}

  // 4. Đọc Tầng 4: Public Documents
  try {
    if (fs.existsSync(PUBLIC_VAULT_FILE)) {
      const store = JSON.parse(fs.readFileSync(PUBLIC_VAULT_FILE, 'utf8'));
      if (store && store[hwid] && verifyHWIDRecord(store[hwid])) {
        records.push(store[hwid]);
      }
    }
  } catch {}

  // 5. Fallback từ Vault cũ nếu có (chỉ áp dụng cho máy thật, bỏ qua mock test)
  try {
    if (!hwid.startsWith('TEST_')) {
      const legacyVault = loadVaultState();
      if (legacyVault.trialInitSec > 0) {
        records.push({
          hwid,
          firstSeenSec: legacyVault.trialInitSec,
          lastSeenSec: nowSec,
          expired: nowSec >= legacyVault.trialInitSec + (TRIAL_DURATION_DAYS * 86400)
        });
      }
    }
  } catch {}

  let firstSeenSec = 0;
  let lastSeenSec = 0;
  let isExpired = false;

  if (records.length > 0) {
    // Lấy mốc thời gian sớm nhất (nhỏ nhất) từng ghi nhận trên máy để chống reset
    firstSeenSec = Math.min(...records.map(r => r.firstSeenSec).filter(s => s > 0));
    lastSeenSec = Math.max(...records.map(r => r.lastSeenSec || r.firstSeenSec));
    isExpired = records.some(r => !!r.expired);
  } else {
    // Lần đầu tiên máy tính này chạy ứng dụng
    firstSeenSec = nowSec;
    lastSeenSec = nowSec;
    isExpired = false;
  }

  // Chống lùi giờ hệ thống (Clock rollback prevention)
  if (nowSec < lastSeenSec - 300 || nowSec < firstSeenSec) {
    console.warn(`[HWID-Trial] Phát hiện lùi giờ hệ thống trên máy ${hwid}: now=${nowSec}, lastSeen=${lastSeenSec}`);
    return {
      isTrialActive: false,
      daysLeft: 0,
      firstSeenSec,
      lastSeenSec,
      expirySec: firstSeenSec + (TRIAL_DURATION_DAYS * 86400),
      expired: true,
      clockTampered: true,
      error: 'Phát hiện lùi giờ hệ thống! Chế độ dùng thử trên thiết bị này đã bị khóa vĩnh viễn.'
    };
  }

  const expirySec = firstSeenSec + (TRIAL_DURATION_DAYS * 86400);
  const secondsLeft = expirySec - nowSec;
  const daysLeft = Math.max(0, Math.ceil(secondsLeft / 86400));
  if (secondsLeft <= 0) {
    isExpired = true;
  }

  lastSeenSec = Math.max(lastSeenSec, nowSec);

  const activeRecord = {
    hwid,
    firstSeenSec,
    lastSeenSec,
    expired: isExpired,
    sig: signHWIDRecord(hwid, firstSeenSec, lastSeenSec, isExpired),
    updatedAt: nowSec
  };

  // TỰ ĐỘNG PHỤC HỒI (SELF-HEALING): Đồng bộ lại vào cả 4 tầng
  saveRecordToAllLayers(hwid, activeRecord);

  return {
    isTrialActive: !isExpired,
    daysLeft: isExpired ? 0 : daysLeft,
    firstSeenSec,
    lastSeenSec,
    expirySec,
    expired: isExpired,
    clockTampered: false,
    error: isExpired ? 'Thời gian dùng thử 3 ngày cho thiết bị này đã kết thúc. Vui lòng kích hoạt bản quyền chính thức!' : undefined
  };
}

/**
 * Lấy mốc thời gian bắt đầu dùng thử (tương thích ngược)
 */
function getPersistentTrialInit(hwid) {
  if (hwid) {
    const rec = getHWIDTrialRecord(hwid);
    return rec.firstSeenSec || 0;
  }
  const vault = loadVaultState();
  return vault.trialInitSec || 0;
}

/**
 * Lưu mốc thời gian bắt đầu dùng thử (tương thích ngược)
 */
function savePersistentTrialInit(sec, hwid) {
  if (hwid) {
    const rec = getHWIDTrialRecord(hwid);
    return rec.firstSeenSec || sec;
  }
  const vault = loadVaultState();
  const current = vault.trialInitSec || 0;
  if (current === 0 || sec < current) {
    vault.trialInitSec = sec;
    saveVaultState(vault);
  }
  return vault.trialInitSec;
}

module.exports = {
  cleanKey,
  hashKey,
  loadVaultState,
  saveVaultState,
  getAppInstanceId,
  checkKeyRevocation,
  bindKeyToInstance,
  markUninstalled,
  getPersistentTrialInit,
  savePersistentTrialInit,
  getHWIDTrialRecord,
  saveRecordToAllLayers,
  signHWIDRecord,
  verifyHWIDRecord,
};
