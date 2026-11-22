/**
 * Hash router with mode synchronization (body[data-mode="quest" | "learn"]).
 * Routes:
 *   #/                        -> quest-home (quest)
 *   #/incident/:id            -> incident (quest)
 *   #/incident/:id/result     -> incident-result (quest)
 *   #/learn                   -> learn-home (learn)
 *   #/learn/topic/:topicId    -> learn-topic (learn) [?from=:incidentId]
 *   #/learn/:domain           -> learn-category (learn)
 */

export function parseHash(rawHash = window.location.hash) {
  let clean = rawHash || '#/';
  if (clean.startsWith('#')) clean = clean.slice(1);
  if (!clean.startsWith('/')) clean = '/' + clean;

  const [pathPart, queryPart = ''] = clean.split('?');
  const normalizedPath = pathPart.replace(/\/+$/, '') || '/';
  const query = {};
  if (queryPart) {
    const sp = new URLSearchParams(queryPart);
    for (const [k, v] of sp.entries()) {
      query[k] = v;
    }
  }

  const parts = normalizedPath.split('/').filter(Boolean);

  if (parts.length === 0) {
    return { name: 'quest-home', mode: 'quest', params: {}, query };
  }

  if (parts[0] === 'incident' && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    if (parts[2] === 'result') {
      return { name: 'incident-result', mode: 'quest', params: { id }, query };
    }
    return { name: 'incident', mode: 'quest', params: { id }, query };
  }

  if (parts[0] === 'learn') {
    if (parts.length === 1) {
      return { name: 'learn-home', mode: 'learn', params: {}, query };
    }
    if (parts[1] === 'topic' && parts[2]) {
      return {
        name: 'learn-topic',
        mode: 'learn',
        params: { topicId: decodeURIComponent(parts[2]) },
        query,
      };
    }
    return {
      name: 'learn-category',
      mode: 'learn',
      params: { domain: decodeURIComponent(parts[1]) },
      query,
    };
  }

  return { name: 'quest-home', mode: 'quest', params: {}, query };
}

export function navigate(hash) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}

export function startRouter(onRoute) {
  const handle = () => {
    const route = parseHash(window.location.hash);
    document.body.dataset.mode = route.mode;
    onRoute(route);
  };

  window.addEventListener('hashchange', handle);
  handle();

  return () => {
    window.removeEventListener('hashchange', handle);
  };
}
