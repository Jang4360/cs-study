/**
 * 5-domain competency pentagon radar chart (SVG + accessible axis list).
 * Vertex order: OS, 네트워크, 인프라, DB, AI.
 */
import { el, svgFromMarkup, escHtml } from './dom.js';

const DOMAIN_ORDER = ['os', 'network', 'infra', 'db', 'ai'];

export function renderRadar({
  scores,
  domains,
  maxPerDomain = 10,
  ruleText = '',
  testId = 'competency-radar',
  includeAxisTestIds = true,
  compact = false,
}) {
  const domainMap = new Map((domains || []).map((d) => [d.id, d]));
  const ordered = DOMAIN_ORDER.map((id) => ({
    id,
    label: domainMap.get(id)?.label || id.toUpperCase(),
    points: Number.isFinite(scores?.[id]) ? scores[id] : 0,
  }));

  const cx = 130;
  const cy = 126;
  const maxR = 84;
  const levels = [0.25, 0.5, 0.75, 1];

  const pointAt = (index, ratio) => {
    const angle = (-90 + index * 72) * (Math.PI / 180);
    return [cx + Math.cos(angle) * maxR * ratio, cy + Math.sin(angle) * maxR * ratio];
  };

  const ringPolygons = levels.map((lvl) => {
    const pts = ordered.map((_, i) => pointAt(i, lvl).map((n) => n.toFixed(1)).join(',')).join(' ');
    return `<polygon class="radar-ring" points="${pts}" />`;
  }).join('');

  const spokes = ordered.map((_, i) => {
    const [x, y] = pointAt(i, 1);
    return `<line class="radar-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />`;
  }).join('');

  const hasAny = ordered.some((item) => item.points > 0);
  const dataPoints = ordered.map((item, i) => {
    const ratio = maxPerDomain > 0 ? Math.min(1, Math.max(0, item.points / maxPerDomain)) : 0;
    // Slight minimum radius when any score > 0 so zero axes still sit cleanly at center
    return pointAt(i, ratio);
  });

  const dataPolyStr = dataPoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const dots = ordered.map((item, i) => {
    const [x, y] = dataPoints[i];
    return `<circle class="radar-dot ${item.points > 0 ? 'is-nonzero' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${item.points > 0 ? 4.5 : 2.5}" />`;
  }).join('');

  const labels = ordered.map((item, i) => {
    const [lx, ly] = pointAt(i, 1.24);
    const anchor = Math.abs(lx - cx) < 8 ? 'middle' : (lx > cx ? 'start' : 'end');
    return `<text class="radar-svg-label" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}">${escHtml(item.label)}</text>`;
  }).join('');

  const svg = svgFromMarkup(`
    <svg class="radar-svg" viewBox="0 0 260 248" role="img" aria-label="5개 분야 역량 오각형 차트">
      ${ringPolygons}
      ${spokes}
      ${hasAny ? `<polygon class="radar-area" points="${dataPolyStr}" />` : `<circle class="radar-origin" cx="${cx}" cy="${cy}" r="4" />`}
      ${dots}
      ${labels}
    </svg>
  `);

  const axisList = el('ul', { className: 'radar-axes' },
    ordered.map((item) => el('li', {
      className: 'radar-axis-item',
      ...(includeAxisTestIds ? { 'data-testid': `axis-${item.id}` } : {}),
      'data-domain': item.id,
      'data-points': String(item.points),
    },
      el('span', { className: 'radar-axis-label' }, item.label),
      el('strong', { className: 'radar-axis-score' }, `${item.points}점`),
    ))
  );

  return el('div', {
    className: `radar-widget${compact ? ' is-compact' : ''}`,
    ...(testId ? { 'data-testid': testId } : {}),
  },
    el('div', { className: 'radar-visual' }, svg),
    axisList,
    ruleText ? el('p', { className: 'radar-caption' }, ruleText) : null,
  );
}
