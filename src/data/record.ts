// 正本JSON（記事1件1ファイル）の型と生成。spec §5.1。本文・画像は保存しない。
import { createHash } from 'node:crypto';
import { parseDetail } from '../scraper/detail';
import type { ListItem } from '../scraper/list';
import { parseArticle, type ParseStatus, type PeriodEvent } from '../period';
import { JST_OFFSET_MS } from '../jst';
import { gachaPeriod, parseCharacters, type CharacterEntry } from '../characters';

export interface ArticleRecord {
  id: string;
  url: string;
  title: string;
  category: string;
  categories: string[];
  published: string;
  fetched_at: string;
  lastmod: string | null;
  content_hash: string;
  parse_status: ParseStatus;
  events: PeriodEvent[];
  reward_until: string | null;
  /** 本文から取り出したキャラクター(新限定・進化の解禁)。無ければ省略(spec §4.13) */
  characters?: CharacterEntry[];
}


/** エポックms/ISO文字列 → ISO8601 +09:00 */
export function toJst(t: number | string): string {
  const ms = typeof t === 'number' ? t : Date.parse(t);
  return new Date(ms + JST_OFFSET_MS).toISOString().replace(/\.\d{3}Z$/, '+09:00');
}

export interface BuildInput {
  item: ListItem;
  html: string;
  fetchedAtMs: number;
  /** sitemap の lastmod (ISO8601)。圏外なら undefined */
  lastmod?: string;
  prev?: ArticleRecord | null;
}

/** 詳細HTML → 正本レコード。内容(fetched_at以外)が前回と同じなら前回をそのまま返す。 */
export function buildRecord({ item, html, fetchedAtMs, lastmod, prev }: BuildInput): ArticleRecord {
  const input = parseDetail(item.id, html);
  const parsed = input ? parseArticle(input) : null;
  const characters = input ? parseCharacters({ title: item.title, lines: input.lines }, gachaPeriod(parsed?.events ?? [])) : [];
  const next: ArticleRecord = {
    id: item.id,
    url: item.url,
    title: item.title,
    category: item.categories[0] ?? 'unknown',
    categories: item.categories,
    published: item.published,
    fetched_at: toJst(fetchedAtMs),
    lastmod: lastmod ? toJst(lastmod) : (prev?.lastmod ?? null),
    content_hash: `sha256:${createHash('sha256').update(html).digest('hex')}`,
    parse_status: parsed?.parse_status ?? 'none',
    events: parsed?.events ?? [],
    reward_until: parsed?.reward_until ?? null,
    ...(characters.length > 0 ? { characters } : {}),
  };
  if (prev && JSON.stringify({ ...next, fetched_at: '' }) === JSON.stringify({ ...prev, fetched_at: '' })) return prev;
  return next;
}
