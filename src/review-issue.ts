// 要判断(同種を集約した行)のレビュー依頼本文と、ルールと記憶の一致率の評価。spec §4.6。
import { classify, type Decision, type Rule } from './classify';
import type { ReviewRow, Judged } from './decisions';

/** レビュー待ち=要判断ファイルで未判断( [ ] )の集約行。 */
const pendingReview = (rows: ReviewRow[]): ReviewRow[] => rows.filter((r) => r.mark === ' ');

/** レビュー依頼Issue。本文は集約行(種類・件数・例示タイトル・リンク)のみ。公式本文は含めない。0件なら null。 */
export function buildReviewIssue(rows: ReviewRow[], date: string): { title: string; body: string } | null {
  const pend = pendingReview(rows);
  if (pend.length === 0) return null;
  const items = pend.map((r) => `- [ ] ${r.id} (${r.category} / ${r.count}) 例: ${r.examples} ${r.url}`);
  const body = [
    `自動で判断できなかった表示候補の種類が ${pend.length} 件あります。種類ごとに「常に表示」か「常に非表示」かを確認してください。`,
    '',
    ...items,
    '',
    '対応: `config/judge/needs-review.md` の該当行を、表示するなら `- [x]`、表示しないなら `- [-]` にして `npm run candidates` を実行する(同種は以後自動で適用される)。',
  ].join('\n');
  return { title: `表示候補の要判断 (${date}, ${pend.length}種類)`, body };
}

export interface Evaluation {
  table: Record<'on' | 'off', Record<Decision, number>>;
  total: number;
  agreed: number;
  decided: number;
  mismatches: { key: string; memory: 'on' | 'off'; rule: string | null }[];
}

/** 記憶(人の判断)を教師に、ルール単独の判定との一致を調べる。 */
export function evaluate(js: Judged[], rules: Rule[]): Evaluation {
  const table = { on: { on: 0, off: 0, unsure: 0 }, off: { on: 0, off: 0, unsure: 0 } };
  const mismatches: Evaluation['mismatches'] = [];
  let total = 0;
  let agreed = 0;
  let decided = 0;
  for (const j of js) {
    if (j.source !== 'memory' || j.decision === null) continue;
    const cls = classify({ key: j.cand.key, category: j.cand.category, count: j.cand.count }, rules);
    total++;
    table[j.decision][cls.decision]++;
    if (cls.decision === 'unsure') continue;
    decided++;
    if (cls.decision === j.decision) agreed++;
    else mismatches.push({ key: j.cand.key, memory: j.decision, rule: cls.rule });
  }
  return { table, total, agreed, decided, mismatches };
}

export function formatEvaluation(e: Evaluation): string {
  const pct = (a: number, b: number): string => (b === 0 ? '-' : `${((a / b) * 100).toFixed(1)}%`);
  const line = (t: 'on' | 'off'): string => {
    const r = e.table[t];
    const n = r.on + r.off + r.unsure;
    return `  記憶=${t}: ${n}件 → ルール on ${r.on} / off ${r.off} / unsure ${r.unsure}(正答 ${pct(r[t], n)}、unsure除く正答 ${pct(r[t], r.on + r.off)})`;
  };
  return [
    `ルール一致率(教師=記憶された人の判断が適用されている候補 ${e.total}件)`,
    line('on'),
    line('off'),
    `  判定した ${e.decided}件中 一致 ${e.agreed}件(${pct(e.agreed, e.decided)}) / 不一致 ${e.mismatches.length}件 / unsure ${e.total - e.decided}件`,
    ...e.mismatches.map((m) => `  不一致: 記憶=${m.memory} ルール=${m.memory === 'on' ? 'off' : 'on'}(${m.rule}) ${m.key}`),
  ].join('\n');
}
