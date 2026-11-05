// カテゴリ → カレンダーのセクション対応。表示の調整はこのファイルだけで行う。spec §4.3。
import order from '../config/display/order.json';

/** 行の並び方(config/display/order.json の rows)。 */
export interface RowRule {
  sort: 'fixed' | 'name' | 'start' | 'builtin';
  /** fixed: 項目名に含む語の順("*"=その他の位置) */
  words?: readonly string[];
  /** fixed の同順位の並び(既定 name) */
  then?: 'name' | 'start';
}
/** 小見出しごとの行の並び。無い小見出しは開始順。 */
export const ROW_RULES: Readonly<Record<string, RowRule>> = order.rows as Record<string, RowRule>;
const wordsOf = (group: string): readonly string[] => ROW_RULES[group]?.words ?? [];

/** キャンペーンの小見出し(表示順。config/display/order.json の groups.campaign)。 */
export const CAMPAIGN_GROUPS: readonly string[] = order.groups.campaign;
/** 名称に含む語で振り分けるキャンペーンの小見出し(セクション振り分け・2行表示の対象)。extra_groups(ミッション)は除く。 */
export const CAMPAIGN_ORDER: readonly string[] = CAMPAIGN_GROUPS.filter((g) => !order.classify.campaign.extra_groups.includes(g));
/** キャンペーンの別名(項目名に含む語 → グループ)。order.json の classify.campaign.group_aliases。 */
export const CAMPAIGN_ALIASES: Readonly<Record<string, string>> = order.classify.campaign.group_aliases;
/** 定例クエストの語(order.json の rows.定例クエスト.words)。名称に含めば定例クエスト。spec §4.3.5。 */
export const QUEST_ORDER: readonly string[] = wordsOf('定例クエスト');
/** クエストの小見出し(判定用。0=定例、1=イベント)。表示順は QUEST_GROUP_ORDER(order.json)。spec §4.3.5。 */
export const QUEST_GROUPS: readonly string[] = ['定例クエスト', 'イベントクエスト', '常設クエスト', '絶級クエスト', '期間限定クエスト', '超究極クエスト', 'その他'];
/** イベントガチャの写しをクエストの「イベントクエスト」に出すためのイベントid接尾辞(week.ts ganttSections)。 */
export const EVENT_QUEST_SUFFIX = '~event';
/** ガチャの小見出し(判定用。0=定例、1=イベント〈コラボ含む〉、2=期間限定)と定例ガチャの語(order.json の rows.定例ガチャ.words)。表示順は GACHA_GROUP_ORDER。spec §4.3.7。 */
export const GACHA_GROUPS: readonly string[] = ['定例ガチャ', 'イベントガチャ', '期間限定ガチャ'];
export const GACHA_REGULAR: readonly string[] = wordsOf('定例ガチャ');

/** 小見出しの表示順(config/display/order.json の groups)。 */
export const QUEST_GROUP_ORDER: readonly string[] = order.groups.quest;
export const GACHA_GROUP_ORDER: readonly string[] = order.groups.gacha;

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
  if (!e.name.includes('ガチャ') || order.classify.gacha.not_gacha.some((k) => e.name.includes(k))) return null;
  if (e.category === 'collab') return e.name.startsWith('ガチャ「') ? GACHA_GROUPS[1] ?? null : null;
  if (regularGachaIndex(e.name) >= 0) return GACHA_GROUPS[0] ?? null;
  const t = e.title ?? '';
  return order.classify.gacha.event_title_prefixes.some((p) => t.startsWith(p)) ? GACHA_GROUPS[1] ?? null : GACHA_GROUPS[2] ?? null;
}

export interface Section {
  id: string;
  label: string;
  /** バー/見出しの色相(hsl) */
  hue: number;
  /** このセクションに入る公式ニュースのカテゴリ */
  categories: readonly string[];
}

/** 表示順(config/display/order.json の sections)。未掲載のカテゴリは表示しない(「その他」セクションは持たない)。 */
export const SECTIONS: readonly Section[] = order.sections;

/** event カテゴリでも、名称がキャンペーン系キーワード(英雄の神殿など)を含めばキャンペーンセクションに入れる。spec §4.3.5 */
export function sectionOfEvent(e: { category: string; name: string; title?: string; section?: string }): Section | null {
  // 手動の修正(config/schedule/overrides.json の section)が最優先。除外カテゴリ(メンテナンス等)は対象外
  if (e.section !== undefined && !EXCLUDED_CATEGORIES.includes(e.category)) {
    const forced = SECTIONS.find((s) => s.id === e.section);
    if (forced) return forced;
  }
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
