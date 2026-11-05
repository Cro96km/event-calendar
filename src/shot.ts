// 撮影モード(Discord 用の画像。URL パラメータ ?shot=…&date=…)。純関数(DOMなし)。docs/spec.md §4.12
import config from '../config/display/discord.json';
import { SECTIONS } from './sections';
import type { BarSpan } from './week';

/** 撮影の種類。summary=概要(絞り込みあり)、他はそのセクションだけ(絞り込みなし)。 */
export const SHOT_KINDS = ['summary', 'quest', 'campaign', 'gacha'] as const;
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
  hide_groups: Record<string, string[]>;
  hide_keywords: string[];
  only_keywords: string[];
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
    if (!isStrs(v)) p.push(`summary.${key} は文字列の配列`);
    else if (v.some((x) => x.trim() === '')) p.push(`summary.${key}: 空の語があります`);
  }
  if (typeof cfg.hide_groups !== 'object' || cfg.hide_groups === null || Array.isArray(cfg.hide_groups)) p.push('summary.hide_groups はオブジェクト(セクションid → 小見出しの配列)');
  else {
    for (const [sec, names] of Object.entries(cfg.hide_groups)) {
      if (!sectionIds.includes(sec)) p.push(`summary.hide_groups: 「${sec}」は order.json にないセクションです`);
      else if (!isStrs(names)) p.push(`summary.hide_groups.${sec} は小見出しの名前の配列`);
      else {
        const known = groupNames(sec);
        for (const n of names) if (known.length > 0 && !known.includes(n)) p.push(`summary.hide_groups.${sec}: 「${n}」は order.json の小見出しにありません(${known.join(' / ')})`);
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
 * 順: 小見出しで外す → 語で外す → only_keywords で残す → 行数で切る。
 */
export function filterSummaryRows(sectionId: string, rows: BarSpan[][], groupOf: (e: BarSpan['event']) => string | null, cfg: SummaryConfig = SUMMARY): BarSpan[][] {
  const hideGroups = cfg.hide_groups[sectionId] ?? [];
  const out = rows.filter((bars) => {
    const e = (bars[0] as BarSpan).event;
    const g = groupOf(e);
    if (g !== null && hideGroups.includes(g)) return false;
    if (cfg.hide_keywords.some((k) => e.name.includes(k))) return false;
    if (cfg.only_keywords.length > 0 && !cfg.only_keywords.some((k) => e.name.includes(k))) return false;
    return true;
  });
  const max = cfg.max_rows[sectionId];
  return max === undefined ? out : out.slice(0, max);
}

/** 4:00(ゲーム日の境目。03:59 も含む)で終わるバーは、列の 1/6 しかなく端の矢印が入らない。撮影モードだけ、右端をこの割合まで伸ばす。 */
export const SHOT_MIN_END_FRAC = 0.4;
export function shotEndFrac(endFrac: number): number {
  const fourAm = 4 / 24;
  return endFrac > fourAm - 2 / 1440 && endFrac <= fourAm + 1e-9 ? SHOT_MIN_END_FRAC : endFrac;
}
