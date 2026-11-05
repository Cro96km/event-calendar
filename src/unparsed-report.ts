// 期間不明(parse_status=none)記事の分類レポート(純関数)。非表示方針の見直し材料にする。
// 本文は使わず、保存済みの正本(タイトル・カテゴリ)だけで分類する。
import type { ArticleRecord } from './data/record';

export type UnparsedGroup = 'evolution' | 'maintenance' | 'title-date-event' | 'notice' | 'dated-other' | 'undated-other';

interface GroupInfo {
  label: string;
  /** 候補に載せる/載せないの提案 */
  suggestion: string;
}

const GROUPS: Record<UnparsedGroup, GroupInfo> = {
  evolution: { label: '獣神化・改/真獣神化の解禁告知(日付はタイトルのみ)', suggestion: '期間ではなく解禁日。載せるなら「タイトルの日付を開始とする単発」を候補生成側で扱う別Issueが必要。当面は非表示のまま' },
  maintenance: { label: 'メンテナンス/アップデート告知', suggestion: '期間が本文の表形式等の場合のみ要確認。基本は非表示のまま' },
  'title-date-event': { label: 'タイトルに開始日がある開催告知(ガチャ・クエスト等)', suggestion: '最有力。タイトルの「M/D より」を開始とする partial 相当で候補化する案(パーサ改修は本レポートのスコープ外)' },
  notice: { label: '不具合・重要なお知らせ等', suggestion: '期間を持たない告知。非表示のまま' },
  'dated-other': { label: 'タイトルに日付はあるがその他', suggestion: '個別に確認。件数が少なければ非表示のまま' },
  'undated-other': { label: '日付もないその他', suggestion: '非表示のまま' },
};

const DATE_IN_TITLE = /(?<!\d)\d{1,2}\/\d{1,2}(?!\d)/;
const DATED_CATEGORIES = new Set(['event', 'campaign', 'collab', 'web-shop']);

export function classifyUnparsed(r: Pick<ArticleRecord, 'title' | 'category'>): UnparsedGroup {
  if (/獣神化/.test(r.title) && /解禁/.test(r.title)) return 'evolution';
  if (r.category === 'error' || r.category === 'important') return 'notice';
  if (DATE_IN_TITLE.test(r.title) && DATED_CATEGORIES.has(r.category) && /(?<!\d)\d{1,2}\/\d{1,2}(?!\d)[^\d]{0,3}(より|から)|開催|登場/.test(r.title)) return 'title-date-event';
  if (r.category === 'maintenance' || /メンテナンス|アップデート情報/.test(r.title)) return 'maintenance';
  return DATE_IN_TITLE.test(r.title) ? 'dated-other' : 'undated-other';
}

export interface GroupReport {
  group: UnparsedGroup;
  count: number;
  /** 公開日の新しい順、最大 `examples` 件 */
  examples: { id: string; published: string; category: string; title: string; url: string }[];
}

/** none の記事だけを分類し、件数の多い順(同数は定義順)に返す。 */
export function buildUnparsedReport(records: ArticleRecord[], examples = 3): GroupReport[] {
  const by = new Map<UnparsedGroup, ArticleRecord[]>();
  for (const r of records) {
    if (r.parse_status !== 'none') continue;
    const g = classifyUnparsed(r);
    const list = by.get(g) ?? [];
    list.push(r);
    by.set(g, list);
  }
  const order = Object.keys(GROUPS) as UnparsedGroup[];
  return [...by.entries()]
    .map(([group, rs]) => ({
      group,
      count: rs.length,
      examples: [...rs].sort((a, b) => b.published.localeCompare(a.published) || a.id.localeCompare(b.id)).slice(0, examples).map((r) => ({ id: r.id, published: r.published.slice(0, 10), category: r.category, title: r.title, url: r.url })),
    }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.group) - order.indexOf(b.group));
}

export function formatUnparsedReport(report: GroupReport[], total: number): string {
  const none = report.reduce((n, g) => n + g.count, 0);
  const lines = [`期間不明(none): ${none}件 / 全${total}件`, ''];
  for (const g of report) {
    const info = GROUPS[g.group];
    lines.push(`## ${info.label} — ${g.count}件`, `提案: ${info.suggestion}`);
    for (const e of g.examples) lines.push(`- ${e.published} [${e.category}] ${e.title} ${e.url}`);
    lines.push('');
  }
  return lines.join('\n');
}
