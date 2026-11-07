// 画面の色(ライト/ダーク)の切替。既定はライト(OSの設定には合わせない)。選んだ色は localStorage に保存する。撮影モード(Discord の画像)は常にライト。
// ダークの配色は src/style.css の `:root[data-theme="dark"]`。docs/spec.md §4.3
export type Theme = 'light' | 'dark';
const KEY = 'theme';

/** 保存した色(無い・読めないときは light)。 */
export function loadTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** いまの画面の色。 */
export const currentTheme = (doc: Document = document): Theme => (doc.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/** 画面の色を変える(CSS は `data-theme="dark"` のときだけダーク)。 */
export function applyTheme(theme: Theme, doc: Document = document): void {
  if (theme === 'dark') doc.documentElement.dataset.theme = 'dark';
  else delete doc.documentElement.dataset.theme;
}

/** 選んだ色を保存する(保存できなくても動作する)。 */
export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* 保存できなくても動作する */
  }
}
