// 一覧ページ・sitemap のパーサ（純関数）。spec §4.1。
import { parse } from 'node-html-parser';

export interface ListItem {
  id: string;
  url: string;
  title: string;
  categories: string[];
  /** YYYY-MM-DD */
  published: string;
  /** 一覧に「追記」表示がある */
  addendum: boolean;
}

export interface ListPage {
  items: ListItem[];
  /** 「次へ」リンク（絶対パス）。最終ページは null */
  next: string | null;
}

export interface SitemapEntry {
  id: string;
  url: string;
  /** ISO8601 (UTC) */
  lastmod: string;
}

export const BASE_URL = 'https://www.monster-strike.com';
const ARTICLE_HREF = /\/news\/(\d{8}_\d+)\.html/;

export function parseList(html: string): ListPage {
  const root = parse(html);
  const items: ListItem[] = [];
  for (const li of root.querySelectorAll('li.news-item')) {
    const a = li.querySelector('a.news-item__link');
    const href = a?.getAttribute('href') ?? '';
    const id = ARTICLE_HREF.exec(href)?.[1];
    const published = li.querySelector('time.news-item__date')?.getAttribute('datetime');
    if (!id || !published) continue;
    items.push({
      id,
      url: `${BASE_URL}/news/${id}.html`,
      title: (li.querySelector('.news-item__title')?.text ?? '').replace(/\s+/g, ' ').trim(),
      categories: li
        .querySelectorAll('.news-item__category-item')
        .map((c) => c.getAttribute('data-category-label') ?? '')
        .filter(Boolean),
      published,
      addendum: li.querySelector('.news-item__addendum') !== null,
    });
  }
  const next = root
    .querySelectorAll('a.c-button')
    .find((a) => /\/news\/index_\d+\.html$/.test(a.getAttribute('href') ?? '') && a.text.includes('次へ'));
  return { items, next: next?.getAttribute('href') ?? null };
}

export function parseSitemap(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const block = m[1] ?? '';
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(block)?.[1];
    const lastmod = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(block)?.[1];
    const id = loc ? ARTICLE_HREF.exec(loc)?.[1] : undefined;
    if (loc && lastmod && id) entries.push({ id, url: loc, lastmod });
  }
  return entries;
}
