// 撮影モード(Discord 用の画像。URL パラメータ ?shot=…&date=…)。純関数(DOMなし)。docs/spec.md §4.12
import config from '../config/display/discord.json';
import { SECTIONS, type Section } from './sections';
import type { BarSpan } from './week';

/** 撮影の種類。summary=概要(絞り込みあり)、他(quest・campaign・gacha=キャラクター・ガチャ)はそのセクションだけ(絞り込みなし)。 */
export const SHOT_KINDS = ['summary', 'quest', 'campaign', 'gacha'] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];

export interface ShotParams {
  kind: ShotKind;
  /** 基準日(YYYY-MM-DD)。無ければ今日(ゲーム日) */
  date: string | null;
  /** 画面の色。既定 light(&theme=dark でダーク。試作) */
  theme: 'light' | 'dark';
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
  return { kind: kind as ShotKind, date: date !== null && isDay(date) ? date : null, theme: q.get('theme') === 'dark' ? 'dark' : 'light' };
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
  /** 開催日だけ出す(その週に始まるものだけ。開始の翌日までに終わるものは期間そのまま、長いものは開始日の列1日分に縮めて開始時刻を `12:00開始` とバーの中に書く。それ以前に始まったものは出さない) */
  start_day_only?: boolean;
  /** true=新限定キャラの名前をバーの中に持つガチャの行だけ出す(キャラクター・ガチャの新限定)。このセクションの、ほかのブロックには出さない */
  with_new_limited?: boolean;
  /** 最大行数(上から数える) */
  max_rows?: number;
}

/** 概要の設定。セクションの大見出し(キャラクター・クエストなど)は出さず、blocks を上から順に並べる。 */
export interface SummaryConfig {
  /** 概要の画像の先頭に出す見出し(ほかの画像のセクション名に当たる) */
  label: string;
  blocks: SummaryBlock[];
}
export const SUMMARY: SummaryConfig = config.summary as SummaryConfig;

/** 設定の誤り。sectionIds / groupNames は order.json 由来(テストで差し替えられる)。 */
export function shotConfigProblems(cfg: SummaryConfig = SUMMARY, sectionIds: readonly string[] = SECTIONS.map((s) => s.id), groupNames: (section: string) => readonly string[] = () => []): string[] {
  const p: string[] = [];
  if (typeof cfg.label !== 'string' || cfg.label.trim() === '') p.push('summary.label は空でない文字列');
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
    if (b.with_new_limited !== undefined && typeof b.with_new_limited !== 'boolean') p.push(`${w}.with_new_limited は true / false`);
    if (b.max_rows !== undefined && !(Number.isInteger(b.max_rows) && b.max_rows >= 1)) p.push(`${w}.max_rows: 1以上の整数`);
  });
  return p;
}

/** 概要で並べる1ブロック分(ui.ts が大見出しなしで描く)。 */
export interface SummaryEntry {
  section: Section;
  rows: BarSpan[][];
}

/**
 * 概要の行を、設定の blocks の順に並べる。sections=ganttSections の結果(セクションごとの行)。groupOf=行の小見出し(無ければ null)。
 * ブロックごとの判定順: 小見出し → 語で外す → only の語 → 開催日だけ → 行数。行が無いブロックは出さない。
 */
export function summaryBlocks(sections: { section: Section; rows: BarSpan[][] }[], groupOf: (sectionId: string, e: BarSpan['event']) => string | null, cfg: Pick<SummaryConfig, 'blocks'> = SUMMARY): SummaryEntry[] {
  const out: SummaryEntry[] = [];
  // with_new_limited のブロックがあるセクションでは、新限定の名前を持つ行はそのブロックだけに出す(ほかのブロックと重ねない)
  const newBlockSections = new Set(cfg.blocks.filter((b) => b.with_new_limited === true).map((b) => b.section));
  for (const b of cfg.blocks) {
    const sec = sections.find((x) => x.section.id === b.section);
    if (!sec) continue;
    let rows = sec.rows.filter((bars) => {
      const e = (bars[0] as BarSpan).event;
      const hasNew = (e.new_names?.length ?? 0) > 0;
      if (b.with_new_limited === true ? !hasNew : hasNew && newBlockSections.has(b.section)) return false;
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
    if (rows.length > 0) out.push({ section: sec.section, rows });
  }
  return out;
}

/**
 * 開催日だけの表示: その表示期間に始まるバーだけを残す(表示期間より前に始まったものは出さない)。
 * - 開始の翌日までに終わるバー(例: 12:00〜翌11:59の1日限定)は、期間そのまま(開始〜終了の位置。2列にまたがってよい)。
 * - それより長いバーは、開始日の列1日分(罫線から罫線まで。矢印なし)に縮め、バーの中に開始時刻(`12:00開始`)を書く(startLabel)。
 */
export function startDayBars(bars: BarSpan[]): BarSpan[] {
  return bars
    .filter((b) => !b.clippedLeft)
    .map((b) =>
      !b.openEnded && !b.clippedRight && b.to <= b.from + 1
        ? b
        : { ...b, to: b.from, startFrac: 0, endFrac: 1, clippedRight: false, openEnded: false, startLabel: `${b.event.start.slice(11, 16)}開始` },
    );
}
