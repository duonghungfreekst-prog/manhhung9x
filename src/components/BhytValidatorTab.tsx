import { useState, useCallback } from 'react';
import {
  Upload, ShieldCheck, ShieldAlert, AlertTriangle, Info,
  Download, RefreshCw, ChevronDown, ChevronUp, Search, FileText,
} from 'lucide-react';
import { readAnyFile, DEFAULT_PORTAL_MAPPING } from '../utils/excelProcessor';
import { validateBhyt, exportBhytValidation, QD130_XML_TABLES } from '../utils/bhytValidator';
import type { BhytSummary, BhytValidationResult } from '../utils/bhytValidator';
import type { PatientRow } from '../types';

const RULES = [
  { code: 'CARD_FORMAT / CARD_LENGTH / CARD_PREFIX / CARD_NUMERIC', label: 'Định dạng mã thẻ BHYT', ref: 'TT 35/2019 & QĐ 3276/QĐ-BYT' },
  { code: 'BENEFIT_RATE_MISMATCH', label: 'Mức hưởng đúng đối tượng', ref: 'NĐ 75/2023 & TT 25/2023' },
  { code: 'COST_IMBALANCE', label: 'Cân đối tổng chi phí', ref: 'TT 01/2023/TT-BYT Điều 14' },
  { code: 'STAY_DAYS_EXCEEDED', label: 'Giới hạn ngày nằm viện', ref: 'TT 01/2023/TT-BYT Điều 28' },
  { code: 'ICD_FORMAT / ICD_EXCLUDED', label: 'Mã ICD-10 hợp lệ', ref: 'QĐ 4469/QĐ-BYT' },
  { code: 'BHYT_EXCEED_TOTAL', label: 'BHYT không vượt tổng tiền', ref: 'TT 01/2023/TT-BYT' },
  { code: 'DATE_ORDER / DATE_FUTURE', label: 'Ngày vào/ra viện hợp lý', ref: 'TT 01/2023/TT-BYT' },
  { code: 'DUPLICATE_VISIT', label: 'Phát hiện trùng lần khám', ref: 'BHXH VN - chống gian lận' },
  { code: 'SURGERY_INDICATION_RISK', label: 'Chỉ định phẫu thuật / thủ thuật', ref: 'QĐ 130/QĐ-BYT Bảng XML3' },
  { code: 'BED_FEE_POLICY / BED_OVERLIMIT', label: 'Định mức tiền giường bệnh', ref: 'TT 22/2023 & QĐ 130/QĐ-BYT' },
  { code: 'DRUG_RATIO_ABNORMAL', label: 'Tỷ lệ chi phí thuốc bất thường', ref: 'QĐ 3618/QĐ-BHXH Giám định' },
];

const RISK_COLOR: Record<string, string> = {
  'OK': '#10b981', 'THẤP': '#22d3ee', 'TRUNG BÌNH': '#f59e0b', 'CAO': '#ef4444', 'RẤT CAO': '#7f1d1d',
};
const RISK_BG: Record<string, string> = {
  'OK': '#ecfdf5', 'THẤP': '#ecfeff', 'TRUNG BÌNH': '#fffbeb', 'CAO': '#fef2f2', 'RẤT CAO': '#fde8e8',
};
const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6',
};
const SEV_ICON: Record<string, React.ReactNode> = {
  critical: <ShieldAlert size={13} />,
  warning:  <AlertTriangle size={13} />,
  info:     <Info size={13} />,
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : score >= 40 ? '#ef4444' : '#7f1d1d';
  return (
    <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.78rem', fontWeight: 700, color, background: '#fff', flexShrink: 0 }}>
      {score}
    </div>
  );
}

function PatientCard({ r }: { r: BhytValidationResult }) {
  const [open, setOpen] = useState(false);
  const hasIssues = r.issues.length > 0;
  const criticals = r.issues.filter(i => i.severity === 'critical').length;
  return (
    <div style={{ border: `1.5px solid ${hasIssues ? '#fca5a5' : '#d1fae5'}`, borderRadius: 8,
      background: RISK_BG[r.riskLevel], marginBottom: 6, overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: hasIssues ? 'pointer' : 'default' }}
        onClick={() => hasIssues && setOpen(v => !v)}
      >
        <ScoreRing score={r.score} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.patientName || '—'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {r.insuranceCode} · {r.issues.length} vấn đề
            {criticals > 0 && <span style={{ color: '#ef4444', marginLeft: 4, fontWeight: 600 }}>({criticals} nghiêm trọng)</span>}
          </div>
        </div>
        <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
          background: RISK_COLOR[r.riskLevel], color: '#fff' }}>
          {r.riskLevel}
        </span>
        {hasIssues && (open ? <ChevronUp size={15} color="#6b7280" /> : <ChevronDown size={15} color="#6b7280" />)}
      </div>
      {open && hasIssues && (
        <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {r.issues.map((iss, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start',
              background: 'white', borderRadius: 6, padding: '6px 10px',
              border: `1px solid ${SEV_COLOR[iss.severity]}22` }}>
              <span style={{ color: SEV_COLOR[iss.severity], marginTop: 1, flexShrink: 0 }}>
                {SEV_ICON[iss.severity]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', color: '#111', fontWeight: 500 }}>{iss.message}</div>
                {iss.value && (
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>
                    Thực tế: <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>{iss.value}</code>
                    {iss.expected && <> → Đúng: <code style={{ background: '#dcfce7', padding: '1px 4px', borderRadius: 3 }}>{iss.expected}</code></>}
                  </div>
                )}
                <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 2 }}>📎 {iss.reference}</div>
              </div>
              <span style={{ fontSize: '0.65rem', color: '#9ca3af', flexShrink: 0, marginTop: 1 }}>{iss.code}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BhytValidatorTab() {
  const [file, setFile]         = useState<File | null>(null);
  const [loading, setLoading]   = useState(false);
  const [summary, setSummary]   = useState<BhytSummary | null>(null);
  const [search, setSearch]     = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('TẤT CẢ');
  const [error, setError]       = useState('');
  const [showRules, setShowRules] = useState(false);
  const [showXml130Modal, setShowXml130Modal] = useState(false);

  const handleFile = useCallback(async (f: File | null) => {
    if (!f) { setFile(null); setSummary(null); return; }
    setFile(f);
    setLoading(true);
    setError('');
    try {
      const { data } = await readAnyFile(f);
      if (data.length === 0) { setError('File không có dữ liệu.'); setLoading(false); return; }

      // Map sang PatientRow dùng mapping mặc định
      const map = DEFAULT_PORTAL_MAPPING;
      const normalize = (val: unknown) => String(val ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      const findCol = (keys: string[], aliases: string[]): string =>
        keys.find(k => aliases.some(a => normalize(k).includes(a))) || '';
      const parseNum = (v: unknown) => {
        const s = String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.');
        return parseFloat(s) || 0;
      };

      const keys = Object.keys(data[0] || {});
      const colFor = (aliases: string[]) => findCol(keys, aliases);

      const colName = colFor(map.name);
      const colCard = colFor(map.insuranceCode);
      const colDob  = colFor(map.dob);
      const colGen  = colFor(map.gender);
      const colIn   = colFor(map.dateIn);
      const colOut  = colFor(map.dateOut);
      const colTot  = colFor(map.totalCost);
      const colBhyt = colFor(map.bhytPay);
      const colPt   = colFor(map.patientPay);
      const colPct  = colFor(map.bhytPercent);
      const colIcd  = colFor(map.diagnosis);
      const colIcdN = colFor(map.diagnosisName);
      const colDept = colFor(map.deptName);
      const colTreat= colFor(map.treatmentType);
      const colHosp = colFor(map.hospitalCode);
      const colAdm  = colFor(map.admissionNumber);

      const rows: PatientRow[] = data.map((row, i) => {
        const g = (col: string) => (col ? row[col] : '') ?? '';
        const days = parseNum(g(''));
        return {
          id: `row_${i}`,
          name:            String(g(colName)),
          insuranceCode:   String(g(colCard)).trim().toUpperCase(),
          dob:             String(g(colDob)),
          gender:          String(g(colGen)),
          dateIn:          String(g(colIn)),
          dateOut:         String(g(colOut)),
          stayDays:        days,
          totalCost:       parseNum(g(colTot)),
          bhytPay:         parseNum(g(colBhyt)),
          patientPay:      parseNum(g(colPt)),
          bhytPercent:     parseNum(g(colPct)),
          diagnosis:       String(g(colIcd)),
          diagnosisName:   String(g(colIcdN)),
          deptName:        String(g(colDept)),
          treatmentType:   String(g(colTreat)),
          hospitalCode:    String(g(colHosp)),
          admissionNumber: String(g(colAdm)),
          // ---- New fields with default values ----
          objectCode:        '',
          serviceCode:       '',
          medicineCode:      '',
          medicineCost:      0,
          materialCost:      0,
          benefitCode:       '',
          paymentDate:       '',
          paymentDecisionNo: '',
          diseaseCategory:   '',
          regionCode:        '',
          yearVisitCount:    0,
        };
      });

      // Tính stayDays nếu không có cột riêng
      for (const r of rows) {
        if (!r.stayDays && r.dateIn && r.dateOut) {
          const parseD = (s: string) => {
            const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
          };
          const dIn = parseD(r.dateIn), dOut = parseD(r.dateOut);
          if (dIn && dOut) r.stayDays = Math.round((dOut.getTime() - dIn.getTime()) / 86400000);
        }
      }

      const result = validateBhyt(rows);
      setSummary(result);
    } catch (e) {
      setError('Lỗi đọc file: ' + String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const filtered = summary?.results.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.patientName.toLowerCase().includes(q) || r.insuranceCode.toLowerCase().includes(q)
      || r.issues.some(i => i.message.toLowerCase().includes(q));
    const matchRisk = riskFilter === 'TẤT CẢ' || r.riskLevel === riskFilter;
    return matchSearch && matchRisk;
  }) || [];

  const pk = '#0ea5e9'; // sky blue chủ đạo

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f0f9ff' }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e0f2fe', padding: '0.75rem 1rem',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <ShieldCheck size={22} color={pk} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: '1rem', color: '#0c4a6e' }}>Kiểm Tra Hồ Sơ BHYT Chuẩn QĐ 130</strong>
            <span style={{ fontSize: '0.68rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
              12 BẢNG XML & 11 QUY TẮC
            </span>
          </div>
          <div style={{ fontSize: '0.73rem', color: '#6b7280', marginTop: 1 }}>
            11 quy tắc kiểm toán xuất toán · Chuẩn QĐ 130/QĐ-BYT · TT 22/2023 · NĐ 75/2023 · QĐ 4469
          </div>
        </div>
        <button
          onClick={() => setShowXml130Modal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
            borderRadius: 6, border: '1px solid #bae6fd', background: '#f0f9ff',
            color: '#0369a1', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
          <FileText size={14} /> Tra cứu 12 Bảng QĐ 130
        </button>
        <button
          onClick={() => setShowRules(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
            borderRadius: 6, border: '1px solid #cbd5e1', background: 'white',
            color: '#334155', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
          {showRules ? 'Ẩn' : 'Xem'} 11 Quy Tắc
        </button>
        {summary && (
          <button
            onClick={() => {
              const d = new Date().toISOString().slice(0, 10);
              exportBhytValidation(summary, `KiemTra_BHYT_QD130_${d}.xlsx`);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px',
              borderRadius: 6, border: 'none', background: pk, color: 'white',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
            <Download size={14} /> Xuất Excel
          </button>
        )}
      </div>

      {/* Modal Tra Cứu 12 Bảng XML QĐ 130 */}
      {showXml130Modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
          zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 16, width: '95%', maxWidth: 760,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 60px -15px rgba(0,0,0,0.4)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px', background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                  Chuẩn 12 Bảng XML Cổng Giám Định BHYT (Quyết Định 130/QĐ-BYT)
                </h3>
                <div style={{ fontSize: '0.75rem', color: '#bae6fd', marginTop: 2 }}>
                  Quy định định dạng dữ liệu đầu ra phục vụ quản lý, giám định, thanh toán chi phí KCB BHYT
                </div>
              </div>
              <button
                onClick={() => setShowXml130Modal(false)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 8px', color: 'white', cursor: 'pointer', fontSize:'0.9rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {QD130_XML_TABLES.map((t, idx) => (
                <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ background: '#0284c7', color: 'white', fontSize: '0.7rem', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>
                      {t.code}
                    </span>
                    <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{t.name}</strong>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: 6 }}>{t.description}</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    <strong>Trường bắt buộc: </strong>
                    <code style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: 3 }}>
                      {t.requiredFields.join(', ')}
                    </code>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowXml130Modal(false)}
                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#0284c7', color: 'white', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Đóng Tra Cứu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules info */}
      {showRules && (
        <div style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa', padding: '0.75rem 1rem',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 6, flexShrink: 0 }}>
          {RULES.map((r, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 6, padding: '6px 10px',
              border: '1px solid #fed7aa', fontSize: '0.75rem' }}>
              <div style={{ fontWeight: 600, color: '#92400e' }}>Quy tắc {i + 1}: {r.label}</div>
              <div style={{ color: '#9ca3af', marginTop: 2 }}>📎 {r.ref}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>

        {/* Upload */}
        {!summary && (
          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            style={{ border: `2px dashed ${pk}`, borderRadius: 12, padding: '2.5rem',
              textAlign: 'center', background: 'white', cursor: 'pointer' }}
            onClick={() => { const el = document.getElementById('bhyt-file-input'); el?.click(); }}
          >
            <input id="bhyt-file-input" type="file" accept=".xlsx,.xls,.csv,.xml"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {loading
              ? <><RefreshCw size={32} color={pk} style={{ animation: 'spin 1s linear infinite' }} />
                  <div style={{ marginTop: 12, color: pk, fontWeight: 600 }}>Đang phân tích...</div></>
              : <>
                  <Upload size={36} color={pk} opacity={0.6} />
                  <div style={{ marginTop: 12, fontWeight: 600, color: '#0c4a6e', fontSize: '1rem' }}>
                    Kéo thả hoặc click để chọn file
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 4 }}>
                    Excel · XML · CSV — file đối soát BHYT (Cổng giám định hoặc 01/BH)
                  </div>
                </>
            }
            {error && <div style={{ color: '#ef4444', marginTop: 12, fontSize: '0.82rem' }}>{error}</div>}
          </div>
        )}

        {/* Summary cards */}
        {summary && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 8 }}>
              {[
                { label: 'Tổng hồ sơ', value: summary.total, bg: '#f0f9ff', color: pk },
                { label: '✅ Hợp lệ', value: summary.ok, bg: '#ecfdf5', color: '#10b981' },
                { label: '🔵 Rủi ro thấp', value: summary.lowRisk, bg: '#ecfeff', color: '#0891b2' },
                { label: '🟡 Trung bình', value: summary.medRisk, bg: '#fffbeb', color: '#d97706' },
                { label: '🔴 Rủi ro cao', value: summary.highRisk, bg: '#fef2f2', color: '#dc2626' },
                { label: '🚨 Rất cao', value: summary.veryHighRisk, bg: '#fde8e8', color: '#7f1d1d' },
                { label: '⚠ Tổng lỗi', value: summary.totalIssues, bg: '#fefce8', color: '#ca8a04' },
                { label: '🔴 Nghiêm trọng', value: summary.criticalIssues, bg: '#fef2f2', color: '#dc2626' },
              ].map((s, i) => (
                <div key={i} style={{ background: s.bg, borderRadius: 8, padding: '0.6rem 0.8rem',
                  border: `1px solid ${s.color}22` }}>
                  <div style={{ fontSize: '0.68rem', color: '#6b7280', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm tên, mã thẻ, nội dung lỗi..."
                  style={{ width: '100%', padding: '6px 10px 6px 32px', borderRadius: 6, border: '1px solid #bae6fd',
                    fontSize: '0.82rem', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
              {(['TẤT CẢ', 'OK', 'THẤP', 'TRUNG BÌNH', 'CAO', 'RẤT CAO'] as const).map(lv => (
                <button key={lv} onClick={() => setRiskFilter(lv)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: '0.78rem',
                    fontWeight: 600,
                    background: riskFilter === lv ? (RISK_COLOR[lv] || pk) : '#f1f5f9',
                    color: riskFilter === lv ? 'white' : '#475569' }}>
                  {lv}
                </button>
              ))}
              <button onClick={() => { setFile(null); setSummary(null); setSearch(''); setRiskFilter('TẤT CẢ'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6,
                  border: '1px solid #e5e7eb', background: 'white', color: '#6b7280', cursor: 'pointer', fontSize: '0.78rem' }}>
                <RefreshCw size={13} /> Tải file mới
              </button>
            </div>

            {/* Results */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 6 }}>
                Hiển thị {filtered.length}/{summary.total} hồ sơ · File: <strong>{file?.name}</strong>
              </div>
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  Không tìm thấy hồ sơ phù hợp
                </div>
              )}
              {filtered.map(r => <PatientCard key={r.patientId} r={r} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
