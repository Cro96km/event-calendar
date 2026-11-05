import { describe, expect, it } from 'vitest';
import { appTitle } from '../src/app';

describe('appTitle', () => {
  it('returns the app title', () => {
    expect(appTitle()).toBe('モンストイベントカレンダー');
  });
});
