// 表示候補(記事内の項目を同種で集約したキー)と選択ファイル(config/judge/selection.md)の純関数。spec §4.5。
import type { ExportEvent } from './data/export';
import type { ArticleRecord } from './data/record';
import { eventUrl, type PeriodEvent } from './period';
import { MAINTENANCE_CATEGORY, sectionOf } from './sections';

/** UIが読む選択状態(public/data/selection.json)。ファイルが無い=選択機能なし(全件表示)。 */
export interface SelectionJson {
  generated_at: string;
  /** 選択済み候補キー(正規化タイトル) */
  selected: string[];
  /** 選択ファイルの候補総数(未選択を含む) */
  total: number;
}

/** 候補キー: タイトルから日付・回数・番号など回ごとに変わる部分を除いた文字列。 */
export function normalizeTitle(title: string): string {
  return title
    // 10/21, 10/21 12時, 10/21 12:00 と直後の助詞(より/から/に/まで)
    .replace(/\d{1,2}\/\d{1,2}(?:\s*\d{1,2}(?:時(?:\d{1,2}分)?|:\d{2}))?(?:より|から|に|まで)?/g, '')
    .replace(/\d{4}年\d{1,2}月\d{1,2}日(?:\s*\d{1,2}時)?(?:より|から|に|まで)?/g, '')
    .replace(/\d{1,2}月\d{1,2}日(?:\s*\d{1,2}時)?(?:より|から|に|まで)?/g, '')
    // 回ごとに変わる注記 (追記:10/22) (追加情報:10/22)
    .replace(/[(（](?:追記|追加情報)[:：][^)）]*[)）]/g, '')
    // 第1〜3弾 / 第2回 / 3回目 / Vol.5 / #4
    .replace(/第\d+(?:[~〜～]\d+)?(?=[弾回章期話])/g, '第N')
    .replace(/\d+(?=回目)/g, 'N')
    .replace(/(Vol\.?|#)\s*\d+/gi, '$1N')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '｜')
    .trim();
}

/** 項目の候補キー。見出し名の項目は見出し、タイトル由来(見出し無し)・旧データは記事タイトルを正規化したもの。 */
export function itemKey(title: string, e: { name: string; title_named?: boolean }): string {
  return normalizeTitle(e.title_named ? title : e.name) || normalizeTitle(title);
}

export interface Candidate {
  key: string;
  category: string;
  /** この項目を含む記事の数 */
  count: number;
  /** 直近(開始が最新)の期間 YYYY-MM-DD〜YYYY-MM-DD(終了未定は〜のみ) */
  latest: string;
  /** 直近の期間が記事の主期間を継承したものか */
  inherited: boolean;
  url: string;
}

const day = (iso: string): string => iso.slice(0, 10);

/** 表示対象になりうる記事(期間あり・除外カテゴリでない)の項目から候補を作る。 */
export function buildCandidates(records: ArticleRecord[]): Candidate[] {
  interface Group { rec: ArticleRecord; ev: PeriodEvent; articles: Set<string> }
  const groups = new Map<string, Group>();
  for (const r of records) {
    if (r.events.length === 0 || sectionOf(r.category) === null) continue;
    for (const ev of r.events) {
      const key = itemKey(r.title, ev);
      const g = groups.get(key);
      if (!g) groups.set(key, { rec: r, ev, articles: new Set([r.id]) });
      else {
        g.articles.add(r.id);
        // 同じ記事内の同名項目は後ろ(開始が新しい方)、別記事なら開始が新しい方。同時刻なら期間を持つ項目を優先
        if (ev.start > g.ev.start || (ev.start === g.ev.start && g.ev.inherited && !ev.inherited)) Object.assign(g, { rec: r, ev });
      }
    }
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      category: g.rec.category,
      count: g.articles.size,
      latest: `${day(g.ev.start)}〜${g.ev.end ? day(g.ev.end) : ''}`,
      inherited: g.ev.inherited === true,
      url: eventUrl(g.rec.url, g.ev),
      _s: g.ev.start,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || b._s.localeCompare(a._s) || a.key.localeCompare(b.key))
    .map(({ _s, ...c }) => { void _s; return c; });
}

export const LINE = /^- \[([ xX])\] (.+?)(?: \| .*)?$/;

/** 選択ファイル → キー→選択状態。候補行以外(見出し・説明)は無視。 */
export function parseSelection(md: string): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const line of md.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (m) out.set((m[2] as string).trim(), m[1] !== ' ');
  }
  return out;
}

/** 項目自身に期間が無く記事の期間を継承していることを示す(選択ファイル・UI共通) */
export const INHERIT_MARK = '(記事期間を継承)';

export function selectionJson(sel: Map<string, boolean>, generatedAt: string): SelectionJson {
  return { generated_at: generatedAt, selected: [...sel].filter(([, on]) => on).map(([k]) => k), total: sel.size };
}

/** 選択済みキーに属するイベントのみ。選択情報が無ければ全件。 */
export function applySelection(events: ExportEvent[], sel: SelectionJson | null): ExportEvent[] {
  if (!sel) return events;
  const on = new Set(sel.selected);
  // メンテナンスは選択の対象外(常に表示)
  return events.filter((e) => e.category === MAINTENANCE_CATEGORY || on.has(e.item ?? normalizeTitle(e.title)));
}
