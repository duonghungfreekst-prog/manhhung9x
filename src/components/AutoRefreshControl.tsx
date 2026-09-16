import React, { useState, useRef, useEffect } from 'react';
import { RotateCw, Clock, Check, ChevronDown, Sparkles, Zap } from 'lucide-react';
import {
  useAutoRefreshStatus,
  saveAutoRefreshConfig,
  triggerGlobalSmartRefresh,
} from '../utils/autoRefreshManager';

const INTERVAL_OPTIONS = [
  { value: 10, label: '10 giây (Siêu tốc)' },
  { value: 30, label: '30 giây (Chuẩn)' },
  { value: 60, label: '1 phút' },
  { value: 120, label: '2 phút' },
  { value: 300, label: '5 phút' },
];

export const AutoRefreshControl: React.FC = () => {
  const status = useAutoRefreshStatus();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleToggleEnabled = () => {
    saveAutoRefreshConfig({ enabled: !status.enabled });
  };

  const handleSelectInterval = (val: number) => {
    saveAutoRefreshConfig({ intervalSec: val, enabled: true });
  };

  const handleTogglePreserve = () => {
    saveAutoRefreshConfig({ preserveState: !status.preserveState });
  };

  const handleToggleSilent = () => {
    saveAutoRefreshConfig({ silentMode: !status.silentMode });
  };

  const handleManualRefresh = async () => {
    await triggerGlobalSmartRefresh({ silent: false, isAuto: false });
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        userSelect: 'none',
      }}
    >
      {/* ── Cụm Nút Điều Khiển Gọn Gàng Trên Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: status.enabled ? 'rgba(238, 242, 255, 0.9)' : '#f8fafc',
          border: status.enabled ? '1px solid #c7d2fe' : '1px solid #cbd5e1',
          borderRadius: 6,
          padding: '1px 3px',
          height: 28,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Nút Làm Mới Ngay Lập Tức */}
        <button
          onClick={handleManualRefresh}
          disabled={status.isRefreshing}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            border: 'none',
            borderRadius: 4,
            background: 'transparent',
            color: status.isRefreshing ? '#4f46e5' : '#334155',
            cursor: status.isRefreshing ? 'wait' : 'pointer',
            padding: 0,
            transition: 'transform 0.15s ease',
          }}
          title="Làm mới thông minh giữ nguyên thao tác (Phím tắt: F5 hoặc Ctrl+R)"
        >
          <RotateCw
            size={13}
            style={{
              animation: status.isRefreshing ? 'spin 0.8s linear infinite' : 'none',
              transformOrigin: 'center',
            }}
          />
        </button>

        {/* Nút Bấm Mở Menu Cấu Hình & Hiển Thị Đếm Ngược */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            border: 'none',
            background: 'transparent',
            padding: '2px 4px',
            fontSize: '0.74rem',
            fontWeight: 600,
            color: status.enabled ? '#4338ca' : '#64748b',
            cursor: 'pointer',
            borderRadius: 4,
            whiteSpace: 'nowrap',
          }}
          title="Tự động làm mới: Bấm để cài đặt chu kỳ & cơ chế giữ nguyên vị trí"
        >
          {status.enabled ? (
            <>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: status.isRefreshing ? '#6366f1' : '#10b981',
                  boxShadow: status.isRefreshing ? '0 0 6px #6366f1' : '0 0 4px #10b981',
                  display: 'inline-block',
                }}
              />
              <span>{status.isRefreshing ? 'Đang tải...' : `${status.countdown}s`}</span>
            </>
          ) : (
            <>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#94a3b8',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#64748b' }}>Tắt</span>
            </>
          )}
          <ChevronDown size={11} style={{ opacity: 0.7 }} />
        </button>
      </div>

      {/* ── Dropdown Menu Thiết Lập Tự Động Làm Mới Thông Minh ── */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: '#ffffff',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            boxShadow: '0 12px 30px -5px rgba(0,0,0,0.18)',
            width: 275,
            zIndex: 2500,
            padding: '10px 12px',
            color: '#1e293b',
            fontSize: '0.8rem',
          }}
        >
          {/* Header menu */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 8,
              borderBottom: '1px solid #f1f5f9',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#1e293b', fontSize: '0.82rem' }}>
              <Clock size={14} color="#4f46e5" />
              <span>Tự Động Làm Mới</span>
            </div>
            {/* Toggle switch bật tắt */}
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 4 }}>
              <input
                type="checkbox"
                checked={status.enabled}
                onChange={handleToggleEnabled}
                style={{ cursor: 'pointer', accentColor: '#4f46e5' }}
              />
              <span style={{ fontSize: '0.74rem', fontWeight: 600, color: status.enabled ? '#16a34a' : '#64748b' }}>
                {status.enabled ? 'Đang bật' : 'Đang tắt'}
              </span>
            </label>
          </div>

          {/* Chọn chu kỳ */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, marginBottom: 4 }}>
              CHU KỲ TỰ ĐỘNG CẬP NHẬT:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {INTERVAL_OPTIONS.map(opt => {
                const active = status.enabled && status.intervalSec === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleSelectInterval(opt.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      border: 'none',
                      borderRadius: 5,
                      background: active ? '#eff6ff' : 'transparent',
                      color: active ? '#1d4ed8' : '#334155',
                      fontSize: '0.77rem',
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={e => {
                      if (!active) e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={e => {
                      if (!active) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>{opt.label}</span>
                    {active && <Check size={13} color="#1d4ed8" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cấu hình nâng cao: Bảo tồn vị trí cuộn & tương tác */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 7,
                cursor: 'pointer',
                fontSize: '0.75rem',
                color: '#334155',
              }}
            >
              <input
                type="checkbox"
                checked={status.preserveState}
                onChange={handleTogglePreserve}
                style={{ marginTop: 2, accentColor: '#4f46e5', cursor: 'pointer' }}
              />
              <div>
                <strong style={{ color: '#0f172a' }}>Giữ nguyên thao tác & vị trí cuộn</strong>
                <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 1 }}>
                  Không nhảy scroll, không mất con trỏ input, không mất dòng đang chọn.
                </div>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 7,
                cursor: 'pointer',
                fontSize: '0.75rem',
                color: '#334155',
              }}
            >
              <input
                type="checkbox"
                checked={status.silentMode}
                onChange={handleToggleSilent}
                style={{ marginTop: 2, accentColor: '#4f46e5', cursor: 'pointer' }}
              />
              <div>
                <strong style={{ color: '#0f172a' }}>Làm mới êm ái (Silent Mode)</strong>
                <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 1 }}>
                  Cập nhật ngầm, không khóa màn hình hay hiện spinner che thao tác.
                </div>
              </div>
            </label>
          </div>

          {/* Footer & Phím tắt */}
          <div
            style={{
              borderTop: '1px solid #f1f5f9',
              paddingTop: 8,
              fontSize: '0.7rem',
              color: '#64748b',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Lần làm mới gần nhất:</span>
              <strong style={{ color: '#0f172a' }}>{status.lastRefreshedAt || 'Chưa làm mới'}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#059669', fontSize: '0.69rem', marginTop: 2 }}>
              <Zap size={11} />
              <span>Phím tắt: <strong>F5</strong> hoặc <strong>Ctrl+R</strong> (Làm mới êm)</span>
            </div>

            <button
              onClick={() => {
                setIsOpen(false);
                handleManualRefresh();
              }}
              disabled={status.isRefreshing}
              style={{
                marginTop: 6,
                width: '100%',
                padding: '6px 8px',
                borderRadius: 6,
                border: 'none',
                background: '#4f46e5',
                color: 'white',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Sparkles size={13} />
              <span>Làm mới toàn app ngay lập tức</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
