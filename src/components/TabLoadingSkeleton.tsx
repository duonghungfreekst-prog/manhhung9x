import React from 'react';
import { Loader2 } from 'lucide-react';

interface TabLoadingSkeletonProps {
  tabTitle?: string;
}

export const TabLoadingSkeleton: React.FC<TabLoadingSkeletonProps> = ({ tabTitle }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '55vh',
      padding: '32px',
      color: '#475569'
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 14,
        background: 'rgba(37, 99, 235, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16
      }}>
        <Loader2 size={26} color="#2563eb" className="animate-spin" />
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: 4 }}>
        Đang nạp phân hệ {tabTitle ? `"${tabTitle}"` : ''}...
      </div>
      <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
        Tối ưu hóa bộ nhớ RAM — Tự động cách ly tài nguyên
      </div>
    </div>
  );
};
