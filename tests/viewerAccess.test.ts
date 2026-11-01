import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { viewerMayRequest } from '../src/api/viewerAccess.js';

// The access rule for staff viewers (openspec `accountant-staff-access`):
// GET requests on the agent workspace pass, plus the conversation-flow
// actions on a client (openspec `staff-conversation-controls`).
describe('viewerMayRequest', () => {
  it('allows the agent list', () => {
    assert.equal(viewerMayRequest('GET', '/agents'), true);
  });

  it('allows workspace reads, including file downloads and SSE', () => {
    assert.equal(viewerMayRequest('GET', '/agents/a1/clients'), true);
    assert.equal(viewerMayRequest('GET', '/agents/a1/clients/c1'), true);
    assert.equal(viewerMayRequest('GET', '/agents/a1/clients/c1/files/f1/download'), true);
    assert.equal(viewerMayRequest('GET', '/agents/a1/clients/c1/files/f1/view'), true);
    assert.equal(viewerMayRequest('GET', '/agents/a1/events'), true);
    assert.equal(viewerMayRequest('GET', '/agents/a1/dashboard'), true);
    assert.equal(viewerMayRequest('get', '/agents/a1/clients/c1/emails'), true);
  });

  it('allows the conversation-flow actions on a client', () => {
    assert.equal(viewerMayRequest('PUT', '/agents/a1/clients/c1/pause'), true);
    assert.equal(viewerMayRequest('put', '/agents/a1/clients/c1/pause'), true);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients/c1/send-now'), true);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients/c1/retry-send'), true);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients/c1/redraft'), true);
  });

  it('refuses the conversation-flow routes under the wrong verb or path', () => {
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients/c1/pause'), false);
    assert.equal(viewerMayRequest('DELETE', '/agents/a1/clients/c1/pause'), false);
    assert.equal(viewerMayRequest('PUT', '/agents/a1/clients/c1/send-now'), false);
    assert.equal(viewerMayRequest('PUT', '/agents/a1/pause'), false);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients/c1/redraft/x'), false);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients/c1/documents/d1/send-now'), false);
  });

  it('refuses every other write on the workspace', () => {
    assert.equal(viewerMayRequest('DELETE', '/agents/a1/clients/c1'), false);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients'), false);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients/test'), false);
    assert.equal(viewerMayRequest('PATCH', '/agents/a1/clients/c1'), false);
    assert.equal(viewerMayRequest('PUT', '/agents/a1/clients/c1/whatsapp'), false);
    assert.equal(viewerMayRequest('PUT', '/agents/a1/clients/c1/due-date'), false);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients/c1/documents'), false);
    assert.equal(viewerMayRequest('PATCH', '/agents/a1/clients/c1/documents/d1'), false);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients/c1/documents/d1/approve'), false);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients/c1/approve-draft'), false);
    assert.equal(viewerMayRequest('PUT', '/agents/a1/settings'), false);
  });

  it('refuses the staff list, account routes and the admin panel, even as GET', () => {
    assert.equal(viewerMayRequest('GET', '/staff'), false);
    assert.equal(viewerMayRequest('POST', '/staff'), false);
    assert.equal(viewerMayRequest('GET', '/mailbox'), false);
    assert.equal(viewerMayRequest('GET', '/monday-connection'), false);
    assert.equal(viewerMayRequest('GET', '/admin/accountants'), false);
  });

  it('does not treat a look-alike prefix as the workspace', () => {
    assert.equal(viewerMayRequest('GET', '/agentsx'), false);
    assert.equal(viewerMayRequest('GET', '/agents-admin'), false);
  });
});
