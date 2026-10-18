import type { DecisionResponse } from '../../src/agents/declarationOfCapital/decisionSchema.js';
import type { ToolCall } from '../../src/agents/declarationOfCapital/decisionTools.js';

/**
 * Test helper: the tool calls that assemble into a given raw decision form
 * (openspec `planner-answer-tools`). The decision tests keep describing their
 * cases as the readable `DecisionResponse` object; this turns one into the
 * calls the model would make, so `gateDecision` sees what production sees.
 */
export function callsOf(raw: DecisionResponse): ToolCall[] {
  const ev = (e: { message_id: string; quote: string } | null | undefined) => ({
    evidence_message_id: e?.message_id ?? '',
    evidence_quote: e?.quote ?? '',
  });
  const calls: ToolCall[] = [{ name: 'conclude', args: { decision: raw.decision, reasoning: raw.reasoning } }];
  if (raw.whatsapp_text != null) calls.push({ name: 'send_whatsapp_text', args: { text: raw.whatsapp_text, send_at: raw.send_at ?? '' } });
  if (raw.whatsapp_template != null) {
    calls.push({
      name: 'send_whatsapp_template',
      args: { template_id: raw.whatsapp_template.template_id, variables: raw.whatsapp_template.variables, send_at: raw.send_at ?? '' },
    });
  }
  for (const id of raw.collected_document_ids) calls.push({ name: 'mark_collected', args: { document_id: id } });
  for (const m of raw.matched_files) calls.push({ name: 'tie_file', args: { file_id: m.file_id, document_id: m.document_id, ...ev(m.evidence) } });
  const instance = (anchor: string, i: NonNullable<NonNullable<DecisionResponse['added_instances']>[number]['instances']>[number], evidence: ReturnType<typeof ev>, proven = '') => {
    calls.push({
      name: 'add_instance',
      args: {
        anchor_document_id: anchor,
        name: i.name,
        description: i.description ?? '',
        already_provided: i.already_provided,
        file_ids: i.file_ids,
        paper_key: i.paper_key,
        ...evidence,
        proven_by_file_id: proven,
      },
    });
    if (i.stated_cost && i.stated_cost.amount !== 0) {
      calls.push({
        name: 'state_cost',
        args: {
          document_id: '',
          instance_name: i.name,
          amount: i.stated_cost.amount,
          currency: i.stated_cost.currency,
          evidence_message_id: i.stated_cost.message_id,
          evidence_quote: i.stated_cost.quote,
        },
      });
    }
    const v = i.stated_vehicle;
    if (v && (v.manufacturer || v.model || v.production_year || v.license_plate || v.purchase_cost || v.quote)) {
      calls.push({
        name: 'state_vehicle',
        args: {
          document_id: '',
          instance_name: i.name,
          manufacturer: v.manufacturer,
          model: v.model,
          production_year: v.production_year,
          license_plate: v.license_plate,
          purchase_cost: v.purchase_cost,
          currency: v.currency,
          evidence_message_id: v.message_id,
          evidence_quote: v.quote,
        },
      });
    }
  };
  for (const r of raw.resolved_documents ?? []) {
    calls.push({ name: 'resolve_document', args: { document_id: r.document_id, resolution: r.resolution, ...ev(r.evidence) } });
    for (const i of r.instances ?? []) instance(r.document_id, i, ev(null));
  }
  for (const a of raw.added_instances ?? []) {
    a.instances.forEach((i, idx) => instance(a.anchor_document_id, i, idx === 0 ? ev(a.evidence) : ev(null), idx === 0 ? a.proven_by_file_id : ''));
  }
  for (const r of raw.retired_documents ?? []) {
    calls.push({ name: 'retire_document', args: { document_id: r.document_id, ...ev(r.evidence), proven_by_file_id: r.proven_by_file_id } });
  }
  for (const s of raw.stated_costs) {
    calls.push({
      name: 'state_cost',
      args: { document_id: s.document_id, instance_name: '', amount: s.amount, currency: s.currency, ...ev(s.evidence) },
    });
  }
  for (const v of raw.stated_vehicles ?? []) {
    calls.push({
      name: 'state_vehicle',
      args: {
        document_id: v.document_id,
        instance_name: '',
        manufacturer: v.manufacturer,
        model: v.model,
        production_year: v.production_year,
        license_plate: v.license_plate,
        purchase_cost: v.purchase_cost,
        currency: v.currency,
        ...ev(v.evidence),
      },
    });
  }
  if (raw.attestation) calls.push({ name: 'attestation', args: { action: raw.attestation, ...ev(raw.attestation_evidence) } });
  if (raw.tax_fetch_action) {
    calls.push({
      name: 'tax_fetch',
      args: { action: raw.tax_fetch_action, provider: raw.tax_fetch_provider ?? '', document_keys: raw.tax_fetch_document_keys ?? [] },
    });
  }
  return calls;
}
