import { describe, expect, it } from 'vitest';
import { gameDayOf, isOnGameDay, todayGameDay, todayJstDay } from '../src/gameday';

const at = (iso: string): Date => new Date(iso);

describe('todayGameDay', () => {
  it('3:59 JST は前日', () => {
    expect(todayGameDay(at('2026-10-23T03:59:00+09:00'))).toBe('2026-10-22');
  });
  it('4:00 JST から当日', () => {
    expect(todayGameDay(at('2026-10-23T04:00:00+09:00'))).toBe('2026-10-23');
  });
  it('0:00〜3:59 は前日', () => {
    expect(todayGameDay(at('2026-10-23T00:00:00+09:00'))).toBe('2026-10-22');
    expect(todayGameDay(at('2026-10-23T02:30:00+09:00'))).toBe('2026-10-22');
  });
  it('11:59 は当日', () => {
    expect(todayGameDay(at('2026-10-23T11:59:00+09:00'))).toBe('2026-10-23');
  });
  it('月初・年またぎ', () => {
    expect(gameDayOf(at('2027-01-01T03:59:00+09:00'))).toBe('2026-12-31');
  });
  it('実行環境のTZに依存しない(UTC基準の入力でもJSTで判定)', () => {
    expect(gameDayOf(at('2026-10-22T19:00:00Z'))).toBe('2026-10-23'); // 10/23 4:00 JST
    expect(gameDayOf(at('2026-10-22T18:59:00Z'))).toBe('2026-10-22'); // 10/23 3:59 JST
  });
});

describe('isOnGameDay', () => {
  const ev = (start: string, end: string | null) => ({ start, end });
  it('終了が丁度4:00なら翌ゲーム日には出さない', () => {
    const e = ev('2026-10-20T12:00:00+09:00', '2026-10-23T04:00:00+09:00');
    expect(isOnGameDay(e, '2026-10-22')).toBe(true);
    expect(isOnGameDay(e, '2026-10-23')).toBe(false);
  });
  it('3:59終了は前ゲーム日のみ', () => {
    const e = ev('2026-10-20T12:00:00+09:00', '2026-10-23T03:59:00+09:00');
    expect(isOnGameDay(e, '2026-10-22')).toBe(true);
    expect(isOnGameDay(e, '2026-10-23')).toBe(false);
  });
  it('0:00〜3:59開始は前ゲーム日に属する', () => {
    const e = ev('2026-10-23T01:00:00+09:00', '2026-10-23T11:59:00+09:00');
    expect(isOnGameDay(e, '2026-10-22')).toBe(true);
    expect(isOnGameDay(e, '2026-10-23')).toBe(true);
  });
  it('11:59終了は当日のみ', () => {
    const e = ev('2026-10-23T12:00:00+09:00', '2026-10-24T11:59:00+09:00');
    expect(isOnGameDay(e, '2026-10-22')).toBe(false);
    expect(isOnGameDay(e, '2026-10-23')).toBe(true);
    expect(isOnGameDay(e, '2026-10-24')).toBe(true);
    expect(isOnGameDay(e, '2026-10-25')).toBe(false);
  });
  it('end=null は開始ゲーム日のみ', () => {
    const e = ev('2026-10-17T04:00:00+09:00', null);
    expect(isOnGameDay(e, '2026-10-16')).toBe(false);
    expect(isOnGameDay(e, '2026-10-17')).toBe(true);
    expect(isOnGameDay(e, '2026-10-18')).toBe(false);
  });
});

describe('todayJstDay', () => {
  it('0:00で切り替わる(ゲーム日の4:00ではない)', () => {
    expect(todayJstDay(at('2026-10-30T23:59:00+09:00'))).toBe('2026-10-30');
    expect(todayJstDay(at('2026-10-31T00:15:00+09:00'))).toBe('2026-10-31');
    expect(todayGameDay(at('2026-10-31T00:15:00+09:00'))).toBe('2026-10-30');
  });
});
