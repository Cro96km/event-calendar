// 日ごとに属性が決まるバーの見せ方の設定(config/display/bar-style.json)。docs/spec.md §4.7
import cfg from '../config/display/bar-style.json';

export const DAY_STYLES = ['lines', 'stripes', 'underline', 'off'] as const;
export type DayStyle = (typeof DAY_STYLES)[number];

interface BarStyleConfig {
  default: string;
  sections?: Record<string, string>;
}

const isStyle = (s: string | undefined): s is DayStyle => (DAY_STYLES as readonly string[]).includes(s ?? '');

/** セクションの見せ方(上書きがあればそれ、無ければ既定)。 */
export function dayStyleOf(sectionId: string, c: BarStyleConfig = cfg): DayStyle {
  const own = c.sections?.[sectionId];
  if (isStyle(own)) return own;
  return isStyle(c.default) ? c.default : 'lines';
}

/** 設定の誤り(値が lines/stripes/underline/edge/off のどれか。セクションidは sectionIds にあるもの)。 */
export function barStyleProblems(c: BarStyleConfig = cfg, sectionIds: readonly string[] = []): string[] {
  const p: string[] = [];
  if (!isStyle(c.default)) p.push(`bar-style.default は ${DAY_STYLES.join(' / ')}(${String(c.default)})`);
  for (const [sec, v] of Object.entries(c.sections ?? {})) {
    if (!isStyle(v)) p.push(`bar-style.sections「${sec}」は ${DAY_STYLES.join(' / ')}(${String(v)})`);
    if (sectionIds.length > 0 && !sectionIds.includes(sec)) p.push(`bar-style.sections「${sec}」は order.json にないセクションです(${sectionIds.join(' / ')})`);
  }
  return p;
}
