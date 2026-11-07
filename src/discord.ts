// Discord への送信用の純関数(I/Oなし)。docs/operations.md §18 / scripts/discord-post.ts
import { SHOT_KINDS, type ShotKind } from './shot';

/** 各画像のメッセージの見出し語。 */
export const KIND_LABELS: Record<ShotKind, string> = { summary: '概要', quest: 'クエスト', campaign: 'キャンペーン', gacha: 'キャラクター・ガチャ' };

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

/** `2026-11-06` → `11/6`。 */
function md(day: string): string {
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
}

/** メッセージの本文(見出し)。例: `**概要** 11/6〜11/12` */
export function messageContent(f: ShotFile): string {
  return `**${KIND_LABELS[f.kind]}** ${md(f.start)}〜${md(f.end)}`;
}

/** multipart の payload_json。メンションは一切解釈させない。 */
export function buildPayload(f: ShotFile, silent: boolean): { content: string; flags?: number; allowed_mentions: { parse: [] }; attachments: { id: number; filename: string }[] } {
  return {
    content: messageContent(f),
    ...(silent ? { flags: FLAG_SILENT } : {}),
    allowed_mentions: { parse: [] },
    attachments: [{ id: 0, filename: f.file }],
  };
}

/** Webhook の URL の形(https://discord.com/api/webhooks/<id>/<token>)か。値そのものは出力しない。 */
export function isWebhookUrl(url: string): boolean {
  return /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url);
}

/** 429 のときの待ち時間(ミリ秒)。retry_after は秒。読めなければ null。上限 30 秒。 */
export function retryDelayMs(body: unknown): number | null {
  const v = (body as { retry_after?: unknown } | null)?.retry_after;
  return typeof v === 'number' && v >= 0 ? Math.min(Math.ceil(v * 1000) + 100, 30_000) : null;
}
