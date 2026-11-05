// キャラクター(新限定・獣神化・獣神化改・真獣神化)の抽出。純関数(DOMなし)。docs/spec.md §4.13
// 公式の本文は保存しない。本文から取り出した「名前・種別・日時」だけを記事のレコード(data/articles)に残す。
import colors from '../config/display/quest-colors.json';
import { HOUR_MS, JST_OFFSET_MS } from './jst';

/** カレンダーのキャラクターセクションに入る項目のカテゴリ(記事のカテゴリとは別。出力時に付ける)。 */
export const CHARACTER_CATEGORY = 'character';

export const CHARACTER_KINDS = ['新限定', '獣神化', '獣神化・改', '真獣神化'] as const;
export type CharacterKind = (typeof CHARACTER_KINDS)[number];

/** キャラクターの属性(行のラベルの色に使う)。 */
export type Attribute = '火' | '水' | '木' | '光' | '闇';

/** 記事に残すキャラクター1件。start〜end が行のバー(進化は解禁日の暦日1日分=罫線から罫線まで。新限定はガチャの期間)。 */
export interface CharacterEntry {
  name: string;
  kind: CharacterKind;
  /** ISO8601 +09:00 */
  start: string;
  end: string | null;
  /** 進化の解禁の日時(詳細に出す。バーの start/end とは別)。新限定は無い */
  at?: string;
  /** 属性(本文の `木属性 ★6`)。取れなければ省略 */
  attr?: Attribute;
  /** 新限定の実装ガチャ名(`ガチャ「…」` の中身) */
  gacha?: string;
}

/** 属性 → 公式の属性色 `#rrggbb`(config/display/quest-colors.json。火=赤・水=青・木=緑・光=黄・闇=紫)。 */
export function attributeColor(attr: Attribute | undefined): string | undefined {
  const name = attr === undefined ? undefined : (colors.kinki as Record<string, string>)[attr];
  return name === undefined ? undefined : (colors.palette as Record<string, string>)[name];
}

/** 本文の行(htmlToLines の出力。h2/h3 は行頭 `# `)とタイトルから抽出する入力。 */
export interface CharacterInput {
  title: string;
  lines: readonly string[];
}

const DAY_MS = 24 * HOUR_MS;

const jstIso = (ms: number): string => new Date(ms + JST_OFFSET_MS).toISOString().replace(/\.\d{3}Z$/, '+09:00');

/** 瞬間 → その暦日(JST 0:00〜翌0:00)の [開始, 終了)。進化のバーは、解禁日の列を罫線から罫線まで塗る。 */
export function calendarDay(ms: number): { start: number; end: number } {
  const start = Math.floor((ms + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS;
  return { start, end: start + DAY_MS };
}

const ATTR = /^([火水木光闇])属性/;
/** from〜to の行にある属性。名前を含む次の行(`X属性` の次が名前や「二つ名 名前」)があればそれ、無ければ最初の属性。 */
function attrIn(lines: readonly string[], from: number, to: number, name: string): Attribute | undefined {
  const found: { attr: Attribute; next: string }[] = [];
  for (let i = from; i < Math.min(to, lines.length); i++) {
    const m = ATTR.exec((lines[i] ?? '').trim());
    if (m) found.push({ attr: m[1] as Attribute, next: (lines[i + 1] ?? '').trim() });
  }
  return (found.find((f) => f.next === name || f.next.endsWith(` ${name}`)) ?? found[0])?.attr;
}

const KIND = '(真獣神化|獣神化・改|獣神化)';
/** `# 真獣神化「名前」` / `# 獣神化・改「A」「B」`(1つの見出しに複数の名前がある形もある。先頭に「お正月仕様の」等が付いてもよい)。 */
const EVOLUTION_HEADING = new RegExp(`^#\\s*(?:\\S*?)${KIND}((?:「[^」]+」)+)\\s*$`);
/** タイトルの `「A」「B」の獣神化・改`(見出しが無い記事用)。 */
const TITLE_EVOLUTION = new RegExp(`((?:「[^」]+」)+)の${KIND}`, 'g');
const UNLOCK_LABEL = /^▼解禁日時\s*$/;
const DATE_TIME = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日[^\d]*(\d{1,2}):(\d{2})/;

/**
 * 進化の解禁。本文の形は3種類ある(いずれも `▼解禁日時` の次の行に `2026年2月11日（水）22:00`):
 * - 見出しごとに自分の `▼解禁日時` がある(見出しの直後〜次の見出しの前)
 * - 全員に共通の `▼解禁日時` が、最初の見出しより前に1つある
 * - 見出しが無い(1体だけの記事)。名前はタイトルの `「名前」の獣神化・改`、日時は唯一の `▼解禁日時`
 * 日時が取れないものは作らない。バーは解禁日の暦日1日分(罫線から罫線まで)で、解禁の日時は `at` に残す。
 */
function evolutions(title: string, lines: readonly string[]): CharacterEntry[] {
  const heads: { idx: number; kind: CharacterKind; names: string[] }[] = [];
  const dates: { idx: number; ms: number }[] = [];
  lines.forEach((line, i) => {
    const h = EVOLUTION_HEADING.exec(line.trim());
    if (h) heads.push({ idx: i, kind: h[1] as CharacterKind, names: namesOf(h[2] as string) });
    if (!UNLOCK_LABEL.test(line.trim())) return;
    const d = DATE_TIME.exec(lines[i + 1] ?? '');
    if (!d) return;
    const [y, mo, da, hh, mm] = d.slice(1).map(Number) as [number, number, number, number, number];
    dates.push({ idx: i, ms: Date.UTC(y, mo - 1, da, hh, mm) - JST_OFFSET_MS });
  });
  const targets: { kind: CharacterKind; names: string[]; ms: number | null; attrFrom: number; attrTo: number }[] = [];
  if (heads.length > 0) {
    const shared = dates.filter((d) => d.idx < (heads[0] as { idx: number }).idx).pop();
    heads.forEach((h, k) => {
      const next = heads[k + 1]?.idx ?? Infinity;
      const own = dates.find((d) => d.idx > h.idx && d.idx < next);
      targets.push({ kind: h.kind, names: h.names, ms: (own ?? shared)?.ms ?? null, attrFrom: h.idx, attrTo: next });
    });
  } else if (dates.length === 1) {
    for (const m of title.matchAll(TITLE_EVOLUTION)) targets.push({ kind: m[2] as CharacterKind, names: namesOf(m[1] as string), ms: (dates[0] as { ms: number }).ms, attrFrom: 0, attrTo: lines.length });
  }
  const out: CharacterEntry[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    if (t.ms === null) continue;
    for (const name of t.names) {
      const key = `${t.kind}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const day = calendarDay(t.ms);
      const attr = attrIn(lines, t.attrFrom, t.attrTo, name);
      out.push({ name, kind: t.kind, start: jstIso(day.start), end: jstIso(day.end), at: jstIso(t.ms), ...(attr ? { attr } : {}) });
    }
  }
  return out;
}

const NAMES = /((?:「[^」]+」)+)/;
/** 「」の中の名前。末尾の読み仮名の括弧 `東方萌萌美人（オリエンタル…）` は付けない(ラベルの括弧と区別できなくなるため)。 */
const namesOf = (s: string): string[] => [...s.matchAll(/「([^」]+)」/g)].map((m) => (m[1] as string).replace(/[（(][^）)]*[）)]$/, '').trim());

/** 新限定キャラの名前。本文の `新限定キャラクター「A」「B」` を優先し、無ければタイトルの `新限定(キャラ)「A」`。 */
function newLimitedNames({ title, lines }: CharacterInput): string[] {
  const body = new RegExp(`新限定キャラクター${NAMES.source}`);
  for (const l of lines) {
    const m = body.exec(l);
    if (m) return namesOf(m[1] as string);
  }
  const t = new RegExp(`新限定(?:キャラクター|キャラ)?${NAMES.source}`).exec(title);
  return t ? namesOf(t[1] as string) : [];
}

/** 記事のガチャの開催期間(新限定キャラのバー)と、その名前。 */
export interface GachaPeriod {
  start: string;
  end: string | null;
  /** `ガチャ「…」` の中身。取れなければ省略 */
  gacha?: string;
}

/**
 * 記事から取り出すキャラクター。
 * - 進化(真獣神化・獣神化・改・獣神化): 本文の見出しと `▼解禁日時` から。バーは解禁日の暦日1日。
 * - 新限定: タイトルに「新限定」を含む記事だけ。バーはガチャの開催期間(gacha)、ラベルに実装ガチャ名。ガチャの期間が無ければ作らない。
 * 日時が取れないものは作らない(推測した日付を載せない)。
 */
export function parseCharacters(input: CharacterInput, gacha: GachaPeriod | null): CharacterEntry[] {
  const out = evolutions(input.title, input.lines);
  if (input.title.includes('新限定') && gacha !== null) {
    for (const name of newLimitedNames(input)) {
      const attr = newLimitedAttr(input.lines, name);
      out.push({ name, kind: '新限定', start: gacha.start, end: gacha.end, ...(attr ? { attr } : {}), ...(gacha.gacha ? { gacha: gacha.gacha } : {}) });
    }
  }
  return out;
}

/** 新限定キャラの属性: `X属性 ★6` の次の行がそのキャラの名前(または「二つ名 名前」)のもの。 */
function newLimitedAttr(lines: readonly string[], name: string): Attribute | undefined {
  for (let i = 0; i < lines.length - 1; i++) {
    const m = ATTR.exec((lines[i] ?? '').trim());
    const next = (lines[i + 1] ?? '').trim();
    if (m && (next === name || next.endsWith(` ${name}`))) return m[1] as Attribute;
  }
  return undefined;
}

/** 行の表示名。新限定=`名前（実装ガチャ名）`、進化=`名前（種別）`(ラベルは 1行目=名前、2行目=（…）に分かれる)。 */
export const characterLabel = (c: Pick<CharacterEntry, 'name' | 'kind' | 'gacha'>): string =>
  c.kind === '新限定' ? (c.gacha ? `${c.name}（${c.gacha}）` : c.name) : `${c.name}（${c.kind}）`;

/** 新限定キャラのバーにする期間: 記事のガチャの開催期間(名前に `ガチャ「…」` を含む最初の項目)。無ければ記事の最初の項目(主期間。ガチャ名なし)。 */
export function gachaPeriod(events: readonly { name: string; start: string; end: string | null }[]): GachaPeriod | null {
  const g = events.find((x) => x.name.includes('ガチャ「'));
  const e = g ?? events[0];
  if (!e) return null;
  const name = g ? /ガチャ「([^」]+)」/.exec(g.name)?.[1] : undefined;
  return { start: e.start, end: e.end, ...(name ? { gacha: name } : {}) };
}
