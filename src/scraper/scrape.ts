// 取得オーケストレーション: sitemap → 一覧(新しい順) → 必要な詳細のみ取得してキャッシュ。spec §4.1。
import type { RawCache } from './cache';
import { parseDisallow } from './robots';
import { BASE_URL, parseList, parseSitemap, type ListItem } from './list';
import { DisallowedError, type Fetcher } from './http';
import { parseDetail } from './detail';
import { parseArticle, type ParseStatus } from '../period';

export interface ScrapeOptions {
  fetcher: Fetcher;
  cache: RawCache;
  pages: number;
  /** YYYY-MM-DD。指定時は公開日がこれより古い記事に達するまで巡回する（pages は上限）。 */
  since?: string;
  log?: (msg: string) => void;
}

export interface ScrapeResult {
  items: ListItem[];
  fetched: string[];
  skipped: string[];
  notFound: string[];
  /** sitemap の lastmod (ISO8601, id → 値)。圏外の記事は含まれない */
  lastmod: Map<string, string>;
  /** 429/5xx/想定外エラーで中断した場合のエラー。ここまでの結果は有効（部分成功） */
  error?: Error;
}

export const articlePath = (id: string): string => `articles/${id}.html`;

export async function scrape(o: ScrapeOptions): Promise<ScrapeResult> {
  const result: ScrapeResult = { items: [], fetched: [], skipped: [], notFound: [], lastmod: new Map() };
  try {
    await run(o, result);
  } catch (e) {
    result.error = e instanceof Error ? e : new Error(String(e));
  }
  return result;
}

async function run({ fetcher, cache, pages, since, log = () => {} }: ScrapeOptions, result: ScrapeResult): Promise<void> {
  const robots = await fetcher.get(`${BASE_URL}/robots.txt`);
  if (robots.status === 'ok') fetcher.setDisallow(parseDisallow(robots.body));

  const sm = await fetcher.get(`${BASE_URL}/sitemap-news.xml`);
  const entries = sm.status === 'ok' ? parseSitemap(sm.body) : [];
  const lastmod = new Map(entries.map((e) => [e.id, Date.parse(e.lastmod)]));
  for (const e of entries) result.lastmod.set(e.id, e.lastmod);
  if (sm.status === 'ok') await cache.write('sitemap-news.xml', sm.body);

  const items = result.items;
  let path: string | null = '/news/';
  for (let n = 1; n <= pages && path; n++) {
    const res = await fetcher.get(`${BASE_URL}${path}`);
    if (res.status !== 'ok') {
      log(`一覧が取得できない(404): ${path}`);
      break;
    }
    await cache.write(`lists/${n}.html`, res.body);
    const page = parseList(res.body);
    items.push(...page.items.filter((i) => since === undefined || i.published >= since));
    if (since !== undefined && page.items.some((i) => i.published < since)) break;
    path = page.next;
  }

  for (const item of items) {
    const rel = articlePath(item.id);
    const at = await cache.fetchedAt(rel);
    const mod = lastmod.get(item.id);
    // 未取得、またはsitemapのlastmodがキャッシュより新しい場合のみ詳細を取得
    if (at !== null && !(mod !== undefined && mod > at)) {
      result.skipped.push(item.id);
      continue;
    }
    const res = await fetcher.get(item.url).catch((e: unknown) => {
      if (e instanceof DisallowedError) return null; // robots.txt で禁止: 取得せず続行
      throw e;
    });
    if (res === null) {
      log(`robots.txt で禁止: ${item.id}`);
      continue;
    }
    if (res.status === 'not_found') {
      log(`404 skip: ${item.id}`);
      result.notFound.push(item.id);
      continue;
    }
    await cache.write(rel, res.body);
    result.fetched.push(item.id);
  }
}

export interface ReparseEntry {
  id: string;
  parse_status: ParseStatus;
  events: number;
  warnings: string[];
}

/** キャッシュ済みHTMLを再取得なしで再解析する。 */
export async function reparse(cache: RawCache): Promise<ReparseEntry[]> {
  const out: ReparseEntry[] = [];
  for (const file of (await cache.list('articles')).sort().reverse()) {
    const id = file.replace(/\.html$/, '');
    const html = await cache.read(articlePath(id));
    const input = html ? parseDetail(id, html) : null;
    if (!input) {
      out.push({ id, parse_status: 'none', events: 0, warnings: ['詳細HTMLを解釈できない'] });
      continue;
    }
    const r = parseArticle(input);
    out.push({ id, parse_status: r.parse_status, events: r.events.length, warnings: r.warnings });
  }
  return out;
}
