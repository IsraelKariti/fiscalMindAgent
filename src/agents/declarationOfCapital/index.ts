import { requestReplan } from '../../orchestration/requestReplan.js';
import { DECLARATION_OF_CAPITAL } from './agentType.js';
import { planFollowUp } from './plan.js';
import { analyzeInboundFile } from './analyzeInboundFile.js';
import { screenInboundMessage } from './screenInbound.js';
import { buildRouter } from './router.js';
import { catalogSeedRows } from './catalog.js';
import { maybeHandleOtpInbound } from './taxFetch/inboundOtp.js';
import type { AgentTypeDefinition } from '../types.js';

/**
 * The declaration-of-capital collector — the platform's only agent: converses
 * with clients over WhatsApp to collect the documents a הצהרת הון needs as of
 * the 31.12.{{tax_year}} valuation date (client_documents, seeded from the
 * catalog and resolved by the intake interview), with LLM-scheduled
 * follow-ups, per-document verification and the closing attestation.
 */
export const declarationOfCapitalAgent: AgentTypeDefinition = {
  id: DECLARATION_OF_CAPITAL,
  conversationModel: 'scheduled_follow_up',
  // A הצהרת הון demand is accountant-initiated: imported clients wait paused
  // until the accountant fires the monday kickoff webhook (form submission on
  // the board row) or resumes them in the workspace.
  manualKickoff: true,
  // WhatsApp is the only client channel (no emailSuffix — the agent has no
  // mailbox): clients are keyed by their phone, first contact goes out as an
  // approved template, and the planner may never pick email.
  whatsappOnly: true,
  // The hardcoded catalog is the ONLY checklist supply: every new client
  // starts with one 'unresolved' row per document type and the intake
  // interview resolves them — the import source's documents column is ignored.
  seedClientDocuments: catalogSeedRows,
  // The declaration year is PER CLIENT — read from the monday board row's
  // year column at kickoff (agent_fields.tax_year). There is no instance-wide
  // year: the admin field is hidden and a row without a parseable year is not
  // started.
  collectsTaxYear: false,
  planNextAction: planFollowUp,
  async onInboundMessage(ctx, evt) {
    // A WhatsApp reply carrying the tax-authority OTP is time-critical: route it
    // straight to the worker without an LLM round-trip or a re-plan.
    if (await maybeHandleOtpInbound(ctx, evt)) return;
    // The three injection layers on the message text, before any planning: a
    // hit withholds the text from the planner and answers with a fixed reply.
    await screenInboundMessage(ctx, evt);
    // The planner does not run here: WhatsApp delivers the text and each file
    // of one client turn as separate webhooks, so the re-plan is deferred and
    // runs once, after the quiet window and after every file of the turn is
    // processed (openspec `inbound-turn`, src/queue/replanWorker.ts).
    await requestReplan(ctx.client.id);
  },
  analyzeInboundFile,
  buildRouter,
};
