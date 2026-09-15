/**
 * DMH_Tools - Global Processing Indicator Components
 * 1. GlobalTopProgressBar: Thanh tiến trình chạy lướt trên đỉnh toàn màn hình
 * 2. HeaderProcessingIndicator: Dòng biểu tượng & trạng thái đang xử lý nổi bật ở Header
 */

import { useState } from 'react';
import { Loader2, Activity, Layers, XCircle } from 'lucide-react';
import { useGlobalLoading, clearAllGlobalLoading } from '../utils/globalLoading';

/**
 * Vạch tiến trình thanh mảnh chạy lướt liên tục trên đỉnh ứng dụng
 */
export function GlobalTopProgressBar() {
  const { isLoading } = useGlobalLoading();

  if (!isLoading) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 99999,
        background: 'rgba(2, 132, 199, 0.2)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '100%',
          background: 'linear-gradient(90deg, #0284c7 0%, #38bdf8 30%, #06b6d4 60%, #10b981 100%)',
          boxShadow: '0 0 8px rgba(14, 165, 233, 0.8)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: '40%',
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.9), transparent)',
            animation: 'globalShimmer 1.4s infinite ease-in-out',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Dòng biểu tượng và thông báo trạng thái đang xử lý nổi bật trên thanh Header
 */
export function HeaderProcessingIndicator() {
  const { isLoading, currentMessage, taskCount, tasks } = useGlobalLoading();
  const [showDropdown, setShowDropdown] = useState(false);

  if (!isLoading) return null;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        margin: '0 8px',
        maxWidth: 420,
        flexShrink: 1,
        minWidth: 0,
      }}
    >
      <div
        className="global-badge-pulse"
        onClick={() => taskCount > 1 && setShowDropdown(!showDropdown)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '3px 10px',
          borderRadius: 20,
          border: '1.5px solid #38bdf8',
          background: 'linear-gradient(135deg, #f0fdfa 0%, #eff6ff 100%)',
          color: '#0369a1',
          fontSize: '0.74rem',
          fontWeight: 700,
          cursor: taskCount > 1 ? 'pointer' : 'default',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(14, 165, 233, 0.25)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          height: 28,
        }}
        title={`${currentMessage} (Nhấn để xem chi tiết các tác vụ)`}
      >
        {/* Spinner xoay mượt mà */}
        <Loader2 size={14} className="global-spin" color="#0284c7" style={{ flexShrink: 0 }} />

        {/* Chấm tròn xung điện phát sáng báo hiệu hoạt động thực */}
        <span
          className="global-pulse-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#10b981',
            flexShrink: 0,
            boxShadow: '0 0 6px #10b981',
          }}
        />

        {/* Thông điệp xử lý */}
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 260,
            color: '#075985',
            letterSpacing: -0.2,
          }}
        >
          {currentMessage || 'Hệ thống đang xử lý...'}
        </span>

        {/* Huy hiệu đếm số tác vụ nếu có nhiều tác vụ cùng chạy */}
        {taskCount > 1 && (
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 10,
              background: '#0284c7',
              color: 'white',
              fontSize: '0.68rem',
              fontWeight: 800,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Layers size={10} />
            {taskCount}
          </span>
        )}
      </div>

      {/* Dropdown danh sách tác vụ đang chạy nếu có nhiều */}
      {showDropdown && taskCount > 1 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: 320,
            background: 'white',
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: 3000,
            padding: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 6px',
              borderBottom: '1px solid #f1f5f9',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Activity size={13} /> {taskCount} tác vụ đang thực thi:
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearAllGlobalLoading();
                setShowDropdown(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#ef4444',
                fontSize: '0.7rem',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
              title="Đặt lại toàn bộ trạng thái loading nếu bị kẹt"
            >
              <XCircle size={12} /> Hủy tất cả
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
            {tasks.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: '#f0fdfa',
                  border: '1px solid #ccfbf1',
                  fontSize: '0.74rem',
                  color: '#134e4a',
                }}
              >
                <Loader2 size={12} className="global-spin" color="#0d9488" />
                <span style={{ flex: 1 }}>{t.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
