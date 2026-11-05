// 表示候補の自動分類(純関数)。ルールは config/judge/rules.json。spec §4.6。
import type { Candidate } from './selection';

export type Decision = 'on' | 'off' | 'unsure';

export interface Rule {
  name: string;
  /** unsure=該当したら人に確認(未選択でレビュー依頼に載る) */
  decision: Decision;
  category?: string[];
  title_includes?: string[];
  /** 正規表現(いずれにも一致する語の順序を指定したいとき。例: 期間限定.*ミッション) */
  title_regex?: string;
  min_count?: number;
}

export interface Classification {
  decision: Decision;
  /** 一致したルール名。どれにも一致しなければ null(unsure) */
  rule: string | null;
}

/** 設定JSONの検証。不正なら理由付きで投げる(誤設定で黙って全unsureにしない)。 */
export function parseRules(json: unknown): Rule[] {
  const rules = (json as { rules?: unknown } | null)?.rules;
  if (!Array.isArray(rules)) throw new Error('rules.json: "rules" が配列ではありません');
  const names = new Set<string>();
  return rules.map((r: Rule, i: number) => {
    if (typeof r?.name !== 'string' || r.name === '' || /[()|]/.test(r.name)) throw new Error(`rules.json: rules[${i}].name が不正です`);
    if (names.has(r.name)) throw new Error(`rules.json: ルール名が重複しています: ${r.name}`);
    names.add(r.name);
    if (r.decision !== 'on' && r.decision !== 'off' && r.decision !== 'unsure') throw new Error(`rules.json: ${r.name}.decision は on/off/unsure のみ`);
    const known = ['name', 'decision', 'category', 'title_includes', 'title_regex', 'min_count'];
    const unknown = Object.keys(r).find((k) => !known.includes(k));
    if (unknown) throw new Error(`rules.json: ${r.name} に未知のキー ${unknown} があります`);
    if (r.category === undefined && r.title_includes === undefined && r.title_regex === undefined && r.min_count === undefined) throw new Error(`rules.json: ${r.name} に条件がありません`);
    for (const k of ['category', 'title_includes'] as const) {
      const v: unknown = r[k];
      if (v !== undefined && !(Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x !== ''))) throw new Error(`rules.json: ${r.name}.${k} は空でない文字列の配列にしてください`);
    }
    if (r.title_regex !== undefined) {
      try {
        new RegExp(r.title_regex);
      } catch {
        throw new Error(`rules.json: ${r.name}.title_regex が正規表現として不正です`);
      }
      if (r.title_regex === '') throw new Error(`rules.json: ${r.name}.title_regex は空にできません`);
    }
    if (r.min_count !== undefined && !(Number.isInteger(r.min_count) && r.min_count >= 1)) throw new Error(`rules.json: ${r.name}.min_count は1以上の整数にしてください`);
    return r;
  });
}

const matches = (r: Rule, c: Pick<Candidate, 'key' | 'category' | 'count'>): boolean =>
  (r.category === undefined || r.category.includes(c.category)) &&
  (r.title_includes === undefined || r.title_includes.some((w) => c.key.includes(w))) &&
  (r.title_regex === undefined || new RegExp(r.title_regex).test(c.key)) &&
  (r.min_count === undefined || c.count >= r.min_count);

export function classify(c: Pick<Candidate, 'key' | 'category' | 'count'>, rules: Rule[]): Classification {
  const hit = rules.find((r) => matches(r, c));
  return hit ? { decision: hit.decision, rule: hit.name } : { decision: 'unsure', rule: null };
}

const MARK = /^自動:(on|off|\?)\s*(?:\((.*)\))?$/;
/** 旧形式(移行用)の自動判定印 `自動:on(ルール名)` / `自動:?` を解釈する */
export function parseMark(s: string): Classification | null {
  const m = MARK.exec(s.trim());
  if (!m) return null;
  return { decision: m[1] === '?' ? 'unsure' : (m[1] as Decision), rule: m[2] ?? null };
}
