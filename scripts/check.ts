// npm run check — 設定と収集データの点検。終了コード: 0=自動マージ可 / 1=要確認(設定の矛盾・健全性NG)。詳細は --help と docs/operations.md。
import { readFile } from 'node:fs/promises';
import { readDecisions, readRules } from '../src/data/selection-store';
import { readAllRecords } from '../src/data/store';
import { checkHakai } from '../src/hakai-check';
import { judgeHealth } from '../src/health';
import cfgOverrides from '../config/display/label-overrides.json';
import { labelWidth, MAX_LABEL_WIDTH } from '../src/label-override';

const HELP = `npm run check [-- --summary FILE]
  目的: 設定と収集データを点検する。自動マージしてよいかを、終了コードで返す。
  使う場面: 更新のあと(Actionsが自動で実行)、設定を直した後、新しい星墓が出たとき。
  点検する内容:
    1. 星墓の設定(config/schedule/hakai.json): 未定義のクエストの参照・階層番号の重複・sinceの順序・色など(矛盾)。
       色の対応が無い階層名(=新クエスト)は警告(要対応。Issueに出る)。
    2. 判断の設定(config/judge/rules.json・decisions.json)が正しい書式か。
    3. ラベルの上書き(config/display/label-overrides.json)が全角15.5文字相当以内か。
    4. 健全性(--summary を渡したとき): 収集の完了・既存記事の書き換え量・期間が取れない新規の割合(config/judge/health.json の閾値)。
  オプション:
    --summary FILE  npm run update が出したサマリ(update-report.json)。健全性の点検に使う。
    --help          この説明
  入力: data/articles、config/、(--summary のファイル)
  出力: 標準出力に点検結果。終了コード 0=問題なし(新クエスト等の警告は出うる) / 1=要確認。
  副作用: なし(読み取りのみ)。`;

const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const fails: string[] = [];
const warns: string[] = [];

const records = await readAllRecords('data/articles');
const hk = checkHakai(records);
for (const p of hk.problems) fails.push(`星墓の設定の矛盾: ${p}`);
for (const u of hk.unknown) warns.push(`新しい星墓クエスト: 「${u.name}」(記事 ${u.article}、開催 ${u.start}) → config/schedule/hakai.json の quests に追加`);

try {
  await readRules('config/judge/rules.json');
  await readDecisions('config/judge/decisions.json');
} catch (e) {
  fails.push(`判断の設定が不正です: ${e instanceof Error ? e.message : String(e)}`);
}
for (const r of cfgOverrides.rules) {
  const w = labelWidth(r.label);
  if (w > MAX_LABEL_WIDTH) fails.push(`ラベルの上書きが長すぎます(約${w.toFixed(1)}文字 > ${MAX_LABEL_WIDTH}): ${r.label}`);
}

const summaryFile = arg('--summary');
if (summaryFile !== undefined) {
  const s = JSON.parse(await readFile(summaryFile, 'utf8')) as {
    collect: { aborted: string | null } | null;
    newArticles: number;
    changedArticles: number;
    unparsed: number;
    prevArticles?: number;
    curArticles?: number;
  };
  const h = judgeHealth({
    collect: s.collect,
    prevArticles: s.prevArticles ?? records.length,
    curArticles: s.curArticles ?? records.length,
    newArticles: s.newArticles,
    changedArticles: s.changedArticles,
    unparsedNew: s.unparsed,
    configProblems: [],
  });
  for (const r of h.reasons) fails.push(`健全性: ${r}`);
}

for (const w of warns) console.log(`警告: ${w}`);
for (const f of fails) console.log(`要確認: ${f}`);
if (fails.length === 0) console.log(`点検OK${warns.length > 0 ? `(警告 ${warns.length} 件は要対応)` : ''}: 自動マージ可。`);
process.exit(fails.length > 0 ? 1 : 0);
