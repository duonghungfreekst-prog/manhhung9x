const sql = require('mssql');

/**
 * HISConnectionManager - Quản lý Connection Pool kết nối SQL Server cho HIS
 * Giữ kết nối bền vững, tái sử dụng pool giữa các lần polling/gọi bệnh nhân
 * Tránh socket exhaustion và giảm tải CPU cho máy chủ dữ liệu bệnh viện.
 */
class HISConnectionManager {
  constructor() {
    this.pools = new Map();
    this.connectingPromises = new Map();
  }

  async getPool(connStr) {
    if (!connStr || typeof connStr !== 'string') {
      throw new Error('Chuỗi kết nối SQL Server (connStr) không hợp lệ');
    }
    const key = connStr.trim();

    // 1. Nếu pool đã kết nối sẵn sàng, tái sử dụng ngay lập tức
    if (this.pools.has(key)) {
      const existing = this.pools.get(key);
      if (existing && existing.connected) {
        return existing;
      }
      try {
        await existing.close();
      } catch {}
      this.pools.delete(key);
    }

    // 2. Chống Race Condition: Nếu có một luồng đang kết nối với cùng key, chờ Promise đó
    if (this.connectingPromises.has(key)) {
      return await this.connectingPromises.get(key);
    }

    // 3. Khởi tạo Promise kết nối mới có serialize
    const connectPromise = (async () => {
      let pool;
      const baseOptions = {
        connectionTimeout: 10000, // 10 giây kết nối
        requestTimeout: 25000,    // 25 giây cho mỗi truy vấn
        pool: {
          max: 10,
          min: 1,
          idleTimeoutMillis: 30000,
        },
        options: {
          encrypt: true,
          trustServerCertificate: true,
          enableArithAbort: true,
        }
      };

      if (key.includes(';') || key.startsWith('mssql://') || key.startsWith('Server=')) {
        pool = new sql.ConnectionPool({
          connectionString: key,
          ...baseOptions,
        });
      } else {
        pool = new sql.ConnectionPool(key);
      }

      pool.on('error', (err) => {
        console.warn('[HIS_SQL_POOL_WARN]', err?.message || err);
        this.pools.delete(key);
      });

      await pool.connect();
      this.pools.set(key, pool);
      return pool;
    })();

    this.connectingPromises.set(key, connectPromise);

    try {
      return await connectPromise;
    } finally {
      this.connectingPromises.delete(key);
    }
  }

  async closePool(connStr) {
    const key = (connStr || '').trim();
    if (this.pools.has(key)) {
      const pool = this.pools.get(key);
      try {
        await pool.close();
      } catch {}
      this.pools.delete(key);
    }
  }

  async closeAll() {
    for (const [, pool] of this.pools.entries()) {
      try {
        await pool.close();
      } catch {}
    }
    this.pools.clear();
  }
}

const hisConnManager = new HISConnectionManager();

module.exports = {
  hisConnManager,
  sql,
};
