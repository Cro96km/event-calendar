// 撮影モード(Discord 用の画像。URL パラメータ ?shot=…&date=…)。純関数(DOMなし)。docs/spec.md §4.12
import config from '../config/display/discord.json';
import { CHARACTER_KINDS } from './characters';
import { SECTIONS } from './sections';
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

/** 概要の絞り込み設定(config/display/discord.json の summary)。 */
export interface SummaryConfig {
  sections: string[];
  /** セクションid → 外す小見出し */
  hide_groups: Record<string, string[]>;
  /** セクションid → 項目名にこの語を含む行を外す */
  hide_keywords: Record<string, string[]>;
  /** セクションid → 空でなければ、項目名にこの語のどれかを含む行だけ残す */
  only_keywords: Record<string, string[]>;
  /** セクションid → 開催日だけ出す小見出し(その週に始まるものを、開始日の列だけに描く。それ以前に始まったものは出さない) */
  start_day_only: Record<string, string[]>;
  max_rows: Record<string, number>;
}
export const SUMMARY: SummaryConfig = config.summary as SummaryConfig;

/** 設定の誤り。sectionIds / groupNames は order.json 由来(テストで差し替えられる)。 */
export function shotConfigProblems(cfg: SummaryConfig = SUMMARY, sectionIds: readonly string[] = SECTIONS.map((s) => s.id), groupNames: (section: string) => readonly string[] = () => []): string[] {
  const p: string[] = [];
  const isStrs = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (!isStrs(cfg.sections) || cfg.sections.length === 0) p.push('summary.sections は1つ以上のセクションidの配列');
  else {
    for (const s of cfg.sections) if (!sectionIds.includes(s)) p.push(`summary.sections: 「${s}」は order.json にないセクションです(${sectionIds.join(' / ')})`);
    if (new Set(cfg.sections).size !== cfg.sections.length) p.push('summary.sections: セクションが重複しています');
  }
  for (const key of ['hide_keywords', 'only_keywords'] as const) {
    const v: unknown = cfg[key];
    if (typeof v !== 'object' || v === null || Array.isArray(v)) p.push(`summary.${key} はオブジェクト(セクションid → 語の配列)`);
    else {
      for (const [sec, words] of Object.entries(v)) {
        if (!sectionIds.includes(sec)) p.push(`summary.${key}: 「${sec}」は order.json にないセクションです`);
        else if (!isStrs(words)) p.push(`summary.${key}.${sec} は文字列の配列`);
        else if (words.some((x) => x.trim() === '')) p.push(`summary.${key}.${sec}: 空の語があります`);
      }
    }
  }
  for (const key of ['hide_groups', 'start_day_only'] as const) {
    const v: unknown = cfg[key];
    if (typeof v !== 'object' || v === null || Array.isArray(v)) p.push(`summary.${key} はオブジェクト(セクションid → 小見出しの配列)`);
    else {
      for (const [sec, names] of Object.entries(v)) {
        if (!sectionIds.includes(sec)) p.push(`summary.${key}: 「${sec}」は order.json にないセクションです`);
        else if (!isStrs(names)) p.push(`summary.${key}.${sec} は小見出しの名前の配列`);
        else {
          const known = groupNames(sec);
          for (const n of names) if (known.length > 0 && !known.includes(n)) p.push(`summary.${key}.${sec}: 「${n}」は order.json の小見出しにありません(${known.join(' / ')})`);
        }
      }
    }
  }
  if (typeof cfg.max_rows !== 'object' || cfg.max_rows === null || Array.isArray(cfg.max_rows)) p.push('summary.max_rows はオブジェクト(セクションid → 行数)');
  else {
    for (const [sec, n] of Object.entries(cfg.max_rows)) {
      if (!sectionIds.includes(sec)) p.push(`summary.max_rows: 「${sec}」は order.json にないセクションです`);
      if (!Number.isInteger(n) || n < 1) p.push(`summary.max_rows.${sec}: 1以上の整数`);
    }
  }
  return p;
}

/** 概要に出すセクションか。 */
export const summaryHasSection = (sectionId: string, cfg: SummaryConfig = SUMMARY): boolean => cfg.sections.includes(sectionId);

/**
 * 概要の絞り込み。rows=1セクションの行(上から順)。groupOf=行の小見出し(無ければ null)。
 * 順: 小見出しで外す → 語で外す → only_keywords で残す → 開催日だけ(start_day_only) → 行数で切る。
 * 語・小見出し・行数の指定は、すべてセクションごと。
 */
export function filterSummaryRows(sectionId: string, rows: BarSpan[][], groupOf: (e: BarSpan['event']) => string | null, cfg: SummaryConfig = SUMMARY): BarSpan[][] {
  const hideGroups = cfg.hide_groups[sectionId] ?? [];
  const hideWords = cfg.hide_keywords[sectionId] ?? [];
  const onlyWords = cfg.only_keywords[sectionId] ?? [];
  const dayOnly = cfg.start_day_only[sectionId] ?? [];
  const out: BarSpan[][] = [];
  for (const bars of rows) {
    const e = (bars[0] as BarSpan).event;
    const g = groupOf(e);
    if (g !== null && hideGroups.includes(g)) continue;
    if (hideWords.some((k) => e.name.includes(k))) continue;
    if (onlyWords.length > 0 && !onlyWords.some((k) => e.name.includes(k))) continue;
    if (g !== null && dayOnly.includes(g)) {
      const days = startDayBars(bars);
      if (days.length > 0) out.push(days);
      continue;
    }
    out.push(bars);
  }
  const max = cfg.max_rows[sectionId];
  return max === undefined ? out : out.slice(0, max);
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
