import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Workspace navigation state. On standalone surfaces it is encoded in the URL
 * hash so refresh, back/forward and deep links to a specific agent + client
 * (conversation) all work:
 *   #/                                   boot — auto-pick the default agent
 *   #/agents                             agents-home grid
 *   #/agents/:instanceId                 one agent, auto-restored view
 *   #/agents/:instanceId/clients/:id     one client of that agent
 *   #/agents/:instanceId/settings        agent settings (owns the dashboard)
 *
 * While an admin impersonates, every path is prefixed with /as/:email so the
 * link also names whose workspace it is. It is a namespace of its own because
 * #/accountants/:email/agents/:type is already the admin panel's drill-down
 * page (keyed by agent *type*, not instance). An admin who opens an /as/ link
 * without impersonating lands on that accountant's admin page (admin/route.ts
 * maps it there) with the hash left untouched; it survives the "view as"
 * reload, so impersonation continues straight to the linked agent + client.
 *
 * monday surfaces pass base=null — the iframe URL belongs to monday — and get
 * the same navigation API backed by in-memory state instead.
 */
export type WorkspaceRoute =
  | { kind: 'boot' }
  | { kind: 'home' }
  | { kind: 'agent'; agentId: string }
  | { kind: 'settings'; agentId: string }
  | { kind: 'client'; agentId: string; clientId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function routeHash(route: WorkspaceRoute, base: string[]): string {
  const segs = [...base];
  switch (route.kind) {
    case 'boot':
      break;
    case 'home':
      segs.push('agents');
      break;
    case 'agent':
      segs.push('agents', route.agentId);
      break;
    case 'settings':
      segs.push('agents', route.agentId, 'settings');
      break;
    case 'client':
      segs.push('agents', route.agentId, 'clients', route.clientId);
      break;
  }
  return `#/${segs.map(encodeURIComponent).join('/')}`;
}

function parseHash(hash: string, base: string[]): WorkspaceRoute {
  let parts: string[];
  try {
    parts = hash
      .replace(/^#\/?/, '')
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
  } catch {
    // A stray "%" makes decodeURIComponent throw.
    return { kind: 'boot' };
  }
  // A hash outside this workspace's namespace (admin-panel leftovers, another
  // accountant's /as/ link) means boot; resolution rewrites it in place.
  if (base.some((seg, i) => parts[i] !== seg)) return { kind: 'boot' };
  const rest = parts.slice(base.length);
  if (rest[0] !== 'agents') return { kind: 'boot' };
  const agentId = rest[1];
  if (!agentId) return { kind: 'home' };
  // Ids go straight into API paths. A mangled one (e.g. a hand-edited link with
  // "?x=1" glued on) would hit a different endpoint and return the wrong shape —
  // fall back to the nearest valid level instead.
  if (!UUID.test(agentId)) return { kind: 'boot' };
  if (rest[2] === 'clients' && rest[3]) {
    return UUID.test(rest[3]) ? { kind: 'client', agentId, clientId: rest[3] } : { kind: 'agent', agentId };
  }
  if (rest[2] === 'settings') return { kind: 'settings', agentId };
  return { kind: 'agent', agentId };
}

/**
 * Returns [route, navigate, replaceRoute]. `navigate` is user navigation and
 * pushes a history entry; `replaceRoute` is automatic resolution (boot default,
 * restored view, deleted client) and rewrites the entry in place so back/forward
 * never step through states the user didn't choose.
 */
export function useWorkspaceRoute(
  base: string[] | null,
): [WorkspaceRoute, (route: WorkspaceRoute) => void, (route: WorkspaceRoute) => void] {
  const baseRef = useRef(base);
  baseRef.current = base;
  const [route, setRoute] = useState<WorkspaceRoute>(() =>
    base ? parseHash(window.location.hash, base) : { kind: 'boot' },
  );

  const baseKey = base ? base.join('/') : null;
  useEffect(() => {
    if (baseRef.current === null) return;
    const onChange = () => setRoute(parseHash(window.location.hash, baseRef.current ?? []));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [baseKey]);

  const navigate = useCallback((next: WorkspaceRoute) => {
    const b = baseRef.current;
    if (b === null) setRoute(next);
    else window.location.hash = routeHash(next, b);
  }, []);
  const replaceRoute = useCallback((next: WorkspaceRoute) => {
    const b = baseRef.current;
    // replaceState fires no hashchange event — sync the state ourselves.
    if (b !== null) window.history.replaceState(null, '', routeHash(next, b));
    setRoute(next);
  }, []);

  return [route, navigate, replaceRoute];
}
