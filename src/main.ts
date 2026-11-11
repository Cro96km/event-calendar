import '@fontsource-variable/noto-sans-jp/wght.css'; // 画面も Discord の画像も同じ字形にするため、フォントを同梱する(docs/spec.md §4.3)
import type { ExportEvent, IndexFile, MonthFile } from './data/export';
import { initialState, render } from './ui';
import { todayJstDay } from './gameday';
import { applySelection, type SelectionJson } from './selection';
import { mergeEvents } from './week';
import { applyManual } from './manual';
import { applyOverrides } from './overrides';
import { MONTHLY } from './monthly';
import { parseShot } from './shot';
import { applyTheme, loadTheme } from './theme';
import './style.css';

async function load(): Promise<{ index: IndexFile; events: ExportEvent[]; selection: SelectionJson | null }> {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return (await res.json()) as T;
  };
  const index = await get<IndexFile>('data/index.json');
  const months = await Promise.all(index.months.map((m) => get<MonthFile>(`data/events/${m}.json`)));
  // 表示の判断(public/data/selection.json。判断の記憶とルールから作る)。無い(404/JSONでない応答)ときは全件表示(spec §4.5)。
  // 公開ビルドの data/ には selection.json が無い(絞り込み済み)ので、開発時(DEV)だけ取りに行く(本番で404を出さない)
  const selection = import.meta.env.DEV ? await get<SelectionJson>('data/selection.json').catch(() => null) : null;
  return { index, events: mergeEvents(months.map((m) => m.events)), selection };
}

// 画面の色(ライト/ダーク)。撮影モードは常にライト。読み込み前に適用して、色のちらつきを防ぐ
const shotParams = parseShot(location.search);
applyTheme(shotParams ? shotParams.theme : loadTheme()); // 撮影モードは URL の theme(既定ライト)。localStorage は使わない

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  root.textContent = '読み込み中…';
  load()
    .then(({ index, events, selection }) => {
      // 撮影モード(?shot=…&date=…。Discord 用の画像)。基準日を固定でき、畳み状態(localStorage)は使わない
      const shot = parseShot(location.search);
      const state = initialState(shot?.date ?? todayJstDay(), applyManual(applyOverrides(applySelection(events, selection))), index, MONTHLY);
      if (shot) {
        state.shot = shot.kind;
        state.collapsed = new Set();
      }
      render(root, state);
    })
    .catch((e: unknown) => {
      root.textContent = `データを読み込めません。\`npm run collect\` の後 \`npm run dev\` で開いてください (${String(e)})`;
    });
}
