import { z } from 'zod';
import type { RequestHandler } from 'express';
import * as agentInstances from '../db/queries/agentInstances.js';
import type { AgentInstanceRow } from '../db/types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The agent instance workspace routes operate on, set by resolveAgentInstance. */
      agentInstance?: AgentInstanceRow;
    }
  }
}

const uuid = z.string().uuid();

/**
 * Resolves the agent instance the request operates on and sets
 * req.agentInstance. With an :agentId param it must be the caller's own
 * enabled instance (404 otherwise); without one — the legacy unprefixed
 * mounts — it falls back to the user's doc_collector instance so pre-agent
 * clients (SPA, monday surfaces) keep working unchanged.
 */
export const resolveAgentInstance: RequestHandler = async (req, res, next) => {
  const agentId = req.params.agentId;
  if (agentId !== undefined) {
    const instance = uuid.safeParse(agentId).success
      ? await agentInstances.getByIdForUser(agentId, req.userId!)
      : null;
    if (!instance || !instance.enabled) {
      res.status(404).json({ error: 'Agent not found.' });
      return;
    }
    req.agentInstance = instance;
    next();
    return;
  }
  // No auto-provisioning here: accounts without an enabled doc_collector
  // (agents are admin-enabled only) just 404 the legacy unprefixed routes.
  const instance = await agentInstances.getByTypeForUser(req.userId!, 'doc_collector');
  if (!instance || !instance.enabled) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  req.agentInstance = instance;
  next();
};

/** GET /agents — the caller's enabled agent instances, oldest first. */
export const listAgents: RequestHandler = async (req, res) => {
  const instances = await agentInstances.listForUser(req.userId!);
  res.json({
    agents: instances.map((i) => ({ id: i.id, agentType: i.agent_type, name: i.name, enabled: i.enabled })),
  });
};
