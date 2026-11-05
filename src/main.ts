import type { ExportEvent, IndexFile, MonthFile } from './data/export';
import { initialState, render, type AppState } from './ui';
import { todayJstDay } from './gameday';
import { applySelection, type SelectionJson } from './selection';
import { mergeEvents, mergeSameLabel } from './week';
import { applyManual } from './manual';
import { applyOverrides } from './overrides';
import { MONTHLY } from './monthly';
import './style.css';

async function load(): Promise<{ index: IndexFile; events: ExportEvent[]; selection: SelectionJson | null }> {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return (await res.json()) as T;
  };
  const index = await get<IndexFile>('data/index.json');
  const months = await Promise.all(index.months.map((m) => get<MonthFile>(`data/events/${m}.json`)));
  // 表示の判断(public/data/selection.json。判断の記憶とルールから作る)。無い(404/JSONでない応答)ときは全件表示(spec §4.5)
  const selection = await get<SelectionJson>('data/selection.json').catch(() => null);
  return { index, events: mergeEvents(months.map((m) => m.events)), selection };
}

/** 開発サーバの `POST /api/collect`(scripts/collect-api.ts)で収集→再読込。本番ビルドには無いのでボタンも出さない */
async function refreshData(state: AppState): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/collect', { method: 'POST', headers: { 'X-Requested-With': 'update-button' } });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; log?: string; error?: string } | null;
  if (!body) return { ok: false, message: `更新に失敗しました: 更新APIに接続できません (${res.status})` };
  if (!res.ok || !body.ok) return { ok: false, message: `更新に失敗しました: ${body.error ?? body.log ?? res.status}` };
  const { index, events, selection } = await load();
  state.events = mergeSameLabel(applyManual(applyOverrides(applySelection(events, selection))));
  state.generatedAt = index.generated_at;
  return { ok: true, message: '更新しました' };
}

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  root.textContent = '読み込み中…';
  load()
    .then(({ index, events, selection }) => {
      const state = initialState(todayJstDay(), applyManual(applyOverrides(applySelection(events, selection))), index, MONTHLY);
      if (import.meta.env.DEV) state.refresh = () => refreshData(state);
      render(root, state);
    })
    .catch((e: unknown) => {
      root.textContent = `データを読み込めません。\`npm run collect\` の後 \`npm run dev\` で開いてください (${String(e)})`;
    });
}
