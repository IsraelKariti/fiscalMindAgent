import * as clients from '../db/queries/clients.js';
import * as documentFiles from '../db/queries/documentFiles.js';
import { loadAgentContext } from '../agents/resolve.js';
import { logger } from '../util/logger.js';
import type { DocumentFileRow } from '../db/types.js';

/**
 * Dispatches a freshly stored inbound file to the client's agent for content
 * analysis. Shared by email attachment and WhatsApp media ingestion. Agents
 * without an analyzer just get the row marked unsupported.
 */
export async function analyzeStoredFile(clientId: string, file: DocumentFileRow, body: Buffer): Promise<void> {
  const client = await clients.getById(clientId);
  if (!client) {
    logger.warn('stored file for missing client, skipping analysis', { clientId, fileId: file.id });
    return;
  }
  const agent = await loadAgentContext(client);
  if (!agent.definition.analyzeInboundFile) {
    await documentFiles.setAnalysis(file.id, 'unsupported', null);
    return;
  }
  await agent.definition.analyzeInboundFile(agent, file, body);
}
