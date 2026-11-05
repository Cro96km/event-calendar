// npm run judge — 要判断の判断を、判断の記憶(config/judge/decisions.json)に取り込む。詳細は --help と docs/operations.md。
import { readFile, writeFile } from 'node:fs/promises';
import { readAllRecords } from '../src/data/store';
import { readDecisions, readRules } from '../src/data/selection-store';
import { buildCandidates } from '../src/selection';
import { emptyDecisions, importReview, judgeAll, parseReview, reviewGroups, serializeDecisions } from '../src/decisions';
import { applyJudgeMarks, parseJudgeIssue } from '../src/judge-issue';

const HELP = `npm run judge -- (--issue FILE | --review FILE) [--dry-run]
  目的: 要判断(未判断の表示候補の種類)の「表示/非表示」の判断を、判断の記憶(config/judge/decisions.json)に取り込む。
  使う場面: 要対応Issueの \`/apply\` コメント(Actionsが自動で実行)、またはローカルで要判断ファイルを直したとき。
  オプション:
    --issue FILE    要対応IssueのMarkdown本文のファイル。チェックあり=表示、チェック無し=非表示で確定する。
                    現在の要判断に無い種類(本文を書き換えたもの)は無視して警告する。
    --review FILE   要判断ファイル(config/judge/needs-review.md の形式)。行の - [x]=表示 / - [-]=非表示(- [ ] は保留)。
    --dry-run       decisions.json を書き換えず、取り込む件数だけ表示する。
    --help          この説明
  入力: data/articles(現在の要判断を求めるため)、config/judge/(ルール・判断の記憶)、--issue / --review のファイル
  出力: config/judge/decisions.json(更新。--dry-run なら更新しない)
  副作用: なし(ネットワークには触れない)。取り込み後は npm run update -- --no-collect で判定とレポートを作り直せる。`;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.length === 0) {
  console.log(HELP);
  process.exit(argv.includes('--help') ? 0 : 1);
}
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const issueFile = arg('--issue');
const reviewFile = arg('--review');
if ((issueFile === undefined) === (reviewFile === undefined)) throw new Error('--issue か --review のどちらか一方を指定してください(--help)');
const dryRun = argv.includes('--dry-run');

const d = (await readDecisions('config/judge/decisions.json')) ?? emptyDecisions();
const rules = await readRules('config/judge/rules.json');
let applied: number;
if (issueFile !== undefined) {
  const records = await readAllRecords('data/articles');
  const groups = reviewGroups(judgeAll(buildCandidates(records), d, rules));
  const marks = parseJudgeIssue(await readFile(issueFile, 'utf8'));
  if (marks.length === 0) throw new Error('Issue本文に判断の行(- [ ] ... <!--k:...-->)が見つかりません。');
  const r = applyJudgeMarks(d, marks, groups);
  applied = r.applied;
  for (const u of r.unknown) console.warn(`警告: 現在の要判断に無い種類のため無視しました: ${u}`);
} else {
  const parsed = parseReview(await readFile(reviewFile as string, 'utf8'));
  applied = importReview(d, parsed.rows);
  if (parsed.unrecognized > 0) console.warn(`警告: 認識できないチェック行が ${parsed.unrecognized} 件あり無視しました。`);
}
console.log(`判断の記憶に取り込んだ種類: ${applied}${dryRun ? '(--dry-run: 書き換えません)' : ''}`);
if (!dryRun) await writeFile('config/judge/decisions.json', serializeDecisions(d));
