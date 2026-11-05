// npm run collect [-- --pages N --since YYYY-MM-DD]  /  npm run rebuild (キャッシュ済み生HTMLから再生成。再取得なし)
import { collect, rebuild } from '../src/data/collect';
import { RawCache } from '../src/scraper/cache';
import { Fetcher } from '../src/scraper/http';
import { showHelpIfRequested } from './_help';

showHelpIfRequested(`npm run collect [-- --pages N --since YYYY-MM-DD]  /  npm run rebuild
  目的: collect = 公式ニュースを収集し、正本(data/articles)と表示用データ(public/data)を更新する。判定の再生成・差分レポートはしない。
        rebuild = キャッシュ済みの生HTML(data/raw)から正本を作り直す(再取得なし)。
  使う場面: collect はローカルで収集だけ試すとき(通常は npm run update)。rebuild はパーサを直した後。
  オプション(collect):
    --pages N           巡回するページ数(既定2)。--since 指定時は上限(既定200)
    --since YYYY-MM-DD  この公開日より古くなるまで巡回(初回・過去分用。公式サイトへの負荷が大きい)
  入力: collect=公式ニュース(ネットワーク)、rebuild=data/raw
  出力: data/articles、public/data、data/runs.log(実行ログ。git管理外)、data/raw(collectのみ。git管理外)
  副作用: collect は公式サイトへアクセスする。間隔2秒以上・直列・429で即中断(礼節。docs/operations.md §4)。`);

if (process.argv[2] === '--rebuild') {
  const r = await rebuild({ cache: new RawCache('data/raw'), articlesDir: 'data/articles', publicDir: 'public/data' });
  console.log(`records=${r.records} written=${r.written}`);
  process.exit(0);
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const since = arg('--since');
if (since !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(since) && new Date(`${since}T00:00:00Z`).toISOString().startsWith(since))) throw new Error('--since は YYYY-MM-DD');
// --since 指定時は pages を上限(既定200)として公開日が since より古くなるまで巡回する
const pages = Number(arg('--pages') ?? (since ? 200 : 2));
if (!Number.isInteger(pages) || pages < 1) throw new Error('--pages は1以上の整数');

const s = await collect({
  fetcher: new Fetcher(),
  cache: new RawCache('data/raw'),
  pages,
  since,
  articlesDir: 'data/articles',
  publicDir: 'public/data',
  runsLog: 'data/runs.log',
  log: console.log,
});
console.log(`items=${s.items} fetched=${s.fetched} written=${s.written} months=${s.months.length}`);
console.log(`今回: ok=${s.run.ok} partial=${s.run.partial} none=${s.run.none} / 全体: ok=${s.total.ok} partial=${s.total.partial} none=${s.total.none}`);
if (s.aborted) {
  console.error(`中断: ${s.aborted}（ここまでの結果は保存済み）`);
  if (s.aborted.startsWith('RateLimitedError')) console.error('429のRetry-Afterが過ぎるまで再実行しないこと。');
  process.exit(1);
}
