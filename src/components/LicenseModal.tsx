import { useState, useEffect } from 'react';
import {
  Shield, ShieldCheck, RefreshCw, X, Unlock, CheckCircle2,
  XCircle, Copy, Check
} from 'lucide-react';
import {
  validateLicenseKey, getDeviceHardwareId,
  saveLicense, expiryLabel, maskToTabList,
  TIER_LABELS,
  type LicenseResult
} from '../utils/licenseManager';

interface Props {
  onClose: () => void;
  onActivate: (result: LicenseResult) => void;
  currentLicense: LicenseResult | null;
}

export function LicenseModal({ onClose, onActivate, currentLicense }: Props) {
  const [hwid, setHwid] = useState<string>('Đang lấy...');
  const [copiedHwid, setCopiedHwid] = useState(false);

  // Activate panel state
  const [inputKey, setInputKey] = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<LicenseResult | null>(null);

  useEffect(() => {
    getDeviceHardwareId().then(h => {
      setHwid(h);
    });
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleCopyHwid = () => {
    navigator.clipboard.writeText(hwid);
    setCopiedHwid(true);
    setTimeout(() => setCopiedHwid(false), 2000);
  };

  const handleActivate = async () => {
    if (!inputKey.trim()) return;
    setLoading(true);
    const r = await validateLicenseKey(inputKey.trim(), true, hwid);
    setResult(r);
    if (r.valid && !r.expired && !r.usesExhausted && r.hwidMatched) {
      await saveLicense(inputKey.trim());
      onActivate(r);
    }
    setLoading(false);
  };

  const handleInput = (v: string) => {
    const clean   = v.replace(/[^A-Za-z2-7]/g, '').toUpperCase();
    const grouped = clean.match(/.{1,4}/g)?.join('-') ?? clean;
    setInputKey(grouped);
  };

  const isOk = (r: LicenseResult) => r.valid && !r.expired && !r.usesExhausted && r.hwidMatched;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)',
      zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(5px)',
    }}>
      <div style={{
        background: 'white', borderRadius: 20, width: '95%', maxWidth: 580,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
            }}>
              <Shield size={24} color="white" />
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                DMH Tools License Manager
                <span style={{ fontSize: '0.7rem', background: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                  v6.6.4
                </span>
              </div>
              <div style={{ color: '#a5b4fc', fontSize: '0.78rem' }}>
                Kích hoạt bản quyền chính hãng DMH Commercial Suite
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
              padding: 6, cursor: 'pointer', color: 'white',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content - Chỉ giữ lại duy nhất phần nhập Key và kích hoạt */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Trạng thái ngắn gọn khi đã kích hoạt */}
          {currentLicense && currentLicense.valid && !currentLicense.expired && (
            <div style={{
              background: '#f0fdf4', borderRadius: 10, padding: '10px 14px',
              border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#166534' }}>
                <ShieldCheck size={18} color="#16a34a" />
                <span>Đã kích hoạt: <strong>{currentLicense.customerName || 'Khách Hàng'}</strong></span>
              </div>
              <span style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 700 }}>
                Hạn dùng: {expiryLabel(currentLicense.expiry)}
              </span>
            </div>
          )}

              {/* Input Nhập Key */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Nhập License Key Được Cấp (AES-256)
                </label>
                <input
                  value={inputKey}
                  onChange={e => handleInput(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-..."
                  onKeyDown={e => e.key === 'Enter' && handleActivate()}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 10, boxSizing: 'border-box',
                    border: result
                      ? (isOk(result) ? '2px solid #10b981' : '2px solid #ef4444')
                      : '2px solid #cbd5e1',
                    fontFamily: 'monospace', fontSize: '0.95rem', letterSpacing: 2,
                    outline: 'none', background: '#f8fafc',
                  }}
                />
              </div>

              <button
                onClick={handleActivate}
                disabled={loading || !inputKey.trim()}
                style={{
                  padding: '12px 20px', borderRadius: 10, border: 'none',
                  background: !inputKey.trim() ? '#e2e8f0' : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                  color: !inputKey.trim() ? '#94a3b8' : 'white',
                  fontWeight: 700, fontSize: '0.95rem', cursor: !inputKey.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
                  boxShadow: !inputKey.trim() ? 'none' : '0 4px 14px rgba(14,165,233,0.3)',
                }}
              >
                {loading ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Unlock size={18} />}
                {loading ? 'Đang xác thực khóa phần cứng...' : 'Kích Hoạt Bản Quyền Ngay'}
              </button>

              {/* Result Message */}
              {result && (
                <div style={{
                  padding: 14, borderRadius: 10,
                  background: isOk(result) ? '#f0fdf4' : '#fef2f2',
                  border: `1.5px solid ${isOk(result) ? '#bbf7d0' : '#fecaca'}`,
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  {isOk(result)
                    ? <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
                    : <XCircle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />}
                  <div>
                    <div style={{ fontWeight: 700, color: isOk(result) ? '#166534' : '#991b1b', fontSize: '0.9rem' }}>
                      {isOk(result)
                        ? `✓ Kích hoạt thành công — Đã cấp phép cho ${result.customerName} (${maskToTabList(result.mask).length} module)`
                        : result.usesExhausted
                          ? `🚫 Key đã đạt giới hạn số máy tối đa (${result.usedCount}/${result.maxUses} máy)`
                          : result.expired
                            ? '⏰ Giấy phép bản quyền đã hết hạn sử dụng'
                            : !result.hwidMatched
                              ? `🔒 Khóa HWID: Mã máy này (${hwid.slice(0, 16)}) không khớp với máy được cấp key!`
                              : result.errorMsg ?? 'Mã Key không hợp lệ hoặc đã bị thay đổi!'
                      }
                    </div>
                    {isOk(result) && (
                      <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: 4 }}>
                        Hạn dùng: <strong>{expiryLabel(result.expiry)}</strong> · Gói: <strong>{TIER_LABELS[result.tier]}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}
        </div>

        {/* Footer info */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid #f1f5f9',
          background: '#f8fafc', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', fontSize: '0.78rem', color: '#64748b',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>Hotline Hỗ Trợ: <strong>0988.388.xxx</strong></span>
            <button
              onClick={handleCopyHwid}
              title="Sao chép mã máy tính để gửi cho kỹ thuật viên cấp License Key"
              style={{
                background: 'none', border: 'none', color: copiedHwid ? '#16a34a' : '#94a3b8',
                cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4,
                textDecoration: 'underline', padding: 0
              }}
            >
              {copiedHwid ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
              {copiedHwid ? 'Đã chép mã máy' : 'Sao chép mã máy'}
            </button>
          </div>
          <div>Bản quyền phần mềm DMH Suite © 2026</div>
        </div>
      </div>
    </div>
  );
}
