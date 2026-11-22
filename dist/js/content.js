/**
 * Content loader and in-memory cache for catalog, incidents, and learn topics.
 */

let catalogPromise = null;
const incidentPromises = new Map();
const topicPromises = new Map();
let allTopicsPromise = null;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`콘텐츠를 불러오지 못했습니다 (${res.status}): ${url}`);
  }
  return res.json();
}

export function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetchJson('content/catalog.json');
  }
  return catalogPromise;
}

export async function loadIncident(id) {
  if (!incidentPromises.has(id)) {
    incidentPromises.set(id, (async () => {
      const catalog = await loadCatalog();
      const stage = (catalog.quest?.stages || []).find((s) => s.id === id && s.file);
      if (!stage) return null;
      return fetchJson(`content/${stage.file}`);
    })());
  }
  return incidentPromises.get(id);
}

export async function loadAllAvailableIncidents() {
  const catalog = await loadCatalog();
  const stages = (catalog.quest?.stages || []).filter((s) => s.file);
  const loaded = await Promise.all(stages.map((s) => loadIncident(s.id)));
  const map = {};
  for (const inc of loaded) {
    if (inc) map[inc.id] = inc;
  }
  return map;
}

export async function loadTopic(id) {
  if (!topicPromises.has(id)) {
    topicPromises.set(id, (async () => {
      const catalog = await loadCatalog();
      const ids = catalog.learn?.topics || [];
      if (!ids.includes(id)) return null;
      return fetchJson(`content/topics/${id}.json`);
    })());
  }
  return topicPromises.get(id);
}

export function loadAllTopics() {
  if (!allTopicsPromise) {
    allTopicsPromise = (async () => {
      const catalog = await loadCatalog();
      const ids = catalog.learn?.topics || [];
      const topics = await Promise.all(ids.map((id) => loadTopic(id)));
      return topics.filter(Boolean);
    })();
  }
  return allTopicsPromise;
}

export async function getCompetencyMeta() {
  const [catalog, topics, incidentsById] = await Promise.all([
    loadCatalog(),
    loadAllTopics(),
    loadAllAvailableIncidents(),
  ]);
  return {
    topics: topics.map((t) => ({ id: t.id, domain: t.domain })),
    incidents: Object.values(incidentsById).map((inc) => ({
      id: inc.id,
      primary: inc.domains?.primary,
      secondary: inc.domains?.secondary || [],
    })),
    rule: catalog.competency,
  };
}
