import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { replacementOfRetirement } from '../src/agents/declarationOfCapital/retirementReplacement.js';

const contract = { type_key: 'real_estate', paper_key: 'purchase_contract' };
const licence = { type_key: 'vehicle', paper_key: 'vehicle_license' };
const receipt = { type_key: 'vehicle', paper_key: 'vehicle_purchase_document' };
const costDeclaration = { type_key: 'real_estate', paper_key: 'cost_declaration' };
const vehicleDeclaration = { type_key: 'vehicle', paper_key: 'vehicle_declaration' };
const assessment = { type_key: 'real_estate', paper_key: 'purchase_tax_assessment' };
const tabu = { type_key: 'real_estate', paper_key: 'tabu_extract' };

describe('replacementOfRetirement (openspec retired-by-declaration-tab)', () => {
  it('a declaration-paper instance added in the same answer → the client declaration replaced the row', () => {
    assert.equal(replacementOfRetirement(contract, [costDeclaration], []), 'client_declaration');
    assert.equal(replacementOfRetirement(licence, [vehicleDeclaration], []), 'client_declaration');
  });

  it('a statement on an existing declaration item of the same type → the client declaration', () => {
    assert.equal(replacementOfRetirement(receipt, [], [vehicleDeclaration]), 'client_declaration');
    assert.equal(replacementOfRetirement(contract, [], [costDeclaration]), 'client_declaration');
  });

  it('only other papers added → other documents', () => {
    assert.equal(replacementOfRetirement(contract, [assessment, tabu], []), 'documents');
  });

  it('a declaration of another type does not count', () => {
    assert.equal(replacementOfRetirement(contract, [], [vehicleDeclaration]), 'documents');
    assert.equal(replacementOfRetirement(licence, [costDeclaration], []), 'documents');
  });

  it('nothing else in the answer → other documents (proven-file retirements, lone retirements)', () => {
    assert.equal(replacementOfRetirement(contract, [], []), 'documents');
  });

  it('an ad-hoc retired row (no type) is never matched by a declaration', () => {
    assert.equal(replacementOfRetirement({ type_key: null }, [vehicleDeclaration], [{ type_key: null, paper_key: 'vehicle_declaration' }]), 'documents');
  });
});
