// 対象ステージ/階層クエストの名前の属性色と、破界の星墓の固定の階層(DOMなし)。設定は config/display/quest-colors.json・config/schedule/hakai.json。spec §4.7。
import cfg from '../config/display/quest-colors.json';
import hakai from '../config/schedule/hakai.json';
import type { DetailBlock } from './details';

const PALETTE = cfg.palette as Record<string, string>;
const KINKI = cfg.kinki as Record<string, string>;
const QUESTS = (cfg as { quests?: Record<string, string> }).quests ?? {};

const hex = (key: string | undefined): string | undefined => (key !== undefined && Object.hasOwn(PALETTE, key) ? PALETTE[key] : undefined);

/** `&`/`＆` と中黒を揃える(設定は半角・中黒なし。記事には `ティル・ナ・ノーグ` のような表記ゆれがある)。 */
export const norm = (s: string): string => s.replace(/＆/g, '&').replace(/[・･]/g, '');

/**
 * クエスト名の属性色 `#rrggbb`。禁忌の獄(`火獄の無量大数`)は名前の先頭の属性、破界の星墓は config/schedule/hakai.json の quests の名前を含むもの(上から最初の一致)。
 * 項目の接頭辞(`・`・`1階層：`)は呼び出し側で除く。設定に無ければ undefined。
 */
export function questNameColor(name: string): string | undefined {
  const n = norm(name.trim());
  // 名前が固定のクエスト(特Lの園の 獄炎の神殿 など。設定の quests)
  const fixed = Object.keys(QUESTS).find((w) => n.includes(norm(w)));
  if (fixed !== undefined) return hex(KINKI[QUESTS[fixed] as string]);
  const k = /^(.)獄/.exec(n)?.[1];
  if (k !== undefined && Object.hasOwn(KINKI, k)) return hex(KINKI[k]);
  const h = hakai.quests.find((x) => n.includes(norm(x.name)));
  return h ? hex(h.color) : undefined;
}

/** 色を付ける対象のブロックか(対象ステージ/階層のクエスト)。他のブロックの文は色付けしない。 */
export const isQuestNameBlock = (label: string): boolean => /対象ステージ|階層.*クエスト/.test(label);

interface Schedule {
  since: string;
  floors: { floor: number; quest: string }[];
}

/** 開催の開始日(ISO。省略時は最新)に since が当てはまる最後の版の階層 `[{floor, name}]`。どの版も当てはまらなければ空。 */
export function pickFloors(schedules: readonly Schedule[], eventStart?: string): { floor: number; name: string }[] {
  const day = eventStart?.slice(0, 10);
  const versions = schedules.filter((s) => day === undefined || s.since <= day);
  const v = versions[versions.length - 1];
  return (v?.floors ?? []).map((f) => ({ floor: f.floor, name: `${f.quest}の星墓` }));
}

/** 破界の星墓の階層クエストの固定の階層(config/schedule/hakai.json の schedules)。 */
export const fixedFloors = (eventStart?: string): { floor: number; name: string }[] => pickFloors(hakai.schedules, eventStart);

/**
 * 破界の星墓の階層クエストのブロックに、記事に載っていない階層(config/schedule/hakai.json の schedules。開催の開始日に合う版)を固定で追加する。
 * 表示時の整形(保存データは変えない)。同じ階層番号が記事にあれば追加しない。ラベルの `～5階層` は最大の階層に直す。
 * 破界の星墓の項目の階層クエストのブロック以外はそのまま返す。
 */
export function withFixedFloors(eventName: string, block: DetailBlock, eventStart?: string): DetailBlock {
  if (!eventName.includes('破界の星墓') || !/階層.*クエスト/.test(block.label)) return block;
  const fixed = fixedFloors(eventStart);
  const have = new Set(block.lines.map((l) => /^(\d+)階層/.exec(l)?.[1]).filter((x): x is string => x !== undefined));
  const extra = fixed.filter((f) => !have.has(String(f.floor))).map((f) => `${f.floor}階層：${f.name}`);
  if (extra.length === 0) return block;
  const max = Math.max(...fixed.map((f) => f.floor));
  return { ...block, label: block.label.replace(/～\s*\d+階層/, `～${max}階層`), lines: [...block.lines, ...extra] };
}
