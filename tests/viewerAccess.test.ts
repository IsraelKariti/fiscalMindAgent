import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { viewerMayRequest } from '../src/api/viewerAccess.js';

// The read-only rule for staff viewers (openspec `accountant-employee-access`):
// only GET requests on the agent workspace pass.
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

  it('refuses every write on the workspace', () => {
    assert.equal(viewerMayRequest('DELETE', '/agents/a1/clients/c1'), false);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients'), false);
    assert.equal(viewerMayRequest('POST', '/agents/a1/clients/c1/documents/d1/approve'), false);
    assert.equal(viewerMayRequest('PATCH', '/agents/a1/clients/c1'), false);
    assert.equal(viewerMayRequest('PUT', '/agents/a1/clients/c1/pause'), false);
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
