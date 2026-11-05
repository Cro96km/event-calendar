// 公開用export: 選択状態で非表示の項目と、直近12ヶ月より前に終わった項目を除く。spec §5.2。
import { applySelection, type SelectionJson } from '../selection';
import { jstDay, PAST_MONTHS, windowRange } from '../window';
import type { ExportEvent, IndexFile, MonthFile } from './export';

/** 公開する期間(過去の月数。config/display/window.json)。 */
export const PUBLIC_MONTHS = PAST_MONTHS;

/** now(ms)のJST日付から過去の限界の日(YYYY-MM-DD)。 */
export function publicCutoff(nowMs: number): string {
  return windowRange(jstDay(nowMs)).from;
}

/** now(ms)のJST日付から未来の限界の日(YYYY-MM-DD)。これより後に始まる項目は公開しない。 */
export function publicLimit(nowMs: number): string {
  return windowRange(jstDay(nowMs)).to;
}

/**
 * 公開用の月別JSONとindexを作る。選択情報が無いと未判断の項目まで公開してしまうため、null は投げる。
 * 終了(未定は開始)が cutoff 以降で、開始が未来の限界(その日の終わり)までのイベントだけを残し、範囲外の月ファイルは出さない。
 */
export function buildPublic(months: MonthFile[], index: IndexFile, selection: SelectionJson | null, nowMs: number): { months: MonthFile[]; index: IndexFile } {
  if (selection === null) throw new Error('選択情報(selection.json)がありません。公開用exportには必須です。先に npm run candidates を実行してください。');
  const cutoff = publicCutoff(nowMs);
  const cutoffMs = Date.parse(`${cutoff}T00:00:00+09:00`);
  const limitMs = Date.parse(`${publicLimit(nowMs)}T23:59:59+09:00`);
  const keep = (e: ExportEvent): boolean => Date.parse(e.end ?? e.start) >= cutoffMs && Date.parse(e.start) <= limitMs;
  const out = months
    .filter((m) => m.month >= cutoff.slice(0, 7) && m.month <= publicLimit(nowMs).slice(0, 7))
    .map((m) => ({ month: m.month, events: applySelection(m.events, selection).filter(keep) }))
    .filter((m) => m.events.length > 0);
  const categories = new Set(out.flatMap((m) => m.events.map((e) => e.category)));
  return { months: out, index: { generated_at: index.generated_at, months: out.map((m) => m.month), categories: [...categories].sort() } };
}
