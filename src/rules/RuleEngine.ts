import type { ClinicalPatientRecord, DiffDetail } from '../types';
import { RULE_REGISTRY } from './rules_registry';

export class RuleEngine {
  private rules = RULE_REGISTRY;

  // Cập nhật trạng thái bật/tắt của một rule
  public toggleRule(ruleId: string, isActive: boolean) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.isActive = isActive;
    }
  }

  // Lấy danh sách các rules hiện tại
  public getRules() {
    return this.rules;
  }

  // Chạy các rules đang bật trên một hồ sơ chi tiết
  public executeAll(patient: ClinicalPatientRecord): DiffDetail[] {
    let allDiffs: DiffDetail[] = [];
    
    for (const rule of this.rules) {
      if (rule.isActive) {
        try {
          const ruleDiffs = rule.execute(patient);
          allDiffs = allDiffs.concat(ruleDiffs);
        } catch (error) {
          console.error(`Lỗi khi chạy rule ${rule.name}:`, error);
          allDiffs.push({
            field: `Rule Engine - ${rule.name}`,
            portalValue: '',
            internalValue: '',
            severity: 'high',
            note: '⚠ Lỗi kỹ thuật khi chạy rule này'
          });
        }
      }
    }
    
    return allDiffs;
  }
}

// Global instance
export const bhytRuleEngine = new RuleEngine();
