import type { Stats } from '../types';
import { CheckCircle2, AlertCircle, HelpCircle, BarChart3 } from 'lucide-react';

interface StatsBarProps {
  stats: Stats;
}

export function StatsBar({ stats }: StatsBarProps) {
  const matchPct = stats.total > 0 ? Math.round((stats.khop / stats.total) * 100) : 0;

  return (
    <div className="stats-container">
      <div className="stat-pill stat-match">
        <CheckCircle2 size={16} />
        Khớp: <strong>{stats.khop}</strong>
      </div>
      <div className="stat-pill stat-diff">
        <AlertCircle size={16} />
        Lệch: <strong>{stats.lech}</strong>
      </div>
      <div className="stat-pill stat-missing">
        <HelpCircle size={16} />
        Không thấy: <strong>{stats.khongThay}</strong>
      </div>
      {stats.total > 0 && (
        <div className="stat-pill" style={{ background: '#e0e7ff', color: '#3730a3' }}>
          <BarChart3 size={16} />
          Tỷ lệ khớp: <strong>{matchPct}%</strong>
        </div>
      )}
    </div>
  );
}
