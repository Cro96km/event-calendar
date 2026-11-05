// npm run discord:images — 週表示のカレンダー画像(概要・クエスト・キャンペーン・ガチャの4枚)をローカルに作る。Discord には送らない。
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { SHOT_KINDS, isDay, type ShotKind } from '../src/shot';
import { showHelpIfRequested } from './_help';

showHelpIfRequested(`npm run discord:images [-- --dist DIR] [--out DIR] [--date YYYY-MM-DD] [--only KIND]
  目的: Discord 用に、週表示(基準日から7日)のカレンダーを PNG にする。概要(summary)・クエスト(quest)・キャンペーン(campaign)・ガチャ(gacha)の4枚。メンテナンスの帯は4枚とも出る。
  使う場面: 画像の見た目や、概要の絞り込み(config/display/discord.json)を確認するとき。
  オプション: --dist DIR(ビルド結果。既定 dist)、--out DIR(出力先。既定 out/discord)、--date(基準日。既定=今日〈ゲーム日〉)、--only KIND(summary/quest/campaign/gacha のどれか1枚だけ)
  入力: npm run build:public の出力(dist/ と dist/data)。ローカルで配信して撮る。公式サイトにも公開サイトにもアクセスしない。ブラウザは Playwright の Chromium(初回は npx playwright install chromium。日本語フォント fonts-noto-cjk などが必要)。
  出力: <out>/<kind>.png(summary.png など)。標準出力に各ファイルのサイズ。画像は git に含めない(out/ は ignore)。
  副作用: out の同名ファイルを上書き。ローカルのポートを一時的に使う。ネットワークには出ない。`);

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dist = resolve(arg('--dist') ?? 'dist');
const outDir = resolve(arg('--out') ?? 'out/discord');
const date = arg('--date');
const only = arg('--only');
if (date !== undefined && !isDay(date)) throw new Error(`--date は YYYY-MM-DD(実在の日付): ${date}`);
if (only !== undefined && !(SHOT_KINDS as readonly string[]).includes(only)) throw new Error(`--only は ${SHOT_KINDS.join(' / ')}: ${only}`);
const kinds: readonly ShotKind[] = only ? [only as ShotKind] : SHOT_KINDS;

await stat(join(dist, 'data', 'index.json')).catch(() => {
  throw new Error(`${dist}/data/index.json がありません。先に npm run update と npm run build:public を実行してください`);
});

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
// dist/ だけを配信する(127.0.0.1 のみ。パスは dist の外に出さない)
const server = createServer((req, res) => {
  void (async () => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0] as string);
    const file = resolve(join(dist, normalize(path === '/' ? '/index.html' : path)));
    if (!file.startsWith(dist + sep)) return void res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  })();
});
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
const addr = server.address();
const port = typeof addr === 'object' && addr ? addr.port : 0;

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  // 日時はJST・日本語・ライト固定。2倍の解像度で、文字を読みやすくする
  const context = await browser.newContext({ timezoneId: 'Asia/Tokyo', locale: 'ja-JP', colorScheme: 'light', viewport: { width: 800, height: 900 }, deviceScaleFactor: 2 });
  for (const kind of kinds) {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/?shot=${kind}${date ? `&date=${date}` : ''}`);
    await page.waitForSelector('[data-testid="shot"]', { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    const file = join(outDir, `${kind}.png`);
    await page.locator('[data-testid="shot"]').screenshot({ path: file });
    console.log(`${file} (${((await stat(file)).size / 1024).toFixed(0)} KB)`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
