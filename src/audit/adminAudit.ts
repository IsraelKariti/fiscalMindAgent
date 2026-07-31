import type { Request, Response } from 'express';
import { recordAudit } from './audit.js';
import { redactForAudit } from './redact.js';
import type { AuditSeverity } from '../db/queries/auditEvents.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Route-pattern → (action name, severity) for the admin audit trail. Keyed on
 * `METHOD <req.route.path>` — the Express pattern with :params, not the
 * concrete URL, so one entry covers every target. Unlisted mutations still get
 * recorded under a derived `admin.<method>:<path>` action; listing a route
 * here only gives it a friendlier name and/or a higher severity.
 */
const KNOWN_ROUTES: Record<string, { action: `admin.${string}`; severity: AuditSeverity }> = {
  'PUT /admin/kill-switch': { action: 'admin.kill_switch_set', severity: 'critical' },
  'POST /admin/whitelist': { action: 'admin.whitelist_added', severity: 'critical' },
  'DELETE /admin/whitelist/:email': { action: 'admin.whitelist_removed', severity: 'warning' },
  'PATCH /admin/whitelist/:email': { action: 'admin.whitelist_hebrew_name_set', severity: 'info' },
  'POST /admin/impersonate': { action: 'admin.impersonation_started', severity: 'warning' },
  'POST /admin/impersonate/stop': { action: 'admin.impersonation_stopped', severity: 'info' },
  'POST /admin/accountants/:userId/agents': { action: 'admin.agent_enabled', severity: 'info' },
  'DELETE /admin/accountants/:userId/agents/:agentType': { action: 'admin.agent_disabled', severity: 'warning' },
  'PUT /admin/model': { action: 'admin.model_changed', severity: 'warning' },
  'POST /admin/agent-emails': { action: 'admin.agent_email_set', severity: 'info' },
  'POST /admin/agent-tax-year': { action: 'admin.agent_tax_year_set', severity: 'info' },
  'POST /admin/wa-senders/provision': { action: 'admin.wa_number_provisioned', severity: 'warning' },
  'POST /admin/wa-senders/:agentInstanceId/release': { action: 'admin.wa_number_released', severity: 'warning' },
  'POST /admin/wa-numbers/release': { action: 'admin.wa_number_released', severity: 'warning' },
  'PUT /prompt-template': { action: 'admin.prompt_template_changed', severity: 'warning' },
  'POST /prompt-template/reset': { action: 'admin.prompt_template_reset', severity: 'info' },
  'POST /admin/alerts/:id/ack': { action: 'admin.alert_acked', severity: 'info' },
};

/**
 * Called from requireAdmin, so every admin route — present and future — is
 * audited from one place. Records mutating requests (POST/PUT/PATCH/DELETE)
 * once the response finishes, attributed to the REAL signed-in admin
 * (req.realUserId), which stays correct during impersonation. Rejected
 * requests (4xx/5xx) are recorded at 'info' so a denied kill-switch flip
 * doesn't fire the critical-event alert, but a probing pattern still shows in
 * the trail.
 */
export function auditAdminMutation(req: Request, res: Response): void {
  if (!MUTATING_METHODS.has(req.method)) return;
  res.on('finish', () => {
    const routePath = req.route?.path ?? req.path;
    const key = `${req.method} ${routePath}`;
    const known = KNOWN_ROUTES[key];
    const succeeded = res.statusCode < 400;
    recordAudit({
      actorType: 'admin',
      action: known?.action ?? `admin.${req.method.toLowerCase()}:${routePath}`,
      actorUserId: req.realUserId ?? null,
      severity: succeeded ? (known?.severity ?? 'info') : 'info',
      targetType: 'api_route',
      targetId: key,
      detail: {
        statusCode: res.statusCode,
        params: redactForAudit(req.params),
        body: redactForAudit(req.body),
      },
    });
  });
}
