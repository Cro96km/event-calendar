// キャラクター(新限定・獣神化・獣神化改・真獣神化)の抽出。純関数(DOMなし)。docs/spec.md §4.13
// 公式の本文は保存しない。本文から取り出した「名前・種別・日時」だけを記事のレコード(data/articles)に残す。
import { HOUR_MS, JST_OFFSET_MS } from './jst';

/** カレンダーのキャラクターセクションに入る項目のカテゴリ(記事のカテゴリとは別。出力時に付ける)。 */
export const CHARACTER_CATEGORY = 'character';

export const CHARACTER_KINDS = ['新限定', '獣神化', '獣神化・改', '真獣神化'] as const;
export type CharacterKind = (typeof CHARACTER_KINDS)[number];

/** 記事に残すキャラクター1件。start〜end が行のバー(進化は解禁日のゲーム日1日分。新限定はガチャの期間)。 */
export interface CharacterEntry {
  name: string;
  kind: CharacterKind;
  /** ISO8601 +09:00 */
  start: string;
  end: string | null;
}

/** 本文の行(htmlToLines の出力。h2/h3 は行頭 `# `)とタイトルから抽出する入力。 */
export interface CharacterInput {
  title: string;
  lines: readonly string[];
}

const DAY_MS = 24 * HOUR_MS;
const GAME_DAY_START_MS = 4 * HOUR_MS;

const jstIso = (ms: number): string => new Date(ms + JST_OFFSET_MS).toISOString().replace(/\.\d{3}Z$/, '+09:00');

/** 解禁の瞬間 → そのゲーム日(4:00〜翌4:00)の終わり。 */
export function gameDayEnd(startMs: number): number {
  const day = Math.floor((startMs + JST_OFFSET_MS - GAME_DAY_START_MS) / DAY_MS);
  return day * DAY_MS + GAME_DAY_START_MS + DAY_MS - JST_OFFSET_MS;
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
 * 日時が取れないものは作らない。バーは解禁日のゲーム日1日分。
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
  const targets: { kind: CharacterKind; names: string[]; ms: number | null }[] = [];
  if (heads.length > 0) {
    const shared = dates.filter((d) => d.idx < (heads[0] as { idx: number }).idx).pop();
    heads.forEach((h, k) => {
      const next = heads[k + 1]?.idx ?? Infinity;
      const own = dates.find((d) => d.idx > h.idx && d.idx < next);
      targets.push({ kind: h.kind, names: h.names, ms: (own ?? shared)?.ms ?? null });
    });
  } else if (dates.length === 1) {
    for (const m of title.matchAll(TITLE_EVOLUTION)) targets.push({ kind: m[2] as CharacterKind, names: namesOf(m[1] as string), ms: (dates[0] as { ms: number }).ms });
  }
  const out: CharacterEntry[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    if (t.ms === null) continue;
    for (const name of t.names) {
      const key = `${t.kind}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, kind: t.kind, start: jstIso(t.ms), end: jstIso(gameDayEnd(t.ms)) });
    }
  }
  return out;
}

const NAMES = /((?:「[^」]+」)+)/;
const namesOf = (s: string): string[] => [...s.matchAll(/「([^」]+)」/g)].map((m) => (m[1] as string).trim());

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

/**
 * 記事から取り出すキャラクター。
 * - 進化(真獣神化・獣神化・改・獣神化): 本文の見出しと `▼解禁日時` から。バーは解禁日のゲーム日1日。
 * - 新限定: タイトルに「新限定」を含む記事だけ。バーは記事の主期間(ガチャの開催期間 mainPeriod)。主期間が無ければ作らない。
 * 日時が取れないものは作らない(推測した日付を載せない)。
 */
export function parseCharacters(input: CharacterInput, mainPeriod: { start: string; end: string | null } | null): CharacterEntry[] {
  const out = evolutions(input.title, input.lines);
  if (input.title.includes('新限定') && mainPeriod !== null) {
    for (const name of newLimitedNames(input)) out.push({ name, kind: '新限定', start: mainPeriod.start, end: mainPeriod.end });
  }
  return out;
}

/** 行の表示名 `名前（種別）`(ラベルは 1行目=名前、2行目=（種別）に分かれる)。 */
export const characterLabel = (c: Pick<CharacterEntry, 'name' | 'kind'>): string => `${c.name}（${c.kind}）`;

/** 新限定キャラのバーにする期間: 記事のガチャの開催期間(名前に `ガチャ「…」` を含む最初の項目)。無ければ記事の最初の項目(主期間)。 */
export function gachaPeriod(events: readonly { name: string; start: string; end: string | null }[]): { start: string; end: string | null } | null {
  const e = events.find((x) => x.name.includes('ガチャ「')) ?? events[0];
  return e ? { start: e.start, end: e.end } : null;
}
