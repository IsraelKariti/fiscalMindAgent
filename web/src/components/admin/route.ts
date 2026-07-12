import { useCallback, useEffect, useState } from 'react';

/**
 * Admin navigation state, encoded in the URL hash so refresh, back/forward
 * and deep links all work without a router dependency:
 *   #/                                   platform overview
 *   #/accountants                        roster table
 *   #/accountants/:email                 one accountant's page
 *   #/accountants/:email/agents/:type    one agent of that accountant
 *   #/settings                           platform settings
 */
export type AdminRoute =
  | { screen: 'overview' }
  | { screen: 'accountants' }
  | { screen: 'accountant'; email: string }
  | { screen: 'agent'; email: string; agentType: string }
  | { screen: 'settings' };

export function routeHash(route: AdminRoute): string {
  switch (route.screen) {
    case 'overview':
      return '#/';
    case 'accountants':
      return '#/accountants';
    case 'accountant':
      return `#/accountants/${encodeURIComponent(route.email)}`;
    case 'agent':
      return `#/accountants/${encodeURIComponent(route.email)}/agents/${encodeURIComponent(route.agentType)}`;
    case 'settings':
      return '#/settings';
  }
}

function parseHash(hash: string): AdminRoute {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
  if (parts[0] === 'settings') return { screen: 'settings' };
  if (parts[0] === 'accountants') {
    const email = parts[1];
    if (!email) return { screen: 'accountants' };
    if (parts[2] === 'agents' && parts[3]) return { screen: 'agent', email, agentType: parts[3] };
    return { screen: 'accountant', email };
  }
  return { screen: 'overview' };
}

export function useAdminRoute(): [AdminRoute, (route: AdminRoute) => void] {
  const [route, setRoute] = useState<AdminRoute>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: AdminRoute) => {
    window.location.hash = routeHash(next);
  }, []);

  return [route, navigate];
}
