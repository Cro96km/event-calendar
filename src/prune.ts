// 不要データの削除の対象(DOMなし・純関数)。表示範囲(config/display/window.json)の過去の限界より前に終わった記事。
import type { ArticleRecord } from './data/record';

/** 記事の最後の日(YYYY-MM-DD)。項目があれば最も遅い終了(未定は開始)、無ければ公開日。 */
export function lastDay(r: ArticleRecord): string {
  const days = r.events.map((e) => (e.end ?? e.start).slice(0, 10));
  return days.length > 0 ? days.reduce((a, b) => (a > b ? a : b)) : r.published;
}

/** cutoff(YYYY-MM-DD)より前に終わった記事。範囲の中(cutoff 以降まで続くもの)は含めない。 */
export function pruneTargets(records: readonly ArticleRecord[], cutoff: string): ArticleRecord[] {
  return records.filter((r) => lastDay(r) < cutoff);
}
