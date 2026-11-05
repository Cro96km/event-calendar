// カレンダーの表示範囲(config/display/window.json)。今日を基準に、過去・未来それぞれ N か月。純関数(DOMなし)。
import config from '../config/display/window.json';
import { JST_OFFSET_MS } from './jst';

export const PAST_MONTHS: number = config.past_months;
export const FUTURE_MONTHS: number = config.future_months;

/** 日付(YYYY-MM-DD)に n か月足す。存在しない日(3/31 の1か月前など)は月末日。 */
export function addMonths(day: string, n: number): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(Number(day.slice(8, 10)), last))).toISOString().slice(0, 10);
}

/** now(ms)のJST日付(YYYY-MM-DD)。 */
export const jstDay = (nowMs: number): string => new Date(nowMs + JST_OFFSET_MS).toISOString().slice(0, 10);

/** 表示範囲 [from, to](YYYY-MM-DD)。from=過去の限界の日、to=未来の限界の日。 */
export function windowRange(today: string, past: number = PAST_MONTHS, future: number = FUTURE_MONTHS): { from: string; to: string } {
  return { from: addMonths(today, -past), to: addMonths(today, future) };
}

/** day を表示範囲の中に収める(カレンダーの移動の限界)。 */
export function clampToWindow(day: string, today: string): string {
  const { from, to } = windowRange(today);
  return day < from ? from : day > to ? to : day;
}
