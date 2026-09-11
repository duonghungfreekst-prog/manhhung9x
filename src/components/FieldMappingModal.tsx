import { useState, useEffect } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import type { ColumnMapping } from '../types';
import { DEFAULT_PORTAL_MAPPING, DEFAULT_INTERNAL_MAPPING, guessMapping } from '../utils/excelProcessor';

interface Props {
  portalCols: string[];
  internalCols: string[];
  initialPortal?: ColumnMapping | null;
  initialInternal?: ColumnMapping | null;
  onSave: (portal: ColumnMapping, internal: ColumnMapping) => void;
  onClose: () => void;
}

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  insuranceCode: 'Mã thẻ BHYT',
  name: 'Họ và tên',
  dob: 'Ngày sinh',
  gender: 'Giới tính',
  dateIn: 'Ngày vào viện',
  dateOut: 'Ngày ra viện',
  totalCost: 'Tổng chi phí',
  bhytPay: 'BHYT chi trả',
  patientPay: 'Bệnh nhân trả',
  bhytPercent: 'Tỷ lệ BHYT (%)',
  diagnosis: 'Mã ICD',
  diagnosisName: 'Tên chẩn đoán',
  deptName: 'Khoa điều trị',
  treatmentType: 'Loại hình KCB',
  hospitalCode: 'Mã cơ sở KCB',
  admissionNumber: 'Số thứ tự / Lần',
  objectCode: 'Mã đối tượng BHYT',
  serviceCode: 'Mã dịch vụ kỹ thuật',
  medicineCode: 'Mã thuốc',
  medicineCost: 'Chi phí thuốc',
  materialCost: 'Chi phí VTYT',
  benefitCode: 'Mã quyền lợi',
  paymentDate: 'Ngày quyết định',
  paymentDecisionNo: 'Số quyết định',
  diseaseCategory: 'Phân loại bệnh',
  regionCode: 'Mã khu vực',
  yearVisitCount: 'Số lần khám trong năm',
  stayDays: 'Số ngày nằm viện (điều trị)',
};

const FIELD_ORDER: (keyof ColumnMapping)[] = [
  'insuranceCode', 'name', 'dob', 'gender', 'dateIn', 'dateOut', 'stayDays', 'yearVisitCount',
  'totalCost', 'bhytPay', 'patientPay', 'bhytPercent',
  'diagnosis', 'diagnosisName', 'deptName', 'treatmentType', 'hospitalCode', 'admissionNumber', 'objectCode',
  'serviceCode', 'medicineCode', 'medicineCost', 'materialCost', 'benefitCode',
  'paymentDate', 'paymentDecisionNo', 'diseaseCategory', 'regionCode'
];

export function FieldMappingModal({ portalCols, internalCols, initialPortal, initialInternal, onSave, onClose }: Props) {
  const [portalMap, setPortalMap] = useState<ColumnMapping>({ ...DEFAULT_PORTAL_MAPPING });
  const [internalMap, setInternalMap] = useState<ColumnMapping>({ ...DEFAULT_INTERNAL_MAPPING });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initialPortal) setPortalMap({ ...DEFAULT_PORTAL_MAPPING, ...initialPortal });
    else setPortalMap(guessMapping(portalCols, DEFAULT_PORTAL_MAPPING));
    if (initialInternal) setInternalMap({ ...DEFAULT_INTERNAL_MAPPING, ...initialInternal });
    else setInternalMap(guessMapping(internalCols, DEFAULT_INTERNAL_MAPPING));
  }, [portalCols, internalCols, initialPortal, initialInternal]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleChange = (side: 'portal' | 'internal', field: keyof ColumnMapping, value: string) => {
    if (side === 'portal') {
      setPortalMap(prev => ({ ...prev, [field]: [value] }));
    } else {
      setInternalMap(prev => ({ ...prev, [field]: [value] }));
    }
  };

  const handleSave = () => {
    onSave(portalMap, internalMap);
  };

  const getValue = (mapping: ColumnMapping, field: keyof ColumnMapping, cols: string[]) => {
    const arr = mapping[field];
    if (!Array.isArray(arr) || arr.length === 0) return '';
    const val = arr[0];
    return cols.includes(val) ? val : '';
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'white', borderRadius: 12, width: '90%', maxWidth: 800,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Tùy chỉnh ghép cột dữ liệu</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: 12, background: '#fffbeb', padding: 12, borderRadius: 8, marginBottom: internalCols.length === 0 ? 8 : 24, color: '#b45309', fontSize: '0.9rem' }}>
            <AlertTriangle size={20} style={{ flexShrink: 0 }} />
            <div>
              Hệ thống đã tự động chọn cột dựa theo tên. Vui lòng kiểm tra và chọn lại nếu thấy cột ghép chưa đúng. Để trống nếu file không có cột đó.
            </div>
          </div>

          {internalCols.length === 0 && (
            <div style={{ display: 'flex', gap: 12, background: '#fef2f2', padding: 12, borderRadius: 8, marginBottom: 24, color: '#dc2626', fontSize: '0.9rem', border: '1px solid #fecaca' }}>
              <AlertTriangle size={20} style={{ flexShrink: 0 }} />
              <div>
                <strong>File Nội Bộ (01/BH) chưa đọc được cột nào.</strong> Có thể file bị lỗi encoding (ANSI/Windows-1252), file rỗng, hoặc chưa tải file lên.
                Vui lòng đóng modal, kiểm tra lại file rồi tải lại.
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 2fr 2fr', gap: 16, fontWeight: 600, color: '#475569', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #e2e8f0' }}>
            <div>Trường Dữ Liệu</div>
            <div style={{ color: '#10b981' }}>File Cổng Giám Định</div>
            <div style={{ color: '#6366f1' }}>File Nội Bộ (01/BH)</div>
          </div>

          {FIELD_ORDER.map(field => (
            <div key={field} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 2fr 2fr', gap: 16, alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: '0.95rem', color: '#1e293b', fontWeight: 500 }}>
                {FIELD_LABELS[field]}
              </div>
              
              <select 
                value={getValue(portalMap, field, portalCols)}
                onChange={(e) => handleChange('portal', field, e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
              >
                <option value="">-- Không có --</option>
                {portalCols.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <select 
                value={getValue(internalMap, field, internalCols)}
                onChange={(e) => handleChange('internal', field, e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
              >
                <option value="">-- Không có --</option>
                {internalCols.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', color: '#475569', cursor: 'pointer', fontWeight: 500 }}>
            Hủy
          </button>
          <button onClick={handleSave} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Save size={18} /> Lưu & Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
}
