// npm run candidates: 要判断ファイルの確定行を記憶(config/judge/decisions.json)に取り込み、収集済みデータの候補を
// 定例/自動ON/自動OFF/要判断に分類して config/judge/needs-review.md(要判断・ユーザ編集)と config/judge/calendar/YYYY/MM.md(カレンダーの台帳・自動生成・git管理)を更新する。
//   --report        記憶(人の判断)を教師にルール(config/judge/rules.json)の一致率を表示(ファイルは変更しない)
//   --review-issue  要判断(集約行)のレビュー依頼本文を表示(ドライラン。ファイルは変更しない)
//     --publish     上記を gh issue create で実際に発行(明示指定時のみ)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeLedger } from '../src/data/ledger-store';
import { readAllRecords } from '../src/data/store';
import { readDecisions, readRules, readSelectionText, runCandidates } from '../src/data/selection-store';
import { toJst } from '../src/data/record';
import { emptyDecisions, judgeAll, parseReview } from '../src/decisions';
import { buildReviewIssue, evaluate, formatEvaluation } from '../src/review-issue';
import { buildCandidates } from '../src/selection';
import { showHelpIfRequested } from './_help';

showHelpIfRequested(`npm run candidates [-- --report | --review-issue [--publish]]
  目的: 収集済みデータの表示候補を 定例/自動ON/自動OFF/要判断 に分類し、要判断ファイル(config/judge/needs-review.md)の確定行を判断の記憶(decisions.json)に取り込む。
  使う場面: ローカルで要判断ファイルを編集して取り込むとき。通常の運用は npm run update(判定の再生成)と npm run judge(取り込み)を使う。
  オプション:
    (なし)          要判断ファイルの取り込み→分類→ config/judge/needs-review.md・calendar/(台帳。public/data があるとき)・public/data/selection.json を再生成
    --report        判断の記憶を教師に、ルール(config/judge/rules.json)の一致率を表示(ファイルは変更しない)
    --review-issue  要判断のレビュー依頼本文を表示(ドライラン)。--publish を付けると gh issue create で実際に発行
  入力: data/articles、config/judge/(rules・decisions・needs-review.md)
  出力: config/judge/decisions.json(取り込みがあれば更新)、needs-review.md(生成物・git管理外)・calendar/(台帳。生成物・git管理)、public/data/selection.json
  副作用: --review-issue --publish のときだけ GitHub に Issue を作る(gh が必要)。`);

const PATHS = { review: 'config/judge/needs-review.md', decisions: 'config/judge/decisions.json' };
const RULES = 'config/judge/rules.json';
const args = new Set(process.argv.slice(2));
if (args.has('--publish') && !args.has('--review-issue')) throw new Error('--publish は --review-issue と併用してください。');
const rules = await readRules(RULES);

if (args.has('--report') || args.has('--review-issue')) {
  if (args.has('--report')) {
    if (!rules) throw new Error(`${RULES} がありません。`);
    const records = await readAllRecords('data/articles');
    const js = judgeAll(buildCandidates(records), (await readDecisions(PATHS.decisions)) ?? emptyDecisions(), rules);
    console.log(formatEvaluation(evaluate(js, rules)));
  }
  if (args.has('--review-issue')) {
    const md = await readSelectionText(PATHS.review);
    if (md === null) throw new Error(`${PATHS.review} がありません。先に npm run candidates を実行してください。`);
    const issue = buildReviewIssue(parseReview(md).rows, toJst(Date.now()).slice(0, 10));
    if (!issue) console.log('要判断(未判断の種類)はありません。');
    else if (!args.has('--publish')) {
      console.log(`[ドライラン] 発行しません。発行するには --review-issue --publish\n\n# ${issue.title}\n\n${issue.body}`);
    } else {
      const r = spawnSync('gh', ['issue', 'create', '--title', issue.title, '--body-file', '-'], { input: issue.body, stdio: ['pipe', 'inherit', 'inherit'] });
      if (r.status !== 0) throw new Error('gh issue create に失敗しました。');
    }
  }
} else {
  const records = await readAllRecords('data/articles');
  if (records.length === 0) throw new Error('data/articles が空です。先に npm run collect を実行してください。');
  const r = await runCandidates(records, PATHS, 'public/data', toJst(Date.now()), rules);
  // 台帳(判定・理由の列)も作り直す。表示用データ(public/data。npm run update が作る)があるときだけ
  if (existsSync('public/data/index.json')) await writeLedger('public/data', 'config/judge/calendar', toJst(Date.now()), r.judged);
  const b = r.buckets;
  console.log(`候補 ${r.candidates} 件: 要判断 ${b.review}件(同種集約 ${r.reviewGroups}行) / 定例 ${b.recurring}件 / 自動ON ${b['auto-on']}件 / 自動OFF ${b['auto-off']}件。表示 ${r.selected} 件。`);
  if (r.imported > 0) console.log(`${PATHS.review} から ${r.imported} 種類の判断を記憶(${PATHS.decisions})に取り込みました。`);
  if (!rules) console.log(`${RULES} が無いため自動ルールなし(記憶に無いものは全て要判断)。`);
  console.log(r.reviewGroups > 0 ? `要判断は ${PATHS.review} だけ見て、表示なら "- [x]"、非表示なら "- [-]" にして、再度 npm run candidates を実行。` : '要判断はありません。ブラウザを再読み込みして確認してください。');
  if (r.unrecognized > 0) console.warn(`警告: 認識できない形式のチェック行が ${r.unrecognized} 件あり無視しました(行頭は "- [x] " "- [-] " の形式)。`);
}
