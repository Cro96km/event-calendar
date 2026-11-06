// 表示順・小見出しの設定(config/display/order.json)の点検。純関数。spec §4.3.8
import order from '../config/display/order.json';
import type { GroupDef } from './sections';

const SORTS = ['fixed', 'name', 'start', 'builtin'];
/** コードが特別扱いする役割(セクションごとに、各1つ必須)。 */
const ROLES: Record<string, readonly string[]> = { quest: ['event', 'raid', 'super'], gacha: ['event', 'regular', 'evolution'], campaign: [] };
/** default(どれにも入らない項目の小見出し)が必須のセクション。 */
const NEEDS_DEFAULT = ['quest', 'gacha'];

export interface OrderConfig {
  sections: { id: string; label: string; hue: number; sat?: number; lit?: number; categories: string[] }[];
  groups: Record<string, GroupDef[]>;
}

/** order.json の誤り。小見出しの名前・個数は自由。役割(role)と default は必須。 */
export function orderProblems(cfg: OrderConfig = order as unknown as OrderConfig): string[] {
  const p: string[] = [];
  const ids = cfg.sections.map((x) => x.id);
  for (const need of ['quest', 'campaign', 'gacha']) if (!ids.includes(need)) p.push(`sections に ${need} が必要です`);
  if (new Set(ids).size !== ids.length) p.push('sections の id が重複しています');
  for (const x of cfg.sections) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(x.id)) p.push(`sections「${x.id}」: id は英小文字・数字・ハイフン`);
    if (x.label.trim() === '') p.push(`sections「${x.id}」: label が空です`);
    if (!Number.isInteger(x.hue) || x.hue < 0 || x.hue > 359) p.push(`sections「${x.id}」: hue は 0〜359 の整数`);
    if (x.sat !== undefined && !(Number.isInteger(x.sat) && x.sat >= 0 && x.sat <= 100)) p.push(`sections「${x.id}」: sat は 0〜100 の整数`);
    if (x.lit !== undefined && !(Number.isInteger(x.lit) && x.lit >= -15 && x.lit <= 15)) p.push(`sections「${x.id}」: lit は −15〜15 の整数`);
  }
  for (const sec of Object.keys(ROLES)) {
    const gs = cfg.groups[sec];
    if (!gs || gs.length === 0) {
      p.push(`groups.${sec} が必要です`);
      continue;
    }
    const names = gs.map((g) => g.name);
    for (const g of gs) {
      const w = `groups.${sec}「${g.name}」`;
      if (g.name.trim() === '') p.push(`groups.${sec}: name が空の小見出しがあります`);
      if (g.sort !== undefined && !SORTS.includes(g.sort)) p.push(`${w}: sort は ${SORTS.join(' / ')}`);
      if (g.then !== undefined && g.then !== 'name' && g.then !== 'start') p.push(`${w}: then は name か start`);
      if (g.words?.some((x) => x.trim() === '')) p.push(`${w}: words に空の語があります`);
      if (g.sort === 'fixed' && (g.words ?? []).length === 0) p.push(`${w}: sort が fixed のときは words が必要です`);
      if (g.match === 'words' && (g.words ?? []).length === 0) p.push(`${w}: match が "words" のときは words が必要です`);
      if (g.match !== undefined && g.match !== 'words' && g.match !== 'name') {
        if (g.match.includes === undefined && g.match.pattern === undefined) p.push(`${w}: match は "words" / "name" / {includes} / {pattern}`);
        if (g.match.includes?.some((x) => x.trim() === '')) p.push(`${w}: match.includes に空の語があります`);
        if (g.match.pattern !== undefined) {
          try {
            new RegExp(g.match.pattern);
          } catch {
            p.push(`${w}: match.pattern が正規表現として不正です`);
          }
        }
      }
      if (g.role !== undefined && !(ROLES[sec] ?? []).includes(g.role)) p.push(`${w}: role は ${(ROLES[sec] ?? []).join(' / ') || '(このセクションは無し)'}`);
      if (g.aliases?.some((x) => x.trim() === '')) p.push(`${w}: aliases に空の語があります`);
      if (g.label_strip !== undefined && !(Array.isArray(g.label_strip) && g.label_strip.every((x) => typeof x === 'string' && x.trim() !== ''))) p.push(`${w}: label_strip は空でない語の配列`);
    }
    if (new Set(names).size !== names.length) p.push(`groups.${sec}: name が重複しています`);
    for (const role of ROLES[sec] ?? []) {
      const n = gs.filter((g) => g.role === role).length;
      if (n !== 1) p.push(`groups.${sec}: role「${role}」の小見出しが ${n} 個です(1つ必要)`);
    }
    const defaults = gs.filter((g) => g.default).length;
    if (NEEDS_DEFAULT.includes(sec) ? defaults !== 1 : defaults > 1) p.push(`groups.${sec}: default の小見出しは${NEEDS_DEFAULT.includes(sec) ? '1つ必要' : '1つまで'}です(${defaults} 個)`);
  }
  const aliasOwner = new Map<string, string>();
  for (const g of cfg.groups.campaign ?? []) for (const a of g.aliases ?? []) {
    if (aliasOwner.has(a)) p.push(`groups.campaign: alias「${a}」が複数の小見出しにあります`);
    aliasOwner.set(a, g.name);
  }
  return p;
}
