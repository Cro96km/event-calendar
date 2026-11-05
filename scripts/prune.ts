// npm run prune — 表示範囲より前に終わった記事(data/articles)を削除する。詳細は --help と docs/operations.md §15。
import { readdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { articlePath, readAllRecords } from '../src/data/store';
import { pruneTargets } from '../src/prune';
import { jstDay, windowRange } from '../src/window';
import { showHelpIfRequested } from './_help';

const DIR = 'data/articles';

showHelpIfRequested(`npm run prune [-- --apply] [--before YYYY-MM-DD]
  目的: カレンダーの表示範囲(config/display/window.json の過去の月数)より前に終わった記事を、正本(data/articles)から削除する。
  使う場面: データが増えすぎたとき、不要な古い記事を整理したいとき。既定は確認だけ(削除しない)。
  オプション:
    (なし)            削除対象の件数と月別の内訳、例を表示するだけ(ファイルは変えない)
    --apply           実際に削除する(空になったディレクトリも消す)
    --before DATE     この日(YYYY-MM-DD)より前に終わった記事を対象にする(既定: 今日から過去の限界の日)
    --help            この説明
  対象: 最も遅い項目の終了(未定は開始)、項目が無い記事は公開日が、基準の日より前のもの。範囲の中まで続く記事は残る。
  入力: data/articles、config/display/window.json
  出力: 削除した記事の件数。削除後は main への PR にする(git で戻せる)。判断の記憶(config/judge/decisions.json)は変えない。
  注意: 削除した記事は、公式サイトの一覧から再び取り込まれることがある(--since で過去分を取り直した場合など)。
  副作用: --apply のときだけファイルを削除する。ネットワークには触れない。`);

const argv = process.argv.slice(2);
const before = ((): string => {
  const i = argv.indexOf('--before');
  if (i < 0) return windowRange(jstDay(Date.now())).from;
  const v = argv[i + 1] ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw new Error('--before は実在する YYYY-MM-DD です(--help)');
  return v;
})();

const records = await readAllRecords(DIR);
const targets = pruneTargets(records, before);
const byMonth = new Map<string, number>();
for (const r of targets) byMonth.set(r.id.slice(0, 6), (byMonth.get(r.id.slice(0, 6)) ?? 0) + 1);
console.log(`基準: ${before} より前に終わった記事 ${targets.length} 件 / 全 ${records.length} 件`);
for (const [m, n] of [...byMonth].sort(([a], [b]) => a.localeCompare(b))) console.log(`  ${m.slice(0, 4)}-${m.slice(4)}: ${n}件`);
if (targets.length === 0) process.exit(0);
if (!argv.includes('--apply')) {
  console.log(`例: ${targets.slice(0, 3).map((r) => `${r.id} ${r.title}`).join(' / ')}`);
  console.log('削除していません。実際に削除するには --apply を付けてください。');
  process.exit(0);
}
for (const r of targets) {
  const file = articlePath(DIR, r.id);
  await rm(file, { force: true });
  for (let d = dirname(file); d !== DIR && (await readdir(d).catch(() => ['x'])).length === 0; d = dirname(d)) await rm(d, { recursive: true, force: true });
}
console.log(`削除しました: ${targets.length} 件。残り ${records.length - targets.length} 件。`);
