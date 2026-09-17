/**
 * electron/repositories/his.repository.cjs
 * Tầng truy cập dữ liệu (Repository Pattern) cho phân hệ Gọi Bệnh Nhân HIS
 * Tối ưu hóa chỉ mục ngày Sargable, Connection Pool và Giao dịch nguyên tử (ACID Transaction)
 */

const { hisConnManager, sql } = require('../services/his/hisConnectionManager.cjs');

class HisRepository {
  /**
   * Lấy danh sách bệnh nhân chờ khám từ SQL Server
   */
  async fetchPatients(connStr, roomCode) {
    const pool = await hisConnManager.getPool(connStr);

    const roomCodes = String(roomCode || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0);
    const hasRoomFilter = roomCodes.length > 0;

    const req = pool.request();

    let query;
    if (hasRoomFilter) {
      const paramNames = roomCodes.map((_, i) => `@p${i}`).join(',');
      roomCodes.forEach((code, i) => req.input(`p${i}`, sql.Int, code));

      query = `
        DECLARE @StartOfDay DATETIME = DATEADD(day, DATEDIFF(day, 0, GETDATE()), 0);
        DECLARE @StartOfNextDay DATETIME = DATEADD(day, 1, @StartOfDay);

        SELECT 
          TRY_CAST(dk.sothutudk AS INT) AS SoThuTu, 
          dk.makcb      AS MaBenhNhan, 
          dk.hoten      AS TenBenhNhan,
          dk.maphong    AS MaPhong,
          CONVERT(varchar(8), dk.ngaydk, 108) AS GioDangKy,
          CASE
            WHEN dk.ngaysinh IS NOT NULL THEN YEAR(GETDATE()) - YEAR(dk.ngaysinh)
            WHEN dk.tuoi IS NOT NULL THEN TRY_CAST(LEFT(dk.tuoi, 2) AS INT)
            ELSE NULL
          END AS Tuoi,
          CASE
            WHEN kb.makcb IS NULL THEN 0
            WHEN kb.chuakham = 1  THEN 0
            ELSE 1
          END AS DaKham
        FROM dangky dk
        LEFT JOIN khambenh kb 
          ON kb.makcb = dk.makcb 
          AND kb.maphong = dk.maphong
          AND kb.ngay >= @StartOfDay AND kb.ngay < @StartOfNextDay
        WHERE dk.maphong IN (${paramNames})
          AND dk.ngaydk >= @StartOfDay AND dk.ngaydk < @StartOfNextDay

        UNION ALL

        SELECT 
          TRY_CAST(tt.thutu AS INT) AS SoThuTu,
          tt.makcb AS MaBenhNhan,
          dk.hoten AS TenBenhNhan,
          tt.manoithuchien AS MaPhong,
          CONVERT(varchar(8), dk.ngaydk, 108) AS GioDangKy,
          CASE
            WHEN dk.ngaysinh IS NOT NULL THEN YEAR(GETDATE()) - YEAR(dk.ngaysinh)
            WHEN dk.tuoi IS NOT NULL THEN TRY_CAST(LEFT(dk.tuoi, 2) AS INT)
            ELSE NULL
          END AS Tuoi,
          CASE WHEN tt.coketqua = 1 OR tt.coketqua = 'True' OR tt.maygoi = '1' OR tt.maygoi = 'True' THEN 1 ELSE 0 END AS DaKham
        FROM thutuchidinh tt
        JOIN dangky dk ON tt.makcb = dk.makcb
        WHERE tt.manoithuchien IN (${paramNames})
          AND tt.ngay >= @StartOfDay AND tt.ngay < @StartOfNextDay

        ORDER BY SoThuTu ASC, GioDangKy ASC
      `;
    } else {
      query = `
        DECLARE @StartOfDay DATETIME = DATEADD(day, DATEDIFF(day, 0, GETDATE()), 0);
        DECLARE @StartOfNextDay DATETIME = DATEADD(day, 1, @StartOfDay);

        SELECT 
          TRY_CAST(dk.sothutudk AS INT) AS SoThuTu, 
          dk.makcb      AS MaBenhNhan, 
          dk.hoten      AS TenBenhNhan,
          dk.maphong    AS MaPhong,
          CONVERT(varchar(8), dk.ngaydk, 108) AS GioDangKy,
          CASE
            WHEN dk.ngaysinh IS NOT NULL THEN YEAR(GETDATE()) - YEAR(dk.ngaysinh)
            WHEN dk.tuoi IS NOT NULL THEN TRY_CAST(LEFT(dk.tuoi, 2) AS INT)
            ELSE NULL
          END AS Tuoi,
          CASE
            WHEN kb.makcb IS NULL THEN 0
            WHEN kb.chuakham = 1  THEN 0
            ELSE 1
          END AS DaKham
        FROM dangky dk
        LEFT JOIN khambenh kb 
          ON kb.makcb = dk.makcb 
          AND kb.maphong = dk.maphong
          AND kb.ngay >= @StartOfDay AND kb.ngay < @StartOfNextDay
        WHERE dk.ngaydk >= @StartOfDay AND dk.ngaydk < @StartOfNextDay

        UNION ALL

        SELECT 
          TRY_CAST(tt.thutu AS INT) AS SoThuTu,
          tt.makcb AS MaBenhNhan,
          dk.hoten AS TenBenhNhan,
          tt.manoithuchien AS MaPhong,
          CONVERT(varchar(8), dk.ngaydk, 108) AS GioDangKy,
          CASE
            WHEN dk.ngaysinh IS NOT NULL THEN YEAR(GETDATE()) - YEAR(dk.ngaysinh)
            WHEN dk.tuoi IS NOT NULL THEN TRY_CAST(LEFT(dk.tuoi, 2) AS INT)
            ELSE NULL
          END AS Tuoi,
          CASE WHEN tt.coketqua = 1 OR tt.coketqua = 'True' OR tt.maygoi = '1' OR tt.maygoi = 'True' THEN 1 ELSE 0 END AS DaKham
        FROM thutuchidinh tt
        JOIN dangky dk ON tt.makcb = dk.makcb
        WHERE tt.ngay >= @StartOfDay AND tt.ngay < @StartOfNextDay

        ORDER BY SoThuTu ASC, GioDangKy ASC
      `;
    }

    const result = await req.query(query);
    return result.recordset || [];
  }

  /**
   * Lấy danh sách các phòng khám có bệnh nhân trong ngày
   */
  async fetchRooms(connStr) {
    const pool = await hisConnManager.getPool(connStr);
    const result = await pool.request().query(`
      DECLARE @StartOfDay DATETIME = DATEADD(day, DATEDIFF(day, 0, GETDATE()), 0);
      DECLARE @StartOfNextDay DATETIME = DATEADD(day, 1, @StartOfDay);

      SELECT DISTINCT dk.maphong,
        CONCAT(N'Phòng ', dk.maphong, N' (', COUNT(*) OVER (PARTITION BY dk.maphong), N' BN)') AS tenphong
      FROM dangky dk
      WHERE dk.ngaydk >= @StartOfDay AND dk.ngaydk < @StartOfNextDay
      ORDER BY dk.maphong
    `);
    return result.recordset || [];
  }

  /**
   * Cập nhật trạng thái gọi khám bệnh nhân với Transaction nguyên tử
   */
  async updatePatientCalled(connStr, maBenhNhan) {
    const pool = await hisConnManager.getPool(connStr);
    const transaction = new sql.Transaction(pool);

    await transaction.begin();
    try {
      const req = new sql.Request(transaction);
      req.input('makcb', sql.NVarChar, String(maBenhNhan));

      await req.query(`
        DECLARE @StartOfDay DATETIME = DATEADD(day, DATEDIFF(day, 0, GETDATE()), 0);
        DECLARE @StartOfNextDay DATETIME = DATEADD(day, 1, @StartOfDay);

        UPDATE khambenh
        SET chuakham = 0
        WHERE makcb = @makcb
          AND ngay >= @StartOfDay AND ngay < @StartOfNextDay
          AND chuakham = 1;

        IF NOT EXISTS (
          SELECT 1 FROM khambenh
          WHERE makcb = @makcb
            AND ngay >= @StartOfDay AND ngay < @StartOfNextDay
        )
        BEGIN
          INSERT INTO khambenh (makcb, maphong, ngay, chuakham)
          SELECT dk.makcb, dk.maphong, GETDATE(), 0
          FROM dangky dk
          WHERE dk.makcb = @makcb
            AND dk.ngaydk >= @StartOfDay AND dk.ngaydk < @StartOfNextDay;
        END;

        UPDATE thutuchidinh
        SET maygoi = '1'
        WHERE makcb = @makcb
          AND ngay >= @StartOfDay AND ngay < @StartOfNextDay;
      `);

      await transaction.commit();
      return { ok: true };
    } catch (err) {
      try { await transaction.rollback(); } catch {}
      throw err;
    }
  }

  /**
   * Lấy bệnh nhân được gọi mới nhất
   */
  async getLatestCalled(connStr, roomCode) {
    const pool = await hisConnManager.getPool(connStr);
    const roomInt = parseInt(roomCode, 10);
    const hasRoom = !isNaN(roomInt) && roomInt > 0;

    const q = `
      DECLARE @StartOfDay DATETIME = DATEADD(day, DATEDIFF(day, 0, GETDATE()), 0);
      DECLARE @StartOfNextDay DATETIME = DATEADD(day, 1, @StartOfDay);

      SELECT TOP 1 kb.makcb AS MaBenhNhan, dk.hoten AS TenBenhNhan, dk.sothutudk AS SoThuTu, kb.ngay AS ThoiGian
      FROM khambenh kb
      JOIN dangky dk ON dk.makcb = kb.makcb AND dk.ngaydk >= @StartOfDay AND dk.ngaydk < @StartOfNextDay
      WHERE ${hasRoom ? 'kb.maphong = @p AND' : ''} kb.ngay >= @StartOfDay AND kb.ngay < @StartOfNextDay
      ORDER BY kb.ngay DESC
    `;

    const req = pool.request();
    if (hasRoom) req.input('p', sql.Int, roomInt);
    const result = await req.query(q);
    return result.recordset[0] || null;
  }
}

const hisRepository = new HisRepository();

module.exports = {
  hisRepository
};
