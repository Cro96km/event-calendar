// カテゴリ → カレンダーのセクション対応。表示の調整はこのファイルだけで行う。spec §4.3。
import campaignOrder from '../config/display/campaign-order.json';
import gachaOrder from '../config/display/gacha-order.json';
import questOrder from '../config/display/quest-order.json';
import sortOrder from '../config/display/sort-order.json';

/** キャンペーンの並び順キーワード(config/display/campaign-order.json)。spec §4.3.3。 */
export const CAMPAIGN_ORDER: readonly string[] = campaignOrder.keywords;
/** キャンペーン内の小見出し(並び順)。CAMPAIGN_ORDER + 追加グループ(ミッション)。 */
export const CAMPAIGN_GROUPS: readonly string[] = [...campaignOrder.keywords, ...campaignOrder.extra_groups];
/** キャンペーンの別名(項目名に含む語 → グループ)。config/display/campaign-order.json の group_aliases。 */
export const CAMPAIGN_ALIASES: Readonly<Record<string, string>> = campaignOrder.group_aliases;
/** 小見出し内の並び(config/display/sort-order.json)。キー=小見出し名、値=項目名に含む語の順(\"*\"=その他の位置)。 */
export const GROUP_SORT: Readonly<Record<string, readonly string[]>> = { ...sortOrder.campaign, ...sortOrder.quest, ...sortOrder.gacha };
/** クエストの並び順キーワード(config/display/quest-order.json)。spec §4.3.5。 */
export const QUEST_ORDER: readonly string[] = questOrder.keywords;
/** クエストの小見出し(判定用。0=定例〈総称は config/display/quest-order.json の monthly_label〉、1=イベント)。表示順は QUEST_GROUP_ORDER。spec §4.3.5。 */
export const QUEST_GROUPS: readonly string[] = [questOrder.monthly_label, questOrder.event_label, '絶級クエスト', '期間限定クエスト', '超究極クエスト', 'その他'];
/** イベントガチャの写しをクエストの「イベントクエスト」に出すためのイベントid接尾辞(week.ts ganttSections)。 */
export const EVENT_QUEST_SUFFIX = '~event';
/** ガチャの小見出し(判定用。0=定例、1=イベント〈コラボ含む〉、2=期間限定)と定例ガチャの語(config/display/gacha-order.json)。表示順は GACHA_GROUP_ORDER。spec §4.3.7。 */
export const GACHA_GROUPS: readonly string[] = [gachaOrder.labels.regular, gachaOrder.labels.event, gachaOrder.labels.limited];
export const GACHA_REGULAR: readonly string[] = gachaOrder.regular_keywords;

/** 小見出しの表示順: クエストは イベント→定例→絶級→期間限定→超究極→その他。ガチャは イベント→定例→期間限定。(#143) */
export const QUEST_GROUP_ORDER: readonly string[] = [QUEST_GROUPS[1] as string, QUEST_GROUPS[0] as string, ...QUEST_GROUPS.slice(2)];
export const GACHA_GROUP_ORDER: readonly string[] = [GACHA_GROUPS[1] as string, GACHA_GROUPS[0] as string, ...GACHA_GROUPS.slice(2)];

/** 年代別の行 `ガチャ「<定例ガチャ名> 2013＆2014」`(年代の表由来)。 */
const ERA_GACHA = /^ガチャ「(.+?) (?:(\d{4})(?:[＆&]\d{4})?|Vol\.(\d+))」$/;

/** 定例ガチャの語の順位(GACHA_REGULAR の添字)。定例でなければ -1。名称が `ガチャ「語」` を含むか、年代別の行(`ガチャ「語 2013＆2014」`)。 */
export function regularGachaIndex(name: string): number {
  const era = ERA_GACHA.exec(name)?.[1];
  return GACHA_REGULAR.findIndex((k) => name.includes(`ガチャ「${k}」`) || k === era);
}

/** 年代別の行の年代(先頭の西暦。2013＆2014 は 2013)。年代別でなければ 0。同じ定例ガチャ内の並び(年代順)に使う。 */
export function gachaEra(name: string): number {
  const m = ERA_GACHA.exec(name);
  return Number(m?.[2] ?? m?.[3] ?? 0);
}

/** ガチャの小見出し。ガチャでなければ null。コラボ記事は「ガチャ「」で始まる本体のみ(付随項目は対象外)。 */
export function gachaGroup(e: { category: string; name: string; title?: string }): string | null {
  if (!e.name.includes('ガチャ') || gachaOrder.not_gacha.some((k) => e.name.includes(k))) return null;
  if (e.category === 'collab') return e.name.startsWith('ガチャ「') ? GACHA_GROUPS[1] ?? null : null;
  if (regularGachaIndex(e.name) >= 0) return GACHA_GROUPS[0] ?? null;
  const t = e.title ?? '';
  return gachaOrder.event_title_prefixes.some((p) => t.startsWith(p)) ? GACHA_GROUPS[1] ?? null : GACHA_GROUPS[2] ?? null;
}

export interface Section {
  id: string;
  label: string;
  /** バー/見出しの色相(hsl) */
  hue: number;
  /** このセクションに入る公式ニュースのカテゴリ */
  categories: readonly string[];
}

/** 表示順。未掲載のカテゴリは表示しない(「その他」セクションは持たない)。 */
export const SECTIONS: readonly Section[] = [
  { id: 'quest', label: 'クエスト', hue: 215, categories: ['event'] },
  { id: 'campaign', label: 'キャンペーン', hue: 140, categories: ['campaign', 'web-shop'] },
  { id: 'gacha', label: 'ガチャ', hue: 340, categories: ['collab'] },
];

/** event カテゴリでも、名称がキャンペーン系キーワード(英雄の神殿など)を含めばキャンペーンセクションに入れる。spec §4.3.5 */
export function sectionOfEvent(e: { category: string; name: string; title?: string }): Section | null {
  if (!EXCLUDED_CATEGORIES.includes(e.category) && gachaGroup(e) !== null) return SECTIONS.find((s) => s.id === 'gacha') ?? null;
  if (e.category === 'collab') return null; // collab はガチャ本体のみ表示(付随項目は出さない)
  if (e.category === 'event' && (CAMPAIGN_ORDER.some((k) => e.name.includes(k)))) return SECTIONS.find((s) => s.id === 'campaign') ?? null;
  return sectionOf(e.category);
}

/** メンテナンス記事のカテゴリ。行ではなくカレンダー全体を貫く帯で表示する(spec §4.3.6)。 */
export const MAINTENANCE_CATEGORY = 'maintenance';

/** 行として出さないカテゴリ(メンテナンスは帯で別に出す)。 */
const EXCLUDED_CATEGORIES: readonly string[] = ['update', 'important', MAINTENANCE_CATEGORY];

/** カテゴリのセクション。除外カテゴリ・未掲載カテゴリは null。 */
export function sectionOf(category: string): Section | null {
  if (EXCLUDED_CATEGORIES.includes(category)) return null;
  return SECTIONS.find((s) => s.categories.includes(category)) ?? null;
}
