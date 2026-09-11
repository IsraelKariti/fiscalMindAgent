import { createHash } from 'node:crypto';
import { ContainerInstanceManagementClient } from '@azure/arm-containerinstance';
import { DefaultAzureCredential } from '@azure/identity';
import { env } from '../../../config/env.js';
import { logger } from '../../../util/logger.js';
import { FetchAtCapacityError } from './types.js';

/**
 * Container-per-session pool for tax fetches (TAX_FETCH_RUNNER_MODE=aci).
 * Each session gets its own throwaway Azure Container Instance running the
 * browser-runner image, created in the Israel Central egress subnet — the tax
 * authority drops non-Israeli source IPs, and that subnet's NAT gateway holds
 * the static IP verified against the site. The group name is derived from the
 * session id, so a restarted worker can always re-find or reap a session's
 * container through ARM without any DB state; the periodic sweep is the
 * backstop for containers orphaned by a crash between jobs.
 */

const GROUP_PREFIX = 'taxfetch-';
const ROLE_TAG = 'fiscalmind-tax-fetch-session';
const CREATED_AT_TAG = 'fm-created-at';
const RUNNER_PORT = 4100;
// Provisioning + image pull (same-region ACR) + Chrome boot. Generous: a cold
// ACI allocation alone can take a couple of minutes.
const READY_TIMEOUT_MS = 300_000;
const READY_POLL_MS = 3_000;
// A container may legitimately live for the whole OTP wait plus login and
// download on either side; only reap well past that.
const ORPHAN_GRACE_MS = 30 * 60_000;

interface AciConfig {
  subscriptionId: string;
  resourceGroup: string;
  subnetId: string;
  image: string;
  acrIdentityId: string;
  location: string;
  runnerToken: string;
}

function requireConfig(): AciConfig {
  const missing: string[] = [];
  const need = (name: string, value: string | undefined): string => {
    if (!value) missing.push(name);
    return value ?? '';
  };
  const cfg: AciConfig = {
    subscriptionId: need('TAX_FETCH_ACI_SUBSCRIPTION_ID', env.TAX_FETCH_ACI_SUBSCRIPTION_ID),
    resourceGroup: need('TAX_FETCH_ACI_RESOURCE_GROUP', env.TAX_FETCH_ACI_RESOURCE_GROUP),
    subnetId: need('TAX_FETCH_ACI_SUBNET_ID', env.TAX_FETCH_ACI_SUBNET_ID),
    image: need('TAX_FETCH_ACI_IMAGE', env.TAX_FETCH_ACI_IMAGE),
    acrIdentityId: need('TAX_FETCH_ACI_ACR_IDENTITY_ID', env.TAX_FETCH_ACI_ACR_IDENTITY_ID),
    location: env.TAX_FETCH_ACI_LOCATION,
    runnerToken: need('BROWSER_RUNNER_TOKEN', env.BROWSER_RUNNER_TOKEN),
  };
  if (missing.length > 0) {
    throw new Error(`TAX_FETCH_RUNNER_MODE=aci but missing env: ${missing.join(', ')}`);
  }
  return cfg;
}

let armClient: ContainerInstanceManagementClient | null = null;
function arm(cfg: AciConfig): ContainerInstanceManagementClient {
  // DefaultAzureCredential: managed identity in prod, az login locally.
  armClient ??= new ContainerInstanceManagementClient(new DefaultAzureCredential(), cfg.subscriptionId);
  return armClient;
}

/** Deterministic ACI group name for a session — recoverable after a worker restart. */
export function groupNameFor(sessionId: string): string {
  return GROUP_PREFIX + createHash('sha256').update(sessionId).digest('hex').slice(0, 20);
}

// group name -> private IP; a cache only — ARM is the source of truth.
const ipCache = new Map<string, string>();

const baseUrlOf = (ip: string): string => `http://${ip}:${RUNNER_PORT}`;

/** Creates the session's container and waits until its runner answers /healthz. */
export async function provisionSessionContainer(sessionId: string): Promise<string> {
  const cfg = requireConfig();
  const name = groupNameFor(sessionId);
  const registryServer = cfg.image.split('/')[0] as string;
  let ip: string | undefined;
  try {
    const group = await arm(cfg).containerGroups.beginCreateOrUpdateAndWait(cfg.resourceGroup, name, {
      location: cfg.location,
      identity: { type: 'UserAssigned', userAssignedIdentities: { [cfg.acrIdentityId]: {} } },
      imageRegistryCredentials: [{ server: registryServer, identity: cfg.acrIdentityId }],
      containers: [
        {
          name: 'runner',
          image: cfg.image,
          resources: { requests: { cpu: 2, memoryInGB: 4 } },
          ports: [{ port: RUNNER_PORT, protocol: 'TCP' }],
          environmentVariables: [
            { name: 'BROWSER_RUNNER_TOKEN', secureValue: cfg.runnerToken },
            { name: 'TAX_FETCH_SESSION_TTL_MS', value: String(env.TAX_FETCH_SESSION_TTL_MS) },
          ],
        },
      ],
      ipAddress: { type: 'Private', ports: [{ port: RUNNER_PORT, protocol: 'TCP' }] },
      subnetIds: [{ id: cfg.subnetId }],
      osType: 'Linux',
      restartPolicy: 'Never',
      tags: { 'fm-role': ROLE_TAG, [CREATED_AT_TAG]: String(Date.now()) },
    });
    ip = group.ipAddress?.ip;
    if (!ip) throw new Error('container group has no private IP');
    await waitForRunner(baseUrlOf(ip));
  } catch (err) {
    // Never leave a half-provisioned container behind; it holds a Chrome slot.
    await teardownSessionContainer(sessionId);
    if (/quota|capacity|too many/i.test(errText(err))) throw new FetchAtCapacityError();
    throw err;
  }
  ipCache.set(name, ip);
  logger.info('tax fetch: session container ready', { sessionId, group: name, ip });
  return baseUrlOf(ip);
}

/** Base URL of the session's container, or null if it no longer exists. */
export async function resolveSessionBaseUrl(sessionId: string): Promise<string | null> {
  const cfg = requireConfig();
  const name = groupNameFor(sessionId);
  const cached = ipCache.get(name);
  if (cached) return baseUrlOf(cached);
  try {
    const group = await arm(cfg).containerGroups.get(cfg.resourceGroup, name);
    const ip = group.ipAddress?.ip;
    if (!ip) return null;
    ipCache.set(name, ip);
    return baseUrlOf(ip);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Deletes the session's container. Idempotent, never throws. */
export async function teardownSessionContainer(sessionId: string): Promise<void> {
  const name = groupNameFor(sessionId);
  ipCache.delete(name);
  try {
    const cfg = requireConfig();
    await arm(cfg).containerGroups.beginDeleteAndWait(cfg.resourceGroup, name);
  } catch (err) {
    if (!isNotFound(err)) {
      logger.warn('tax fetch: session container delete failed', { sessionId, group: name, reason: errText(err) });
    }
  }
}

/**
 * Reaps session containers whose session is long over (worker crashed between
 * jobs, teardown call lost). Runs at boot and on an interval in aci mode.
 */
export async function sweepOrphanedSessionContainers(): Promise<void> {
  if (env.TAX_FETCH_RUNNER_MODE !== 'aci') return;
  const cfg = requireConfig();
  const cutoff = Date.now() - (env.TAX_FETCH_SESSION_TTL_MS + ORPHAN_GRACE_MS);
  let reaped = 0;
  for await (const group of arm(cfg).containerGroups.listByResourceGroup(cfg.resourceGroup)) {
    if (group.tags?.['fm-role'] !== ROLE_TAG || !group.name) continue;
    const createdAt = Number(group.tags[CREATED_AT_TAG]);
    if (!Number.isFinite(createdAt) || createdAt > cutoff) continue;
    ipCache.delete(group.name);
    try {
      await arm(cfg).containerGroups.beginDeleteAndWait(cfg.resourceGroup, group.name);
      reaped += 1;
    } catch (err) {
      logger.warn('tax fetch: orphan container delete failed', { group: group.name, reason: errText(err) });
    }
  }
  if (reaped > 0) logger.info('tax fetch: reaped orphaned session containers', { count: reaped });
}

async function waitForRunner(baseUrl: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(2500) });
      if (res.ok) return;
      last = `status ${res.status}`;
    } catch (err) {
      last = errText(err);
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
  throw new Error(`browser container not ready within ${READY_TIMEOUT_MS / 1000}s (${last})`);
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { statusCode?: number }).statusCode === 404;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
