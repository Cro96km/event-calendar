import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import order from '../config/display/order.json';
import { orderProblems, type OrderConfig } from '../src/order-check';
import { overrideProblems, type OverridesConfig } from '../src/overrides';

/** md の ```json ブロックを取り出す。 */
const blocks = (file: string): unknown[] => [...readFileSync(file, 'utf8').matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1] as string));

describe('設定の記入例(md)が実際の書式に合っている', () => {
  it('overrides.md の例は点検を通る', () => {
    const ex = blocks('config/schedule/overrides.md') as OverridesConfig[];
    expect(ex.length).toBeGreaterThan(0);
    for (const cfg of ex) expect(overrideProblems(cfg).problems).toEqual([]);
  });
  it('order.md の例は、現在の設定に重ねても点検を通る', () => {
    const ex = blocks('config/display/order.md') as Partial<OrderConfig>[];
    expect(ex.length).toBeGreaterThan(0);
    for (const part of ex) {
      const base = structuredClone(order) as unknown as OrderConfig;
      expect(orderProblems({ ...base, ...part, groups: { ...base.groups, ...part.groups } })).toEqual([]);
    }
  });
});
