// 毎月決まった日の項目(config/schedule/monthly-days.json)を、表示範囲の月ぶん生成する。純関数。spec §4.3.4
import config from '../config/schedule/monthly-days.json';
import type { ExportEvent } from './data/export';

export interface MonthlyDef {
  name: string;
  category: string;
  days: number[];
  pin?: { top?: boolean; after?: string };
}

export const MONTHLY: readonly MonthlyDef[] = config.events;

/** その月に存在しない日(30日が無い2月など)は月末日で代用する。重複(10日が複数日にならない)は除く。 */
export function monthlyDays(month: string, days: readonly number[]): string[] {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return [...new Set(days.map((d) => Math.min(d, last)))].map((d) => `${month}-${String(d).padStart(2, '0')}`);
}

function addMonthStart(month: string): string {
  const t = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
}

/** first〜last(YYYY-MM-DD)に掛かる月の項目を生成する。各項目は暦日0:00〜23:59。 */
export function monthlyEvents(first: string, last: string, defs: readonly MonthlyDef[] = MONTHLY): ExportEvent[] {
  const out: ExportEvent[] = [];
  for (let m = first.slice(0, 7); m <= last.slice(0, 7); m = addMonthStart(m).slice(0, 7)) {
    for (const def of defs) {
      for (const day of monthlyDays(m, def.days)) {
        if (day < first || day > last) continue;
        out.push({
          id: `monthly:${def.name}:${day}`,
          article_id: 'monthly',
          name: def.name,
          title: def.name,
          category: def.category,
          start: `${day}T00:00:00+09:00`,
          end: `${day}T23:59:00+09:00`,
          reward_until: null,
          url: '',
          item: `monthly:${def.name}`,
        });
      }
    }
  }
  return out;
}
