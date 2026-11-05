import { describe, expect, it } from 'vitest';
import { addMonths, clampToWindow, windowRange } from '../src/window';

describe('カレンダーの表示範囲(config/display/window.json)', () => {
  it('addMonths: 存在しない日は月末日、年をまたぐ', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-11-05', -12)).toBe('2025-11-05');
    expect(addMonths('2026-11-05', 12)).toBe('2027-11-05');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
  });
  it('windowRange と clampToWindow(既定は過去12か月・未来12か月)', () => {
    expect(windowRange('2026-11-05')).toEqual({ from: '2025-11-05', to: '2027-11-05' });
    expect(windowRange('2026-11-05', 6, 3)).toEqual({ from: '2026-05-05', to: '2027-02-05' });
    expect(clampToWindow('2020-01-01', '2026-11-05')).toBe('2025-11-05');
    expect(clampToWindow('2030-01-01', '2026-11-05')).toBe('2027-11-05');
    expect(clampToWindow('2026-12-01', '2026-11-05')).toBe('2026-12-01');
  });
});
