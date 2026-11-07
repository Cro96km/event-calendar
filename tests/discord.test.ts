import { describe, expect, it } from 'vitest';
import { buildPayload, isWebhookUrl, messageContent, parseShotFile, retryDelayMs, selectLatest } from '../src/discord';

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

  it('見出しは「M/D〜M/D 種類・種類…」(0埋めなし)', () => {
    expect(messageContent(selectLatest(['2026-11-06_2026-11-12_summary.png', '2026-11-06_2026-11-12_quest.png']))).toBe('**11/6〜11/12** 概要・クエスト');
    expect(messageContent(selectLatest(['2026-12-31_2027-01-06_campaign.png']))).toBe('**12/31〜1/6** キャンペーン');
  });

  it('payload は全画像を1通に添付・メンション無効。silent のときだけ flags=4096', () => {
    const fs = selectLatest(week1);
    expect(buildPayload(fs, false)).toEqual({
      content: '**11/6〜11/12** 概要・クエスト・キャラクター・ガチャ',
      allowed_mentions: { parse: [] },
      attachments: fs.map((f, id) => ({ id, filename: f.file })),
    });
    expect(buildPayload(fs, true).flags).toBe(4096);
  });

  it('Webhook の URL の形を確かめる(別のホスト・http・パス違いは不可)', () => {
    expect(isWebhookUrl('https://discord.com/api/webhooks/123456789/abc-DEF_123')).toBe(true);
    expect(isWebhookUrl('http://discord.com/api/webhooks/123/abc')).toBe(false);
    expect(isWebhookUrl('https://example.com/api/webhooks/123/abc')).toBe(false);
    expect(isWebhookUrl('https://discord.com/api/webhooks/123')).toBe(false);
    expect(isWebhookUrl('')).toBe(false);
  });

  it('429 の待ち時間は retry_after(秒)から。読めなければ null、上限30秒', () => {
    expect(retryDelayMs({ retry_after: 1.5 })).toBe(1600);
    expect(retryDelayMs({ retry_after: 999 })).toBe(30000);
    expect(retryDelayMs({})).toBeNull();
    expect(retryDelayMs(null)).toBeNull();
  });
});
