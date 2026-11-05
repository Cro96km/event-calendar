// ゲーム日: 4:00 JST 区切り。日Dは半開区間 [D 4:00, D+1 4:00)。spec §3。
import { HOUR_MS as HOUR, JST_OFFSET_MS as JST_OFFSET } from './jst';

const DAY = 24 * HOUR;
const DAY_START = 4 * HOUR;

function formatDay(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** 瞬間 → それが属するゲーム日 (YYYY-MM-DD, JST)。ブラウザのローカルTZは使わない。 */
export function gameDayOf(instant: Date): string {
  return formatDay(instant.getTime() + JST_OFFSET - DAY_START);
}

/** 「今日」のゲーム日。0:00〜3:59 は前日。now は注入可能。 */
export function todayGameDay(now: Date = new Date()): string {
  return gameDayOf(now);
}

/** 「今日」の暦日(JST 0:00切替)。カレンダーの列は暦日なので、週の起点・今日の強調はこれを使う。now は注入可能。 */
export function todayJstDay(now: Date = new Date()): string {
  return formatDay(now.getTime() + JST_OFFSET);
}

/** ゲーム日の範囲 [from, to) をエポックmsで返す。 */
function gameDayRange(day: string): { from: number; to: number } {
  const from = Date.parse(`${day}T00:00:00Z`) - JST_OFFSET + DAY_START;
  return { from, to: from + DAY };
}

/**
 * イベントをゲーム日に表示するか。
 * `start < D+1 4:00` かつ `end > D 4:00`。end=null(終了未定)は開始ゲーム日のみ。
 */
export function isOnGameDay(event: { start: string; end: string | null }, day: string): boolean {
  const { from, to } = gameDayRange(day);
  const start = Date.parse(event.start);
  if (event.end === null) return start >= from && start < to;
  return start < to && Date.parse(event.end) > from;
}
