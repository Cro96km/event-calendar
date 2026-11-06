// 日ごとに対象の属性が決まっているバー(追憶の書庫・英雄の神殿の特Lの園・ノーマルクエストの経験値アップなど)の、縁の色の区切り。純関数(DOMなし)。docs/spec.md §4.7
import type { ExportEvent } from './data/export';
import { attributeColor, type Attribute } from './characters';
import { normalQuestBlock } from './details';
import { questNameColor } from './quest-color';
import type { BarSpan } from './week';

const LINE = /^(\d{1,2})\/(\d{1,2})\([月火水木金土日]\)\s+(.+)$/;
const ATTRS: readonly Attribute[] = ['火', '水', '木', '光', '闇'];

/**
 * 日付(YYYY-MM-DD) → その日の対象の属性色(`#rrggbb`。複数ならその順)。詳細の `M/D(曜) …` の行から作る:
 * 名前が固定のクエスト(特Lの園の 獄炎の神殿 など)は結び付けた属性色、`火・水属性クエスト` は属性の字ごと。ノーマルクエストの経験値アップは曜日ごとの設定から展開した行を使う。
 * 色が取れない日は含まない。
 */
export function dayAttrColors(event: Pick<ExportEvent, 'name' | 'start' | 'end' | 'details'>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const derived = normalQuestBlock(event);
  const blocks = [...(event.details ?? []), ...(derived ? [derived] : [])];
  const y0 = Number(event.start.slice(0, 4));
  const m0 = Number(event.start.slice(5, 7));
  for (const block of blocks) {
    for (const line of block.lines) {
      const m = LINE.exec(line);
      if (!m) continue;
      const month = Number(m[1]);
      const day = Number(m[2]);
      const text = m[3] as string;
      const named = questNameColor(text);
      const cs = named !== undefined ? [named] : ATTRS.filter((a) => text.includes(a)).map((a) => attributeColor(a)).filter((c): c is string => c !== undefined);
      if (cs.length === 0) continue;
      const year = month < m0 ? y0 + 1 : y0; // 年をまたぐ開催(12月→1月)
      out.set(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, cs);
    }
  }
  return out;
}

/** バーの縁の1区間。color が null なら既定の縁の色。a〜b はバーの幅に対する割合(0〜1)。 */
export interface EdgeSegment {
  color: string | null;
  a: number;
  b: number;
}

/**
 * バーの縁を、日(列)ごとの対象属性の色に区切る。判定はイベント全体(colors)で行い、色のある日が2日未満なら null(従来の縁)。
 * 表示中の日が1日だけ(週の初日だけ・最終日だけが映る)でも、その日の色を付ける(表示中に色のある日が無ければ null)。
 * 1日に属性が複数あれば、その日の幅を等分する。色の無い日は既定の縁(color: null)。区間はバーの幅(開始・終了の時刻の割合を含む)に対する割合。
 */
export function dayEdgeSegments(bar: Pick<BarSpan, 'from' | 'to' | 'startFrac' | 'endFrac'>, days: readonly string[], colors: ReadonlyMap<string, string[]>): EdgeSegment[] | null {
  const cols: { color: string[] | null; w: number }[] = [];
  for (let c = bar.from; c <= bar.to; c++) {
    const lo = c === bar.from ? bar.startFrac : 0;
    const hi = c === bar.to ? bar.endFrac : 1;
    cols.push({ color: colors.get(days[c] as string) ?? null, w: Math.max(0, hi - lo) });
  }
  if (colors.size < 2 || cols.every((x) => x.color === null)) return null;
  const total = cols.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return null;
  const out: EdgeSegment[] = [];
  let at = 0;
  for (const col of cols) {
    const w = col.w / total;
    const parts = col.color ?? [null];
    parts.forEach((color, i) => out.push({ color, a: at + (w * i) / parts.length, b: at + (w * (i + 1)) / parts.length }));
    at += w;
  }
  return out;
}

/** 縁の色の CSS(属性色は縁と同じ濃さ。null は既定の縁)。 */
export const edgeColorCss = (color: string | null): string => (color === null ? 'var(--c-bar-edge)' : `color-mix(in srgb, ${color} var(--ep), var(--ek))`);

/** 区間 → CSS の linear-gradient(90deg)。色は縁と同じ濃さに合わせる(--ep・--ek。ライト=属性色85%+黒、ダーク=60%+白。style.css)。 */
export function edgeGradient(segs: readonly EdgeSegment[]): string {
  const stops = segs.map((s) => {
    const c = edgeColorCss(s.color);
    return `${c} ${(s.a * 100).toFixed(3)}% ${(s.b * 100).toFixed(3)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
