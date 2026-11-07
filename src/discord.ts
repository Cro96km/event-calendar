// Discord への送信用の純関数(I/Oなし)。docs/operations.md §18 / scripts/discord-post.ts
import { SHOT_KINDS, type ShotKind } from './shot';

/** Discord のメッセージの flags: 通知を鳴らさない(SUPPRESS_NOTIFICATIONS)。 */
export const FLAG_SILENT = 4096;

export interface ShotFile {
  file: string;
  start: string;
  end: string;
  kind: ShotKind;
}

/** `2026-11-06_2026-11-12_summary.png` → 期間と種類。形式が違えば null。 */
export function parseShotFile(file: string): ShotFile | null {
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})_([a-z]+)\.png$/.exec(file);
  const kind = m?.[3];
  if (!m || !kind || !(SHOT_KINDS as readonly string[]).includes(kind)) return null;
  return { file, start: m[1] as string, end: m[2] as string, kind: kind as ShotKind };
}

/** 一覧から最新の期間(開始日が最大)の画像だけを、SHOT_KINDS の順に選ぶ。only があればその種類だけ。 */
export function selectLatest(files: readonly string[], only?: ShotKind): ShotFile[] {
  const parsed = files.map(parseShotFile).filter((f): f is ShotFile => f !== null);
  const start = parsed.map((f) => f.start).sort().pop();
  return parsed
    .filter((f) => f.start === start && (only === undefined || f.kind === only))
    .sort((a, b) => SHOT_KINDS.indexOf(a.kind) - SHOT_KINDS.indexOf(b.kind));
}

/** `2026-11-06` → `2026/11/06`。 */
function ymd(day: string): string {
  return day.replaceAll('-', '/');
}

/** メッセージの本文: 期間だけ。全画像を1通で送る。例: `2026/11/06 ~ 2026/11/12` */
export function messageContent(files: readonly ShotFile[]): string {
  const first = files[0];
  if (!first) throw new Error('送る画像がありません');
  return `${ymd(first.start)} ~ ${ymd(first.end)}`;
}

/** Discord は1通に最大10添付。 */
export const MAX_ATTACHMENTS = 10;

/** multipart の payload_json。全画像を1通に添付する。メンションは一切解釈させない。 */
export function buildPayload(files: readonly ShotFile[], silent: boolean): { content: string; flags?: number; allowed_mentions: { parse: [] }; attachments: { id: number; filename: string }[] } {
  if (files.length > MAX_ATTACHMENTS) throw new Error(`1通に添付できるのは ${MAX_ATTACHMENTS} 枚まで`);
  return {
    content: messageContent(files),
    ...(silent ? { flags: FLAG_SILENT } : {}),
    allowed_mentions: { parse: [] },
    attachments: files.map((f, id) => ({ id, filename: f.file })),
  };
}

/** Webhook の URL の形(https://discord.com/api/webhooks/<id>/<token>)か。値そのものは出力しない。 */
export function isWebhookUrl(url: string): boolean {
  return /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url);
}

/**
 * 環境変数 DISCORD_WEBHOOK_URL の値 → Webhook の URL の一覧。改行・カンマ区切りで複数可。空は除き、重複は1つにまとめる。
 * 形が違うものは invalid に、何件目か(1始まり)だけ入れる(値そのものは返さない・出さない)。
 */
export function parseWebhookUrls(raw: string): { urls: string[]; invalid: number[] } {
  const items = raw.split(/[\r\n,]+/).map((x) => x.trim()).filter((x) => x !== '');
  const urls: string[] = [];
  const invalid: number[] = [];
  items.forEach((x, i) => {
    if (!isWebhookUrl(x)) invalid.push(i + 1);
    else if (!urls.includes(x)) urls.push(x);
  });
  return { urls, invalid };
}

/** 429 のときの待ち時間(ミリ秒)。retry_after は秒。読めなければ null。上限 30 秒。 */
export function retryDelayMs(body: unknown): number | null {
  const v = (body as { retry_after?: unknown } | null)?.retry_after;
  return typeof v === 'number' && v >= 0 ? Math.min(Math.ceil(v * 1000) + 100, 30_000) : null;
}
