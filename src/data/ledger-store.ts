// 台帳(config/judge/calendar/YYYY/MM.md)の書き出し。表示用データ(public/data)と選択・手動の調整から作る。
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { renderLedger } from '../ledger';
import { applyManual } from '../manual';
import { applySelection, type SelectionJson } from '../selection';
import { mergeEvents } from '../week';
import { jstDay } from '../window';
import type { IndexFile, MonthFile } from './export';

/** 台帳を作り直す(毎回。範囲外になった月のファイルは消える)。書いたファイル数を返す。 */
export async function writeLedger(publicDir: string, outDir: string, generatedAt: string): Promise<number> {
  const readJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
  const index = await readJson<IndexFile>(join(publicDir, 'index.json'));
  const months = await Promise.all(index.months.map((m) => readJson<MonthFile>(join(publicDir, 'events', `${m}.json`))));
  const selection = await readJson<SelectionJson>(join(publicDir, 'selection.json')).catch(() => null);
  const events = applyManual(applySelection(mergeEvents(months.map((m) => m.events)), selection));
  const nowMs = Date.parse(generatedAt);
  const files = renderLedger(events, jstDay(Number.isNaN(nowMs) ? Date.now() : nowMs));
  await rm(outDir, { recursive: true, force: true });
  for (const [month, text] of files) {
    const file = join(outDir, month.slice(0, 4), `${month.slice(5, 7)}.md`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return files.size;
}
