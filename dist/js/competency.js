/**
 * Pure competency computation (no DOM dependencies).
 * Contract defined in docs/spec/SPEC.md section 5.
 */

const DOMAINS = ['os', 'network', 'infra', 'db', 'ai'];

/**
 * Compute per-domain integer competency scores.
 * @param {{ learnDone?: string[], history?: Array<{ incidentId: string, outcome: string }> }} progress
 * @param {{ topics?: Array<{ id: string, domain: string }>, incidents?: Array<{ id: string, primary: string, secondary?: string[] }>, rule: { learnPoints: number, questAssisted: number, questIndependent: number, secondaryBonus: number, maxPerDomain: number } }} meta
 * @returns {{ os: number, network: number, infra: number, db: number, ai: number }}
 */
export function computeCompetency(progress = {}, meta = {}) {
  const scores = { os: 0, network: 0, infra: 0, db: 0, ai: 0 };
  const rule = meta.rule || {
    learnPoints: 1,
    questAssisted: 2,
    questIndependent: 3,
    secondaryBonus: 1,
    maxPerDomain: 10,
  };

  const topicMap = new Map();
  for (const t of meta.topics || []) {
    if (t && t.id && DOMAINS.includes(t.domain)) {
      topicMap.set(t.id, t.domain);
    }
  }

  const seenLearn = new Set();
  for (const tid of progress.learnDone || []) {
    if (seenLearn.has(tid)) continue;
    seenLearn.add(tid);
    const domain = topicMap.get(tid);
    if (domain) {
      scores[domain] += rule.learnPoints;
    }
  }

  const incidentMap = new Map();
  for (const inc of meta.incidents || []) {
    if (inc && inc.id) {
      incidentMap.set(inc.id, inc);
    }
  }

  // Pick best outcome per incident: independent > assisted
  const bestByIncident = new Map();
  for (const entry of progress.history || []) {
    if (!entry || !incidentMap.has(entry.incidentId)) continue;
    if (entry.outcome !== 'independent' && entry.outcome !== 'assisted') continue;
    const prev = bestByIncident.get(entry.incidentId);
    if (!prev || (prev === 'assisted' && entry.outcome === 'independent')) {
      bestByIncident.set(entry.incidentId, entry.outcome);
    }
  }

  for (const [incidentId, outcome] of bestByIncident.entries()) {
    const inc = incidentMap.get(incidentId);
    if (!inc) continue;
    if (DOMAINS.includes(inc.primary)) {
      scores[inc.primary] += outcome === 'independent' ? rule.questIndependent : rule.questAssisted;
    }
    const secSeen = new Set();
    for (const sec of inc.secondary || []) {
      if (!DOMAINS.includes(sec) || secSeen.has(sec)) continue;
      secSeen.add(sec);
      scores[sec] += rule.secondaryBonus;
    }
  }

  const cap = Number.isFinite(rule.maxPerDomain) ? rule.maxPerDomain : 10;
  for (const d of DOMAINS) {
    scores[d] = Math.min(cap, Math.round(scores[d]));
  }

  return scores;
}
