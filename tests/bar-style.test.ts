import { describe, expect, it } from 'vitest';
import { barStyleProblems, dayStyleOf } from '../src/bar-style';
import cfg from '../config/display/bar-style.json';

describe('日ごとの属性バーの見せ方(config/display/bar-style.json)', () => {
  it('既定は lines(縦線2本)。セクションごとに上書きできる', () => {
    expect(dayStyleOf('campaign')).toBe('lines');
    expect(dayStyleOf('quest', { default: 'off', sections: { quest: 'underline' } })).toBe('underline');
    expect(dayStyleOf('gacha', { default: 'off', sections: { quest: 'underline' } })).toBe('off');
    expect(dayStyleOf('gacha', { default: 'ふしぎ' })).toBe('lines'); // 不正な値は既定に戻す
  });
  it('現在の設定に誤りは無い。不正な値・無いセクションを検出する', () => {
    expect(barStyleProblems(cfg, ['quest', 'campaign', 'gacha'])).toEqual([]);
    const p = barStyleProblems({ default: 'x', sections: { campaign: 'stripes', nothing: 'lines', quest: 'y' } }, ['quest', 'campaign', 'gacha']).join('\n');
    expect(p).toContain('bar-style.default は');
    expect(p).toContain('「nothing」は order.json にないセクション');
    expect(p).toContain('「quest」は lines');
  });
});
