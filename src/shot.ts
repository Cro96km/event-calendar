// 撮影モード(Discord 用の画像。URL パラメータ ?shot=…&date=…)。純関数(DOMなし)。docs/spec.md §4.12
import config from '../config/display/discord.json';
import { CHARACTER_KINDS } from './characters';
import { SECTIONS, type Section } from './sections';
import type { BarSpan } from './week';

/** 撮影の種類。summary=概要(絞り込みあり)、他(character=キャラクター・quest・campaign・gacha)はそのセクションだけ(絞り込みなし)。 */
export const SHOT_KINDS = ['summary', 'character', 'quest', 'campaign', 'gacha'] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];

export interface ShotParams {
  kind: ShotKind;
  /** 基準日(YYYY-MM-DD)。無ければ今日(ゲーム日) */
  date: string | null;
}

/** 実在する日付(YYYY-MM-DD)か。 */
export function isDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** location.search → 撮影のパラメータ。shot が無い・不正なら null(通常表示)。date が不正なら無視して今日。 */
export function parseShot(search: string): ShotParams | null {
  const q = new URLSearchParams(search);
  const kind = q.get('shot');
  if (!kind || !(SHOT_KINDS as readonly string[]).includes(kind)) return null;
  const date = q.get('date');
  return { kind: kind as ShotKind, date: date !== null && isDay(date) ? date : null };
}

/** 概要の1ブロック(config/display/discord.json の summary.blocks)。上から順に、条件に合う行を並べる。 */
export interface SummaryBlock {
  /** セクションid(order.json の sections) */
  section: string;
  /** 出す小見出し(order.json の groups の name)。複数なら、この順に並べる。省略=セクションの全行 */
  groups?: string[];
  /** 空でなければ、項目名にこの語のどれかを含む行だけ残す */
  keywords?: string[];
  /** 項目名にこの語を含む行を外す */
  hide_keywords?: string[];
  /** 開催日だけ出す(その週に始まるものを開始日の列1日分に描く。それ以前に始まったものは出さない) */
  start_day_only?: boolean;
  /** 小見出しを出すか(既定: groups を指定したブロックは出す・語だけのブロックは出さない) */
  headings?: boolean;
  /** 最大行数(上から数える) */
  max_rows?: number;
}

/** 概要の設定。セクションの大見出し(キャラクター・クエストなど)は出さず、blocks を上から順に並べる。 */
export interface SummaryConfig {
  blocks: SummaryBlock[];
}
export const SUMMARY: SummaryConfig = config.summary as SummaryConfig;

/** 設定の誤り。sectionIds / groupNames は order.json 由来(テストで差し替えられる)。 */
export function shotConfigProblems(cfg: SummaryConfig = SUMMARY, sectionIds: readonly string[] = SECTIONS.map((s) => s.id), groupNames: (section: string) => readonly string[] = () => []): string[] {
  const p: string[] = [];
  const isStrs = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (!Array.isArray(cfg.blocks) || cfg.blocks.length === 0) return ['summary.blocks は1つ以上のブロックの配列'];
  cfg.blocks.forEach((b, i) => {
    const w = `summary.blocks[${i}]`;
    if (!sectionIds.includes(b.section)) p.push(`${w}.section: 「${b.section}」は order.json にないセクションです(${sectionIds.join(' / ')})`);
    for (const key of ['groups', 'keywords', 'hide_keywords'] as const) {
      const v: unknown = b[key];
      if (v === undefined) continue;
      if (!isStrs(v) || v.length === 0) p.push(`${w}.${key} は1つ以上の文字列の配列`);
      else if (v.some((x) => x.trim() === '')) p.push(`${w}.${key}: 空の語があります`);
    }
    if (isStrs(b.groups)) {
      const known = groupNames(b.section);
      for (const g of b.groups) if (known.length > 0 && !known.includes(g)) p.push(`${w}.groups: 「${g}」は order.json の ${b.section} の小見出しにありません(${known.join(' / ')})`);
    }
    if (b.start_day_only !== undefined && typeof b.start_day_only !== 'boolean') p.push(`${w}.start_day_only は true / false`);
    if (b.headings !== undefined && typeof b.headings !== 'boolean') p.push(`${w}.headings は true / false`);
    if (b.max_rows !== undefined && !(Number.isInteger(b.max_rows) && b.max_rows >= 1)) p.push(`${w}.max_rows: 1以上の整数`);
  });
  return p;
}

/** 概要で並べる1ブロック分(ui.ts が大見出しなしで描く)。 */
export interface SummaryEntry {
  section: Section;
  rows: BarSpan[][];
  /** 小見出しを出すか */
  headings: boolean;
}

/**
 * 概要の行を、設定の blocks の順に並べる。sections=ganttSections の結果(セクションごとの行)。groupOf=行の小見出し(無ければ null)。
 * キャラクターの行は先に詰める(compactCharacterRows)。ブロックごとの判定順: 小見出し → 語で外す → only の語 → 開催日だけ → 行数。行が無いブロックは出さない。
 */
export function summaryBlocks(sections: { section: Section; rows: BarSpan[][] }[], groupOf: (sectionId: string, e: BarSpan['event']) => string | null, cfg: SummaryConfig = SUMMARY): SummaryEntry[] {
  const out: SummaryEntry[] = [];
  const compacted = new Map<string, BarSpan[][]>();
  const rowsOf = (sec: { section: Section; rows: BarSpan[][] }): BarSpan[][] => {
    if (sec.section.id !== 'character') return sec.rows;
    if (!compacted.has(sec.section.id)) compacted.set(sec.section.id, compactCharacterRows(sec.rows));
    return compacted.get(sec.section.id) as BarSpan[][];
  };
  for (const b of cfg.blocks) {
    const sec = sections.find((x) => x.section.id === b.section);
    if (!sec) continue;
    let rows = rowsOf(sec).filter((bars) => {
      const e = (bars[0] as BarSpan).event;
      if (b.groups !== undefined && !b.groups.includes(groupOf(sec.section.id, e) ?? '')) return false;
      if (b.hide_keywords?.some((k) => e.name.includes(k))) return false;
      if (b.keywords !== undefined && !b.keywords.some((k) => e.name.includes(k))) return false;
      return true;
    });
    // 複数の小見出しは、設定に書いた順(同じ小見出しの中は元の並び)
    if (b.groups !== undefined) {
      const order = (bars: BarSpan[]): number => (b.groups as string[]).indexOf(groupOf(sec.section.id, (bars[0] as BarSpan).event) ?? '');
      rows = rows.map((r, i) => ({ r, i })).sort((x, y) => order(x.r) - order(y.r) || x.i - y.i).map((x) => x.r);
    }
    if (b.start_day_only) rows = rows.map((bars) => startDayBars(bars)).filter((bars) => bars.length > 0);
    if (b.max_rows !== undefined) rows = rows.slice(0, b.max_rows);
    if (rows.length > 0) out.push({ section: sec.section, rows, headings: b.headings ?? b.groups !== undefined });
  }
  return out;
}

/** 開催日だけの表示: その表示期間に始まるバーを、開始日の列1日分(罫線から罫線まで。開始時刻は問わない)にする。表示期間より前に始まったものは出さない。 */
export function startDayBars(bars: BarSpan[]): BarSpan[] {
  return bars.filter((b) => !b.clippedLeft).map((b) => ({ ...b, to: b.from, startFrac: 0, endFrac: 1, clippedRight: false, openEnded: false }));
}

/** `名前（種別）`/`名前（ガチャ名）` の名前だけ(行名の括弧の前)。 */
const nameOnly = (label: string): string => label.replace(/（[^（）]*）$/, '');

/**
 * 撮影モードのキャラクターの行を詰める(行数対策。通常のカレンダーは変えない)。
 * - 新限定: 同じガチャ・同じ期間のキャラを1行にまとめる(`shot_names` に名前と属性色。期間が違えば別の行のまま)。ラベルはガチャ名、名前は期間の線の上に書く(ui.ts)。
 * - 進化: 種別(獣神化・獣神化改・真獣神化)ごとに1行にまとめる(バーは1日分なので、同じ日の名前は日付の枠に縦に並ぶ。ui.ts)。
 * rows は ganttSections の行(新限定→進化の順、各々登場順)。出力も 新限定→進化。キャラクターでない行はそのまま。
 */
export function compactCharacterRows(rows: BarSpan[][]): BarSpan[][] {
  const news = new Map<string, BarSpan[][]>();
  const evo = new Map<string, BarSpan[]>();
  const rest: BarSpan[][] = [];
  for (const bars of rows) {
    const e = (bars[0] as BarSpan).event;
    if (e.character === undefined) rest.push(bars);
    else if (e.character.kind === '新限定') {
      const k = `${e.character.gacha ?? ''}|${e.start}|${e.end ?? ''}`;
      news.set(k, [...(news.get(k) ?? []), bars]);
    } else evo.set(e.character.kind, [...(evo.get(e.character.kind) ?? []), ...bars]);
  }
  const merged = [...news.values()].map((group) => {
    const first = (group[0] as BarSpan[])[0] as BarSpan;
    const parts = group.map((g) => (g[0] as BarSpan).event).map((e) => ({ name: nameOnly(e.name), ...(e.color ? { color: e.color } : {}) }));
    const gacha = first.event.character?.gacha;
    // 1行1ガチャ(期間)。ラベルはガチャ名、期間の線の上に名前を属性色で書く(ui.ts)。ガチャ名が無ければ名前を並べる
    return [{ ...first, event: { ...first.event, name: `${parts.map((x) => x.name).join('・')}${gacha ? `（${gacha}）` : ''}`, shot_names: parts, color: undefined } }];
  });
  const evoRows = CHARACTER_KINDS.filter((k) => evo.has(k)).map((k) => (evo.get(k) as BarSpan[]).sort((a, b) => a.from - b.from || (a.event.character?.at ?? '').localeCompare(b.event.character?.at ?? '')));
  return [...rest, ...merged, ...evoRows];
}

const FOUR_AM = 4 / 24;
const TOL = 2 / 1440;
/** 撮影モードでの 4:00(ゲーム日の境目)の位置(列内の割合)。本来は 1/6 だが、端の矢印が入るよう少し右へずらす。開始・終了とも同じ位置にする。 */
export const SHOT_4AM_FRAC = 0.2;
const near4am = (frac: number): boolean => Math.abs(frac - FOUR_AM) <= TOL;
/** 撮影モードの右端(列内の割合)。4:00(03:59含む)終わりは 4:00 の位置へ、23:59 終わりは 24:00 と同じ(罫線に接する)。 */
export function shotEndFrac(endFrac: number): number {
  if (endFrac >= 1 - TOL) return 1;
  return near4am(endFrac) ? SHOT_4AM_FRAC : endFrac;
}
/** 撮影モードの左端(列内の割合)。4:00 開始も終了と同じ 4:00 の位置へ、0:00(0:01含む)開始は罫線に接する。 */
export function shotStartFrac(startFrac: number): number {
  if (startFrac <= TOL) return 0;
  return near4am(startFrac) ? SHOT_4AM_FRAC : startFrac;
}
