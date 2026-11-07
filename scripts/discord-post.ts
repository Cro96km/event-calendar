// npm run discord:post — discord:images で作った画像(最新の期間の分)を、Discord の Webhook へ1通にまとめて送る。
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SHOT_KINDS, type ShotKind } from '../src/shot';
import { buildPayload, messageContent, parseWebhookUrls, retryDelayMs, selectLatest } from '../src/discord';
import { showHelpIfRequested } from './_help';

showHelpIfRequested(`npm run discord:post [-- --dir DIR] [--only KIND] [--silent] [--dry-run]
  目的: 週表示の画像(ハイライト・クエスト・キャンペーン・キャラクター・ガチャ)を、Discord の Webhook へ1通にまとめて(本文は期間 YYYY/MM/DD ~ YYYY/MM/DD だけ)新しく投稿する。Webhook は複数可。
  使う場面: 毎週の転送(.github/workflows/discord.yml)と、画像の送信内容の確認(--dry-run)。
  オプション: --dir DIR(画像の置き場。既定 out/discord。複数の期間があれば最新の期間だけ送る)、--only KIND(summary/quest/campaign/gacha のどれか1枚だけ)、--silent(通知を鳴らさない)、--dry-run(送らず、送る内容だけ表示。Webhook の URL は不要)
  入力: 環境変数 DISCORD_WEBHOOK_URL(Webhook の URL。複数なら改行またはカンマ区切り。値は表示しない)。先に npm run discord:images で画像を作る。
  出力: 送った(送る)メッセージの見出し・ファイル名・サイズ。4枚を1通のメッセージに添付して送る。429 は待って最大3回やり直す。複数の Webhook は1つずつ送り、どれかが失敗しても残りには送って、最後に失敗があれば失敗で終わる(1つの Webhook への送信は1通なので、一部の画像だけ届くことはない)。
  副作用: Discord へ投稿する(取り消しは Discord 側で削除)。リポジトリは変えない。`);

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dir = resolve(arg('--dir') ?? 'out/discord');
const only = arg('--only');
const silent = argv.includes('--silent');
const dryRun = argv.includes('--dry-run');
if (only !== undefined && !(SHOT_KINDS as readonly string[]).includes(only)) throw new Error(`--only は ${SHOT_KINDS.join(' / ')}: ${only}`);

const targets = selectLatest(await readdir(dir).catch(() => []), only as ShotKind | undefined);
if (targets.length === 0) throw new Error(`${dir} に送る画像がありません。先に npm run discord:images を実行してください`);

const { urls, invalid } = parseWebhookUrls(process.env.DISCORD_WEBHOOK_URL ?? '');
if (!dryRun && (urls.length === 0 || invalid.length > 0)) {
  throw new Error(`環境変数 DISCORD_WEBHOOK_URL が無い、または Webhook の URL の形ではありません${invalid.length > 0 ? `(${invalid.join('・')} 件目)` : ''}(値は表示しません)`);
}

const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));

const files = await Promise.all(targets.map(async (f) => ({ f, bytes: await readFile(join(dir, f.file)) })));
const label = `${messageContent(targets)}\n` + files.map(({ f, bytes }) => `  ${f.file} (${(bytes.length / 1024).toFixed(0)} KB)`).join('\n');
if (dryRun) {
  console.log(`[dry-run] ${label}${silent ? ' [通知なし]' : ''}`);
  console.log(`dry-run: ${targets.length} 枚を1通で・Webhook ${urls.length} 件(送っていません)`);
} else {
  /** 1つの Webhook へ1通送る。429 は待って最大3回。失敗は Error(URL(秘密)は出さない。状態と応答の本文だけ) */
  const post = async (url: string): Promise<void> => {
    for (let attempt = 1; ; attempt++) {
      const form = new FormData();
      form.set('payload_json', JSON.stringify(buildPayload(targets, silent)));
      files.forEach(({ f, bytes }, i) => form.set(`files[${i}]`, new Blob([new Uint8Array(bytes)], { type: 'image/png' }), f.file));
      const res = await fetch(url, { method: 'POST', body: form });
      if (res.ok) return;
      const text = await res.text();
      if (res.status === 429 && attempt < 3) {
        let body: unknown = null;
        try {
          body = JSON.parse(text);
        } catch {
          /* 本文が JSON でなければ待ち時間は不明 */
        }
        await sleep(retryDelayMs(body) ?? 5000);
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
  };
  let failed = 0;
  for (const [i, url] of urls.entries()) {
    try {
      await post(url);
      console.log(`送信 ${i + 1}/${urls.length} 件目: 成功`);
    } catch (e) {
      failed++;
      console.error(`送信 ${i + 1}/${urls.length} 件目: 失敗(${e instanceof Error ? e.message : String(e)})`);
    }
  }
  console.log(`送信内容: ${label}\n完了: Webhook ${urls.length} 件中 ${urls.length - failed} 件に成功・${targets.length} 枚`);
  if (failed > 0) throw new Error(`Discord への送信に失敗: ${failed} 件`);
}
