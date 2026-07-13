import { useMemo } from 'react';
import type { Accountant } from '../../api';
import { formatUsd } from '../../format';
import { useT } from '../../i18n';

/** Platform-wide stat tiles — the admin's landing screen. Agent-agnostic: per-agent progress lives on the agent pages. */
export function AdminOverview({ accountants }: { accountants: Accountant[] }) {
  const { t } = useT();

  const totals = useMemo(() => {
    let activeAgents = 0;
    let llmCost = 0;
    let hasUnpriced = false;
    let hasUsage = false;
    for (const accountant of accountants) {
      activeAgents += accountant.agents.filter((a) => a.enabled).length;
      for (const usage of accountant.llmUsage) {
        hasUsage = true;
        if (usage.cost === null) hasUnpriced = true;
        else llmCost += usage.cost;
      }
    }
    return { activeAgents, llmCost, hasUnpriced, hasUsage };
  }, [accountants]);

  return (
    <div className="stat-row">
      <div className="card stat-tile">
        <span className="stat-label">{t.accountantsLabel}</span>
        <span className="stat-value">{accountants.length}</span>
        <span className="stat-context">{t.withAgentMailbox(accountants.filter((a) => a.mailbox).length)}</span>
      </div>
      <div className="card stat-tile">
        <span className="stat-label">{t.adminActiveAgentsLabel}</span>
        <span className="stat-value">{totals.activeAgents === 0 ? '—' : totals.activeAgents}</span>
        <span className="stat-context">{t.acrossAllAccountants}</span>
      </div>
      <div className="card stat-tile">
        <span className="stat-label">{t.adminLlmSpendLabel}</span>
        <span className="stat-value" dir="ltr">
          {totals.hasUsage ? `${formatUsd(totals.llmCost)}${totals.hasUnpriced ? '+' : ''}` : '—'}
        </span>
        <span className="stat-context">{totals.hasUsage ? t.acrossAllAccountants : t.adminLlmSpendNone}</span>
      </div>
    </div>
  );
}
