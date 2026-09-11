import { useEffect } from 'react';
import { Building2, X, Lock, ShieldCheck } from 'lucide-react';
import { DEFAULT_OEM_CONFIG, type OemConfig } from '../utils/oemConfig';

interface Props {
  onClose: () => void;
  onSaved?: (cfg: OemConfig) => void;
}

export function OemSettingsModal({ onClose }: Props) {
  const config = DEFAULT_OEM_CONFIG;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
      zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(5px)',
    }}>
      <div style={{
        background: 'white', borderRadius: 20, width: '95%', maxWidth: 640,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.4)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)',
          color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Building2 size={22} color="white" />
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                Thương Hiệu Bản Quyền DMH
                <span style={{ fontSize: '0.7rem', background: '#022c22', color: '#6ee7b7', padding: '2px 8px', borderRadius: 10, border: '1px solid #059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Lock size={10} /> MẶC ĐỊNH CỐ ĐỊNH
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#a7f3d0' }}>
                Hệ thống nhận diện thương hiệu chuẩn xác của Hệ Thống Y Tế & Kỹ Thuật Máy Tính DMH
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8,
              padding: 6, cursor: 'pointer', color: 'white',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Notice Banner: Khóa Bản Quyền Mặc Định */}
        <div style={{
          margin: '16px 24px 0', padding: '10px 14px', borderRadius: 10,
          background: '#f0fdf4', border: '1px solid #bbf7d0',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', color: '#166534',
        }}>
          <ShieldCheck size={18} color="#16a34a" style={{ flexShrink: 0 }} />
          <div>
            <strong>Cấu hình thương hiệu mặc định:</strong> Thông tin bản quyền được thiết lập cố định theo nhà phát hành DMH và <strong>không thể chỉnh sửa</strong>.
          </div>
        </div>

        {/* Content Form */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                Tên Phòng Khám / Bệnh Viện / Đơn Vị Y Tế
              </label>
              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Lock size={11} /> Mặc định
              </span>
            </div>
            <input
              type="text"
              value={config.clinicName}
              readOnly
              disabled
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid #cbd5e1', fontSize: '0.9rem', outline: 'none',
                boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a',
                fontWeight: 700, cursor: 'not-allowed',
              }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                Slogan / Khẩu hiệu hoạt động
              </label>
              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Lock size={11} /> Mặc định
              </span>
            </div>
            <input
              type="text"
              value={config.slogan}
              readOnly
              disabled
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid #cbd5e1', fontSize: '0.9rem', outline: 'none',
                boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a',
                fontWeight: 600, cursor: 'not-allowed',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                  Hotline Tiếp Đón / Đặt Lịch
                </label>
                <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Lock size={11} /> Mặc định
                </span>
              </div>
              <input
                type="text"
                value={config.hotline}
                readOnly
                disabled
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: '1.5px solid #cbd5e1', fontSize: '0.9rem', outline: 'none',
                  boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a',
                  fontWeight: 700, cursor: 'not-allowed',
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                  Bộ phận Hỗ trợ Kỹ thuật / IT Phòng Khám
                </label>
                <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Lock size={11} /> Mặc định
                </span>
              </div>
              <input
                type="text"
                value={config.techSupport}
                readOnly
                disabled
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: '1.5px solid #cbd5e1', fontSize: '0.9rem', outline: 'none',
                  boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a',
                  fontWeight: 600, cursor: 'not-allowed',
                }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                Địa Chỉ Cơ Sở Khám Chữa Bệnh
              </label>
              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Lock size={11} /> Mặc định
              </span>
            </div>
            <input
              type="text"
              value={config.address}
              readOnly
              disabled
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid #cbd5e1', fontSize: '0.9rem', outline: 'none',
                boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a',
                fontWeight: 600, cursor: 'not-allowed',
              }}
            />
          </div>

          {/* Preview Box */}
          <div style={{
            marginTop: 4, padding: '14px 18px', borderRadius: 12,
            background: '#f8fafc', border: '1px dashed #94a3b8',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
              Xem trước hiển thị Header & Báo cáo
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
              {config.clinicName}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#059669', fontStyle: 'italic', marginTop: 2 }}>
              "{config.slogan}"
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
              📍 {config.address} · ☎ {config.hotline}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc',
        }}>
          <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lock size={13} color="#059669" />
            <span>Đã khóa bản quyền chính hãng DMH</span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                padding: '9px 24px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #047857, #065f46)',
                color: 'white', fontWeight: 700, fontSize: '0.88rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 2px 8px rgba(4,120,87,0.3)',
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
