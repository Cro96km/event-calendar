// カテゴリ → カレンダーのセクション対応。表示の調整はこのファイルだけで行う。spec §4.3。
import order from '../config/display/order.json';
import { CHARACTER_CATEGORY } from './characters';

/** 小見出しの定義(config/display/order.json の groups。配列の順が表示順)。 */
export interface GroupDef {
  name: string;
  /** コードが特別扱いする役割(quest: event / raid / super、gacha: event / regular / evolution) */
  role?: string;
  /** どの項目が入るか: "words"=自分の words / "name"=自分の name / {includes} / {pattern}。無ければ名称では入らない */
  match?: 'words' | 'name' | { includes?: string[]; pattern?: string };
  words?: string[];
  /** 行の名前に含む語 → 属性(火・水・木・光・闇)。ラベルとバーの縁をその属性色にする(定例ガチャ) */
  attrs?: Record<string, string>;
  sort?: 'fixed' | 'name' | 'start' | 'builtin';
  then?: 'name' | 'start';
  /** 項目名にこの語を含めばこの小見出し(キャンペーン) */
  aliases?: string[];
  /** 他の小見出しの判定のあとで判定する */
  late?: boolean;
  /** どれにも入らない項目の小見出し */
  default?: boolean;
  /** この小見出しの行ラベルから取り除く語(小見出しの名前で自明な語。取り除いて空になるときは元のまま) */
  label_strip?: string[];
}

const GROUPS = order.groups as Record<string, GroupDef[]>;
export const groupDefs = (section: string): readonly GroupDef[] => GROUPS[section] ?? [];
const namesOf = (section: string): readonly string[] => groupDefs(section).map((g) => g.name);
const roleName = (section: string, role: string): string => groupDefs(section).find((g) => g.role === role)?.name ?? '';
const defaultName = (section: string): string => groupDefs(section).find((g) => g.default)?.name ?? '';

/** 行の並び方(小見出しの sort・words・then)。 */
export interface RowRule {
  sort: 'fixed' | 'name' | 'start' | 'builtin';
  words?: readonly string[];
  then?: 'name' | 'start';
}
/** セクション → 小見出し名 → 行の並び方。無い小見出しは開始順。 */
export const ROW_RULES: Readonly<Record<string, Readonly<Record<string, RowRule>>>> = Object.fromEntries(
  Object.entries(GROUPS).map(([sec, gs]) => [sec, Object.fromEntries(gs.filter((g) => g.sort !== undefined).map((g) => [g.name, { sort: g.sort as RowRule['sort'], ...(g.words ? { words: g.words } : {}), ...(g.then ? { then: g.then } : {}) }]))]),
);

/** 小見出しの名前(表示順)。 */
export const QUEST_GROUPS: readonly string[] = namesOf('quest');
export const CAMPAIGN_GROUPS: readonly string[] = namesOf('campaign');
export const GACHA_GROUPS: readonly string[] = namesOf('gacha');
/** 役割の小見出し(名前を変えても役割で引く)。 */
export const CHARACTER_EVOLUTION = roleName('gacha', 'evolution');
export const QUEST_EVENT = roleName('quest', 'event');
export const QUEST_RAID = roleName('quest', 'raid');
export const QUEST_SUPER = roleName('quest', 'super');
export const QUEST_DEFAULT = defaultName('quest');
export const GACHA_EVENT = roleName('gacha', 'event');
export const GACHA_REGULAR_GROUP = roleName('gacha', 'regular');
export const GACHA_DEFAULT = defaultName('gacha');

/** 名称に含む語で振り分けるキャンペーンの小見出し(match: "name")。セクション振り分け・2行表示の対象。 */
export const CAMPAIGN_ORDER: readonly string[] = groupDefs('campaign').filter((g) => g.match === 'name').map((g) => g.name);
/** キャンペーンの別名(項目名に含む語 → 小見出し)。 */
export const CAMPAIGN_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(groupDefs('campaign').flatMap((g) => (g.aliases ?? []).map((a) => [a, g.name] as const)));
/** 定例ガチャの語(role: regular の words)。 */
export const GACHA_REGULAR: readonly string[] = groupDefs('gacha').find((g) => g.role === 'regular')?.words ?? [];
/** イベントガチャの写しをクエストの「イベントクエスト」に出すためのイベントid接尾辞(week.ts ganttSections)。 */
export const EVENT_QUEST_SUFFIX = '~event';

/** 小見出しの match に一致するか。 */
function matcher(g: GroupDef): ((name: string) => boolean) | null {
  const m = g.match;
  if (m === undefined) return null;
  if (m === 'words') return (n) => (g.words ?? []).some((k) => n.includes(k));
  if (m === 'name') return (n) => n.includes(g.name);
  const re = m.pattern !== undefined ? new RegExp(m.pattern) : null;
  return (n) => (m.includes ?? []).some((k) => n.includes(k)) || (re?.test(n) ?? false);
}
const MATCHERS: Record<string, { name: string; test: (n: string) => boolean; late: boolean }[]> = Object.fromEntries(
  Object.entries(GROUPS).map(([sec, gs]) => [sec, gs.flatMap((g) => { const t = matcher(g); return t ? [{ name: g.name, test: t, late: g.late === true }] : []; })]),
);

/** 項目名が match で入る小見出し(late でないものを配列の順に、次に late のもの)。無ければ null。default は含まない。 */
export function matchGroup(section: string, name: string): string | null {
  const ms = MATCHERS[section] ?? [];
  return [...ms.filter((m) => !m.late), ...ms.filter((m) => m.late)].find((m) => m.test(name))?.name ?? null;
}

/** 年代別の行 `ガチャ「<定例ガチャ名> 2013＆2014」`(年代の表由来)。 */
const ERA_GACHA = /^ガチャ「(.+?) (?:(\d{4})(?:[＆&]\d{4})?|Vol\.(\d+))」$/;

/** 定例ガチャの語の順位(GACHA_REGULAR の添字)。定例でなければ -1。名称が `ガチャ「語` で始まる(派生を含む)か、年代別の行(`ガチャ「語 2013＆2014」`)。 */
export function regularGachaIndex(name: string): number {
  const era = ERA_GACHA.exec(name)?.[1];
  // `ガチャ「語」`、および語で始まる派生(`ガチャ「モンコレDX 〜アルセーヌ編〜」`・`ガチャ「モンストジェネレーション2019 〜ソロモン編〜」`)も定例ガチャ
  return GACHA_REGULAR.findIndex((k) => name.includes(`ガチャ「${k}`) || k === era);
}

/** 定例ガチャの行のうち、`ガチャ「語」` そのもの(0)か、語のあとに続く派生(`ガチャ「モンコレDX 〜ビナー編〜」`。1)か。同じ定例ガチャの中で、本体を派生の前に並べる。 */
export function regularGachaDerived(name: string): number {
  const k = GACHA_REGULAR[regularGachaIndex(name)];
  return k !== undefined && name.includes(`ガチャ「${k}」`) ? 0 : 1;
}

/** 年代別の行の年代(先頭の西暦。2013＆2014 は 2013)。年代別でなければ 0。同じ定例ガチャ内の並び(年代順)に使う。 */
export function gachaEra(name: string): number {
  const m = ERA_GACHA.exec(name);
  return Number(m?.[2] ?? m?.[3] ?? 0);
}

/**
 * ガチャ(キャラクター・ガチャ)セクションの小見出し。対象でなければ null。コラボ記事は「ガチャ「」で始まる本体のみ(付随項目は対象外)。
 * キャラクターの項目: 進化=role evolution の小見出し。新限定はふだんはガチャのバーに畳まれる(newlimited.ts)ので、畳めなかった行だけここに来て、既定の小見出し。
 */
export function gachaGroup(e: { category: string; name: string; title?: string; character?: { kind: string } }): string | null {
  if (e.character !== undefined) return e.character.kind === '新限定' ? GACHA_DEFAULT : CHARACTER_EVOLUTION;
  if (!e.name.includes('ガチャ') || order.classify.gacha.not_gacha.some((k) => e.name.includes(k))) return null;
  if (e.category === 'collab') return e.name.startsWith('ガチャ「') ? GACHA_EVENT : null;
  if (regularGachaIndex(e.name) >= 0) return GACHA_REGULAR_GROUP;
  const t = e.title ?? '';
  return order.classify.gacha.event_title_prefixes.some((p) => t.startsWith(p)) ? GACHA_EVENT : GACHA_DEFAULT;
}

export interface Section {
  id: string;
  label: string;
  /** バー/見出しの色相(hsl) */
  hue: number;
  /** 彩度(%。0〜100。省略は CSS の既定=16) */
  sat?: number;
  /** 濃い色(縁・線)の明るさの補正(%。−15〜15。省略は0) */
  lit?: number;
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
  // キャラクターは名称に関わらずキャラクター・ガチャのセクション(id gacha。進化は小見出し「進化」、新限定は畳めなかったときの行)
  if (e.category === CHARACTER_CATEGORY) return SECTIONS.find((s) => s.id === 'gacha') ?? null;
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
