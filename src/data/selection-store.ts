// 表示の判断(判断の記憶・ルール)の適用と、結果の書き出し(public/data/selection.json=カレンダー用。読む用の一覧は台帳 config/judge/calendar/)。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseRules, type Rule } from '../classify';
import { countBuckets, emptyDecisions, importReview, judgeAll, parseDecisions, parseReview, renderReview, reviewGroups, serializeDecisions, type Bucket, type Decisions, type Judged } from '../decisions';
import { buildCandidates, selectionJson } from '../selection';
import { readTextIfExists as readText } from '../read-text';
import type { ArticleRecord } from './record';

/** 自動分類ルール。ファイルが無ければ空(=自動判定なし。従来どおり新規は全て未選択)。不正な設定は投げる。 */
export async function readRules(path: string): Promise<Rule[] | null> {
  const text = await readText(path);
  return text === null ? null : parseRules(JSON.parse(text));
}

export const readSelectionText = (path: string): Promise<string | null> => readText(path);

export interface Paths {
  /** 要判断(ユーザが編集する唯一のファイル) */
  review: string;
  /** 判断の記憶 */
  decisions: string;
}

export const readDecisions = async (path: string): Promise<Decisions | null> => {
  const t = await readText(path);
  return t === null ? null : parseDecisions(JSON.parse(t));
};

export interface CandidatesResult {
  candidates: number;
  /** 表示(on)の数 */
  selected: number;
  buckets: Record<Bucket, number>;
  /** 要判断(同種を集約した行数) */
  reviewGroups: number;
  /** 要判断ファイルから今回記憶に取り込んだ行数 */
  imported: number;
  /** 認識できなかったチェック行(書式崩れ)の数 */
  unrecognized: number;
  /** 全候補の判定(候補キー→判定)。台帳の判定・理由の列に使う */
  judged: Judged[];
}

/**
 * 要判断ファイルの確定行を記憶へ取り込み → 候補を判定 → 要判断 / selection.json を再生成する(台帳は呼び出し側が judged から作る)。
 */
export async function runCandidates(records: ArticleRecord[], paths: Paths, publicDir: string, generatedAt: string, rules: Rule[] | null = null): Promise<CandidatesResult> {
  let decisions = await readDecisions(paths.decisions);
  const rv = parseReview((await readText(paths.review)) ?? '');
  decisions ??= emptyDecisions();
  const imported = importReview(decisions, rv.rows);
  const cands = buildCandidates(records);
  const js = judgeAll(cands, decisions, rules);
  const groups = reviewGroups(js);
  await mkdir(dirname(paths.decisions), { recursive: true });
  if (imported > 0 || (await readText(paths.decisions)) === null) await writeFile(paths.decisions, serializeDecisions(decisions));
  await writeFile(paths.review, renderReview(groups));
  // カレンダー用は全件の判断から直接作る(読む用の一覧を読み戻さない)
  await mkdir(publicDir, { recursive: true });
  const sel = new Map(js.map((j) => [j.cand.key, j.decision === 'on'] as const));
  await writeFile(join(publicDir, 'selection.json'), `${JSON.stringify(selectionJson(sel, generatedAt), null, 2)}\n`);
  return { candidates: cands.length, selected: [...sel.values()].filter(Boolean).length, buckets: countBuckets(js), reviewGroups: groups.length, imported, unrecognized: rv.unrecognized, judged: js };
}

/** 取り込みはせず、現在の判断の記憶とルールで全候補を判定する(台帳だけを作り直すとき用)。 */
export async function currentJudgments(records: ArticleRecord[], decisionsPath: string, rulesPath: string): Promise<Judged[]> {
  const decisions = (await readDecisions(decisionsPath)) ?? emptyDecisions();
  return judgeAll(buildCandidates(records), decisions, await readRules(rulesPath));
}
