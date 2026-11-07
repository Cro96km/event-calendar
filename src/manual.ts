// 手動の調整(config/schedule/manual.json)。add=公式ニュースに無い項目を足す / hide=表示から外す。純関数。docs/operations.md §14
import config from '../config/schedule/manual.json';
import type { ExportEvent } from './data/export';
import { CAMPAIGN_GROUPS, QUEST_GROUPS } from './sections';
import { COLOR_SPEC_HELP, resolveColorSpec, validColorSpec } from './color-spec';

export type ManualCategory = 'event' | 'campaign';

export interface ManualAdd {
  name: string;
  category: ManualCategory;
  /** JST の "YYYY-MM-DD HH:MM" */
  start: string;
  end: string;
  group?: string;
  /** true なら期間の開始/終了を表示しない(両方 true なら期間の行ごと出さない)。仮置きの期間の常設クエスト用 */
  hide_start?: boolean;
  hide_end?: boolean;
  /** ラベルの文字の色(palette の色名・`#rrggbb`)。バーの縁も同じ色(edge_color で別にできる) */
  color?: string;
  /** バーの縁の色(同じ書式。省略時は color と同じ) */
  edge_color?: string;
  note?: string;
}

export interface ManualHide {
  /** 項目ID(例 20261030_3#0)または記事ID(例 20261030_3。その記事の全項目) */
  id: string;
  note?: string;
}

export interface ManualConfig {
  add: ManualAdd[];
  hide: ManualHide[];
}

export const MANUAL: ManualConfig = { add: config.add as ManualAdd[], hide: config.hide as ManualHide[] };

const TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/** "YYYY-MM-DD HH:MM"(JST)が実在する日時か。 */
function validTime(s: string): boolean {
  const m = TIME.exec(s);
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && h < 24 && mi < 60;
}

const iso = (s: string): string => `${s.replace(' ', 'T')}:00+09:00`;

/** add の項目を、公式由来の項目と同じ形(ExportEvent)にする。 */
export function manualEvents(add: readonly ManualAdd[] = MANUAL.add): ExportEvent[] {
  return add.map((a) => {
    const color = a.color === undefined ? undefined : resolveColorSpec(a.color);
    const edge = a.edge_color === undefined ? color : resolveColorSpec(a.edge_color);
    return {
      id: `manual:${a.name}:${a.start}`,
      article_id: 'manual',
      name: a.name,
      title: a.name,
      category: a.category,
      start: iso(a.start),
      end: iso(a.end),
      reward_until: null,
      url: '',
      item: `manual:${a.name}`,
      ...(a.group !== undefined ? { group: a.group } : {}),
      ...(a.hide_start ? { hide_start: true as const } : {}),
      ...(a.hide_end ? { hide_end: true as const } : {}),
      ...(color ? { color } : {}),
      ...(edge ? { edge_color: edge } : {}),
    };
  });
}

/** hide の項目(または記事)を外し、add の項目を足す。表示の選択(selection)のあとに適用する。 */
export function applyManual(events: ExportEvent[], cfg: ManualConfig = MANUAL): ExportEvent[] {
  const hidden = new Set(cfg.hide.map((h) => h.id));
  return [...events.filter((e) => !hidden.has(e.id) && !hidden.has(e.article_id)), ...manualEvents(cfg.add)];
}

/** 設定の誤り(矛盾)。unknown は、存在しない項目ID/記事ID(書き間違いの疑い。knownIds を渡したときだけ)。 */
export function manualProblems(cfg: ManualConfig, knownIds?: ReadonlySet<string>): { problems: string[]; unknown: string[] } {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const a of cfg.add) {
    const where = `add「${a.name}」`;
    if (a.name.trim() === '') problems.push('add の name が空です');
    if (a.category !== 'event' && a.category !== 'campaign') problems.push(`${where}: category は event か campaign: ${String(a.category)}`);
    if (!validTime(a.start)) problems.push(`${where}: start は実在する "YYYY-MM-DD HH:MM": ${a.start}`);
    if (!validTime(a.end)) problems.push(`${where}: end は実在する "YYYY-MM-DD HH:MM": ${a.end}`);
    if (validTime(a.start) && validTime(a.end) && a.start >= a.end) problems.push(`${where}: end は start より後にしてください`);
    const groups: readonly string[] = a.category === 'campaign' ? CAMPAIGN_GROUPS : QUEST_GROUPS;
    if (a.group !== undefined && !groups.includes(a.group)) problems.push(`${where}: group「${a.group}」は ${groups.join(' / ')} のいずれか`);
    for (const k of ['hide_start', 'hide_end'] as const) if (a[k] !== undefined && typeof a[k] !== 'boolean') problems.push(`${where}: ${k} は true か false`);
    for (const k of ['color', 'edge_color'] as const) if (a[k] !== undefined && !validColorSpec(a[k])) problems.push(`${where}: ${k} は ${COLOR_SPEC_HELP} のいずれか: ${a[k]}`);
    const key = `${a.name}\u0000${a.start}`;
    if (seen.has(key)) problems.push(`${where}: 同じ name と start の項目が重複しています`);
    seen.add(key);
  }
  const hid = new Set<string>();
  const unknown: string[] = [];
  for (const h of cfg.hide) {
    if (h.id.trim() === '') problems.push('hide の id が空です');
    if (hid.has(h.id)) problems.push(`hide「${h.id}」が重複しています`);
    hid.add(h.id);
    if (knownIds && !knownIds.has(h.id)) unknown.push(h.id);
  }
  return { problems, unknown };
}

/** 編集(CLI・Actions用)。cfg は変更せず新しい設定を返す。誤りがあれば投げる。 */
export function addEntry(cfg: ManualConfig, a: ManualAdd): ManualConfig {
  const next = { ...cfg, add: [...cfg.add.filter((x) => !(x.name === a.name && x.start === a.start)), a] };
  const { problems } = manualProblems(next);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return next;
}

export function removeEntry(cfg: ManualConfig, name: string): ManualConfig {
  if (!cfg.add.some((x) => x.name === name)) throw new Error(`add に「${name}」はありません`);
  return { ...cfg, add: cfg.add.filter((x) => x.name !== name) };
}

export function hideEntry(cfg: ManualConfig, h: ManualHide): ManualConfig {
  const next = { ...cfg, hide: [...cfg.hide.filter((x) => x.id !== h.id), h] };
  const { problems } = manualProblems(next);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return next;
}

export function unhideEntry(cfg: ManualConfig, id: string): ManualConfig {
  if (!cfg.hide.some((x) => x.id === id)) throw new Error(`hide に「${id}」はありません`);
  return { ...cfg, hide: cfg.hide.filter((x) => x.id !== id) };
}
