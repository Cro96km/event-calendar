// 項目ごとの手動の修正(config/schedule/overrides.json)。純関数。spec §4.11 / docs/operations.md §17
import config from '../config/schedule/overrides.json';
import type { DetailBlock } from './details';
import type { ExportEvent } from './data/export';
import { SECTIONS, CAMPAIGN_GROUPS, QUEST_GROUPS } from './sections';

export interface OverrideSet {
  name?: string;
  start?: string;
  end?: string;
  group?: string;
  section?: string;
  notes?: string[];
  hide_blocks?: string[];
  add_blocks?: { label: string; lines: string[] }[];
}

/** 直す前の公式の値(食い違いの検知用)。 */
export interface OverrideWas {
  name?: string;
  start?: string;
  end?: string;
}

export interface OverrideItem {
  id: string;
  set: OverrideSet;
  was?: OverrideWas;
  note?: string;
}

export interface OverridesConfig {
  items: OverrideItem[];
}

export const OVERRIDES: OverridesConfig = { items: config.items as OverrideItem[] };

const TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
function validTime(s: string): boolean {
  const m = TIME.exec(s);
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && h < 24 && mi < 60;
}
const iso = (s: string): string => `${s.replace(' ', 'T')}:00+09:00`;
/** ISO(+09:00) → "YYYY-MM-DD HH:MM"(JST)。 */
export const jstText = (isoTime: string): string => new Date(Date.parse(isoTime) + 9 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');

/** 公式の値(name・start・end)。 */
export interface OfficialValue {
  name: string;
  start: string;
  end: string | null;
}

/** 修正を適用する(選択のあと・手動の調整〈manual〉の前)。id が一致する項目だけを変え、元の配列は変えない。 */
export function applyOverrides(events: ExportEvent[], cfg: OverridesConfig = OVERRIDES): ExportEvent[] {
  if (cfg.items.length === 0) return events;
  const by = new Map(cfg.items.map((x) => [x.id, x.set]));
  return events.map((e) => {
    const s = by.get(e.id);
    if (!s) return e;
    const fields = Object.keys(s).filter((k) => (s as Record<string, unknown>)[k] !== undefined);
    const periodChanged = s.start !== undefined || s.end !== undefined;
    let details: DetailBlock[] = [...(e.details ?? [])];
    if (s.hide_blocks?.length) details = details.filter((b) => !s.hide_blocks?.includes(b.label));
    for (const a of s.add_blocks ?? []) details = [...details.filter((b) => b.label !== a.label), { label: a.label, lines: [...a.lines] }];
    const { slots, ...rest } = e;
    const next: ExportEvent = {
      ...rest,
      ...(s.name !== undefined ? { name: s.name } : {}),
      ...(s.start !== undefined ? { start: iso(s.start) } : {}),
      ...(s.end !== undefined ? { end: iso(s.end) } : {}),
      ...(s.group !== undefined ? { group: s.group } : {}),
      ...(s.section !== undefined ? { section: s.section } : {}),
      ...(slots && !periodChanged ? { slots } : {}),
      ...(details.length > 0 ? { details } : {}),
      fix: { fields, ...(s.notes?.length ? { notes: s.notes } : {}), ...(s.hide_blocks?.length ? { hide_blocks: s.hide_blocks } : {}) },
    };
    if (details.length === 0) delete next.details;
    return next;
  });
}

export interface OverrideProblems {
  /** 設定の誤り(要確認) */
  problems: string[];
  /** 存在しない項目ID(書き間違いか、範囲外に消えた) */
  unknown: string[];
  /** 公式の値が修正時(was)から変わった項目(修正の見直しの合図) */
  stale: string[];
  /** 修正した値が、今の公式の値と同じ(修正が不要になった) */
  redundant: string[];
}

/** 設定の点検。official を渡すと、存在確認と was との食い違いも見る(id → 公式の今の値)。 */
export function overrideProblems(cfg: OverridesConfig, official?: ReadonlyMap<string, OfficialValue>): OverrideProblems {
  const problems: string[] = [];
  const unknown: string[] = [];
  const stale: string[] = [];
  const redundant: string[] = [];
  const seen = new Set<string>();
  const sectionIds = SECTIONS.map((x) => x.id);
  for (const it of cfg.items) {
    const w = `overrides「${it.id}」`;
    if (it.id.trim() === '' || it.id.startsWith('manual:') || it.id.startsWith('monthly:')) problems.push(`${w}: id は公式の項目ID(manual・monthly は対象外。manual.json を直してください)`);
    if (seen.has(it.id)) problems.push(`${w}: 重複しています`);
    seen.add(it.id);
    const s = it.set;
    if (Object.keys(s).filter((k) => (s as Record<string, unknown>)[k] !== undefined).length === 0) problems.push(`${w}: set が空です`);
    if (s.name !== undefined && s.name.trim() === '') problems.push(`${w}: name が空です`);
    if (s.start !== undefined && !validTime(s.start)) problems.push(`${w}: start は実在する "YYYY-MM-DD HH:MM": ${s.start}`);
    if (s.end !== undefined && !validTime(s.end)) problems.push(`${w}: end は実在する "YYYY-MM-DD HH:MM": ${s.end}`);
    if (s.section !== undefined && !sectionIds.includes(s.section)) problems.push(`${w}: section は ${sectionIds.join(' / ')} のいずれか`);
    if (s.group !== undefined && ![...QUEST_GROUPS, ...CAMPAIGN_GROUPS].includes(s.group)) problems.push(`${w}: group「${s.group}」は ${[...QUEST_GROUPS, ...CAMPAIGN_GROUPS].join(' / ')} のいずれか`);
    for (const a of s.add_blocks ?? []) if (a.label.trim() === '' || a.lines.length === 0) problems.push(`${w}: add_blocks は label と lines(1行以上)が必要です`);
    const off = official?.get(it.id);
    if (official && !off) unknown.push(it.id);
    if (off) {
      const cur = { name: off.name, start: jstText(off.start), end: off.end === null ? null : jstText(off.end) };
      const was = it.was ?? {};
      for (const k of ['name', 'start', 'end'] as const) {
        if (was[k] !== undefined && was[k] !== cur[k]) stale.push(`${it.id}(${k}: 修正時 ${was[k]} → 今 ${cur[k] ?? '未定'})`);
        if (s[k] !== undefined && s[k] === cur[k]) redundant.push(`${it.id}(${k})`);
      }
    }
  }
  return { problems, unknown, stale, redundant };
}

/** 編集(CLI用)。cfg は変更せず新しい設定を返す。同じ id は置き換える。 */
export function setItem(cfg: OverridesConfig, item: OverrideItem): OverridesConfig {
  const next = { items: [...cfg.items.filter((x) => x.id !== item.id), item] };
  const { problems } = overrideProblems(next);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return next;
}

export function unsetItem(cfg: OverridesConfig, id: string): OverridesConfig {
  if (!cfg.items.some((x) => x.id === id)) throw new Error(`items に「${id}」はありません`);
  return { items: cfg.items.filter((x) => x.id !== id) };
}
