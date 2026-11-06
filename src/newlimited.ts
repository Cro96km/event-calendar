// 新限定キャラを、同時に実装されるガチャのバーに畳む(表示時のみ。純関数)。docs/spec.md §4.13
import { attributeOfColor } from './characters';
import type { ExportEvent, NewName } from './data/export';
import { gachaGroup, sectionOfEvent } from './sections';

/** `名前（実装ガチャ名）` の名前だけ(行名の括弧の前)。 */
export const nameOnly = (label: string): string => label.replace(/（[^（）]*）$/, '');

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * バーの縁(輪郭)に使う属性色。0個=既定の縁、1個=その色、2個=左右半分ずつ(左=最初の名前)。
 * - 新限定の名前を持つガチャ: 1〜2人で全員に色があるときだけ(3人以上・色が不明なら既定)
 * - コラボのピックアップ: 名前の色(pickup.color)
 * - ラベルが色付きの項目(キャラクターの進化・畳めなかった新限定・超究極のボス名など): ラベルの色(color)
 * - 定例ガチャ(RED STARS など): 属性色(edge_color。src/gacha-color.ts)
 */
export function barEdgeColors(e: Pick<ExportEvent, 'new_names' | 'pickup' | 'character' | 'color' | 'edge_color'>): string[] {
  if (e.new_names?.length) {
    const cs = e.new_names.map((n) => n.color);
    return cs.length <= 2 && cs.every((c): c is string => c !== undefined && HEX.test(c)) ? cs : [];
  }
  // ピックアップは名前の色、それ以外はラベルの色(進化・畳めなかった新限定・定例ガチャの属性色・超究極などのボス名の色)と同じ
  const c = e.pickup ? e.pickup.color : (e.edge_color ?? e.color);
  return c !== undefined && HEX.test(c) ? [c] : [];
}

/** 項目IDの `#c<連番>` の連番(無ければ 0)。名前の並びを記事の順にする。 */
const charIndex = (id: string): number => Number(/#c(\d+)$/.exec(id)?.[1] ?? 0);

/**
 * 新限定キャラ(kind 新限定)を、同じ記事・同じ開始・同じ終了のガチャ(ピックアップを除く)に結び付ける。
 * 戻り値: ガチャの項目ID → そのキャラの項目(記事の順)。結び付かないキャラは含まない(行として残す)。
 */
export function newLimitedHosts(events: readonly ExportEvent[]): Map<string, ExportEvent[]> {
  const chars = events.filter((e) => e.character?.kind === '新限定');
  const out = new Map<string, ExportEvent[]>();
  if (chars.length === 0) return out;
  const hosts = events.filter((e) => e.character === undefined && e.pickup === undefined && sectionOfEvent(e)?.id === 'gacha' && gachaGroup(e) !== null);
  for (const c of [...chars].sort((a, b) => charIndex(a.id) - charIndex(b.id))) {
    const host = hosts.find((h) => h.article_id === c.article_id && h.start === c.start && h.end === c.end);
    if (host) out.set(host.id, [...(out.get(host.id) ?? []), c]);
  }
  return out;
}

/** 畳んだキャラを `new_names` にして、畳んだ行(キャラの項目)を取り除く。畳めなかった新限定キャラはそのまま残る。 */
export function foldNewLimited(events: ExportEvent[]): ExportEvent[] {
  const hosts = newLimitedHosts(events);
  if (hosts.size === 0) return events;
  const folded = new Set([...hosts.values()].flat().map((c) => c.id));
  return events
    .filter((e) => !folded.has(e.id))
    .map((e) => {
      const cs = hosts.get(e.id);
      if (!cs) return e;
      const names: NewName[] = cs.map((c) => {
        const attr = attributeOfColor(c.color);
        return { name: nameOnly(c.name), ...(c.color ? { color: c.color } : {}), ...(attr ? { attr } : {}) };
      });
      return { ...e, new_names: names };
    });
}
