import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { clientIdNumber, type CredentialsLookup } from '../src/agents/declarationOfCapital/taxFetch/clientId.js';

function lookupOf(rows: Partial<Record<string, string>>): CredentialsLookup {
  return async (_clientId, provider) => {
    const id = rows[provider];
    return id === undefined ? null : { id_number: id };
  };
}

const client = (idNumber?: string) => ({ id: 'c1', agent_fields: idNumber === undefined ? {} : { id_number: idNumber } });

test('the id stored on the client is used when no credentials row exists', async () => {
  assert.deepEqual(await clientIdNumber(client(' 021537543 '), 'altshuler_shaham', lookupOf({})), {
    id: '021537543',
    source: 'monday_crm',
  });
});

test("the provider's own credentials row wins over the stored id", async () => {
  assert.deepEqual(
    await clientIdNumber(client('021537543'), 'altshuler_shaham', lookupOf({ altshuler_shaham: '111111118' })),
    { id: '111111118', source: 'credentials' },
  );
});

test('the tax-authority row is the fallback before the stored id', async () => {
  assert.deepEqual(
    await clientIdNumber(client('021537543'), 'harel', lookupOf({ israel_tax_authority: '111111118' })),
    { id: '111111118', source: 'credentials' },
  );
});

test('no id anywhere resolves to null', async () => {
  assert.equal(await clientIdNumber(client(), 'harel', lookupOf({})), null);
  assert.equal(await clientIdNumber(client('   '), 'harel', lookupOf({})), null);
  assert.equal(await clientIdNumber(client(), 'harel', lookupOf({ altshuler_shaham: '' })), null);
});

test('the tax authority itself never falls back to another provider row', async () => {
  const lookup = lookupOf({ altshuler_shaham: '111111118' });
  assert.deepEqual(await clientIdNumber(client('021537543'), 'israel_tax_authority', lookup), {
    id: '021537543',
    source: 'monday_crm',
  });
});
