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
            const uId = String(u.userId || u.uid || '').trim();
            const name = (u.name || '').trim();
            if (uId && name) {
              userMap[uId] = name;
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

    // 4. Ánh xạ dữ liệu sang RawPunchLog chuẩn của hệ thống
    const mappedLogs = [];
    for (const item of attLogs) {
      const empId = String(item.deviceUserId || item.userId || item.sn || '').trim();
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

      const empName = userMap[empId] || `Nhân viên ${empId}`;

      mappedLogs.push({
        empId,
        empName,
        timestamp: dateObj.toISOString(),
        punchType: 'UNKNOWN',
        deviceId: `${ip}:${port}`,
      });
    }

    // Sắp xếp thời gian tăng dần
    mappedLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      ok: true,
      logs: mappedLogs,
      totalLogs: mappedLogs.length,
      userCount: usersList.length,
      deviceIp: ip,
      message: `Đã tải thành công ${mappedLogs.length} lượt quẹt thẻ từ ${usersList.length || 'nhiều'} nhân viên trên máy.`,
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

module.exports = {
  probeTcpPort,
  getLocalNetworkInfo,
  scanLanBiometricDevices,
  testBiometricConnection,
  pullBiometricAttendanceLogs,
};
