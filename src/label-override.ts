// クエスト・キャンペーンの行ラベルの上書き(DOMなし)。設定は config/display/label-overrides.json。spec §4.3.1。
import cfg from '../config/display/label-overrides.json';

export interface LabelOverride {
  /** 1行目 */
  l1: string;
  /** 2行目(任意) */
  l2: string | null;
}

const strip = (s: string): string => s.replace(/[「」『』]/g, '');

/** 項目名(「」『』を除く)に match を含む最初の規則のラベル。無ければ null。 */
export function labelOverride(name: string): LabelOverride | null {
  const n = strip(name);
  const r = cfg.rules.find((x) => n.includes(strip(x.match)));
  return r ? { l1: r.label, l2: 'desc' in r ? (r.desc as string) : null } : null;
}

/** 行ラベルの幅の目安(em)。全角=1、半角英数=0.6、半角の記号・空白=0.35。ラベル欄は約16em(13rem÷0.8rem)で1行に収まる。実測ではない。 */
export const labelWidth = (s: string): number => [...s].reduce((a, c) => a + (c.charCodeAt(0) < 0x80 ? (/[A-Za-z0-9]/.test(c) ? 0.6 : 0.35) : /[ｦ-ﾟ]/.test(c) ? 0.5 : 1), 0);

/** 1行に収まる幅の上限の目安(em)。安全側に15.5。 */
export const MAX_LABEL_WIDTH = 15.5;
