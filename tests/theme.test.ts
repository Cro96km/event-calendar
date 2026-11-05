// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { IndexFile } from '../src/data/export';
import { applyTheme, currentTheme, loadTheme, saveTheme } from '../src/theme';
import { initialState, render } from '../src/ui';

const INDEX: IndexFile = { generated_at: '2026-11-05T09:00:00+09:00', months: [], categories: [] };

beforeEach(() => {
  localStorage.clear();
  applyTheme('light');
});

describe('画面の色(ライト/ダーク)', () => {
  it('既定はライト(OSの設定には合わせない)。保存した色を読む。壊れた値はライト', () => {
    expect(loadTheme()).toBe('light');
    saveTheme('dark');
    expect(loadTheme()).toBe('dark');
    localStorage.setItem('theme', 'purple');
    expect(loadTheme()).toBe('light');
  });

  it('applyTheme は data-theme を付け外しする(ライトでは付けない)', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(currentTheme()).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(currentTheme()).toBe('light');
  });

  const draw = () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.querySelector('#app') as HTMLElement;
    render(root, initialState('2026-11-05', [], INDEX));
    return root;
  };
  const btn = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]') as HTMLButtonElement;

  it('切替ボタン: 押すとダーク⇄ライトが切り替わり、保存され、ラベルが変わる', () => {
    const root = draw();
    expect(btn(root).textContent).toBe(''); // 文字ではなく記号
    expect(btn(root).querySelector('.icon-moon')).not.toBeNull(); // ライト中は「ダークにする」月の記号
    expect(btn(root).getAttribute('aria-label')).toBe('ダーク表示にする');
    btn(root).click();
    expect(currentTheme()).toBe('dark');
    expect(loadTheme()).toBe('dark');
    expect(btn(root).querySelector('.icon-sun')).not.toBeNull(); // ダーク中は「ライトにする」太陽の記号
    expect(btn(root).getAttribute('aria-label')).toBe('ライト表示にする');
    expect(btn(root).title).toBe('ライト表示にする');
    btn(root).click();
    expect(currentTheme()).toBe('light');
    expect(loadTheme()).toBe('light');
    expect(btn(root).querySelector('.icon-moon')).not.toBeNull();
  });

  it('週/月の切替も記号(切替先のカレンダー)。ラベルは aria-label・title', () => {
    const root = draw();
    const v = root.querySelector<HTMLButtonElement>('[data-testid="view-toggle"]') as HTMLButtonElement;
    expect(v.textContent).toBe('');
    expect(v.querySelector('.icon-calendar-month')).not.toBeNull();
    expect(v.getAttribute('aria-label')).toBe('月表示にする');
    v.click();
    const v2 = root.querySelector<HTMLButtonElement>('[data-testid="view-toggle"]') as HTMLButtonElement;
    expect(v2.querySelector('.icon-calendar-week')).not.toBeNull();
    expect(v2.getAttribute('aria-label')).toBe('週表示にする');
    expect(v2.title).toBe('週表示にする');
  });

  it('撮影モード(Discord の画像)には切替ボタンを出さない', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.querySelector('#app') as HTMLElement;
    const state = initialState('2026-11-05', [], INDEX);
    state.shot = 'summary';
    render(root, state);
    expect(root.querySelector('[data-testid="theme-toggle"]')).toBeNull();
  });
});
