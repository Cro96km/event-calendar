// 要対応のIssue(要判断をチェックボックスで付ける)の生成と、チェック状態の取り込み(DOMなし・純関数)。
// AIなしで、GitHubの画面だけで判断できるようにする。チェック=表示 / チェック無し=非表示(確定)。
import { importReview, type Decisions, type ReviewGroup, type ReviewRow } from './decisions';
import type { UpdateReport } from './update-report';

export interface JudgeMark {
  /** 種類ID(`カテゴリ::種類キー`) */
  kind: string;
  /** チェックあり=表示 */
  ticked: boolean;
}

const MARK = /^- \[([ xX])\] .*<!--k:([^>]+?)-->\s*$/;
/** 取り込み(`importReview`)と同じ種類ID。 */
const idOf = (g: ReviewGroup): string => `${g.category}::${g.id}`;
const clip = (s: string, n: number): string => ([...s].length > n ? `${[...s].slice(0, n - 1).join('')}…` : s);
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').replace(/<!--|-->/g, '').trim();

/** 要対応が無ければ null。公式の本文は含めず、種類・件数・例示の項目名・リンクのみ。 */
export function renderJudgeIssue(r: UpdateReport, date: string): { title: string; body: string } | null {
  if (r.pending.length === 0 && r.newQuests.length === 0 && r.longLabels.length === 0 && r.unparsed.length === 0) return null;
  const L: string[] = [`自動更新(${date})で、人の確認が必要な項目が見つかりました。公開サイトは更新済みで、未判断の項目は非表示のままです。`, ''];
  if (r.pending.length > 0) {
    L.push(
      `## 要判断(${r.pending.length}種類)`,
      '',
      '**表示するものにチェックを入れて**ください。チェックを入れない種類は「常に非表示」で確定します。確定すると、同じ種類は以後自動で判定されます。',
      '各行の先頭は実際の項目名の例です。「種類」は、「」の中の固有名を空にして同種をまとめた表記で、判断はその種類のすべての項目に適用されます。',
      '終わったら、このIssueに `/apply` とコメントしてください。判断を設定に取り込むPRが自動で作られます(検証が通れば自動でマージされます)。',
      '',
    );
    for (const g of r.pending) {
      // 主表示は固有名つきの実際の項目名(種類キーは「」の中身を空にしていて分かりにくい)。種類は補足として添える
      const ex = clip(oneLine(g.examples[0] ?? g.id), 60);
      const kind = g.examples[0] === g.id ? '' : ` 種類: ${clip(oneLine(g.id), 50)}`;
      L.push(`- [ ] ${ex} (${g.category}・同種${g.count}件)${kind} ${g.url} <!--k:${encodeURIComponent(idOf(g))}-->`);
    }
    L.push('');
  }
  if (r.newQuests.length > 0) {
    L.push('## 新しい星墓クエスト', '', '`config/schedule/hakai.json` の `quests` に追加してください(色は red=火 / blue=水 / green=木 / yellow=光 / purple=闇)。', '');
    for (const q of r.newQuests) L.push(`- 「${oneLine(q.name)}」(記事 ${q.article}、開催 ${q.start})`, '  ```json', `  { "name": "${oneLine(q.name).replace(/の星墓$/, '').replace(/"/g, '')}", "color": "red" }`, '  ```');
    L.push('');
  }
  if (r.longLabels.length > 0) {
    L.push('## 1行に収まらないラベル', '', '`config/display/label-overrides.json` の `rules` に、短い表記(全角15文字以内)を追加してください。', '');
    for (const l of r.longLabels) L.push(`- 「${oneLine(l.label)}」(約${l.width.toFixed(1)}文字)`, '  ```json', `  { "match": "${oneLine(l.label).replace(/"/g, '')}", "label": "ここに短い表記" }`, '  ```');
    L.push('');
  }
  if (r.unparsed.length > 0) {
    L.push('## 期間が取れなかった新規の記事', '', '期間の書式が新しい可能性があります。必要ならパーサの対応が必要です。', '');
    for (const u of r.unparsed) L.push(`- [${oneLine(u.title)}](${u.url})`);
    L.push('');
  }
  return { title: `要対応 (${date})`, body: L.join('\n') };
}

/** Issue本文のチェック状態を読む。種類IDを持たない行・壊れた行は無視する。 */
export function parseJudgeIssue(body: string): JudgeMark[] {
  const out: JudgeMark[] = [];
  for (const line of body.split('\n')) {
    const m = MARK.exec(line.trimEnd());
    if (!m) continue;
    let kind: string;
    try {
      kind = decodeURIComponent(m[2] as string);
    } catch {
      continue;
    }
    if (kind.includes('::')) out.push({ kind, ticked: m[1] !== ' ' });
  }
  return out;
}

/**
 * チェック状態を判断の記憶に取り込む。現在の要判断(groups)にある種類だけ(Issue本文を書き換えても、無関係な種類は変えられない)。
 * チェック=表示、無し=非表示で確定する。戻り値: 取り込んだ数と、現在の要判断に無いため無視した種類ID。
 */
export function applyJudgeMarks(d: Decisions, marks: JudgeMark[], groups: ReviewGroup[]): { applied: number; unknown: string[] } {
  const byKind = new Map(groups.map((g) => [idOf(g), g]));
  const rows: ReviewRow[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const m of marks) {
    const g = byKind.get(m.kind);
    if (!g) {
      unknown.push(m.kind);
      continue;
    }
    if (seen.has(m.kind)) continue;
    seen.add(m.kind);
    rows.push({ mark: m.ticked ? 'x' : '-', id: g.id, category: g.category, count: `${g.count}件`, examples: g.examples.join(' / '), period: g.period, url: g.url });
  }
  return { applied: importReview(d, rows), unknown };
}
