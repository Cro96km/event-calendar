// 正本JSON / export のファイルI/O。
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readTextIfExists } from '../read-text';
import { buildExport } from './export';
import type { ArticleRecord } from './record';

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, path);
};

const articlePath = (dir: string, id: string): string => join(dir, id.slice(0, 4), `${id}.json`);

export async function readRecord(dir: string, id: string): Promise<ArticleRecord | null> {
  const text = await readTextIfExists(articlePath(dir, id));
  return text === null ? null : (JSON.parse(text) as ArticleRecord);
}

/**
 * 内容が変わるときのみ書く。書いたら true。
 * 同一判定は参照比較: 内容不変なら `buildRecord` が `prev` 自体を返す契約に依存する(record.ts)。
 */
export async function writeRecord(dir: string, rec: ArticleRecord, prev: ArticleRecord | null): Promise<boolean> {
  if (prev === rec) return false;
  await writeJson(articlePath(dir, rec.id), rec);
  return true;
}

export async function readAllRecords(dir: string): Promise<ArticleRecord[]> {
  const out: ArticleRecord[] = [];
  for (const year of await readdir(dir).catch(() => [])) {
    for (const f of await readdir(join(dir, year)).catch(() => [])) {
      if (f.endsWith('.json')) out.push(JSON.parse(await readFile(join(dir, year, f), 'utf8')) as ArticleRecord);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** public/data/events/YYYY-MM.json と public/data/index.json を再生成（古い月ファイルは削除）。 */
export async function writeExport(publicDir: string, records: ArticleRecord[], generatedAt: string): Promise<string[]> {
  const { months, index } = buildExport(records, generatedAt);
  const eventsDir = join(publicDir, 'events');
  const keep = new Set(months.map((m) => `${m.month}.json`));
  // 正本が空(パス違い・読込失敗等)のときは既存exportを消さない
  for (const f of records.length ? await readdir(eventsDir).catch(() => []) : []) {
    if (f.endsWith('.json') && !keep.has(f)) await rm(join(eventsDir, f));
  }
  for (const m of months) await writeJson(join(eventsDir, `${m.month}.json`), m);
  await writeJson(join(publicDir, 'index.json'), index);
  return index.months;
}

export async function appendRunLog(path: string, entry: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(entry)}\n`);
}
