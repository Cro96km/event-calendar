// 手動で指定する色の書式(overrides.json・manual.json の color / edge_color)。純関数(DOMなし)。spec §4.7
import cfg from "../config/display/quest-colors.json";

const PALETTE = cfg.palette as Record<string, string>;

/** 色なしに戻す指定(公式・自動の色を消す)。 */
export const COLOR_NONE = "none";

/** 指定できる色名(palette: red / blue / green / yellow / purple)。 */
export const COLOR_NAMES: string[] = Object.keys(PALETTE);

/** 書式が正しいか: `#rrggbb`・palette の色名・`none`。 */
export const validColorSpec = (s: string): boolean =>
  /^#[0-9a-f]{6}$/i.test(s) || s === COLOR_NONE || Object.hasOwn(PALETTE, s);

/** 指定を `#rrggbb` にする。`none` は空文字(色なし。自動の色付けも止める)。書式が不正なら undefined。 */
export function resolveColorSpec(s: string): string | undefined {
  if (s === COLOR_NONE) return "";
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  return Object.hasOwn(PALETTE, s) ? PALETTE[s] : undefined;
}

export const COLOR_SPEC_HELP = `${COLOR_NAMES.join(" / ")} / #rrggbb / ${COLOR_NONE}`;
