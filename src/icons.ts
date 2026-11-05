// 画面上部のボタンの記号(インラインSVG。線の色は文字色 currentColor。24×24、線幅2、丸い端)。
// ボタンには aria-label と title(押すとどうなるか)を付けること(記号だけで意味が分かるように)。
export type IconName = 'moon' | 'sun' | 'calendar-month' | 'calendar-week';

const NS = 'http://www.w3.org/2000/svg';

/** 各記号の線(path の d)。月=月の形 / 太陽=円と光線 / カレンダー(月)=枠と日付の点 / カレンダー(週)=枠と1行の帯。 */
const PATHS: Record<IconName, string[]> = {
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  sun: ['M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M4.93 19.07l1.41-1.41', 'M17.66 6.34l1.41-1.41'],
  'calendar-month': ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M8 14h.01', 'M12 14h.01', 'M16 14h.01', 'M8 18h.01', 'M12 18h.01', 'M16 18h.01'],
  'calendar-week': ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M7 16h10'],
};
/** 枠(角丸の四角)を持つ記号。 */
const FRAMED: readonly IconName[] = ['calendar-month', 'calendar-week'];

/** 記号の SVG 要素(装飾。読み上げは親ボタンの aria-label)。 */
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon', `icon-${name}`);
  if (name === 'sun') {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '12');
    c.setAttribute('cy', '12');
    c.setAttribute('r', '4');
    svg.append(c);
  }
  if (FRAMED.includes(name)) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', '3');
    r.setAttribute('y', '4');
    r.setAttribute('width', '18');
    r.setAttribute('height', '18');
    r.setAttribute('rx', '2');
    svg.append(r);
  }
  for (const d of PATHS[name]) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
