/**
 * Pure virtual terminal command engine (no DOM dependencies).
 * Contract defined in docs/spec/SPEC.md section 12.2:
 *   runCommand(spec, input) -> { kind: 'ok' | 'error' | 'clear', lines: [{ id?, text }] }
 */

const BUILTIN_NAMES = [
  'help', 'clear', 'history', 'pwd', 'whoami', 'hostname', 'date',
  'ls', 'cat', 'less', 'more', 'head', 'tail', 'grep', 'wc',
];

/**
 * Trim ends and collapse consecutive whitespace outside quotes to a single space.
 */
function normalizeInput(raw) {
  const src = String(raw ?? '').trim();
  if (!src) return '';
  let out = '';
  let quote = null;
  let inSpace = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      out += ch;
      if (quote === '"' && ch === '\\' && i + 1 < src.length) {
        out += src[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      inSpace = false;
      quote = ch;
      out += ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (!inSpace) {
        out += ' ';
        inSpace = true;
      }
      continue;
    }
    inSpace = false;
    out += ch;
  }

  return out.trim();
}

/**
 * Split normalized input by unquoted pipe characters `|`.
 */
function splitPipeline(normalized) {
  const stages = [];
  let cur = '';
  let quote = null;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (quote) {
      cur += ch;
      if (quote === '"' && ch === '\\' && i + 1 < normalized.length) {
        cur += normalized[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '|') {
      const trimmed = cur.trim();
      if (!trimmed) {
        return { error: "bash: syntax error near unexpected token `|'" };
      }
      stages.push(trimmed);
      cur = '';
      continue;
    }
    cur += ch;
  }

  const last = cur.trim();
  if (!last) {
    return { error: "bash: syntax error near unexpected token `|'" };
  }
  stages.push(last);
  return { stages };
}

/**
 * Quote-aware shell tokenization for built-in commands and pipe filters.
 */
function tokenize(stage) {
  const tokens = [];
  let cur = '';
  let hasToken = false;
  let quote = null;

  for (let i = 0; i < stage.length; i++) {
    const ch = stage[i];
    if (quote) {
      if (quote === '"' && ch === '\\' && i + 1 < stage.length) {
        cur += stage[++i];
      } else if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken) {
        tokens.push(cur);
        cur = '';
        hasToken = false;
      }
      continue;
    }
    cur += ch;
    hasToken = true;
  }
  if (hasToken) {
    tokens.push(cur);
  }
  return tokens;
}

function stripSudo(stage, spec) {
  if (spec?.sudo === 'strip' && /^sudo\s+/.test(stage)) {
    return stage.replace(/^sudo\s+/, '');
  }
  return stage;
}

function normalizePath(rawPath, home = '/home/ops') {
  const baseHome = home || '/home/ops';
  let p = String(rawPath ?? '').trim();
  if (!p || p === '.') p = baseHome;
  else if (p === '~') p = baseHome;
  else if (p.startsWith('~/')) p = `${baseHome}/${p.slice(2)}`;
  else if (!p.startsWith('/')) p = `${baseHome}/${p}`;

  const parts = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return '/' + parts.join('/');
}

function copyLines(lines) {
  return (lines || []).map((l) => {
    const out = { text: l.text ?? '' };
    if (l.id !== undefined) out.id = l.id;
    if (l.helpUsage !== undefined) out.helpUsage = l.helpUsage;
    if (l.helpDesc !== undefined) out.helpDesc = l.helpDesc;
    return out;
  });
}

function entryBaseName(entry) {
  const arrowIdx = entry.indexOf(' ->');
  const trimmed = arrowIdx >= 0 ? entry.slice(0, arrowIdx) : entry;
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function listDirEntries(spec, targetPath) {
  const dirs = spec?.dirs || {};
  const files = spec?.files || {};
  const norm = normalizePath(targetPath, spec?.home);

  if (Object.prototype.hasOwnProperty.call(files, norm)) {
    return { exists: true, isFile: true, entries: [norm] };
  }

  const hasExplicitDir = Object.prototype.hasOwnProperty.call(dirs, norm);
  const entryMap = new Map();

  if (hasExplicitDir) {
    for (const entry of dirs[norm] || []) {
      const base = entryBaseName(entry);
      if (!entryMap.has(base)) {
        entryMap.set(base, entry);
      }
    }
  }

  const prefix = norm === '/' ? '/' : `${norm}/`;

  for (const filePath of Object.keys(files)) {
    if (!filePath.startsWith(prefix)) continue;
    const rest = filePath.slice(prefix.length);
    if (!rest) continue;
    const slashIdx = rest.indexOf('/');
    if (slashIdx >= 0) {
      const dirName = rest.slice(0, slashIdx);
      if (!entryMap.has(dirName)) entryMap.set(dirName, `${dirName}/`);
    } else if (!entryMap.has(rest)) {
      entryMap.set(rest, rest);
    }
  }

  for (const dirPath of Object.keys(dirs)) {
    if (dirPath === norm || !dirPath.startsWith(prefix)) continue;
    const rest = dirPath.slice(prefix.length);
    if (!rest) continue;
    const slashIdx = rest.indexOf('/');
    const dirName = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
    if (dirName && !entryMap.has(dirName)) {
      entryMap.set(dirName, `${dirName}/`);
    }
  }

  if (!hasExplicitDir && entryMap.size === 0) {
    return { exists: false, isFile: false, entries: [] };
  }

  const entries = Array.from(entryMap.values()).sort((a, b) => a.localeCompare(b));
  return { exists: true, isFile: false, entries };
}

function findSpecCommand(spec, stage0) {
  const commands = spec?.commands || [];
  for (const cmd of commands) {
    for (const pat of cmd.patterns || []) {
      try {
        if (new RegExp(pat).test(stage0)) {
          return cmd;
        }
      } catch {
        // Ignore invalid pattern at runtime
      }
    }
  }
  return null;
}

function parseHeadTailArgs(tokens, cmdName) {
  let count = 10;
  const files = [];

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === '-n') {
      const val = tokens[++i];
      if (val === undefined || !/^\d+$/.test(val)) {
        return { error: `${cmdName}: invalid number of lines: '${val ?? ''}'` };
      }
      count = Number.parseInt(val, 10);
    } else if (/^-n\d+$/.test(tok)) {
      count = Number.parseInt(tok.slice(2), 10);
    } else if (/^-\d+$/.test(tok)) {
      count = Number.parseInt(tok.slice(1), 10);
    } else if (tok.startsWith('-')) {
      return { error: `${cmdName}: invalid option -- '${tok}'` };
    } else {
      files.push(tok);
    }
  }

  return { count, files };
}

function parseGrepArgs(tokens) {
  let ignoreCase = false;
  let invert = false;
  let pattern = null;
  const files = [];
  let endOfOpts = false;

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!endOfOpts && tok === '--') {
      endOfOpts = true;
      continue;
    }
    if (!endOfOpts && tok === '-e') {
      const val = tokens[++i];
      if (val === undefined) return { error: 'grep: option requires an argument -- e' };
      pattern = val;
      continue;
    }
    if (!endOfOpts && tok.startsWith('-') && tok.length > 1) {
      for (const ch of tok.slice(1)) {
        if (ch === 'i') ignoreCase = true;
        else if (ch === 'v') invert = true;
        else if (ch === 'E') { /* regex is already extended in JS */ }
        else return { error: `grep: invalid option -- '${ch}'` };
      }
      continue;
    }
    if (pattern === null) {
      pattern = tok;
    } else {
      files.push(tok);
    }
  }

  if (pattern === null) {
    return { error: 'grep: 패턴을 지정하세요.' };
  }
  return { ignoreCase, invert, pattern, files };
}

function applyGrepFilter(lines, { ignoreCase, invert, pattern }) {
  let matcher;
  try {
    const re = new RegExp(pattern, ignoreCase ? 'i' : '');
    matcher = (text) => re.test(text);
  } catch {
    const needle = ignoreCase ? pattern.toLowerCase() : pattern;
    matcher = (text) => (ignoreCase ? text.toLowerCase() : text).includes(needle);
  }

  return lines.filter((line) => {
    const hit = matcher(line.text ?? '');
    return invert ? !hit : hit;
  });
}

function buildHelpLines(spec) {
  const lines = [];
  const groups = new Map();
  for (const cmd of spec?.commands || []) {
    const cat = cmd.category || '기타';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(cmd);
  }

  for (const [cat, cmds] of groups.entries()) {
    lines.push({ text: `[${cat}]` });
    for (const cmd of cmds) {
      lines.push({
        text: `  ${cmd.usage} — ${cmd.desc}`,
        helpUsage: cmd.usage,
        helpDesc: cmd.desc,
      });
    }
  }

  lines.push({ text: '[파일 · 내장 명령]' });
  lines.push({ text: '  ls [경로] — 디렉터리 내용 보기' });
  lines.push({ text: '  cat / less / more <파일> — 파일 내용 출력' });
  lines.push({ text: '  head [-n N|-N] <파일> — 앞부분 출력 (기본 10줄)' });
  lines.push({ text: '  tail [-n N|-N] <파일> — 뒷부분 출력 (기본 10줄)' });
  lines.push({ text: '  grep [-i] [-v] [-E] <패턴> <파일> — 패턴에 맞는 줄 검색' });
  lines.push({ text: '  wc -l <파일> — 줄 수 세기' });
  lines.push({ text: '  파이프 | — 출력을 grep, head, tail, wc -l로 연결' });
  lines.push({ text: '  pwd, whoami, hostname, date, history, clear — 환경 확인 · 기록 · 화면 지우기' });
  lines.push({ text: '로그 위치: /var/log 아래를 ls로 살펴보세요.' });
  return lines;
}

function readFiles(spec, cmdName, fileArgs) {
  if (fileArgs.length === 0) {
    return { error: `${cmdName}: missing file operand` };
  }
  const filesMap = spec?.files || {};
  const result = [];
  for (const rawArg of fileArgs) {
    const norm = normalizePath(rawArg, spec?.home);
    if (!Object.prototype.hasOwnProperty.call(filesMap, norm)) {
      return { error: `${cmdName}: ${rawArg}: No such file or directory` };
    }
    result.push(...copyLines(filesMap[norm]));
  }
  return { lines: result };
}

function runStage0(spec, stage0, ctx) {
  // 3a. Match spec.commands
  const matched = findSpecCommand(spec, stage0);
  if (matched) {
    return { kind: 'ok', lines: copyLines(matched.output) };
  }

  const tokens = tokenize(stage0);
  if (tokens.length === 0) {
    return { kind: 'ok', lines: [] };
  }
  const cmdName = tokens[0];

  // 3b. Built-in commands
  if (cmdName === 'help') {
    return { kind: 'ok', lines: buildHelpLines(spec) };
  }
  if (cmdName === 'clear') {
    return { kind: 'clear', lines: [] };
  }
  if (cmdName === 'history') {
    const hist = Array.isArray(ctx?.history) ? ctx.history : [];
    return {
      kind: 'ok',
      lines: hist.map((h, i) => ({ text: `${String(i + 1).padStart(4, ' ')}  ${h}` })),
    };
  }
  if (cmdName === 'pwd') {
    return { kind: 'ok', lines: [{ text: spec?.home || '/home/ops' }] };
  }
  if (cmdName === 'whoami') {
    return { kind: 'ok', lines: [{ text: spec?.user || 'ops' }] };
  }
  if (cmdName === 'hostname') {
    return { kind: 'ok', lines: [{ text: spec?.host || 'localhost' }] };
  }
  if (cmdName === 'date') {
    return { kind: 'ok', lines: [{ text: spec?.now || '' }] };
  }
  if (cmdName === 'ls') {
    const targets = tokens.slice(1).filter((t) => !t.startsWith('-'));
    const rawTarget = targets[0] || spec?.home || '/home/ops';
    const listed = listDirEntries(spec, rawTarget);
    if (!listed.exists) {
      return {
        kind: 'error',
        lines: [{ text: `ls: cannot access '${rawTarget}': No such file or directory` }],
      };
    }
    return { kind: 'ok', lines: listed.entries.map((entry) => ({ text: entry })) };
  }
  if (cmdName === 'cat' || cmdName === 'less' || cmdName === 'more') {
    const fileArgs = tokens.slice(1).filter((t) => !t.startsWith('-'));
    const read = readFiles(spec, cmdName, fileArgs);
    if (read.error) return { kind: 'error', lines: [{ text: read.error }] };
    return { kind: 'ok', lines: read.lines };
  }
  if (cmdName === 'head' || cmdName === 'tail') {
    const parsed = parseHeadTailArgs(tokens, cmdName);
    if (parsed.error) return { kind: 'error', lines: [{ text: parsed.error }] };
    const read = readFiles(spec, cmdName, parsed.files);
    if (read.error) return { kind: 'error', lines: [{ text: read.error }] };
    const sliced = cmdName === 'head'
      ? read.lines.slice(0, parsed.count)
      : (parsed.count === 0 ? [] : read.lines.slice(-parsed.count));
    return { kind: 'ok', lines: sliced };
  }
  if (cmdName === 'grep') {
    const parsed = parseGrepArgs(tokens);
    if (parsed.error) return { kind: 'error', lines: [{ text: parsed.error }] };
    if (parsed.files.length === 0) {
      return { kind: 'error', lines: [{ text: 'grep: 파일 경로를 지정하세요.' }] };
    }
    const read = readFiles(spec, 'grep', parsed.files);
    if (read.error) return { kind: 'error', lines: [{ text: read.error }] };
    return { kind: 'ok', lines: applyGrepFilter(read.lines, parsed) };
  }
  if (cmdName === 'wc') {
    const flags = tokens.slice(1).filter((t) => t.startsWith('-'));
    const fileArgs = tokens.slice(1).filter((t) => !t.startsWith('-'));
    if (flags.some((f) => f !== '-l')) {
      return { kind: 'error', lines: [{ text: 'wc: 이 가상 환경에서는 wc -l만 지원합니다.' }] };
    }
    const read = readFiles(spec, 'wc', fileArgs);
    if (read.error) return { kind: 'error', lines: [{ text: read.error }] };
    return { kind: 'ok', lines: [{ text: String(read.lines.length) }] };
  }

  // 3c. Command name exists in spec.commands but arguments didn't match any pattern
  const sameNameCmds = (spec?.commands || []).filter((c) => c.name === cmdName);
  if (sameNameCmds.length > 0) {
    const usages = sameNameCmds.map((c) => c.usage).join(', ');
    return {
      kind: 'error',
      lines: [{ text: `이 가상 환경에서는 지원하지 않는 형태입니다. 지원: ${usages}` }],
    };
  }

  // 3d. Unknown command
  return {
    kind: 'error',
    lines: [
      { text: `bash: ${cmdName}: command not found` },
      { text: 'help로 사용 가능한 명령을 볼 수 있습니다.' },
    ],
  };
}

function runPipeFilter(stage, lines) {
  const tokens = tokenize(stage);
  if (tokens.length === 0) {
    return { kind: 'error', lines: [{ text: "bash: syntax error near unexpected token `|'" }] };
  }
  const cmdName = tokens[0];

  if (cmdName === 'grep') {
    const parsed = parseGrepArgs(tokens);
    if (parsed.error) return { kind: 'error', lines: [{ text: parsed.error }] };
    return { kind: 'ok', lines: applyGrepFilter(lines, parsed) };
  }
  if (cmdName === 'head' || cmdName === 'tail') {
    const parsed = parseHeadTailArgs(tokens, cmdName);
    if (parsed.error) return { kind: 'error', lines: [{ text: parsed.error }] };
    const sliced = cmdName === 'head'
      ? lines.slice(0, parsed.count)
      : (parsed.count === 0 ? [] : lines.slice(-parsed.count));
    return { kind: 'ok', lines: sliced };
  }
  if (cmdName === 'wc') {
    const flags = tokens.slice(1);
    if (flags.length === 1 && flags[0] === '-l') {
      return { kind: 'ok', lines: [{ text: String(lines.length) }] };
    }
    return { kind: 'error', lines: [{ text: `지원하지 않는 파이프 명령: ${cmdName}` }] };
  }

  return { kind: 'error', lines: [{ text: `지원하지 않는 파이프 명령: ${cmdName}` }] };
}

/**
 * Execute a command line against a terminal board spec.
 * @param {object} spec - incident.board (type === 'terminal')
 * @param {string} input - raw user command line
 * @param {{ history?: string[] }} [ctx] - optional execution context for `history`
 * @returns {{ kind: 'ok' | 'error' | 'clear', lines: Array<{ id?: string, text: string }> }}
 */
export function runCommand(spec, input, ctx = {}) {
  const normalized = normalizeInput(input);
  if (!normalized) {
    return { kind: 'ok', lines: [] };
  }

  const split = splitPipeline(normalized);
  if (split.error) {
    return { kind: 'error', lines: [{ text: split.error }] };
  }

  const [rawFirst, ...filters] = split.stages;
  const firstStage = stripSudo(rawFirst, spec);
  let res = runStage0(spec, firstStage, ctx);

  if (res.kind !== 'ok') {
    return res;
  }

  for (const filterStage of filters) {
    res = runPipeFilter(filterStage, res.lines);
    if (res.kind !== 'ok') {
      return res;
    }
  }

  return res;
}

/**
 * Return the matched spec.commands entry for the first pipeline stage, or null.
 * Used by the terminal UI to collect `terms` chips even when output is piped.
 */
export function getMatchedCommand(spec, input) {
  const normalized = normalizeInput(input);
  if (!normalized) return null;
  const split = splitPipeline(normalized);
  if (split.error || !split.stages?.length) return null;
  const firstStage = stripSudo(split.stages[0], spec);
  return findSpecCommand(spec, firstStage);
}

/**
 * Single-candidate Tab autocomplete for command names and file/directory paths.
 * Returns the completed input string when exactly one candidate matches, else null.
 */
export function autocomplete(spec, rawInput) {
  const value = String(rawInput ?? '');
  if (!value.trim()) return null;

  const pipeIdx = value.lastIndexOf('|');
  const segmentStart = pipeIdx >= 0 ? pipeIdx + 1 : 0;
  const segment = value.slice(segmentStart);
  const leadingSpaces = segment.length - segment.trimStart().length;
  const trimmedSeg = segment.trimStart();

  const lastSpaceIdx = trimmedSeg.lastIndexOf(' ');

  // Command name position
  if (lastSpaceIdx === -1) {
    const prefix = trimmedSeg;
    if (!prefix) return null;
    const names = new Set(BUILTIN_NAMES);
    if (pipeIdx < 0) {
      for (const cmd of spec?.commands || []) {
        if (cmd.name) names.add(cmd.name);
      }
      if (spec?.sudo === 'strip') names.add('sudo');
    } else {
      names.clear();
      for (const p of ['grep', 'head', 'tail', 'wc']) names.add(p);
    }
    const matches = [...names].filter((n) => n.startsWith(prefix));
    if (matches.length !== 1 || matches[0] === prefix) return null;
    return value.slice(0, segmentStart + leadingSpaces) + matches[0];
  }

  // Argument position: file/dir path completion
  const tokenStartInTrimmed = lastSpaceIdx + 1;
  const token = trimmedSeg.slice(tokenStartInTrimmed);
  if (!token || token.startsWith('-')) return null;

  const slashIdx = token.lastIndexOf('/');
  const dirPart = slashIdx >= 0 ? (token.slice(0, slashIdx) || '/') : (spec?.home || '/home/ops');
  const basePrefix = slashIdx >= 0 ? token.slice(slashIdx + 1) : token;
  const dirPrefixText = slashIdx >= 0 ? token.slice(0, slashIdx + 1) : '';

  const listed = listDirEntries(spec, dirPart);
  if (!listed.exists || listed.isFile) return null;

  const candidates = listed.entries
    .map((entry) => {
      const arrowIdx = entry.indexOf(' ->');
      return arrowIdx >= 0 ? `${entry.slice(0, arrowIdx)}/` : entry;
    })
    .filter((name) => name.startsWith(basePrefix));

  if (candidates.length !== 1) return null;
  const completedToken = dirPrefixText + candidates[0];
  if (completedToken === token) return null;

  return value.slice(0, segmentStart + leadingSpaces + tokenStartInTrimmed) + completedToken;
}
