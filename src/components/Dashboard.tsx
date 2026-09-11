import type { Stats } from '../types';
import { TrendingUp, TrendingDown, Minus, AlertOctagon, CheckCircle, XCircle, Search } from 'lucide-react';

interface DashboardProps {
  stats: Stats;
  portalCount: number;
  internalCount: number;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
    </div>
  );
}

export function Dashboard({ stats, portalCount, internalCount }: DashboardProps) {
  if (stats.total === 0) return null;

  const matchPct = Math.round((stats.khop / stats.total) * 100);
  const diffPct  = Math.round((stats.lech / stats.total) * 100);
  const missPct  = Math.round((stats.khongThay / stats.total) * 100);

  const cards = [
    {
      icon: <CheckCircle size={20} />,
      label: 'Khớp hoàn toàn',
      value: stats.khop,
      pct: matchPct,
      color: '#10b981',
      bg: '#dcfce7',
      trend: matchPct >= 80 ? 'up' : matchPct >= 50 ? 'flat' : 'down',
    },
    {
      icon: <AlertOctagon size={20} />,
      label: 'Có sai lệch',
      value: stats.lech,
      pct: diffPct,
      color: '#ef4444',
      bg: '#fee2e2',
      trend: diffPct === 0 ? 'up' : diffPct < 10 ? 'flat' : 'down',
    },
    {
      icon: <XCircle size={20} />,
      label: 'Không tìm thấy',
      value: stats.khongThay,
      pct: missPct,
      color: '#f59e0b',
      bg: '#fef3c7',
      trend: missPct === 0 ? 'up' : 'down',
    },
    {
      icon: <Search size={20} />,
      label: 'Lệch nghiêm trọng',
      value: stats.highSeverityDiffs,
      pct: stats.total > 0 ? Math.round((stats.highSeverityDiffs / stats.total) * 100) : 0,
      color: '#7c3aed',
      bg: '#ede9fe',
      trend: stats.highSeverityDiffs === 0 ? 'up' : 'down',
    },
  ];

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'up') return <TrendingUp size={14} style={{ color: '#10b981' }} />;
    if (trend === 'down') return <TrendingDown size={14} style={{ color: '#ef4444' }} />;
    return <Minus size={14} style={{ color: '#94a3b8' }} />;
  };

  return (
    <div className="dashboard">
      {/* Source comparison */}
      <div className="dashboard-sources">
        <div className="source-item">
          <span className="source-label">Cổng Giám Định</span>
          <span className="source-count">{portalCount} hồ sơ</span>
        </div>
        <div className="source-vs">⇄</div>
        <div className="source-item">
          <span className="source-label">Phần mềm 01/BH</span>
          <span className="source-count">{internalCount} hồ sơ</span>
        </div>
        <div style={{ width: 1, background: '#e2e8f0', alignSelf: 'stretch' }} />
        <div className="source-item">
          <span className="source-label">Tổng đối chiếu</span>
          <span className="source-count" style={{ color: '#6366f1' }}>{stats.total} hồ sơ</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="dashboard-cards">
        {cards.map((card) => (
          <div key={card.label} className="dash-card" style={{ background: card.bg }}>
            <div className="dash-card-header">
              <span style={{ color: card.color }}>{card.icon}</span>
              <TrendIcon trend={card.trend} />
            </div>
            <div className="dash-card-value" style={{ color: card.color }}>{card.value}</div>
            <div className="dash-card-label">{card.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <MiniBar value={card.value} max={stats.total} color={card.color} />
              <span style={{ fontSize: '0.75rem', color: card.color, fontWeight: 600, minWidth: 30 }}>
                {card.pct}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
