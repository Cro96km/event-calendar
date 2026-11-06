// 新限定キャラを、同時に実装されるガチャのバーに畳む(表示時のみ。純関数)。docs/spec.md §4.13
import { attributeOfColor } from './characters';
import type { ExportEvent, NewName } from './data/export';
import { gachaGroup, sectionOfEvent } from './sections';

/** `名前（実装ガチャ名）` の名前だけ(行名の括弧の前)。 */
export const nameOnly = (label: string): string => label.replace(/（[^（）]*）$/, '');

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
