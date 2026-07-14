import { ClientSourcesSchema, parseClientSources, type ClientSources } from '../shared/clientSources.js';

/**
 * The debt collector's per-instance config, stored in agent_instances.settings
 * (JSONB): which monday boards / Google Sheets hold the clients' financial
 * rows. The shape is the shared client-sources config (boards/sheets mapped by
 * their email column); the optional name column only feeds the daily scan's
 * auto-enrollment (naming newly discovered debtors).
 */
export const DebtCollectorSettingsSchema = ClientSourcesSchema;

export type DebtCollectorSettings = ClientSources;

/** Tolerant read of the stored JSONB: unknown/invalid shapes fall back to empty config. */
export const parseSettings = parseClientSources;
