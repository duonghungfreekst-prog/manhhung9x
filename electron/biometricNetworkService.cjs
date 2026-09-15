/**
 * Biometric Network Service for DMH_Tools
 * Hỗ trợ kết nối trực tiếp máy chấm công qua mạng LAN (IP:Port 4370)
 * Hỗ trợ giao thức ZKTeco / Ronald Jack (TCP & UDP)
 * Quét tự động subnet mạng LAN nội bộ
 */

const net = require('net');
const os = require('os');
const ZKLib = require('./zklib/zklib.js');

// Đăng ký suppress unhandledRejection để tránh crash Electron khi socket timeout muộn
process.on('unhandledRejection', (reason) => {
  if (reason && reason.name === 'ZKError') {
    // Suppress ZKLib late socket errors
    return;
  }
});

/**
 * Kiểm tra nhanh xem cổng TCP có mở không
 */
function probeTcpPort(ip, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    try {
      socket.connect(port, ip);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Lấy danh sách IP LAN nội bộ của máy tính hiện tại
 */
function getLocalNetworkInfo() {
  const ifaces = os.networkInterfaces();
  const subnets = [];
  let primaryIp = '192.168.1.1';

  for (const name in ifaces) {
    for (const netInfo of ifaces[name]) {
      if (netInfo.family === 'IPv4' && !netInfo.internal) {
        const parts = netInfo.address.split('.');
        if (parts.length === 4) {
          const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
          subnets.push({
            name,
            ip: netInfo.address,
            baseSubnet: base,
          });
          if (!netInfo.address.startsWith('169.254')) {
            primaryIp = netInfo.address;
          }
        }
      }
    }
  }

  const parts = primaryIp.split('.');
  const defaultSubnet = `${parts[0]}.${parts[1]}.${parts[2]}`;

  return {
    primaryIp,
    defaultSubnet,
    subnets,
  };
}

/**
 * Quét nhanh toàn bộ dải mạng LAN để phát hiện máy chấm công mở cổng 4370
 */
async function scanLanBiometricDevices(baseSubnet, port = 4370, onProgress) {
  const targetSubnet = baseSubnet || getLocalNetworkInfo().defaultSubnet;
  const discovered = [];
  const batchSize = 35;
  const totalIps = 254;

  for (let start = 1; start <= totalIps; start += batchSize) {
    const end = Math.min(start + batchSize - 1, totalIps);
    const promises = [];

    for (let i = start; i <= end; i++) {
      const ip = `${targetSubnet}.${i}`;
      promises.push(
        probeTcpPort(ip, port, 600).then((isOpen) => {
          if (isOpen) {
            discovered.push({
              ip,
              port,
              status: 'online',
              detectedAt: new Date().toISOString(),
            });
          }
        })
      );
    }

    await Promise.all(promises);
    if (onProgress) {
      onProgress(Math.round((end / totalIps) * 100), discovered.length);
    }
  }

  return {
    subnet: targetSubnet,
    port,
    count: discovered.length,
    devices: discovered,
  };
}

/**
 * Kiểm tra kết nối tới máy chấm công và đọc thông tin máy (Model, Users, Logs count)
 */
async function testBiometricConnection(ip, port = 4370, timeoutMs = 4000) {
  if (!ip) {
    return { ok: false, error: 'Vui lòng nhập địa chỉ IP của máy chấm công.' };
  }

  // 1. Thử TCP probe trước
  const isTcpOpen = await probeTcpPort(ip, port, Math.min(timeoutMs, 2000));
  if (!isTcpOpen) {
    return {
      ok: false,
      error: `Không thể kết nối tới ${ip}:${port}. Vui lòng kiểm tra cáp mạng LAN, địa chỉ IP và đảm bảo máy chấm công đang bật nguồn.`,
    };
  }

  // 2. Kết nối bằng ZKLib
  let zk = null;
  let timer = null;
  try {
    zk = new ZKLib(ip, port, timeoutMs, 4000);

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { zk.disconnect(); } catch {}
        reject(new Error(`Quá thời gian phản hồi từ máy chấm công (${timeoutMs}ms).`));
      }, timeoutMs);
    });

    const connectPromise = (async () => {
      await zk.createSocket();
      return true;
    })();

    await Promise.race([connectPromise, timeoutPromise]);
    clearTimeout(timer);

    let info = {};
    try {
      info = await zk.getInfo() || {};
    } catch {
      info = { note: 'Đã kết nối thành công, không lấy được chi tiết info.' };
    }

    let usersCount = 0;
    try {
      const usersRes = await zk.getUsers();
      if (usersRes && Array.isArray(usersRes.data)) {
        usersCount = usersRes.data.length;
      }
    } catch {}

    try {
      await zk.disconnect();
    } catch {}

    return {
      ok: true,
      deviceIp: ip,
      port,
      info,
      userCount: usersCount || info.userCounts || 0,
      logCount: info.logCounts || 0,
      logCapacity: info.logCapacity || 0,
      message: 'Kết nối máy chấm công thành công!',
    };
  } catch (err) {
    clearTimeout(timer);
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return {
      ok: false,
      error: err.message || 'Lỗi bắt tay với giao thức máy chấm công ZKTeco/Ronald Jack.',
    };
  }
}

/**
 * Kéo toàn bộ dữ liệu chấm công từ máy về và ánh xạ sang định dạng chuẩn RawPunchLog
 */
async function pullBiometricAttendanceLogs(ip, port = 4370, timeoutMs = 15000) {
  if (!ip) {
    return { ok: false, error: 'Vui lòng nhập địa chỉ IP của máy chấm công.' };
  }

  // Probe nhanh
  const isTcpOpen = await probeTcpPort(ip, port, 2500);
  if (!isTcpOpen) {
    return {
      ok: false,
      error: `Không tìm thấy máy chấm công tại ${ip}:${port}. Vui lòng kiểm tra IP và kết nối mạng.`,
    };
  }

  let zk = null;
  let timer = null;

  try {
    zk = new ZKLib(ip, port, timeoutMs, 4000);

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { zk.disconnect(); } catch {}
        reject(new Error(`Hết thời gian chờ lấy dữ liệu (${timeoutMs}ms).`));
      }, timeoutMs);
    });

    const runPull = async () => {
      await zk.createSocket();

      // 1. Lấy danh sách nhân viên để map userId -> Tên
      const userMap = {};
      let usersList = [];
      try {
        const usersRes = await zk.getUsers();
        if (usersRes && Array.isArray(usersRes.data)) {
          usersList = usersRes.data;
          for (const u of usersList) {
            const rawUId = String(u.userId || u.uid || '').trim();
            const normUId = rawUId.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/^0*([1-9]\d*|0)$/, '$1').trim();
            const name = (u.name || '').trim();
            if (rawUId && name) {
              userMap[rawUId] = name;
              if (normUId) userMap[normUId] = name;
            }
          }
        }
      } catch (e) {
        console.warn('[ZK] Không lấy được danh sách nhân viên:', e.message);
      }

      // 2. Lấy toàn bộ nhật ký chấm công (Attendance Logs)
      let attLogs = [];
      try {
        const attRes = await zk.getAttendances();
        if (attRes && Array.isArray(attRes.data)) {
          attLogs = attRes.data;
        }
      } catch (e) {
        console.warn('[ZK] Lỗi getAttendances:', e.message);
      }

      // 3. Đóng socket an toàn
      try {
        await zk.disconnect();
      } catch {}

      return { userMap, usersList, attLogs };
    };

    const { userMap, usersList, attLogs } = await Promise.race([runPull(), timeoutPromise]);
    clearTimeout(timer);

    if (!attLogs || attLogs.length === 0) {
      return {
        ok: true,
        logs: [],
        totalLogs: 0,
        userCount: usersList.length,
        deviceIp: ip,
        message: 'Đã kết nối thành công, nhưng máy chấm công hiện chưa có bản ghi quẹt thẻ nào.',
      };
    }

    // 4. Ánh xạ dữ liệu sang RawPunchLog chuẩn của hệ thống (chuẩn hóa empId)
    const mappedLogs = [];
    for (const item of attLogs) {
      const rawEmpId = String(item.deviceUserId || item.userId || item.sn || '').trim();
      if (!rawEmpId) continue;
      const cleanEmpId = rawEmpId.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
      const numMatch = cleanEmpId.match(/^0*([1-9]\d*|0)$/);
      const empId = numMatch ? numMatch[1] : cleanEmpId;
      if (!empId) continue;

      let dateObj = null;
      if (item.recordTime instanceof Date && !isNaN(item.recordTime.getTime())) {
        dateObj = item.recordTime;
      } else if (item.recordTime) {
        dateObj = new Date(item.recordTime);
      }

      if (!dateObj || isNaN(dateObj.getTime())) {
        continue;
      }

      const empName = userMap[empId] || userMap[cleanEmpId] || userMap[rawEmpId] || `Nhân viên ${empId}`;
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const hh = String(dateObj.getHours()).padStart(2, '0');
      const min = String(dateObj.getMinutes()).padStart(2, '0');
      const ss = String(dateObj.getSeconds()).padStart(2, '0');
      const timeLocalStr = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;

      mappedLogs.push({
        empId,
        rawEmpId,
        empName,
        timestamp: timeLocalStr,
        punchTime: timeLocalStr,
        punchType: 'UNKNOWN',
        deviceId: `${ip}:${port}`,
      });
    }

    // Sắp xếp thời gian tăng dần
    mappedLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let minDateStr = '';
    let maxDateStr = '';
    if (mappedLogs.length > 0) {
      minDateStr = mappedLogs[0].timestamp.split('T')[0];
      maxDateStr = mappedLogs[mappedLogs.length - 1].timestamp.split('T')[0];
    }

    return {
      ok: true,
      logs: mappedLogs,
      totalLogs: mappedLogs.length,
      userCount: usersList.length,
      deviceIp: ip,
      minDate: minDateStr,
      maxDate: maxDateStr,
      message: `Đã tải thành công ${mappedLogs.length} lượt quẹt thẻ (từ ${minDateStr} đến ${maxDateStr}) từ ${usersList.length || 'nhiều'} nhân viên trên máy.`,
    };
  } catch (err) {
    clearTimeout(timer);
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return {
      ok: false,
      error: err.message || 'Lỗi khi kéo dữ liệu chấm công từ máy qua mạng LAN.',
    };
  }
}

/**
 * Chuyển số nguyên 32-bit từ máy ZKTeco sang đối tượng Date
 */
function decodeZKTime(time) {
  const second = time % 60;
  time = Math.floor((time - second) / 60);
  const minute = time % 60;
  time = Math.floor((time - minute) / 60);
  const hour = time % 24;
  time = Math.floor((time - hour) / 24);
  const day = (time % 31) + 1;
  time = Math.floor((time - (day - 1)) / 31);
  const month = time % 12;
  time = Math.floor((time - month) / 12);
  const year = time + 2000;
  return new Date(year, month, day, hour, minute, second);
}

/**
 * Chuyển Date sang số nguyên 32-bit cho máy ZKTeco
 */
function encodeZKTime(date) {
  const second = date.getSeconds();
  const minute = date.getMinutes();
  const hour = date.getHours();
  const day = date.getDate();
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear() - 2000;
  return (
    second +
    minute * 60 +
    hour * 3600 +
    (day - 1) * 86400 +
    month * 86400 * 31 +
    year * 86400 * 31 * 12
  );
}

/**
 * Lấy trạng thái tổng hợp của máy chấm công (Thời gian máy, Bộ nhớ, Dung lượng)
 */
async function getDeviceFullStatus(ip, port = 4370, timeoutMs = 5000) {
  if (!ip) return { ok: false, error: 'Vui lòng nhập IP máy chấm công.' };
  const isOpen = await probeTcpPort(ip, port, 2000);
  if (!isOpen) return { ok: false, error: `Không kết nối được tới ${ip}:${port}.` };

  let zk = null;
  try {
    zk = new ZKLib(ip, port, timeoutMs, 4000);
    await zk.createSocket();

    let info = {};
    try {
      info = await zk.getInfo() || {};
    } catch {}

    let deviceTime = null;
    let diffSeconds = 0;
    try {
      const timeReply = await zk.executeCmd(201, ''); // CMD_GET_TIME
      if (timeReply && timeReply.length >= 12) {
        const timeVal = timeReply.readUInt32LE(8);
        const devDate = decodeZKTime(timeVal);
        deviceTime = devDate.toISOString();
        diffSeconds = Math.round((Date.now() - devDate.getTime()) / 1000);
      }
    } catch {}

    await zk.disconnect();

    return {
      ok: true,
      deviceIp: ip,
      port,
      deviceTime,
      pcTime: new Date().toISOString(),
      diffSeconds,
      userCount: info.userCounts || 0,
      logCount: info.logCounts || 0,
      logCapacity: info.logCapacity || 0,
      percentUsed: info.logCapacity ? Math.round(((info.logCounts || 0) / info.logCapacity) * 100) : 0,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return { ok: false, error: err.message || 'Lỗi đọc trạng thái máy chấm công.' };
  }
}

/**
 * Đồng bộ giờ máy tính PC sang máy chấm công (CMD_SET_TIME: 202)
 */
async function syncDeviceTime(ip, port = 4370, timeoutMs = 5000) {
  if (!ip) return { ok: false, error: 'Vui lòng nhập IP máy chấm công.' };
  const isOpen = await probeTcpPort(ip, port, 2000);
  if (!isOpen) return { ok: false, error: `Không kết nối được tới ${ip}:${port}.` };

  let zk = null;
  try {
    zk = new ZKLib(ip, port, timeoutMs, 4000);
    await zk.createSocket();

    const now = new Date();
    const timeBuf = Buffer.alloc(4);
    timeBuf.writeUInt32LE(encodeZKTime(now), 0);
    await zk.executeCmd(202, timeBuf); // CMD_SET_TIME

    // Đọc lại giờ để kiểm chứng
    let verifiedTime = now.toISOString();
    try {
      const timeReply = await zk.executeCmd(201, '');
      if (timeReply && timeReply.length >= 12) {
        const timeVal = timeReply.readUInt32LE(8);
        verifiedTime = decodeZKTime(timeVal).toISOString();
      }
    } catch {}

    await zk.disconnect();

    return {
      ok: true,
      syncedTime: verifiedTime,
      message: `Đã đồng bộ giờ máy chấm công khớp với giờ máy tính thành công: ${now.toLocaleTimeString('vi-VN')} ngày ${now.toLocaleDateString('vi-VN')}`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return { ok: false, error: err.message || 'Lỗi đồng bộ thời gian sang máy chấm công.' };
  }
}

/**
 * Phát âm thanh thử loa trên máy chấm công ("Xin cảm ơn" / Chuông bíp) (CMD_TESTVOICE: 1017)
 */
async function testDeviceVoice(ip, port = 4370, timeoutMs = 5000) {
  if (!ip) return { ok: false, error: 'Vui lòng nhập IP máy chấm công.' };
  const isOpen = await probeTcpPort(ip, port, 2000);
  if (!isOpen) return { ok: false, error: `Không kết nối được tới ${ip}:${port}.` };

  let zk = null;
  try {
    zk = new ZKLib(ip, port, timeoutMs, 4000);
    await zk.createSocket();

    const voiceBuf = Buffer.alloc(4);
    voiceBuf.writeUInt32LE(0, 0);
    await zk.executeCmd(1017, voiceBuf); // CMD_TESTVOICE

    await zk.disconnect();

    return {
      ok: true,
      message: 'Đã gửi lệnh thử chuông / phát câu chào trên máy chấm công thành công!',
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return { ok: false, error: err.message || 'Lỗi gửi lệnh thử loa máy chấm công.' };
  }
}

/**
 * Khởi động lại máy chấm công từ xa (CMD_RESTART: 1004)
 */
async function rebootDevice(ip, port = 4370, timeoutMs = 5000) {
  if (!ip) return { ok: false, error: 'Vui lòng nhập IP máy chấm công.' };
  const isOpen = await probeTcpPort(ip, port, 2000);
  if (!isOpen) return { ok: false, error: `Không kết nối được tới ${ip}:${port}.` };

  let zk = null;
  try {
    zk = new ZKLib(ip, port, timeoutMs, 4000);
    await zk.createSocket();
    await zk.executeCmd(1004, ''); // CMD_RESTART
    try { await zk.disconnect(); } catch {}

    return {
      ok: true,
      message: 'Đã gửi lệnh khởi động lại máy chấm công thành công. Thiết bị đang khởi động lại (khoảng 15-30 giây).',
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return { ok: false, error: err.message || 'Lỗi gửi lệnh khởi động lại máy chấm công.' };
  }
}

/**
 * Xóa quyền Admin trên máy chấm công (CMD_CLEAR_ADMIN: 20)
 * Giúp cứu hộ mở khóa máy khi quên mật khẩu menu hoặc người quản lý cũ không bàn giao
 */
async function clearDeviceAdmin(ip, port = 4370, timeoutMs = 5000) {
  if (!ip) return { ok: false, error: 'Vui lòng nhập IP máy chấm công.' };
  const isOpen = await probeTcpPort(ip, port, 2000);
  if (!isOpen) return { ok: false, error: `Không kết nối được tới ${ip}:${port}.` };

  let zk = null;
  try {
    zk = new ZKLib(ip, port, timeoutMs, 4000);
    await zk.createSocket();
    await zk.executeCmd(20, ''); // CMD_CLEAR_ADMIN
    await zk.disconnect();

    return {
      ok: true,
      message: 'Đã xóa quyền Admin trên máy chấm công thành công! Bây giờ bạn có thể nhấn phím M/OK trên máy để vào Menu trực tiếp mà không cần mật khẩu.',
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return { ok: false, error: err.message || 'Lỗi gửi lệnh xóa quyền admin máy chấm công.' };
  }
}

/**
 * Kích hoạt mở khóa cửa chốt điện Access Control (CMD_UNLOCK: 31)
 */
async function unlockDeviceDoor(ip, port = 4370, durationSeconds = 5, timeoutMs = 5000) {
  if (!ip) return { ok: false, error: 'Vui lòng nhập IP máy chấm công.' };
  const isOpen = await probeTcpPort(ip, port, 2000);
  if (!isOpen) return { ok: false, error: `Không kết nối được tới ${ip}:${port}.` };

  let zk = null;
  try {
    zk = new ZKLib(ip, port, timeoutMs, 4000);
    await zk.createSocket();

    const sec = Math.max(1, Math.min(60, Number(durationSeconds) || 5));
    const unlockBuf = Buffer.alloc(4);
    unlockBuf.writeUInt32LE(sec, 0);
    await zk.executeCmd(31, unlockBuf); // CMD_UNLOCK

    await zk.disconnect();

    return {
      ok: true,
      message: `Đã gửi tín hiệu mở chốt khóa cửa trong ${sec} giây thành công!`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return { ok: false, error: err.message || 'Lỗi gửi lệnh mở khóa cửa.' };
  }
}

/**
 * Lấy danh sách toàn bộ nhân sự lưu trên máy chấm công
 */
async function getDeviceUsersList(ip, port = 4370, timeoutMs = 10000) {
  if (!ip) return { ok: false, error: 'Vui lòng nhập IP máy chấm công.' };
  const isOpen = await probeTcpPort(ip, port, 2000);
  if (!isOpen) return { ok: false, error: `Không kết nối được tới ${ip}:${port}.` };

  let zk = null;
  try {
    zk = new ZKLib(ip, port, timeoutMs, 4000);
    await zk.createSocket();
    const res = await zk.getUsers();
    await zk.disconnect();

    const rawList = res?.data || [];
    const users = rawList.map(u => ({
      uid: u.uid,
      userId: String(u.userId || u.uid).trim(),
      name: (u.name || '').trim(),
      role: (u.role && u.role > 0) ? 'Admin' : 'Nhân viên',
      roleCode: u.role || 0,
      hasPassword: Boolean(u.password && String(u.password).trim() !== ''),
      cardno: u.cardno || 0,
    }));

    return {
      ok: true,
      users,
      count: users.length,
      deviceIp: ip,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return { ok: false, error: err.message || 'Lỗi tải danh sách nhân viên từ máy chấm công.' };
  }
}

/**
 * Xóa một nhân viên khỏi máy chấm công (CMD_DELETE_USER: 18)
 */
async function deleteDeviceUser(ip, port = 4370, uid, timeoutMs = 5000) {
  if (!ip) return { ok: false, error: 'Vui lòng nhập IP máy chấm công.' };
  if (uid === undefined || uid === null) return { ok: false, error: 'Thiếu UID nhân sự cần xóa.' };

  const isOpen = await probeTcpPort(ip, port, 2000);
  if (!isOpen) return { ok: false, error: `Không kết nối được tới ${ip}:${port}.` };

  let zk = null;
  try {
    zk = new ZKLib(ip, port, timeoutMs, 4000);
    await zk.createSocket();

    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(Number(uid), 0);
    await zk.executeCmd(18, buf); // CMD_DELETE_USER

    await zk.disconnect();

    return {
      ok: true,
      message: `Đã xóa nhân sự (UID: ${uid}) khỏi máy chấm công thành công!`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return { ok: false, error: err.message || 'Lỗi khi xóa nhân sự trên máy chấm công.' };
  }
}

/**
 * Xóa sạch toàn bộ dữ liệu quẹt thẻ trên máy chấm công để giải phóng bộ nhớ (CMD_CLEAR_ATTLOG: 15)
 */
async function clearDeviceAttendanceLogs(ip, port = 4370, timeoutMs = 8000) {
  if (!ip) return { ok: false, error: 'Vui lòng nhập IP máy chấm công.' };
  const isOpen = await probeTcpPort(ip, port, 2000);
  if (!isOpen) return { ok: false, error: `Không kết nối được tới ${ip}:${port}.` };

  let zk = null;
  try {
    zk = new ZKLib(ip, port, timeoutMs, 4000);
    await zk.createSocket();
    await zk.clearAttendanceLog(); // CMD_CLEAR_ATTLOG (15)
    await zk.disconnect();

    return {
      ok: true,
      message: 'Đã xóa toàn bộ bản ghi quẹt thẻ trên máy chấm công để giải phóng bộ nhớ thành công!',
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return { ok: false, error: err.message || 'Lỗi khi dọn dẹp bộ nhớ máy chấm công.' };
  }
}

module.exports = {
  probeTcpPort,
  getLocalNetworkInfo,
  scanLanBiometricDevices,
  testBiometricConnection,
  pullBiometricAttendanceLogs,
  getDeviceFullStatus,
  syncDeviceTime,
  testDeviceVoice,
  rebootDevice,
  clearDeviceAdmin,
  unlockDeviceDoor,
  getDeviceUsersList,
  deleteDeviceUser,
  clearDeviceAttendanceLogs,
  decodeZKTime,
  encodeZKTime,
};

