// npm run scrape [-- --pages N]  /  npm run reparse
import { RawCache } from '../src/scraper/cache';
import { Fetcher, RateLimitedError } from '../src/scraper/http';
import { reparse, scrape } from '../src/scraper/scrape';
import { showHelpIfRequested } from './_help';

showHelpIfRequested(`npm run scrape [-- --pages N]  /  npm run reparse
  目的: scrape = 公式ニュースの生HTMLを data/raw に保存するだけ(正本は作らない)。reparse = data/raw から期間を抽出し直して結果を表示する。
  使う場面: 取得だけを分けて試すとき(通常は npm run update)。reparse はパーサの調査・確認(ファイルは書かない)。
  オプション(scrape): --pages N  巡回するページ数(既定2)
  入力: scrape=公式ニュース(ネットワーク)、reparse=data/raw
  出力: scrape=data/raw(git管理外)、reparse=標準出力(記事ID・解析結果・警告・件数)
  副作用: scrape は公式サイトへアクセスする(礼節は docs/operations.md §4)。reparse はネットワークに触れない。`);

const cache = new RawCache('data/raw');

if (process.argv[2] === 'reparse') {
  const rows = await reparse(cache);
  for (const r of rows) {
    console.log(`${r.id}\t${r.parse_status}\tevents=${r.events}${r.warnings.length ? `\t! ${r.warnings.join(' / ')}` : ''}`);
  }
  const count = (s: string) => rows.filter((r) => r.parse_status === s).length;
  console.log(`total=${rows.length} ok=${count('ok')} partial=${count('partial')} none=${count('none')}`);
} else {
  const i = process.argv.indexOf('--pages');
  const pages = i >= 0 ? Number(process.argv[i + 1]) : 2;
  if (!Number.isInteger(pages) || pages < 1) throw new Error('--pages は1以上の整数');
  const res = await scrape({ fetcher: new Fetcher(), cache, pages, log: console.log }).catch((e: unknown) => {
    if (e instanceof RateLimitedError) {
      console.error(`429で中断。Retry-After=${e.retryAfter ?? '不明'}。この時間が過ぎるまで再実行しないこと。`);
      process.exit(1);
    }
    throw e;
  });
  console.log(`items=${res.items.length} fetched=${res.fetched.length} skipped=${res.skipped.length} 404=${res.notFound.length}`);
}
