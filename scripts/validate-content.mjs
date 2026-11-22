import { readFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_DIR = path.resolve(__dirname, '../content');

const errors = [];

function fail(msg) {
  errors.push(msg);
}

async function fileExists(absPath) {
  try {
    await access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(relPath) {
  const absPath = path.resolve(CONTENT_DIR, relPath);
  if (!absPath.startsWith(CONTENT_DIR + path.sep)) {
    fail(`Path escapes content/: ${relPath}`);
    return null;
  }
  if (!(await fileExists(absPath))) {
    fail(`Missing file referenced in catalog: content/${relPath}`);
    return null;
  }
  try {
    const raw = await readFile(absPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    fail(`Invalid JSON in content/${relPath}: ${err.message}`);
    return null;
  }
}

function checkRuleLineIds(rule, lineIdSet, context) {
  if (!rule || typeof rule !== 'object') return;
  for (const key of ['allOf', 'anyOf', 'noneOf']) {
    if (rule[key] === undefined) continue;
    if (!Array.isArray(rule[key])) {
      fail(`${context}.${key} must be an array`);
      continue;
    }
    for (const id of rule[key]) {
      if (!lineIdSet.has(id)) {
        fail(`${context}.${key} references unknown evidence line id "${id}"`);
      }
    }
  }
}

function checkDomains(domainsObj, validDomains, context) {
  if (!domainsObj || typeof domainsObj !== 'object') {
    fail(`${context}: missing domains object`);
    return;
  }
  if (!validDomains.has(domainsObj.primary)) {
    fail(`${context}: domains.primary "${domainsObj.primary}" is not in catalog.domains`);
  }
  if (!Array.isArray(domainsObj.secondary)) {
    fail(`${context}: domains.secondary must be an array`);
  } else {
    for (const d of domainsObj.secondary) {
      if (!validDomains.has(d)) {
        fail(`${context}: domains.secondary "${d}" is not in catalog.domains`);
      }
    }
  }
}

function validateBoard(board, { lineIds, cardIds, ctx }) {
  if (!board || typeof board !== 'object') {
    fail(`${ctx}: missing board object`);
    return;
  }
  if (typeof board.type !== 'string' || !board.type) {
    fail(`${ctx}.board: missing type`);
  }

  if (board.type === 'request-flow') {
    if (typeof board.t0 !== 'string' || !/^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(board.t0)) {
      fail(`${ctx}.board: invalid t0 "${board.t0}"`);
    }

    const laneIds = new Set();
    for (const lane of board.lanes || []) {
      if (!lane.id) {
        fail(`${ctx}.board.lanes: lane missing id`);
      } else if (laneIds.has(lane.id)) {
        fail(`${ctx}.board.lanes: duplicate lane id "${lane.id}"`);
      } else {
        laneIds.add(lane.id);
      }
    }

    const traceIds = new Set();
    for (const trace of board.traces || []) {
      if (!trace.id) {
        fail(`${ctx}.board.traces: trace missing id`);
      } else if (traceIds.has(trace.id)) {
        fail(`${ctx}.board.traces: duplicate trace id "${trace.id}"`);
      } else {
        traceIds.add(trace.id);
      }
    }

    const eventIds = new Set();
    const lineOwner = new Map();
    for (const ev of board.events || []) {
      const evCtx = `${ctx}.board.event(${ev.id || '?'})`;
      if (!ev.id) {
        fail(`${evCtx}: missing id`);
      } else if (eventIds.has(ev.id)) {
        fail(`${evCtx}: duplicate event id "${ev.id}"`);
      } else {
        eventIds.add(ev.id);
      }

      if (typeof ev.t !== 'number' || !Number.isFinite(ev.t)) {
        fail(`${evCtx}: t must be a finite number`);
      }
      if (!laneIds.has(ev.from)) {
        fail(`${evCtx}: from "${ev.from}" not in board.lanes`);
      }
      if (!laneIds.has(ev.to)) {
        fail(`${evCtx}: to "${ev.to}" not in board.lanes`);
      }
      if (!traceIds.has(ev.trace)) {
        fail(`${evCtx}: trace "${ev.trace}" not in board.traces`);
      }

      if (!Array.isArray(ev.lines)) {
        fail(`${evCtx}: lines must be an array`);
      } else {
        for (const lid of ev.lines) {
          if (!lineIds.has(lid)) {
            fail(`${evCtx}: line "${lid}" not in incident evidence lines`);
          } else if (lineOwner.has(lid)) {
            fail(`${evCtx}: line "${lid}" already assigned to event "${lineOwner.get(lid)}"`);
          } else {
            lineOwner.set(lid, ev.id);
          }
        }
      }

      for (const tid of ev.terms || []) {
        if (!cardIds.has(tid)) {
          fail(`${evCtx}: term "${tid}" not in incident cards`);
        }
      }
    }
  } else if (board.type === 'terminal') {
    if (typeof board.host !== 'string' || !board.host) {
      fail(`${ctx}.board: terminal missing host`);
    }
    if (typeof board.user !== 'string' || !board.user) {
      fail(`${ctx}.board: terminal missing user`);
    }
    if (!Array.isArray(board.commands)) {
      fail(`${ctx}.board: terminal commands must be an array`);
    } else {
      for (const cmd of board.commands) {
        const cmdCtx = `${ctx}.board.command(${cmd.usage || cmd.name || '?'})`;
        if (!Array.isArray(cmd.patterns) || cmd.patterns.length === 0) {
          fail(`${cmdCtx}: patterns must be a non-empty array`);
        } else {
          for (const pat of cmd.patterns) {
            if (typeof pat !== 'string') {
              fail(`${cmdCtx}: pattern must be a string`);
              continue;
            }
            try {
              new RegExp(pat);
            } catch (err) {
              fail(`${cmdCtx}: invalid regex pattern "${pat}": ${err.message}`);
            }
          }
        }
        if (!Array.isArray(cmd.output)) {
          fail(`${cmdCtx}: output must be an array`);
        } else {
          for (const ln of cmd.output) {
            if (typeof ln?.text !== 'string') {
              fail(`${cmdCtx}: output line missing text string`);
            }
            if (ln?.id !== undefined && !lineIds.has(ln.id)) {
              fail(`${cmdCtx}: output line id "${ln.id}" not in incident evidence lines`);
            }
          }
        }
        for (const tid of cmd.terms || []) {
          if (!cardIds.has(tid)) {
            fail(`${cmdCtx}: term "${tid}" not in incident cards`);
          }
        }
      }
    }
    if (board.files && typeof board.files === 'object') {
      for (const [filePath, lines] of Object.entries(board.files)) {
        const fileCtx = `${ctx}.board.files(${filePath})`;
        if (!Array.isArray(lines)) {
          fail(`${fileCtx}: file content must be an array`);
          continue;
        }
        for (const ln of lines) {
          if (typeof ln?.text !== 'string') {
            fail(`${fileCtx}: line missing text string`);
          }
          if (ln?.id !== undefined && !lineIds.has(ln.id)) {
            fail(`${fileCtx}: line id "${ln.id}" not in incident evidence lines`);
          }
        }
      }
    }
  }
}

const REQUIRED_TOPIC_FIELDS = [
  'id', 'domain', 'order', 'title', 'summary', 'minutes', 'keyword',
  'prerequisites', 'definition', 'why', 'flow', 'misconceptions',
  'inPractice', 'checks', 'terms', 'relatedIncidents', 'sources',
];

async function validateTopics(catalog, validDomains) {
  const catalogTopics = Array.isArray(catalog.learn?.topics) ? catalog.learn.topics : [];
  const catalogTopicSet = new Set(catalogTopics);
  if (catalogTopicSet.size !== catalogTopics.length) {
    fail('catalog.json: duplicate topic ids in learn.topics');
  }

  // Verify 1:1 with content/topics/*.json
  const topicsDir = path.resolve(CONTENT_DIR, 'topics');
  let diskFiles = [];
  try {
    diskFiles = (await readdir(topicsDir)).filter((f) => f.endsWith('.json')).sort();
  } catch (err) {
    fail(`Cannot read content/topics directory: ${err.message}`);
    return catalogTopicSet;
  }

  const diskIds = new Set(diskFiles.map((f) => f.slice(0, -'.json'.length)));
  for (const id of catalogTopics) {
    if (!diskIds.has(id)) {
      fail(`catalog.learn.topics references "${id}" but content/topics/${id}.json does not exist`);
    }
  }
  for (const id of diskIds) {
    if (!catalogTopicSet.has(id)) {
      fail(`content/topics/${id}.json exists on disk but is missing from catalog.learn.topics`);
    }
  }

  for (const id of catalogTopics) {
    const topic = await readJson(`topics/${id}.json`);
    if (!topic) continue;
    const ctx = `topic(${id})`;

    for (const field of REQUIRED_TOPIC_FIELDS) {
      if (topic[field] === undefined || topic[field] === null) {
        fail(`${ctx}: missing required field "${field}"`);
      }
    }
    if (topic.id !== id) {
      fail(`${ctx}: topic.id "${topic.id}" does not match filename "${id}"`);
    }
    if (!validDomains.has(topic.domain)) {
      fail(`${ctx}: domain "${topic.domain}" is not one of the 5 valid domains`);
    }
    if (typeof topic.order !== 'number' || !Number.isFinite(topic.order)) {
      fail(`${ctx}: order must be a finite number`);
    }
    if (typeof topic.minutes !== 'number' || topic.minutes <= 0) {
      fail(`${ctx}: minutes must be a positive number`);
    }
    if (!Array.isArray(topic.prerequisites)) {
      fail(`${ctx}: prerequisites must be an array`);
    } else {
      for (const pre of topic.prerequisites) {
        if (!catalogTopicSet.has(pre)) {
          fail(`${ctx}: prerequisite "${pre}" not in catalog.learn.topics`);
        }
      }
    }
    if (!topic.flow || typeof topic.flow !== 'object' || !Array.isArray(topic.flow.steps) || topic.flow.steps.length === 0) {
      fail(`${ctx}: flow must have a non-empty steps array`);
    }
    if (!Array.isArray(topic.checks)) {
      fail(`${ctx}: checks must be an array`);
    } else {
      const checkIds = new Set();
      for (const chk of topic.checks) {
        const chkCtx = `${ctx}.check(${chk.id || '?'})`;
        if (!chk.id) fail(`${chkCtx}: missing id`);
        else if (checkIds.has(chk.id)) fail(`${chkCtx}: duplicate check id`);
        else checkIds.add(chk.id);

        const optIds = new Set((chk.options || []).map((o) => o.id));
        if (!optIds.has(chk.answer)) {
          fail(`${chkCtx}: answer "${chk.answer}" not in options`);
        }
      }
    }
  }

  return catalogTopicSet;
}

async function main() {
  const catalog = await readJson('catalog.json');
  if (!catalog) {
    reportAndExit();
    return;
  }

  if (!Array.isArray(catalog.domains) || catalog.domains.length !== 5) {
    fail('catalog.json: domains must have 5 entries');
  }
  const validDomains = new Set((catalog.domains || []).map((d) => d.id));
  if (validDomains.size !== (catalog.domains || []).length) {
    fail('catalog.json: duplicate domain ids');
  }

  const catalogTopicSet = await validateTopics(catalog, validDomains);

  // Validate quest stages and requires ordering
  const stages = Array.isArray(catalog.quest?.stages) ? catalog.quest.stages : [];
  if (stages.length === 0) {
    fail('catalog.json: quest.stages must be a non-empty array');
  }

  const seenStageIds = new Set();
  for (const stage of stages) {
    const stageCtx = `catalog.quest.stage(${stage.id || '?'})`;
    if (!stage.id) {
      fail(`${stageCtx}: missing id`);
      continue;
    }
    if (seenStageIds.has(stage.id)) {
      fail(`${stageCtx}: duplicate stage id`);
    }
    if (!Array.isArray(stage.requires)) {
      fail(`${stageCtx}: requires must be an array`);
    } else {
      for (const reqId of stage.requires) {
        if (!seenStageIds.has(reqId)) {
          fail(`${stageCtx}: requires "${reqId}" must reference an earlier stage`);
        }
      }
    }
    seenStageIds.add(stage.id);

    if (!stage.file) {
      if (stage.domain && !validDomains.has(stage.domain)) {
        fail(`${stageCtx}: domain "${stage.domain}" not in catalog.domains`);
      }
      continue;
    }

    const inc = await readJson(stage.file);
    if (!inc) continue;

    const ctx = `incident(${stage.file})`;
    checkDomains(inc.domains, validDomains, ctx);

    if (!inc.objective || typeof inc.objective !== 'string') {
      fail(`${ctx}: missing objective`);
    }
    if (!Array.isArray(inc.criteria) || inc.criteria.length === 0) {
      fail(`${ctx}: missing criteria array`);
    }

    // Cards
    const cardIds = new Set();
    for (const c of inc.cards || []) {
      if (!c.id) {
        fail(`${ctx}: card missing id`);
      } else if (cardIds.has(c.id)) {
        fail(`${ctx}: duplicate card id "${c.id}"`);
      } else {
        cardIds.add(c.id);
      }
      if (!c.topic || !catalogTopicSet.has(c.topic)) {
        fail(`${ctx}: card "${c.id}" topic "${c.topic}" not in catalog.learn.topics`);
      }
    }

    // Hypotheses
    const hypIds = new Set();
    for (const h of inc.hypotheses || []) {
      if (!h.id) {
        fail(`${ctx}: hypothesis missing id`);
      } else if (hypIds.has(h.id)) {
        fail(`${ctx}: duplicate hypothesis id "${h.id}"`);
      } else {
        hypIds.add(h.id);
      }
    }

    // Evidence lines & card refs
    const lineIds = new Set();
    for (const ev of inc.evidence || []) {
      for (const cid of ev.cards || []) {
        if (!cardIds.has(cid)) {
          fail(`${ctx}: evidence ${ev.id} references unknown card "${cid}"`);
        }
      }
      for (const ln of ev.lines || []) {
        if (!ln.id) {
          fail(`${ctx}: evidence ${ev.id} has a line missing id`);
        } else if (lineIds.has(ln.id)) {
          fail(`${ctx}: duplicate evidence line id "${ln.id}"`);
        } else {
          lineIds.add(ln.id);
        }
      }
    }

    // Board
    validateBoard(inc.board, { lineIds, cardIds, ctx });

    // Checkpoints
    for (const cp of inc.checkpoints || []) {
      const cpCtx = `${ctx}.checkpoint(${cp.id})`;
      if (cp.evidenceRule) {
        checkRuleLineIds(cp.evidenceRule, lineIds, `${cpCtx}.evidenceRule`);
      }
      for (const pat of cp.patterns || []) {
        checkRuleLineIds(pat.when, lineIds, `${cpCtx}.pattern(${pat.id}).when`);
        if (pat.suggestTopic && !catalogTopicSet.has(pat.suggestTopic)) {
          fail(`${cpCtx}.pattern(${pat.id}): suggestTopic "${pat.suggestTopic}" not in catalog.learn.topics`);
        }
      }
      if (cp.stateQuestion) {
        const sq = cp.stateQuestion;
        if (!hypIds.has(sq.answer)) {
          fail(`${cpCtx}.stateQuestion: answer "${sq.answer}" not in hypotheses`);
        }
        const optSet = new Set(sq.options || []);
        if (!optSet.has(sq.answer)) {
          fail(`${cpCtx}.stateQuestion: answer "${sq.answer}" not in stateQuestion.options`);
        }
        for (const opt of sq.options || []) {
          if (!hypIds.has(opt)) {
            fail(`${cpCtx}.stateQuestion: option "${opt}" not in hypotheses`);
          }
        }
      }
      if (cp.evidenceQuestion) {
        checkRuleLineIds(cp.evidenceQuestion.rule, lineIds, `${cpCtx}.evidenceQuestion.rule`);
        for (const pn of cp.evidenceQuestion.passNotes || []) {
          checkRuleLineIds(pn.when, lineIds, `${cpCtx}.evidenceQuestion.passNotes.when`);
        }
      }
      if (cp.replyQuestion) {
        const rq = cp.replyQuestion;
        const rqOptIds = new Set((rq.options || []).map((o) => o.id));
        if (!rqOptIds.has(rq.answer)) {
          fail(`${cpCtx}.replyQuestion: answer "${rq.answer}" not in replyQuestion.options`);
        }
      }
    }

    // Hints levels consecutive 1..n
    const hints = inc.hints || [];
    for (let i = 0; i < hints.length; i++) {
      if (hints[i].level !== i + 1) {
        fail(`${ctx}.hints: expected level ${i + 1} at index ${i}, got ${hints[i].level}`);
      }
    }

    // References (if present, every url must be https)
    if (inc.references !== undefined) {
      if (!Array.isArray(inc.references)) {
        fail(`${ctx}.references: must be an array`);
      } else {
        for (const ref of inc.references) {
          if (typeof ref?.url !== 'string' || !ref.url.startsWith('https://')) {
            fail(`${ctx}.references: url "${ref?.url}" must start with https://`);
          }
        }
      }
    }
  }

  reportAndExit();
}

function reportAndExit() {
  if (errors.length > 0) {
    console.error(`Content validation failed (${errors.length} error${errors.length === 1 ? '' : 's'}):`);
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }
  console.log('Content validation passed.');
  process.exit(0);
}

main();
