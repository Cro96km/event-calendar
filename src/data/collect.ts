// collect: scrape → 正本JSON → export。部分成功を保存し runs.log に記録。spec §4.1, §5, §6。
import { toJst, buildRecord } from './record';
import { appendRunLog, readAllRecords, readRecord, writeExport, writeRecord } from './store';
import type { RawCache } from '../scraper/cache';
import type { Fetcher } from '../scraper/http';
import { articlePath, scrape } from '../scraper/scrape';

export interface CollectOptions {
  fetcher: Fetcher;
  cache: RawCache;
  pages: number;
  since?: string;
  articlesDir: string;
  publicDir: string;
  runsLog: string;
  now?: () => Date;
  log?: (msg: string) => void;
}

export interface CollectSummary {
  items: number;
  fetched: number;
  written: number;
  /** 今回処理した記事の内訳 */
  run: Record<'ok' | 'partial' | 'none', number>;
  /** 正本全体の内訳 */
  total: Record<'ok' | 'partial' | 'none', number>;
  months: string[];
  aborted: string | null;
}

const tally = (rows: { parse_status: 'ok' | 'partial' | 'none' }[]): Record<'ok' | 'partial' | 'none', number> => ({
  ok: rows.filter((r) => r.parse_status === 'ok').length,
  partial: rows.filter((r) => r.parse_status === 'partial').length,
  none: rows.filter((r) => r.parse_status === 'none').length,
});

export async function collect(o: CollectOptions): Promise<CollectSummary> {
  const now = o.now ?? (() => new Date());
  const log = o.log ?? (() => {});
  const res = await scrape({ fetcher: o.fetcher, cache: o.cache, pages: o.pages, since: o.since, log });

  const processed = [];
  let written = 0;
  for (const item of res.items) {
    const html = await o.cache.read(articlePath(item.id));
    const at = await o.cache.fetchedAt(articlePath(item.id));
    if (html === null || at === null) continue; // 404/robots禁止で未取得
    const prev = await readRecord(o.articlesDir, item.id);
    const rec = buildRecord({ item, html, fetchedAtMs: at, lastmod: res.lastmod.get(item.id), prev });
    if (await writeRecord(o.articlesDir, rec, prev)) written++;
    processed.push(rec);
  }

  const all = await readAllRecords(o.articlesDir);
  const months = await writeExport(o.publicDir, all, toJst(now().getTime()));
  const aborted = res.error ? `${res.error.constructor.name}: ${res.error.message}` : null;
  const summary: CollectSummary = {
    items: res.items.length,
    fetched: res.fetched.length,
    written,
    run: tally(processed),
    total: tally(all),
    months,
    aborted,
  };
  await appendRunLog(o.runsLog, { at: toJst(now().getTime()), pages: o.pages, since: o.since ?? null, ...summary, notFound: res.notFound });
  return summary;
}

/** キャッシュ済み生HTMLから正本を再生成する(再取得なし。パーサ変更後用)。変わった記事のみ書き、exportも更新する。 */
export async function rebuild(o: Pick<CollectOptions, 'cache' | 'articlesDir' | 'publicDir' | 'now'>): Promise<{ records: number; written: number }> {
  const now = o.now ?? (() => new Date());
  let written = 0;
  const prevs = await readAllRecords(o.articlesDir);
  for (const prev of prevs) {
    const html = await o.cache.read(articlePath(prev.id));
    const at = await o.cache.fetchedAt(articlePath(prev.id));
    if (html === null || at === null) continue;
    const item = { id: prev.id, url: prev.url, title: prev.title, categories: prev.categories, published: prev.published, addendum: false };
    const rec = buildRecord({ item, html, fetchedAtMs: at, prev });
    if (await writeRecord(o.articlesDir, rec, prev)) written++;
  }
  await writeExport(o.publicDir, await readAllRecords(o.articlesDir), toJst(now().getTime()));
  return { records: prevs.length, written };
}
