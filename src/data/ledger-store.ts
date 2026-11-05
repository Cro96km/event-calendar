// 台帳(config/judge/calendar/YYYY/MM.md)の書き出し。表示用データ(public/data)と、表示の判断・修正・手動の調整から作る。
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { howText, verdictText, type Judged } from '../decisions';
import { renderLedger, type HiddenItem } from '../ledger';
import { applyManual } from '../manual';
import { applyOverrides } from '../overrides';
import { applySelection, normalizeTitle, type SelectionJson } from '../selection';
import { MAINTENANCE_CATEGORY, sectionOf } from '../sections';
import { mergeEvents } from '../week';
import { jstDay } from '../window';
import type { ExportEvent, IndexFile, MonthFile } from './export';

/** 台帳を作り直す(毎回。範囲外になった月のファイルは消える)。書いたファイル数を返す。judged=全候補の判定(判定・理由の列に使う)。 */
export async function writeLedger(publicDir: string, outDir: string, generatedAt: string, judged: readonly Judged[]): Promise<number> {
  const readJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
  const index = await readJson<IndexFile>(join(publicDir, 'index.json'));
  const months = await Promise.all(index.months.map((m) => readJson<MonthFile>(join(publicDir, 'events', `${m}.json`))));
  const selection = await readJson<SelectionJson>(join(publicDir, 'selection.json')).catch(() => null);
  const byKey = new Map(judged.map((j) => [j.cand.key, j] as const));
  const keyOf = (e: ExportEvent): string => e.item ?? normalizeTitle(e.title);

  const all = applyOverrides(mergeEvents(months.map((m) => m.events)));
  const selected = applySelection(all, selection);
  const selectedIds = new Set(selected.map((e) => e.id));
  const events = applyManual(selected);
  const shownIds = new Set(events.map((e) => e.id));

  // 表示されない項目: 選択で外れたもの(判定は判断の記憶・ルール)と、manual.json の hide で外れたもの
  const hidden: HiddenItem[] = [];
  for (const e of all) {
    if (e.category === MAINTENANCE_CATEGORY || sectionOf(e.category) === null) continue;
    if (!selectedIds.has(e.id)) {
      const j = byKey.get(keyOf(e));
      hidden.push({ event: e, verdict: j ? (verdictText(j) === '要判断' ? '要判断' : '非表示') : '非表示', reason: j ? howText(j) : '未判断' });
    } else if (!shownIds.has(e.id)) hidden.push({ event: e, verdict: '非表示', reason: 'manual.json の hide' });
  }
  const reasonOf = (e: ExportEvent): string => {
    const j = byKey.get(keyOf(e));
    return j ? howText(j) : '';
  };
  const nowMs = Date.parse(generatedAt);
  const files = renderLedger(events, jstDay(Number.isNaN(nowMs) ? Date.now() : nowMs), { hidden, reasonOf });
  await rm(outDir, { recursive: true, force: true });
  for (const [month, text] of files) {
    const file = join(outDir, month.slice(0, 4), `${month.slice(5, 7)}.md`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return files.size;
}
