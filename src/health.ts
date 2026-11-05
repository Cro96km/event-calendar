// 更新PRの健全性チェック(DOMなし・純関数)。自動マージしてよいかを、理由つきで返す。閾値は config/judge/health.json。
import cfg from '../config/judge/health.json';

export interface HealthLimits {
  /** 既存の記事の書き換えの上限(件)。maxChangedRatio×既存件数 と大きい方まで許す */
  maxChangedArticles: number;
  maxChangedRatio: number;
  /** この件数以上の新規があるとき、期間が取れない新規の割合を調べる */
  minNewArticles: number;
  maxUnparsedRatio: number;
}

export interface HealthInput {
  /** 収集の結果。収集しなかった(設定だけの反映)ときは null */
  collect: { aborted: string | null } | null;
  prevArticles: number;
  curArticles: number;
  newArticles: number;
  changedArticles: number;
  /** 期間が取れなかった新規の記事数 */
  unparsedNew: number;
  /** 設定自体の矛盾(星墓の設定など) */
  configProblems: readonly string[];
}

export interface Health {
  ok: boolean;
  /** 要確認の理由(ok なら空) */
  reasons: string[];
}

export const DEFAULT_LIMITS: HealthLimits = cfg;

/** 自動マージしてよいか。満たさなければ理由を返す(CI=lint/テスト/ビルド/公開データ生成の成否は、ワークフローが別に見る)。 */
export function judgeHealth(i: HealthInput, limits: HealthLimits = DEFAULT_LIMITS): Health {
  const reasons: string[] = [];
  if (i.collect?.aborted) reasons.push(`収集が最後まで終わっていません(${i.collect.aborted})`);
  if (i.curArticles < i.prevArticles) reasons.push(`記事が減っています(${i.prevArticles}件 → ${i.curArticles}件)`);
  const maxChanged = Math.max(limits.maxChangedArticles, Math.floor(i.prevArticles * limits.maxChangedRatio));
  if (i.changedArticles > maxChanged) reasons.push(`既存の記事の書き換えが多すぎます(${i.changedArticles}件 > 上限${maxChanged}件。公式サイトの構造変更の疑い)`);
  if (i.newArticles >= limits.minNewArticles && i.unparsedNew / i.newArticles > limits.maxUnparsedRatio) {
    reasons.push(`期間が取れない新規の記事が多すぎます(${i.unparsedNew}/${i.newArticles}件。パーサの対応が必要な可能性)`);
  }
  for (const p of i.configProblems) reasons.push(`設定の矛盾: ${p}`);
  return { ok: reasons.length === 0, reasons };
}
