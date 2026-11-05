// npm run update — 収集 → 判定の再生成 → 差分レポート(PR本文用)の作成。ActionsでもローカルでもOK。詳細は --help と docs/operations.md。
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { collect } from '../src/data/collect';
import { readDecisions, readRules, runCandidates } from '../src/data/selection-store';
import { readAllRecords, writeExport } from '../src/data/store';
import { toJst } from '../src/data/record';
import { emptyDecisions } from '../src/decisions';
import { RawCache } from '../src/scraper/cache';
import { Fetcher } from '../src/scraper/http';
import { configProblems } from '../src/hakai-check';
import { judgeHealth } from '../src/health';
import { renderJudgeIssue } from '../src/judge-issue';
import { buildUpdateReport, needsAttention, renderUpdateReport } from '../src/update-report';

const HELP = `npm run update [-- オプション]
  目的: 公式ニュースを収集し、表示候補の判定を作り直し、収集前後の差分レポート(PR本文)を作る。
  使う場面: 毎週の更新(Actions)、不定期の手動収集、設定だけ直した後の確認(--no-collect)。
  オプション:
    --pages N        巡回するページ数(既定2)。--since 指定時は上限(既定200)
    --since YYYY-MM-DD  この公開日より古くなるまで巡回(初回・過去分用。公式サイトへの負荷が大きいので注意)
    --no-collect     収集しない(設定の変更だけを反映して、判定とレポートを作り直す)
    --prev DIR       差分の比較元の記事ディレクトリ(既定: 実行前の data/articles。デモ・検証用)
    --out FILE       レポート(Markdown)の出力先(既定 update-report.md)
    --json FILE      機械可読のサマリの出力先(既定 update-report.json。自動マージ判定が読む)
    --issue FILE     要対応Issueの本文の出力先(既定 update-issue.md。要対応がある時だけ作る。要判断はチェックボックス)
    --help           この説明
  入力: data/articles(正本)、config/judge/(判断の記憶・ルール)
  出力: data/articles(更新)、public/data/(表示用。収集しなくても正本から作り直す)、config/judge/needs-review.md・selection.md(生成物)、レポート・サマリ・要対応Issue本文
  副作用: 公式サイトへアクセスする(--no-collect 以外)。間隔2秒以上・直列・429で即中断(礼節。docs/operations.md §4)。`;

const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const since = arg('--since');
if (since !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(since) && new Date(`${since}T00:00:00Z`).toISOString().startsWith(since))) throw new Error('--since は YYYY-MM-DD');
const pages = Number(arg('--pages') ?? (since ? 200 : 2));
if (!Number.isInteger(pages) || pages < 1) throw new Error('--pages は1以上の整数');
const out = arg('--out') ?? 'update-report.md';
const jsonOut = arg('--json') ?? 'update-report.json';
const issueOut = arg('--issue') ?? 'update-issue.md';
const noCollect = argv.includes('--no-collect');

const prev = await readAllRecords(arg('--prev') ?? 'data/articles');

let collectSummary: { aborted: string | null; fetched: number; written: number; none: number } | null = null;
if (!noCollect) {
  const s = await collect({
    fetcher: new Fetcher(),
    cache: new RawCache('data/raw'),
    pages,
    since,
    articlesDir: 'data/articles',
    publicDir: 'public/data',
    selectionPath: 'config/judge/selection.md',
    runsLog: 'data/runs.log',
    log: console.log,
  });
  collectSummary = { aborted: s.aborted, fetched: s.fetched, written: s.written, none: s.total.none };
  console.log(`収集: items=${s.items} fetched=${s.fetched} written=${s.written}${s.aborted ? ` / 中断: ${s.aborted}` : ''}`);
}

const cur = await readAllRecords('data/articles');
if (cur.length === 0) throw new Error('data/articles が空です。');
const rules = await readRules('config/judge/rules.json');
const generatedAt = toJst(Date.now());
// 表示用データ(public/data)を正本から作り直す(収集しない場合や、デプロイ用の反映でも必要。収集した場合は collect が作ったものの再生成になるだけ)
await writeExport('public/data', cur, generatedAt);
await runCandidates(cur, { selection: 'config/judge/selection.md', review: 'config/judge/needs-review.md', decisions: 'config/judge/decisions.json' }, 'public/data', generatedAt, rules);
const decisions = (await readDecisions('config/judge/decisions.json')) ?? emptyDecisions();

const report = buildUpdateReport({ prev, cur, decisions, rules });
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${renderUpdateReport(report, { generatedAt: generatedAt.slice(0, 10) })}\n`);
const generatedDate = generatedAt.slice(0, 10);
const issue = renderJudgeIssue(report, generatedDate);
if (issue) await writeFile(issueOut, `${issue.title}\n\n${issue.body}\n`);
else await rm(issueOut, { force: true });
const health = judgeHealth({ collect: collectSummary, prevArticles: prev.length, curArticles: cur.length, newArticles: report.newArticles, changedArticles: report.changedArticles, unparsedNew: report.unparsed.length, configProblems: configProblems() });
const summary = {
  generatedAt,
  collect: collectSummary,
  prevArticles: prev.length,
  curArticles: cur.length,
  newArticles: report.newArticles,
  changedArticles: report.changedArticles,
  newEvents: report.newEvents.length,
  changedEvents: report.changedEvents.length,
  visibleAdded: report.visibleAdded.length,
  visibleRemoved: report.visibleRemoved.length,
  pending: report.pending.length,
  carriedPending: report.carriedPending,
  newQuests: report.newQuests.length,
  longLabels: report.longLabels.length,
  unparsed: report.unparsed.length,
  health,
  needsAttention: needsAttention(report),
  issueFile: issue ? issueOut : null,
};
await mkdir(dirname(jsonOut), { recursive: true });
await writeFile(jsonOut, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`レポート: ${out} / サマリ: ${jsonOut}`);
console.log(`新規 ${summary.newEvents} 件 / 変更 ${summary.changedEvents} 件 / 公開に出る ${summary.visibleAdded} 件 / 要対応: ${summary.needsAttention ? 'あり' : 'なし'} / 自動マージ: ${health.ok ? '可' : `不可(${health.reasons.join(' / ')})`}`);
