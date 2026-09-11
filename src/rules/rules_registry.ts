import type { AppraisalRule, ClinicalPatientRecord, DiffDetail } from '../types';

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmt(v: number) {
  return v.toLocaleString('vi-VN') + ' đ';
}
function warn(field: string, note: string, pv = '', iv = ''): DiffDetail {
  return { field, portalValue: pv, internalValue: iv, severity: 'high', note };
}

// ─── 17 Rules ────────────────────────────────────────────────────────────────
export const RULE_REGISTRY: AppraisalRule[] = [

  // 1. Thẻ BHYT & mức hưởng
  {
    id: 'rule_the_bhyt', name: 'Thẻ BHYT & mức hưởng', isActive: true,
    description: 'Kiểm tra định dạng mã thẻ BHYT và mức hưởng hợp lệ',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const code = (p.insuranceCode || '').trim().toUpperCase();
      if (code && !/^[A-Z]{2}\d{13}$/.test(code)) {
        diffs.push(warn('Mã thẻ BHYT', `⚠ Định dạng không hợp lệ: "${code}" (chuẩn: 2 chữ + 13 số)`, code));
      }
      const pct = p.bhytPercent || 0;
      const validPcts = [0, 40, 50, 60, 70, 80, 95, 100];
      if (pct > 0 && !validPcts.includes(pct)) {
        diffs.push(warn('Mức hưởng BHYT (%)', `⚠ Tỷ lệ ${pct}% không thuộc danh mục hợp lệ (40/50/60/70/80/95/100)`, String(pct)));
      }
      return diffs;
    },
  },

  // 2. Mã đối tượng KCB
  {
    id: 'rule_doi_tuong', name: 'Mã đối tượng KCB', isActive: true,
    description: 'Kiểm tra mã đối tượng KCB hợp lệ theo danh mục Bộ Y tế',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const obj = (p.objectCode || '').trim();
      const valid = ['1', '2', '3', '4', '5', '6', '7', '8', '9',
        'BH', 'ND', 'BHTN', 'TE', 'NCC', 'DT', 'HS', 'DTTS'];
      if (obj && !valid.includes(obj.toUpperCase())) {
        diffs.push(warn('Mã đối tượng KCB', `⚠ Mã "${obj}" không thuộc danh mục đối tượng hợp lệ`, obj));
      }
      return diffs;
    },
  },

  // 3. Chỉ định DVKT
  {
    id: 'rule_chi_dinh_dvkt', name: 'Chỉ định DVKT', isActive: true,
    description: 'Kiểm tra chỉ định dịch vụ kỹ thuật có phù hợp chẩn đoán',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const svcs = Array.isArray(p.services) ? p.services : [];
      if (svcs.length === 0 && p.totalCost > 0 && !p.medicineCost) {
        diffs.push(warn('Chỉ định DVKT', '⚠ Có chi phí nhưng không có chi tiết dịch vụ kỹ thuật trong hồ sơ'));
      }
      return diffs;
    },
  },

  // 4. Đơn giá dịch vụ
  {
    id: 'rule_don_gia', name: 'Đơn giá dịch vụ', isActive: true,
    description: 'Kiểm tra đơn giá DVKT, thuốc, VTYT có hợp lý',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const total = p.totalCost || 0;
      const bhyt  = p.bhytPay   || 0;
      const bn    = p.patientPay || 0;
      if (total > 0 && bhyt + bn > total * 1.01) {
        diffs.push(warn('Đơn giá / Tổng chi phí',
          `⚠ BHYT (${fmt(bhyt)}) + BN (${fmt(bn)}) > Tổng chi phí (${fmt(total)})`,
          fmt(bhyt + bn), fmt(total)));
      }
      if (total > 200_000_000) {
        diffs.push(warn('Đơn giá / Tổng chi phí',
          `⚠ Tổng chi phí rất cao: ${fmt(total)} — cần kiểm tra lại`, fmt(total)));
      }
      return diffs;
    },
  },

  // 5. Tương tác thuốc
  {
    id: 'rule_tuong_tac', name: 'Tương tác thuốc', isActive: true,
    description: 'Phát hiện cặp thuốc tương tác nghiêm trọng trong đơn',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const meds = Array.isArray(p.medicines) ? p.medicines : [];
      const codes = meds.map(m => (m.ma_thuoc || '').toUpperCase());
      const pairs: [string, string, string][] = [
        ['WARFARIN','ASPIRIN','Tăng nguy cơ xuất huyết'],
        ['METHOTREXATE','IBUPROFEN','Độc thận nghiêm trọng'],
        ['DIGOXIN','AMIODARONE','Nguy cơ loạn nhịp'],
        ['CLOPIDOGREL','OMEPRAZOLE','Giảm hiệu quả chống kết tập tiểu cầu'],
      ];
      for (const [a, b, msg] of pairs) {
        if (codes.some(c => c.includes(a)) && codes.some(c => c.includes(b))) {
          diffs.push(warn('Tương tác thuốc', `⚠ ${a} + ${b}: ${msg}`, a, b));
        }
      }
      return diffs;
    },
  },

  // 6. Liều dùng thuốc
  {
    id: 'rule_lieu_dung', name: 'Liều dùng thuốc', isActive: true,
    description: 'Kiểm tra liều thuốc có vượt ngưỡng tối đa',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const meds = Array.isArray(p.medicines) ? p.medicines : [];
      const stay = Math.max(p.stayDays || 1, 1);
      for (const m of meds) {
        const qty = m.so_luong || 0;
        const name = m.ten_thuoc || '';
        if (qty > 0 && qty / stay > 10) {
          diffs.push(warn('Liều dùng thuốc',
            `⚠ ${name || 'Thuốc'}: ${qty} đơn vị / ${stay} ngày = ${(qty/stay).toFixed(1)} đơn vị/ngày`,
            String(qty), `${stay} ngày`));
        }
      }
      return diffs;
    },
  },

  // 7. Thuốc vượt tuyến
  {
    id: 'rule_vuot_tuyen', name: 'Thuốc vượt tuyến', isActive: true,
    description: 'Phát hiện thuốc chuyên khoa cao hơn tuyến KCB',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const treat = (p.treatmentType || '').toLowerCase();
      const isBasic = treat.includes('thôn') || treat.includes('xã') || treat.includes('1');
      const meds = Array.isArray(p.medicines) ? p.medicines : [];
      const highLevel = ['RITUXIMAB','TRASTUZUMAB','BEVACIZUMAB','IMATINIB'];
      if (isBasic) {
        for (const m of meds) {
          const name = (m.ten_thuoc || '').toUpperCase();
          if (highLevel.some(h => name.includes(h))) {
            diffs.push(warn('Thuốc vượt tuyến',
              `⚠ Thuốc chuyên khoa cao "${name}" tại tuyến cơ sở`, name, treat));
          }
        }
      }
      return diffs;
    },
  },

  // 8. Trùng chỉ định / chi phí
  {
    id: 'rule_trung_chi_dinh', name: 'Trùng chỉ định / chi phí', isActive: true,
    description: 'Phát hiện dịch vụ / thuốc bị khai trùng lặp',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const svcs = Array.isArray(p.services) ? p.services : [];
      const seen = new Set<string>();
      for (const s of svcs) {
        const code = s.ma_dvkt || '';
        if (code && seen.has(code)) {
          diffs.push(warn('Trùng chỉ định DVKT', `⚠ Dịch vụ "${code}" xuất hiện nhiều lần`, code));
        }
        if (code) seen.add(code);
      }
      return diffs;
    },
  },

  // 9. Thời gian KCB
  {
    id: 'rule_thoi_gian', name: 'Thời gian KCB', isActive: true,
    description: 'Kiểm tra thời gian nằm viện hợp lý theo chẩn đoán',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const days = p.stayDays || 0;
      if (days > 180) {
        diffs.push(warn('Thời gian nằm viện', `⚠ Nằm viện ${days} ngày — vượt mức thông thường (>180 ngày)`, String(days)));
      }
      const treat = (p.treatmentType || '').toLowerCase();
      const isOutpatient = treat.includes('ngoại') || treat.includes('1');
      if (isOutpatient && days > 1) {
        diffs.push(warn('Thời gian KCB', `⚠ Ngoại trú nhưng có ${days} ngày nằm viện`, String(days), '0'));
      }
      return diffs;
    },
  },

  // 10. Nhân viên y tế ngoài giờ
  {
    id: 'rule_ngoai_gio', name: 'NV y tế ngoài giờ', isActive: true,
    description: 'Kiểm tra phụ cấp ngoài giờ có phù hợp',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const svcs = Array.isArray(p.services) ? p.services : [];
      let ngoaiGioCount = 0;
      for (const s of svcs) {
        const name = (s.ten_dvkt || '').toLowerCase();
        if (name.includes('ngoài giờ') || name.includes('ngoai gio')) ngoaiGioCount++;
      }
      if (ngoaiGioCount > 3) {
        diffs.push(warn('Phụ cấp ngoài giờ',
          `⚠ Có ${ngoaiGioCount} DVKT "ngoài giờ" trong 1 đợt KCB — cần xác minh`, String(ngoaiGioCount)));
      }
      return diffs;
    },
  },

  // 11. OrderSet
  {
    id: 'rule_orderset', name: 'OrderSet', isActive: true,
    description: 'Phát hiện chỉ định hàng loạt bất thường (ordersets)',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const svcs = Array.isArray(p.services) ? p.services : [];
      const meds = Array.isArray(p.medicines) ? p.medicines : [];
      if (svcs.length > 50) {
        diffs.push(warn('OrderSet / Chỉ định hàng loạt',
          `⚠ Có ${svcs.length} DVKT trong 1 đợt — nghi ngờ orderset bất hợp lý`, String(svcs.length)));
      }
      if (meds.length > 30) {
        diffs.push(warn('OrderSet / Thuốc hàng loạt',
          `⚠ Có ${meds.length} loại thuốc trong 1 đợt — cần kiểm tra đơn thuốc`, String(meds.length)));
      }
      return diffs;
    },
  },

  // 12. Khám bệnh
  {
    id: 'rule_kham_benh', name: 'Khám bệnh', isActive: true,
    description: 'Kiểm tra phí khám bệnh có đúng theo loại hình',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const svcs = Array.isArray(p.services) ? p.services : [];
      const hasKhamBenh = svcs.some(s => {
        const name = (s.ten_dvkt || '').toLowerCase();
        return name.includes('khám bệnh') || name.includes('kham benh');
      });
      const treat = (p.treatmentType || '').toLowerCase();
      const isOutpatient = treat.includes('ngoại') || treat.includes('1');
      if (isOutpatient && !hasKhamBenh && p.totalCost > 0) {
        diffs.push(warn('Khám bệnh', '⚠ Ngoại trú nhưng không có DVKT "Khám bệnh" trong danh sách'));
      }
      return diffs;
    },
  },

  // 13. Giường
  {
    id: 'rule_giuong', name: 'Giường', isActive: true,
    description: 'Kiểm tra phí giường bệnh nội trú có hợp lý',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const days = p.stayDays || 0;
      const svcs = Array.isArray(p.services) ? p.services : [];
      if (days > 0) {
        const giuongSvcs = svcs.filter(s => {
          const n = (s.ten_dvkt || '').toLowerCase();
          return n.includes('giường') || n.includes('giuong') || n.includes('buồng') || n.includes('buong');
        });
        const giuongQty = giuongSvcs.reduce((sum, s) => sum + (s.so_luong || 1), 0);
        if (giuongSvcs.length > 0 && Math.abs(giuongQty - days) > 2) {
          diffs.push(warn('Phí giường bệnh',
            `⚠ Số ngày giường (${giuongQty}) ≠ số ngày nằm viện (${days})`,
            String(giuongQty), String(days)));
        }
      }
      return diffs;
    },
  },

  // 14. ICD-10
  {
    id: 'rule_icd10', name: 'ICD-10', isActive: true,
    description: 'Kiểm tra tính hợp lệ mã ICD-10 chẩn đoán chính và phụ',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const icd = (p.diagnosis || '').trim().toUpperCase();
      if (icd && !/^[A-Z]\d{2,4}(\.\d{1,2})?$/.test(icd)) {
        diffs.push(warn('ICD-10 chính', `⚠ Mã "${icd}" không đúng định dạng ICD-10`, icd));
      }
      // Z-codes không được là chẩn đoán chính nội trú
      const treat = (p.treatmentType || '').toLowerCase();
      const isInpatient = treat.includes('nội') || treat.includes('2') || treat === '';
      if (icd.startsWith('Z') && isInpatient && (p.stayDays || 0) > 0) {
        diffs.push(warn('ICD-10 (Z-code nội trú)',
          `⚠ Mã Z-code "${icd}" dùng làm chẩn đoán chính cho nội trú — cần kiểm tra`, icd));
      }
      return diffs;
    },
  },

  // 15. Tính tiền
  {
    id: 'rule_tinh_tien', name: 'Tính tiền', isActive: true,
    description: 'Kiểm tra phép tính tiền BHYT, BN, tổng chi phí nhất quán',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const total = p.totalCost || 0;
      const bhyt  = p.bhytPay   || 0;
      const bn    = p.patientPay || 0;
      const pct   = p.bhytPercent || 0;
      if (total > 0 && pct > 0) {
        const expected = Math.round(total * pct / 100);
        if (bhyt > 0 && Math.abs(bhyt - expected) > 5000) {
          diffs.push(warn('Tính tiền BHYT',
            `⚠ BHYT thực tế ${fmt(bhyt)} ≠ tính theo ${pct}% × ${fmt(total)} = ${fmt(expected)}`,
            fmt(bhyt), fmt(expected)));
        }
      }
      if (total > 0 && bn > total) {
        diffs.push(warn('Tính tiền BN',
          `⚠ BN chi trả (${fmt(bn)}) > Tổng chi phí (${fmt(total)})`, fmt(bn), fmt(total)));
      }
      return diffs;
    },
  },

  // 16. Danh mục thuốc / VTYT / DVKT
  {
    id: 'rule_danh_muc', name: 'Danh mục thuốc / VTYT / DVKT', isActive: true,
    description: 'Kiểm tra mã thuốc / VTYT / DVKT có trong danh mục BHYT',
    execute(p: ClinicalPatientRecord): DiffDetail[] {
      const diffs: DiffDetail[] = [];
      const meds = Array.isArray(p.medicines) ? p.medicines : [];
      for (const m of meds) {
        const code = m.ma_thuoc || '';
        if (code && !/^\d{3,10}$/.test(code) && !/^[A-Z]\d{2,8}$/.test(code.toUpperCase())) {
          diffs.push(warn('Mã thuốc không hợp lệ',
            `⚠ Mã thuốc "${code}" không đúng định dạng danh mục BHYT`, code));
        }
      }
      return diffs;
    },
  },

  // 17. Custom rule riêng CSKCB
  {
    id: 'rule_custom', name: 'Custom rule riêng CSKCB', isActive: false,
    description: 'Rule tùy chỉnh riêng cho từng cơ sở KCB (mặc định tắt)',
    execute(): DiffDetail[] {
      // Mặc định tắt — CSKCB tự bổ sung logic tại đây
      return [];
    },
  },
];
