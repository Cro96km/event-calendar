// npm run discord:post — discord:images で作った画像(最新の期間の分)を、Discord の Webhook へ1枚ずつ送る。
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SHOT_KINDS, type ShotKind } from '../src/shot';
import { buildPayload, isWebhookUrl, messageContent, retryDelayMs, selectLatest } from '../src/discord';
import { showHelpIfRequested } from './_help';

showHelpIfRequested(`npm run discord:post [-- --dir DIR] [--only KIND] [--silent] [--dry-run]
  目的: 週表示の画像(概要・クエスト・キャンペーン・キャラクター・ガチャ)を、Discord の Webhook へ1枚ずつ(見出しの文字つきで)新しく投稿する。
  使う場面: 毎週の転送(.github/workflows/discord.yml)と、画像の送信内容の確認(--dry-run)。
  オプション: --dir DIR(画像の置き場。既定 out/discord。複数の期間があれば最新の期間だけ送る)、--only KIND(summary/quest/campaign/gacha のどれか1枚だけ)、--silent(通知を鳴らさない)、--dry-run(送らず、送る内容だけ表示。Webhook の URL は不要)
  入力: 環境変数 DISCORD_WEBHOOK_URL(Webhook の URL。値は表示しない)。先に npm run discord:images で画像を作る。
  出力: 送った(送る)メッセージの見出し・ファイル名・サイズ。送信は直列で、1秒あけ、429 は待って最大3回やり直す。途中で失敗したら、そこで止めて失敗(送れたものは再送しない。--only で残りだけ送れる)。
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

const url = process.env.DISCORD_WEBHOOK_URL ?? '';
if (!dryRun && !isWebhookUrl(url)) throw new Error('環境変数 DISCORD_WEBHOOK_URL が無い、または Webhook の URL の形ではありません(値は表示しません)');

const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));

async function post(f: (typeof targets)[number], bytes: Buffer): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const form = new FormData();
    form.set('payload_json', JSON.stringify(buildPayload(f, silent)));
    form.set('files[0]', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), f.file);
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
    // URL(秘密)は出さない。状態と応答の本文だけ
    throw new Error(`Discord への送信に失敗(HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
}

let sent = 0;
for (const f of targets) {
  const bytes = await readFile(join(dir, f.file));
  const label = `${messageContent(f)}  ${f.file} (${(bytes.length / 1024).toFixed(0)} KB)`;
  if (dryRun) {
    console.log(`[dry-run] ${label}${silent ? ' [通知なし]' : ''}`);
    continue;
  }
  if (sent > 0) await sleep(1000);
  try {
    await post(f, bytes);
  } catch (e) {
    console.error(`送信済み ${sent}/${targets.length} 件。${f.kind} で失敗`);
    throw e;
  }
  sent++;
  console.log(`送信: ${label}`);
}
console.log(dryRun ? `dry-run: ${targets.length} 件(送っていません)` : `完了: ${sent} 件`);
