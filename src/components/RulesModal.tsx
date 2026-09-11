import { useState } from 'react';
import { X, Power } from 'lucide-react';
import { bhytRuleEngine } from '../rules/RuleEngine';

interface RulesModalProps {
  onClose: () => void;
}

export function RulesModal({ onClose }: RulesModalProps) {
  const [rules, setRules] = useState(() => bhytRuleEngine.getRules());

  const handleToggle = (id: string) => {
    const current = rules.find(r => r.id === id)?.isActive;
    bhytRuleEngine.toggleRule(id, !current);
    setRules([...bhytRuleEngine.getRules()]);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div className="rule-engine-panel" style={{ padding: 32, background: 'white', borderRadius: 16, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxWidth: 800, width: '90%', position: 'relative' }}>
        <button 
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
        >
          <X size={24} />
        </button>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Các nhóm rule giám định đang chạy</h3>
          <p style={{ margin: '8px 0 0', fontSize: '0.875rem', color: '#64748b' }}>Mỗi nhóm là một module C# độc lập trong core, có thể bật/tắt riêng theo CSKCB.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {rules.map(rule => (
            <button
              key={rule.id}
              onClick={() => handleToggle(rule.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 20,
                border: `1px solid ${rule.isActive ? '#10b981' : '#e2e8f0'}`,
                background: rule.isActive ? '#f0fdf4' : 'transparent',
                color: rule.isActive ? '#065f46' : '#64748b',
                cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              <Power size={14} style={{ color: rule.isActive ? '#10b981' : '#94a3b8' }} />
              {rule.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
