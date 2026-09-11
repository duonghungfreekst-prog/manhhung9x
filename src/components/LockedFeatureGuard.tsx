import React from 'react';
import { ShieldAlert, KeyRound, Sparkles, CheckCircle2 } from 'lucide-react';
import {
  type TabName,
  TAB_LABELS,
  TIER_LABELS,
  type LicenseResult
} from '../utils/licenseManager';

interface Props {
  tab: TabName;
  license: LicenseResult | null;
  onOpenLicenseModal: () => void;
  onNavigateAllowedTab?: (tab: TabName) => void;
}

export const LockedFeatureGuard: React.FC<Props> = ({
  tab,
  license,
  onOpenLicenseModal,
  onNavigateAllowedTab,
}) => {
  const tabLabel = TAB_LABELS[tab] || tab;
  const currentTierLabel = license ? TIER_LABELS[license.tier] : 'Chưa kích hoạt';
  const isExpired = license?.expired;

  // Danh sách các tab mà user có quyền truy cập
  const allowedTabs = license
    ? (Object.keys(license.tabs) as TabName[]).filter(t => license.tabs[t])
    : [];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '70vh',
      padding: '24px 16px',
      background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
    }}>
      <div style={{
        maxWidth: 560,
        width: '100%',
        background: '#ffffff',
        borderRadius: 20,
        border: '1px solid #e2e8f0',
        boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.1)',
        padding: '36px 32px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}>
        {/* Icon cảnh báo */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 24,
          background: 'linear-gradient(135deg, #fee2e2 0%, #fef2f2 100%)',
          border: '1px solid #fca5a5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#dc2626',
          boxShadow: '0 8px 20px -6px rgba(220, 38, 38, 0.25)',
        }}>
          <ShieldAlert size={38} />
        </div>

        {/* Tiêu đề & Tên phân hệ */}
        <div>
          <div style={{
            fontSize: '0.82rem',
            fontWeight: 800,
            color: '#dc2626',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 4,
          }}>
            {isExpired ? 'Bản Quyền Đã Hết Hạn' : 'Phân Hệ Yêu Cầu Bản Quyền'}
          </div>
          <h2 style={{
            fontSize: '1.45rem',
            fontWeight: 800,
            color: '#0f172a',
            margin: '0 0 8px 0',
          }}>
            {tabLabel}
          </h2>
          <p style={{
            fontSize: '0.88rem',
            color: '#64748b',
            lineHeight: 1.5,
            margin: 0,
            maxWidth: 460,
          }}>
            {isExpired
              ? 'Thời gian sử dụng bản quyền của bạn đã kết thúc. Vui lòng gia hạn để tiếp tục sử dụng phân hệ này.'
              : `Phân hệ này không nằm trong phạm vi cấp phép của gói hiện tại (${currentTierLabel}). Vui lòng nâng cấp bản quyền thương mại để mở khóa đầy đủ tính năng.`}
          </p>
        </div>

        {/* Thông tin gói hiện tại */}
        <div style={{
          width: '100%',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.82rem',
          boxSizing: 'border-box',
        }}>
          <span style={{ color: '#64748b' }}>Gói bản quyền hiện tại:</span>
          <span style={{ fontWeight: 700, color: '#1e293b' }}>{currentTierLabel}</span>
        </div>

        {/* Nút hành động */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          width: '100%',
          marginTop: 6,
        }}>
          <button
            onClick={onOpenLicenseModal}
            style={{
              width: '100%',
              padding: '13px 20px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
              transition: 'all 0.15s ease',
            }}
          >
            <KeyRound size={18} />
            <span>Kích Hoạt / Nâng Cấp Bản Quyền Ngay</span>
          </button>

          {allowedTabs.length > 0 && onNavigateAllowedTab && (
            <button
              onClick={() => onNavigateAllowedTab(allowedTabs[0])}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: 12,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontWeight: 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <CheckCircle2 size={16} color="#16a34a" />
              <span>Chuyển sang phân hệ được phép ({TAB_LABELS[allowedTabs[0]]})</span>
            </button>
          )}
        </div>

        {/* Cam kết hỗ trợ */}
        <div style={{
          fontSize: '0.74rem',
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 4,
        }}>
          <Sparkles size={13} color="#6366f1" />
          <span>Hệ thống Y Tế & Kỹ Thuật Máy Tính DMH Commercial Suite 2026</span>
        </div>
      </div>
    </div>
  );
};
