// 定例ガチャの属性色(RED STARS=火 など)。設定は config/display/order.json の groups.gacha の定例ガチャの attrs。純関数(DOMなし)。docs/spec.md §4.3.8
import type { ExportEvent } from './data/export';
import { attributeColor, type Attribute } from './characters';
import { GACHA_REGULAR_GROUP, gachaGroup, groupDefs, sectionOfEvent } from './sections';

const ATTRS = (groupDefs('gacha').find((g) => g.name === GACHA_REGULAR_GROUP)?.attrs ?? {}) as Record<string, string>;

/** 定例ガチャの行(ガチャのセクションの 定例ガチャ)で、名前に attrs の語を含めば、その属性色(`#rrggbb`)。無ければ undefined。 */
export function regularGachaColor(e: Pick<ExportEvent, 'category' | 'name' | 'character' | 'pickup'> & { title?: string; section?: string }): string | undefined {
  if (e.character !== undefined || e.pickup !== undefined) return undefined;
  if (sectionOfEvent(e)?.id !== 'gacha' || gachaGroup(e) !== GACHA_REGULAR_GROUP) return undefined;
  const word = Object.keys(ATTRS).find((w) => e.name.includes(w));
  return word === undefined ? undefined : attributeColor(ATTRS[word] as Attribute);
}

/** 定例ガチャに属性色を付ける(ラベルは color、バーの縁は edge_color)。すでに color がある項目は変えない。 */
export function withRegularGachaColors(events: ExportEvent[]): ExportEvent[] {
  return events.map((e) => {
    const c = e.color === undefined ? regularGachaColor(e) : undefined;
    return c === undefined ? e : { ...e, color: c, edge_color: c };
  });
}
