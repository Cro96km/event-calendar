// 判断の記憶(config/judge/decisions.json)・4区分・要判断ファイル(config/judge/needs-review.md)の純関数。spec §4.6。
import { classify, type Rule } from './classify';
import type { Candidate } from './selection';

/** 確定した判断(記憶に保存できる値)。未確定を含む classify.ts の Decision とは別。 */
export type Verdict = 'on' | 'off';

interface KindDecision {
  decision: Verdict;
  /** 人が読むための例(判断した行のタイトル)。この項目自身には記憶を無条件に適用する */
  example: string;
  /** 要判断ファイルで人が種類として確定した(=例以外の同種にも無条件に適用)。移行で学習しただけのものは未確定 */
  confirmed?: boolean;
}
export interface Decisions {
  /** 種類ID(`カテゴリ::種類キー`)→判断。『この種類は常に表示/非表示』 */
  kinds: Record<string, KindDecision>;
  /** 個別キー→判断。種類判断より優先(移行時に同種の中で判断が割れた項目の例外) */
  items: Record<string, Verdict>;
}
export const emptyDecisions = (): Decisions => ({ kinds: {}, items: {} });

/** 種類キーとして残すべき本文の最小長(括弧とその中身・記号・空白を除く)。短いと別物を同種と誤判定しやすい */
const MIN_KIND_CHARS = 10;

function blankKey(key: string): string {
  return key.replace(/「[^」]*」/g, '「」').replace(/『[^』]*』/g, '『』').replace(/[（(][^）)]*[）)]/g, '（）');
}

/**
 * 種類キー: 固有名(「」『』()の中身)を空にした文字列。ただし空にした後の本文が短い(MIN_KIND_CHARS未満)なら
 * 一般化しすぎで誤判定しうるため項目キー自身を種類キーとする(=同じ項目にしか適用しない)。
 */
export function kindKey(key: string): string {
  const b = blankKey(key);
  const body = b.replace(/[「」『』（）\s!！?？・、。]/g, '');
  return body.length >= MIN_KIND_CHARS ? b : key;
}
export const kindId = (category: string, key: string): string => `${category}::${kindKey(key)}`;

export type Bucket = 'recurring' | 'auto-on' | 'auto-off' | 'review';

export interface Judged {
  cand: Candidate;
  kind: string;
  decision: Verdict | null;
  source: 'memory' | 'rule' | null;
  /** ルール由来のとき一致したルール名 */
  rule: string | null;
  /** 同種(同じ種類ID)の候補が含まれる記事数の合計 */
  kindCount: number;
  bucket: Bucket;
  /** 記憶(未確定の種類判断)とルールが食い違い要判断に回した。値=記憶の判断 */
  conflict: Verdict | null;
}

/**
 * 候補を判定する。優先順: 個別の記憶 > 種類の記憶 > ルール(unsureは判断なし)。
 * 保守性: 種類の記憶が未確定(移行で学習しただけ)で、例以外の項目にルールが逆の判断を出す場合は
 * 誤適用を避けて要判断に回す。
 * 定例 = 判断済みで同種が複数記事に出現するもの(表示/非表示は初回判断=記憶またはルールを踏襲)。
 * 要判断 = 判断が無いもの(未選択=非表示扱い)。
 */
export function judgeAll(cands: Candidate[], d: Decisions, rules: Rule[] | null): Judged[] {
  const total = new Map<string, number>();
  for (const c of cands) total.set(kindId(c.category, c.key), (total.get(kindId(c.category, c.key)) ?? 0) + c.count);
  return cands.map((c) => {
    const id = kindId(c.category, c.key);
    const kindCount = total.get(id) ?? c.count;
    const kd = d.kinds[id];
    const itemCount = c.count;
    let decision: Verdict | null = d.items[c.key] ?? kd?.decision ?? null;
    let source: Judged['source'] = decision ? 'memory' : null;
    let rule: string | null = null;
    let conflict: Verdict | null = null;
    if (decision && d.items[c.key] === undefined && kd && !kd.confirmed && kd.example !== c.key && rules) {
      const cls = classify({ key: c.key, category: c.category, count: itemCount }, rules);
      if (cls.decision !== 'unsure' && cls.decision !== decision) [conflict, decision, source] = [decision, null, null];
    }
    if (!decision && !conflict && rules) {
      const cls = classify({ key: c.key, category: c.category, count: itemCount }, rules);
      if (cls.decision !== 'unsure') [decision, source, rule] = [cls.decision, 'rule', cls.rule];
    }
    const bucket: Bucket = decision === null ? 'review' : kindCount >= 2 ? 'recurring' : decision === 'on' ? 'auto-on' : 'auto-off';
    return { cand: c, kind: id, decision, source, rule, kindCount, bucket, conflict };
  });
}

export const selectedKeys = (js: Judged[]): string[] => js.filter((j) => j.decision === 'on').map((j) => j.cand.key);

export interface ReviewGroup {
  /** 種類キー(判断を適用する単位) */
  id: string;
  category: string;
  /** 例示タイトル(最大3) */
  examples: string[];
  count: number;
  /** 例示の直近期間とリンク */
  period: string;
  url: string;
  /** 記憶とルールの食い違いがあるときの記憶の判断 */
  conflict: Verdict | null;
}

/** 要判断の候補を同種ごとに集約する。 */
export function reviewGroups(js: Judged[]): ReviewGroup[] {
  const m = new Map<string, ReviewGroup>();
  for (const j of js) {
    if (j.bucket !== 'review') continue;
    const g = m.get(j.kind);
    if (!g) m.set(j.kind, { id: kindKey(j.cand.key), category: j.cand.category, examples: [j.cand.key], count: j.cand.count, period: j.cand.latest, url: j.cand.url, conflict: j.conflict });
    else {
      g.count += j.cand.count;
      g.examples.push(j.cand.key);
      g.conflict ??= j.conflict;
    }
  }
  return [...m.values()];
}

const REVIEW_LINE = /^- \[([ xX-])\] (.+?)(?: \| (.*))?$/;
export interface ReviewRow {
  /** ' '=未判断 / 'x'=常に表示 / '-'=常に非表示 */
  mark: ' ' | 'x' | '-';
  id: string;
  category: string;
  count: string;
  examples: string;
  period: string;
  url: string;
}

const REVIEW_HEADER = `# 要判断(ここだけ見れば良い)

同種の候補をまとめた行です。1行の判断が「この種類は常に表示/非表示」として記憶され、同種の以後の候補にも自動で適用されます。
- 表示する: \`- [x]\`
- 表示しない: \`- [-]\`
- 保留: \`- [ ]\` のまま(未選択=非表示扱い。次回も要判断に残る)
編集後に \`npm run candidates\` を実行すると config/judge/decisions.json に取り込まれ、この行は消えます。
先頭の種類キー・カテゴリは編集しないこと。\`|\` 区切り: 種類キー | カテゴリ | 件数 | 例 | 直近期間 | リンク
`;

export function renderReview(groups: ReviewGroup[]): string {
  const rows = groups.map((g) => `- [ ] ${g.id} | ${g.category} | ${g.count}件 | 例: ${g.examples.slice(0, 3).join(' / ')}${g.examples.length > 3 ? ` ほか${g.examples.length - 3}件` : ''} | ${g.period} | ${g.url}${g.conflict ? ` | 注意: 記憶は常に${g.conflict === 'on' ? '表示' : '非表示'}だがルールと食い違うため再確認` : ''}`);
  return `${REVIEW_HEADER}\n${rows.length ? rows.join('\n') : '(要判断はありません)'}\n`;
}

export function parseReview(md: string): { rows: ReviewRow[]; unrecognized: number } {
  const rows: ReviewRow[] = [];
  let unrecognized = 0;
  for (const line of md.split(/\r?\n/)) {
    const m = REVIEW_LINE.exec(line);
    if (!m) {
      if (/^- \[.*\]/.test(line) || /^\s*-\s*\[[^\]]*\]/.test(line)) unrecognized++;
      continue;
    }
    const f = (m[3] ?? '').split(' | ');
    rows.push({ mark: (m[1] === 'X' ? 'x' : m[1]) as ReviewRow['mark'], id: (m[2] as string).trim(), category: f[0] ?? '', count: f[1] ?? '', examples: (f[2] ?? '').replace(/^例:\s*/, ''), period: f[3] ?? '', url: f[4] ?? '' });
  }
  return { rows, unrecognized };
}

/** 要判断ファイルで確定した行(x / -)を記憶に取り込む。同じ種類の既存の判断は上書き。戻り値は取り込んだ行数。 */
export function importReview(d: Decisions, rows: ReviewRow[]): number {
  let n = 0;
  for (const r of rows) {
    if (r.mark === ' ' || r.category === '') continue;
    const verdict: Verdict = r.mark === 'x' ? 'on' : 'off';
    const old = d.kinds[`${r.category}::${r.id}`];
    if (old && !old.confirmed && old.decision !== verdict) {
      // 未確定の種類記憶と逆の判断(食い違い行の確定): 元の例の判断を反転させないよう、列挙された項目だけ個別に記憶
      for (const e of r.examples.replace(/ ほか\d+件$/, '').split(' / ')) if (e !== '') d.items[e] = verdict;
      n++;
      continue;
    }
    d.kinds[`${r.category}::${r.id}`] = { decision: verdict, example: old?.example ?? r.examples.split(' / ')[0] ?? r.id, confirmed: true };
    n++;
  }
  return n;
}

export function parseDecisions(json: unknown): Decisions {
  const o = json as { kinds?: Record<string, KindDecision>; items?: Record<string, Verdict> } | null;
  if (!o || typeof o.kinds !== 'object' || typeof o.items !== 'object' || o.kinds === null || o.items === null) throw new Error('decisions.json: kinds / items がありません');
  const ok = (v: unknown): boolean => v === 'on' || v === 'off';
  for (const [k, v] of Object.entries(o.kinds)) if (!ok(v?.decision)) throw new Error(`decisions.json: kinds[${k}].decision は on/off のみ`);
  for (const [k, v] of Object.entries(o.items)) if (!ok(v)) throw new Error(`decisions.json: items[${k}] は on/off のみ`);
  return { kinds: o.kinds, items: o.items };
}

/** 差分が読めるようキー順で安定出力する。 */
export function serializeDecisions(d: Decisions): string {
  const sort = <T>(r: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify({ kinds: sort(d.kinds), items: sort(d.items) }, null, 2)}\n`;
}

export const GENERATED_MARK = '<!-- generated: npm run candidates -->';

/** 候補の期間 `YYYY-MM-DD〜YYYY-MM-DD`(終了未定は `〜` のみ)の開始日と終了日(未定なら開始日)。 */
const periodDays = (latest: string): { start: string; end: string } => {
  const [start = '', end = ''] = latest.split('〜');
  return { start, end: end !== '' ? end : start };
};

/** 表示の判断の一覧に載せる範囲(YYYY-MM-DD)。カレンダーの表示範囲と同じ。 */
export interface SelectionRange {
  from: string;
  to: string;
}

const esc = (t: string): string => t.replace(/\|/g, '｜');

/**
 * 表示の判断の一覧(config/judge/selection/YYYY/MM.md)を、月ごとの表にして返す(キー=YYYY-MM、値=ファイルの中身。自動生成)。
 * 毎回、現在の状態を作り直す(追記ではない)。range の中(終了が from 以降、開始が to まで)の項目だけを、開始の月に載せる
 * (range より前に始まって続いている項目は最初の月)。日時を含めないので、判断が変わらない限り差分は出ない。
 * 各表は開始順。判定の列だけが変わるので、判断を変えたときの差分が小さい。
 */
export function renderSelectionMonths(js: Judged[], range: SelectionRange | null = null): Map<string, string> {
  const how = (j: Judged): string => {
    const base = j.source === 'memory' ? '判断の記憶' : j.source === 'rule' ? `ルール ${j.rule}` : '未判断';
    return j.bucket === 'recurring' ? `${base}(定例)` : base;
  };
  const verdict = (j: Judged): string => (j.decision === 'on' ? '表示' : j.decision === 'off' ? '非表示' : '要判断');
  const byMonth = new Map<string, Judged[]>();
  for (const j of js) {
    const { start, end } = periodDays(j.cand.latest);
    if (range !== null && (end < range.from || start > range.to)) continue;
    const month = (range !== null && start < range.from ? range.from : start).slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), j]);
  }
  const out = new Map<string, string>();
  for (const [month, list] of [...byMonth].sort(([a], [b]) => a.localeCompare(b))) {
    list.sort((a, b) => a.cand.latest.localeCompare(b.cand.latest) || a.cand.key.localeCompare(b.cand.key));
    const n = (d: string): number => list.filter((j) => verdict(j) === d).length;
    const rows = list.map((j) => `| ${verdict(j)} | ${esc(j.cand.key)} | ${j.cand.category} | ${j.cand.latest} | ${how(j)} | [記事](${j.cand.url}) |`);
    out.set(
      month,
      [
        GENERATED_MARK,
        `# 表示の判断 ${month}`,
        '',
        '自動生成です(`npm run update` が作り直します)。**編集しないでください**。判断を変えるときは、要対応の Issue のチェック(`/apply`)、`config/judge/decisions.json`(種類・項目の記憶)、`config/judge/rules.json`(自動ルール)を直します。',
        '',
        `表示 ${n('表示')}件 / 非表示 ${n('非表示')}件 / 要判断 ${n('要判断')}件(要判断は、判断するまで非表示)。開始の月の表。表示範囲より前に始まって続いている項目は、最初の月に載せています。メンテナンスと手動の調整(\`config/schedule/manual.json\`)は載りません。`,
        '',
        '| 判定 | 項目 | カテゴリ | 期間 | 理由 | 記事 |',
        '|---|---|---|---|---|---|',
        ...rows,
        '',
      ].join('\n'),
    );
  }
  return out;
}

export const countBuckets = (js: Judged[]): Record<Bucket, number> => {
  const r: Record<Bucket, number> = { recurring: 0, 'auto-on': 0, 'auto-off': 0, review: 0 };
  for (const j of js) r[j.bucket]++;
  return r;
};
