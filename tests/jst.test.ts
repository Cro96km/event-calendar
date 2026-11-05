import { describe, expect, it } from 'vitest';
import { padDateTime, padMonthDay, padTime } from '../src/jst';

describe('padMonthDay', () => {
  it('M/D を MM/DD に0埋めする(複数・範囲・曜日付き)', () => {
    expect(padMonthDay('9/7')).toBe('09/07');
    expect(padMonthDay('9/27 0:00〜10/6 11:59')).toBe('09/27 0:00〜10/06 11:59');
    expect(padMonthDay('1/2(金) 木属性')).toBe('01/02(金) 木属性');
  });
  it('すでに0埋め済み・年付き(年は残す)・数字に挟まれた/・年代は変えない', () => {
    expect(padMonthDay('10/20')).toBe('10/20');
    expect(padMonthDay('2026/1/1 0:00〜1/2 11:59')).toBe('2026/01/01 0:00〜01/02 11:59');
    expect(padMonthDay('2013＆2014')).toBe('2013＆2014');
    expect(padMonthDay('100/200')).toBe('100/200');
    expect(padMonthDay('12/31 0:00〜2026/12/31 11:59')).toBe('12/31 0:00〜2026/12/31 11:59');
    expect(padMonthDay('Ver.32.1')).toBe('Ver.32.1');
  });
});

describe('padTime / padDateTime', () => {
  it('H:MM を HH:MM に0埋めする(範囲・日付付き)', () => {
    expect(padTime('0:00')).toBe('00:00');
    expect(padTime('8:00〜9:05')).toBe('08:00〜09:05');
    expect(padDateTime('9/27 0:00〜10/6 8:05')).toBe('09/27 00:00〜10/06 08:05');
    expect(padDateTime('2026/1/1 0:00〜1/2 11:59')).toBe('2026/01/01 00:00〜01/02 11:59');
  });
  it('すでに0埋め済み・数字やコロンに挟まれたもの・時刻でない表記は変えない', () => {
    expect(padTime('12:00')).toBe('12:00');
    expect(padTime('1:2:3')).toBe('1:2:3');
    expect(padTime('Ver.32.1 比率1:100')).toBe('Ver.32.1 比率1:100');
    expect(padTime('100:00')).toBe('100:00');
  });
});
