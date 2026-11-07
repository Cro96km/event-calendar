import { describe, expect, it } from 'vitest';
import { CALENDAR_URL, buildPayload, isWebhookUrl, messageContent, parseShotFile, parseWebhookUrls, retryDelayMs, selectLatest } from '../src/discord';

const week1 = ['2026-11-06_2026-11-12_gacha.png', '2026-11-06_2026-11-12_summary.png', '2026-11-06_2026-11-12_quest.png'];
const old = ['2026-10-30_2026-11-05_summary.png', '2026-10-30_2026-11-05_character.png'];

describe('Discord 送信の純関数', () => {
  it('ファイル名から期間と種類を読む。形式が違う・未知の種類は null', () => {
    expect(parseShotFile('2026-11-06_2026-11-12_summary.png')).toEqual({ file: '2026-11-06_2026-11-12_summary.png', start: '2026-11-06', end: '2026-11-12', kind: 'summary' });
    expect(parseShotFile('summary.png')).toBeNull();
    expect(parseShotFile('2026-11-06_2026-11-12_other.png')).toBeNull();
    expect(parseShotFile('2026-11-06_2026-11-12_summary.jpg')).toBeNull();
  });

  it('最新の期間の画像だけを、概要→クエスト→…の順で選ぶ(古い期間は送らない)', () => {
    expect(selectLatest([...old, ...week1, 'note.txt']).map((f) => f.kind)).toEqual(['summary', 'quest', 'gacha']);
    expect(selectLatest(week1, 'quest').map((f) => f.kind)).toEqual(['quest']);
    expect(selectLatest(['x.txt'])).toEqual([]);
  });

  it('本文は「YYYY/MM/DD ~ YYYY/MM/DD ｜ [カレンダー全体はこちら](URL)」(0埋め・種類名なし)', () => {
    expect(messageContent(selectLatest(['2026-11-06_2026-11-12_summary.png', '2026-11-06_2026-11-12_quest.png']))).toBe(`2026/11/06 ~ 2026/11/12 ｜ [カレンダー全体はこちら](${CALENDAR_URL})`);
    expect(messageContent(selectLatest(['2026-12-31_2027-01-06_campaign.png']))).toBe(`2026/12/31 ~ 2027/01/06 ｜ [カレンダー全体はこちら](${CALENDAR_URL})`);
    expect(CALENDAR_URL).toBe('https://cro96km.github.io/event-calendar/');
  });

  it('payload は全画像を1通に添付・メンション無効・リンクのプレビューなし(flags=4)。silent のときは 4|4096', () => {
    const fs = selectLatest(week1);
    expect(buildPayload(fs, false)).toEqual({
      content: `2026/11/06 ~ 2026/11/12 ｜ [カレンダー全体はこちら](${CALENDAR_URL})`,
      flags: 4,
      allowed_mentions: { parse: [] },
      attachments: fs.map((f, id) => ({ id, filename: f.file })),
    });
    expect(buildPayload(fs, true).flags).toBe(4 | 4096);
  });

  it('Webhook の URL の形を確かめる(別のホスト・http・パス違いは不可)', () => {
    expect(isWebhookUrl('https://discord.com/api/webhooks/123456789/abc-DEF_123')).toBe(true);
    expect(isWebhookUrl('http://discord.com/api/webhooks/123/abc')).toBe(false);
    expect(isWebhookUrl('https://example.com/api/webhooks/123/abc')).toBe(false);
    expect(isWebhookUrl('https://discord.com/api/webhooks/123')).toBe(false);
    expect(isWebhookUrl('')).toBe(false);
  });

  it('Webhook の URL は改行・カンマ区切りで複数。空・重複は除き、形が違うものは何件目かだけ返す', () => {
    const a = 'https://discord.com/api/webhooks/1/aaa';
    const b = 'https://discordapp.com/api/webhooks/2/bbb';
    expect(parseWebhookUrls(a)).toEqual({ urls: [a], invalid: [] });
    expect(parseWebhookUrls(` ${a}\r\n\n${b},${a}, `)).toEqual({ urls: [a, b], invalid: [] });
    expect(parseWebhookUrls(`${a}\nhttp://x.example/y`)).toEqual({ urls: [a], invalid: [2] });
    expect(parseWebhookUrls('')).toEqual({ urls: [], invalid: [] });
  });

  it('429 の待ち時間は retry_after(秒)から。読めなければ null、上限30秒', () => {
    expect(retryDelayMs({ retry_after: 1.5 })).toBe(1600);
    expect(retryDelayMs({ retry_after: 999 })).toBe(30000);
    expect(retryDelayMs({})).toBeNull();
    expect(retryDelayMs(null)).toBeNull();
  });
});
