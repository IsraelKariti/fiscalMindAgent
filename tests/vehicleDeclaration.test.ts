import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { amountAppearsIn } from '../src/agents/declarationOfCapital/decisionSchema.js';
import {
  mergeVehicleEvidence,
  vehicleEvidenceOf,
  vehicleFactMissingFromQuote,
  vehicleFactsLine,
} from '../src/agents/declarationOfCapital/vehicleDeclaration.js';
import { statedVehicleLine } from '../src/agents/declarationOfCapital/prompt.js';

describe('vehicle declaration helpers (openspec vehicle-declaration)', () => {
  it('merges statements: a new fact fills in, a repeated fact is replaced, every quote is kept', () => {
    const first = mergeVehicleEvidence(null, { message_id: 'm1', quote: 'זו מאזדה 3 משנת 2019' }, { manufacturer: 'מאזדה', model: '3', production_year: 2019 });
    assert.deepEqual(first, {
      source: 'chat_vehicle',
      statements: [{ message_id: 'm1', quote: 'זו מאזדה 3 משנת 2019' }],
      facts: { manufacturer: 'מאזדה', model: '3', production_year: 2019 },
    });
    const second = mergeVehicleEvidence(first, { message_id: 'm2', quote: 'שילמתי בערך 85 אלף, בעצם משנת 2018' }, { purchase_cost: 85000, currency: 'ILS', production_year: 2018 });
    assert.deepEqual(second.statements.map((s) => s.message_id), ['m1', 'm2']);
    assert.deepEqual(second.facts, { manufacturer: 'מאזדה', model: '3', production_year: 2018, purchase_cost: 85000, currency: 'ILS' });
  });

  it('reads the pre-066 cost shape on a vehicle declaration row as a one-statement cost, nothing else', () => {
    const old = { source: 'chat' as const, message_id: 'm1', quote: 'שילמתי 85,000', amount: 85000, currency: 'ILS' };
    assert.deepEqual(vehicleEvidenceOf(old, 'vehicle_declaration'), {
      source: 'chat_vehicle',
      statements: [{ message_id: 'm1', quote: 'שילמתי 85,000' }],
      facts: { purchase_cost: 85000, currency: 'ILS' },
    });
    assert.equal(vehicleEvidenceOf(old, 'cost_declaration'), null);
    assert.equal(vehicleEvidenceOf({ message_id: 'm1', quote: 'x' }, 'vehicle_declaration'), null);
    assert.equal(vehicleEvidenceOf(null, 'vehicle_declaration'), null);
  });

  it('lists every fact by label with "לא ידוע" for a missing one, and the prompt line carries it', () => {
    assert.equal(vehicleFactsLine({ manufacturer: 'מאזדה', purchase_cost: 85000, currency: 'ILS' }), 'תוצר: מאזדה · דגם: לא ידוע · שנת ייצור: לא ידוע · מספר רישוי: לא ידוע · עלות הרכישה: 85,000 ILS');
    const row = {
      status: 'stated' as const,
      paper_key: 'vehicle_declaration',
      resolution_evidence: mergeVehicleEvidence(
        mergeVehicleEvidence(null, { message_id: 'm1', quote: 'זו מאזדה' }, { manufacturer: 'מאזדה' }),
        { message_id: 'm2', quote: 'שילמתי 85 אלף' },
        { purchase_cost: 85000, currency: 'ILS' },
      ),
    };
    assert.equal(statedVehicleLine(row), 'הוצהר בצ\'אט (2 הודעות): תוצר: מאזדה · דגם: לא ידוע · שנת ייצור: לא ידוע · מספר רישוי: לא ידוע · עלות הרכישה: 85,000 ILS — "שילמתי 85 אלף"');
    assert.equal(statedVehicleLine({ status: 'pending', paper_key: 'vehicle_declaration', resolution_evidence: row.resolution_evidence }), null);
  });

  it('finds the first fact missing from the quote: digits for year and plate (dashes ignored), the amount rule for the cost, text for make and model', () => {
    const quote = 'זו מאזדה 3 משנת 2019, מספר 12-345-67. שילמתי בערך 85 אלף';
    assert.equal(vehicleFactMissingFromQuote({ manufacturer: 'מאזדה', model: '3', production_year: 2019, license_plate: '1234567', purchase_cost: 85000 }, quote, amountAppearsIn), null);
    assert.equal(vehicleFactMissingFromQuote({ manufacturer: 'טויוטה' }, quote, amountAppearsIn), 'manufacturer');
    assert.equal(vehicleFactMissingFromQuote({ production_year: 2018 }, quote, amountAppearsIn), 'production_year');
    assert.equal(vehicleFactMissingFromQuote({ license_plate: '7654321' }, quote, amountAppearsIn), 'license_plate');
    assert.equal(vehicleFactMissingFromQuote({ purchase_cost: 90000 }, quote, amountAppearsIn), 'purchase_cost');
    // Quotes and geresh marks in the client's spelling do not matter; a Latin make matches case-insensitively.
    assert.equal(vehicleFactMissingFromQuote({ manufacturer: 'יונדאי' }, "יש לי יונדאי i20", amountAppearsIn), null);
    assert.equal(vehicleFactMissingFromQuote({ model: 'i20' }, 'יש לי יונדאי I20', amountAppearsIn), null);
    assert.equal(vehicleFactMissingFromQuote({ model: 'מאזדה 3' }, 'יש לי מאזדה3', amountAppearsIn), null);
  });
});
