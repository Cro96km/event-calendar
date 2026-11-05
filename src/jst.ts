// JST(UTC+9)と曜日の共通定数。日付計算はブラウザのローカルTZに依存させない(spec §3)。
export const HOUR_MS = 3_600_000;
export const JST_OFFSET_MS = 9 * HOUR_MS;
/** 画面表示の `M/D`(年付き `2026/1/1` も)を `MM/DD` に0埋めする。数字に挟まれた `/`(100/200)は変えない。 */
export function padMonthDay(s: string): string {
  return s.replace(/(?<![\d/])((?:\d{4}\/)?)(\d{1,2})\/(\d{1,2})(?![\d/])/g, (_, y: string, m: string, d: string) => `${y}${m.padStart(2, '0')}/${d.padStart(2, '0')}`);
}

/** 画面表示の `H:MM` を `HH:MM` に0埋めする。数字・コロンに挟まれたもの(1:2:3)は変えない。 */
export function padTime(s: string): string {
  return s.replace(/(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/g, (_, h: string, m: string) => `${h.padStart(2, '0')}:${m}`);
}

/** 日付と時刻を続けて0埋めする(`9/27 0:00〜10/6 8:05` → `09/27 00:00〜10/06 08:05`)。 */
export const padDateTime = (s: string): string => padTime(padMonthDay(s));

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;
