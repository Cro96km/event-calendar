// 公開用export: 選択状態で非表示の項目と、直近12ヶ月より前に終わった項目を除く。spec §5.2。
import { applySelection, type SelectionJson } from '../selection';
import { JST_OFFSET_MS } from '../jst';
import type { ExportEvent, IndexFile, MonthFile } from './export';

/** 公開する期間(月数)。 */
export const PUBLIC_MONTHS = 12;

/** now(ms)のJST日付から PUBLIC_MONTHS ヶ月前の日(YYYY-MM-DD)。 */
export function publicCutoff(nowMs: number): string {
  const d = new Date(nowMs + JST_OFFSET_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - PUBLIC_MONTHS, d.getUTCDate())).toISOString().slice(0, 10);
}

/**
 * 公開用の月別JSONとindexを作る。選択情報が無いと未判断の項目まで公開してしまうため、null は投げる。
 * 終了(未定は開始)が cutoff 以降のイベントだけを残し、cutoff の月より前の月ファイルは出さない。
 */
export function buildPublic(months: MonthFile[], index: IndexFile, selection: SelectionJson | null, nowMs: number): { months: MonthFile[]; index: IndexFile } {
  if (selection === null) throw new Error('選択情報(selection.json)がありません。公開用exportには必須です。先に npm run candidates を実行してください。');
  const cutoff = publicCutoff(nowMs);
  const cutoffMs = Date.parse(`${cutoff}T00:00:00+09:00`);
  const keep = (e: ExportEvent): boolean => Date.parse(e.end ?? e.start) >= cutoffMs;
  const out = months
    .filter((m) => m.month >= cutoff.slice(0, 7))
    .map((m) => ({ month: m.month, events: applySelection(m.events, selection).filter(keep) }))
    .filter((m) => m.events.length > 0);
  const categories = new Set(out.flatMap((m) => m.events.map((e) => e.category)));
  return { months: out, index: { generated_at: index.generated_at, months: out.map((m) => m.month), categories: [...categories].sort() } };
}
