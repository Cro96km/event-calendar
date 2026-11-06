// 週表示UI。fetchは行わず、読み込み済みデータを描画する（テストでは固定の今日・データを注入）。
import type { ExportEvent, IndexFile } from './data/export';
import { appTitle } from './app';
import { monthlyEvents, type MonthlyDef } from './monthly';
import { clampToWindow, windowRange } from './window';
import { type BarSpan, addDays, isOnCalendarDay, campaignGroup, questGroup, maintenanceBars, maintenanceOnDay, addMonthsToDay, dayLabel, monthWindow, eventsForDay, formatJst, ganttSections, mergeSameLabel, rowLabel, periodText, unlockText, whenText, slotRows, weekDays, weekdayOf } from './week';
import { EVENT_QUEST_SUFFIX, MAINTENANCE_CATEGORY, gachaGroup, sectionOf } from './sections';
import { barEdgeColors, foldNewLimited } from './newlimited';
import { attributeColor, type Attribute } from './characters';
import { dayAttrColors, dayEdgeSegments, edgeColorCss } from './day-edge';
import { dayStyleOf, type DayStyle } from './bar-style';
import { fullLabel, shortLabel } from './label';
import { PICKUP_SCHEDULE_LABEL, normalQuestBlock, tableOf, type DetailBlock } from './details';
import { padDateTime } from './jst';
import { isQuestNameBlock, questNameColor, withFixedFloors } from './quest-color';
import { icon } from './icons';
import { applyTheme, currentTheme, saveTheme } from './theme';
import { SHOT_4AM_FRAC, compactEvolutionRows, shotEndFrac, shotStartFrac, summaryBlocks, type ShotKind } from './shot';

interface Selection {
  day: string;
  /** 指定時はそのeventのみ、未指定ならその日の全event */
  eventId?: string;
}

export interface AppState {
  today: string;
  events: ExportEvent[];
  /** 公式サイトから最後に収集した時刻。不明なら null */
  collectedAt: string | null;
  selection: Selection | null;
  /** 毎月決まった日の項目の定義(config/schedule/monthly-days.json)。テストでは既定で空 */
  monthly: readonly MonthlyDef[];
  /** 週=今日から7日(ローリング)、月=monthStart から同じ日の翌月前日まで(ローリング) */
  view: 'week' | 'month';
  /** 週表示の先頭日(初期は今日。前後で7日ずつ移動) */
  weekStart: string;
  /** 月表示の先頭日(初期は今日。ドラッグで1日ずつ、< > で1か月ずつ移動) */
  monthStart: string;
  /** 畳んだセクションID(localStorage に保存) */
  collapsed: Set<string>;
  /** 更新ボタン(開発サーバのみ。未設定ならボタンを出さない)。成功/失敗とメッセージを返す */
  refresh?: () => Promise<{ ok: boolean; message: string }>;
  updating: boolean;
  updateMessage: string;
  /** 撮影モード(?shot=…。Discord 用の画像。spec §4.12)。指定時は操作・詳細・注意書きを出さず、種類のセクションだけを週表示で描く */
  shot?: ShotKind;
}

const COLLAPSED_KEY = 'collapsedSections';
function loadCollapsed(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
function saveCollapsed(c: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...c]));
  } catch {
    /* 保存できなくても動作する */
  }
}

/** events は選択ファイル適用済み(main.ts)。表示は今日(ゲーム日4:00境界)から7日のみ。 */
export function initialState(today: string, events: ExportEvent[], index: IndexFile, monthly: readonly MonthlyDef[] = []): AppState {
  return {
    today,
    events: mergeSameLabel(events),
    collectedAt: index.collected_at ?? null,
    selection: null,
    monthly,
    view: 'week',
    weekStart: today,
    monthStart: today,
    collapsed: loadCollapsed(),
    updating: false,
    updateMessage: '',
  };
}

/** ドラッグ量(px)→移動日数。列幅ごとに1日(左へドラッグ=先へ。週・月共通)。0なら移動なし。 */
export function dragShift(dx: number, colWidth: number): number {
  return colWidth > 0 ? -Math.round(dx / colWidth) : 0;
}
const DRAG_START_PX = 6;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderDetail(state: AppState, rerender: () => void): HTMLElement {
  const panel = el('aside', 'detail');
  panel.dataset.testid = 'detail';
  const sel = state.selection;
  if (!sel) return panel;
  // 新限定キャラは、同じ記事・期間のガチャの項目に畳む(ガチャの詳細に名前と属性を出す)
  const pool = foldNewLimited([...state.events, ...monthlyEvents(addDays(sel.day, -1), addDays(sel.day, 1), state.monthly)]);
  // バーは暦日の列に描くので、バーを押したときは暦日で判定する(翌4:00終了などでも「イベントなし」にしない)
  // イベントクエスト行のバーは、ガチャ由来の写し(id末尾 ~event)。詳細は元のガチャイベントを、タイトルは行ラベル(「ガチャ」なし)で出す
  const baseId = sel.eventId?.endsWith(EVENT_QUEST_SUFFIX) ? sel.eventId.slice(0, -EVENT_QUEST_SUFFIX.length) : sel.eventId;
  const entries = sel.eventId
    ? pool.filter((e) => e.id === baseId && sectionOf(e.category) !== null && isOnCalendarDay(e, sel.day)).map((e) => ({ event: baseId === sel.eventId ? e : { ...e, name: rowLabel('gacha', e).l1 } }))
    : eventsForDay(pool, sel.day);
  // メンテナンス(帯)も、帯を選んだとき/日付を選んだときに出す
  const maint = state.events.filter((e) => (sel.eventId ? e.id === sel.eventId : true) && maintenanceOnDay(e, sel.day));
  const close = el('button', 'close', '×');
  close.setAttribute('aria-label', '閉じる');
  close.title = '閉じる';
  close.dataset.testid = 'detail-close';
  close.onclick = () => {
    state.selection = null;
    rerender();
  };
  panel.append(close, el('h2', undefined, dayLabel(sel.day)));
  if (entries.length === 0 && maint.length === 0) panel.append(el('p', undefined, 'この日のイベントはありません'));
  for (const event of [...maint, ...entries.map((x) => x.event)]) {
    const item = el('section', 'detail-item');
    item.append(el('h3', undefined, fullLabel(event.name)));
    // 進化の解禁は開催期間でなく解禁の日時(12:00・22:00など)を出す
    if (unlockText(event) !== '') item.append(el('p', undefined, `解禁日時: ${unlockText(event)}`));
    else if (periodText(event) !== '') item.append(el('p', undefined, `${event.category === MAINTENANCE_CATEGORY ? '実施日程' : '開催期間'}: ${periodText(event)}`));
    if (event.new_names?.length) {
      // 名前(属性)を属性色で書く
      const note = el('p', 'detail-note', '新限定キャラクター: ');
      event.new_names.forEach((n, i) => {
        if (i > 0) note.append('、');
        const nm = el('span', undefined, n.attr ? `${n.name}(${n.attr})` : n.name);
        if (n.color && paint(nm, n.color)) nm.classList.add('qname');
        note.append(nm);
      });
      item.append(note);
    }
    // 報酬受取期限は表示しない(別記事の内容を取り込み大半が誤りのため)
    if (event.slots?.length) {
      const box = el('div', 'detail-block');
      box.dataset.testid = 'detail-slots';
      box.append(el('h4', undefined, '日別の時間帯'));
      const table = el('table', 'detail-table');
      const slotTable = slotRows(event.slots);
      const cols = Math.max(...slotTable.map((r) => r.times.length));
      const head = el('tr');
      for (const h of ['日付', ...Array.from({ length: cols }, (_, i) => String.fromCodePoint(0x2460 + i))]) head.append(el('th', undefined, h));
      const thead = el('thead');
      thead.append(head);
      const body = el('tbody');
      for (const r of slotTable) {
        const row = el('tr');
        row.append(el('td', undefined, r.date), ...Array.from({ length: cols }, (_, i) => el('td', undefined, r.times[i] ?? '')));
        body.append(row);
      }
      table.append(thead, body);
      box.append(table);
      item.append(box);
    }
    const derived = normalQuestBlock(event);
    // 手動の修正(overrides.json): 注記を出し、指定のブロックは出さない
    for (const note of event.fix?.notes ?? []) item.append(el('p', 'detail-note', note));
    const blocks: DetailBlock[] = [...(event.details ?? []), ...(derived ? [derived] : [])].filter((b) => !event.fix?.hide_blocks?.includes(b.label));
    for (const block0 of blocks) {
      const block = withFixedFloors(event.name, block0, event.start);
      const box = el('div', 'detail-block');
      box.append(el('h4', undefined, block.label));
      const t = tableOf(block.lines);
      if (t) {
        const table = el('table', 'detail-table');
        const tr = el('tr');
        for (const h of t.head) tr.append(el('th', undefined, h));
        const thead = el('thead');
        thead.append(tr);
        table.append(thead);
        const body = el('tbody');
        // 1列目が空欄の行は直前の行と同じ対象(ガチャ開催スケジュール): 表の縦結合(rowspan)で見せる
        const merge = t.head[0] === '対象';
        const qnames = isQuestNameBlock(block.label);
        let owner: HTMLTableCellElement | null = null;
        // ピックアップの全期間の表では、クリックした回(開始が一致する行)を強調する
        const cur = block.label === PICKUP_SCHEDULE_LABEL ? `${event.start.slice(5, 7)}/${event.start.slice(8, 10)} ${event.start.slice(11, 16)}` : null;
        for (const r of t.rows) {
          const row = el('tr', r[1] === '土' ? 'sat' : r[1] === '日' ? 'sun' : undefined);
          if (cur !== null && r[1]?.startsWith(cur)) row.classList.add('cur');
          r.forEach((c, i) => {
            if (merge && i === 0 && c === '' && owner) {
              owner.rowSpan += 1;
              return;
            }
            const td = el('td', undefined, c);
            // 対象キャラクターの表: 名前(1列目)と属性(3列目)を属性色で
            if (t.head[0] === 'キャラクター' && (i === 0 || i === 2)) {
              const ac = attrColorInText(r[2] ?? '');
              if (ac && paint(td, ac)) td.classList.add('qname');
            }
            // キャンペーンの対象属性の表: 火・水・木・光・闇の字をそれぞれ属性色で
            if (t.head[2] === '対象属性' && i === 2) {
              // 名前が固定のクエスト(特Lの園など)はその属性色でセルの文字すべて。属性が1つならセルの文字すべて、複数なら属性の字だけ
              const qc = questNameColor(c);
              if (qc && paint(td, qc)) td.classList.add('qname');
              else colorAttrs(td, c);
            }
            // 階層クエストの名前(2列目)に属性色(config/display/quest-colors.json)
            if (qnames && i === 1) {
              const qc = questNameColor(c);
              if (qc && paint(td, qc)) td.classList.add('qname');
            }
            if (merge && i === 0) {
              td.className = 'sched-name';
              owner = td;
              const color = block.colors && Object.hasOwn(block.colors, c) ? block.colors[c] : undefined;
              if (color) paint(td, color);
            }
            row.append(td);
          });
          body.append(row);
        }
        table.append(body);
        box.append(table);
      } else {
        const ul = el('ul');
        for (const line of block.lines) {
          const li = el('li', undefined, /^\d{1,2}\/\d{1,2}(?!\d)/.test(line) ? padDateTime(line) : line);
          // 対象ステージ(禁忌の獄)の名前に属性色。`N階層：` の接頭辞は除いて判定
          const qc = isQuestNameBlock(block.label) ? questNameColor(line.replace(/^\d+階層\s*[：:]\s*/, '')) : undefined;
          if (qc && paint(li, qc)) li.classList.add('qname');
          ul.append(li);
        }
        box.append(ul);
      }
      item.append(box);
    }
    if (event.url) {
      const a = el('a', undefined, '公式記事');
      a.href = event.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      item.append(a);
    }
    panel.append(item);
  }
  return panel;
}

interface DragState {
  startX: number;
  baseWeekStart: string;
  baseMonthStart: string;
  colWidth: number;
  moved: boolean;
}
/** ドラッグ中は再描画で grid が差し替わるため、状態はモジュール側に持つ。 */
let drag: DragState | null = null;
let suppressClick = false;

/** カレンダーを横にドラッグ/スワイプして、ドラッグ中に表示をずらす(放して確定ではない)。しきい値を超えたドラッグ後のクリックは無効。 */
function attachDrag(grid: HTMLElement, state: AppState, rerender: () => void): void {
  if (drag?.moved) grid.classList.add('dragging');
  grid.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as Element | null)?.closest('.g-label')) return; // 左のラベルでは横操作しない
    drag = {
      startX: e.clientX,
      baseWeekStart: state.weekStart,
      baseMonthStart: state.monthStart,
      colWidth: grid.querySelector('.g-date')?.getBoundingClientRect().width || 40,
      moved: false,
    };
    suppressClick = false;
    const move = (ev: PointerEvent): void => {
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) <= DRAG_START_PX) return;
      drag.moved = true;
      suppressClick = true;
      const n = dragShift(dx, drag.colWidth);
      const weekStart = clampToWindow(addDays(drag.baseWeekStart, n), state.today);
      const monthStart = clampToWindow(addDays(drag.baseMonthStart, n), state.today);
      if (state.view === 'week' ? weekStart === state.weekStart : monthStart === state.monthStart) return;
      if (state.view === 'week') state.weekStart = weekStart;
      else state.monthStart = monthStart;
      state.selection = null;
      rerender();
    };
    const end = (): void => {
      drag = null;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      document.querySelector('.gantt')?.classList.remove('dragging');
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  });
  // ドラッグ直後のクリック(バー/日付の選択)を抑止する
  grid.addEventListener(
    'click',
    (e) => {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick = false;
      }
    },
    true,
  );
}

/** 文字列の数字の連続を span.num にする(数字は日本語の字より小さく見えるので、日付ヘッダでは数字だけ少し大きくする。テキストは変わらない)。 */
function numSpans(text: string): (string | HTMLElement)[] {
  return text.split(/(\d+)/).filter((t) => t !== '').map((t) => (/^\d+$/.test(t) ? el('span', 'num', t) : t));
}

/** セクションの色(色相 --hue・彩度 --sat〈省略時は CSS の既定〉・明るさの補正 --lit。CSS の --c-head など)を要素に渡す。 */
function paintSection(node: HTMLElement, section: { hue: number; sat?: number; lit?: number }): void {
  node.style.setProperty('--hue', String(section.hue));
  if (section.sat !== undefined) node.style.setProperty('--sat', `${section.sat}%`);
  node.style.setProperty('--lit', `${section.lit ?? 0}%`);
}

/** 文字列の最初の属性(火・水・木・光・闇)の色。無ければ undefined。 */
function attrColorInText(text: string): string | undefined {
  const a = (['火', '水', '木', '光', '闇'] as const).find((x) => text.includes(x));
  return attributeColor(a);
}

/** 日ごと(複数の属性がある日は色ごと)に分けたバー1つの見た目。color=その属性の色(null は既定の縁)。 */
function paintDayPiece(piece: HTMLElement, color: string | null, style: DayStyle): void {
  if (color === null) return;
  const full = (cls: string): void => {
    const node = el('span', cls);
    node.style.left = '0';
    node.style.width = '100%';
    node.style.setProperty('--dc', edgeColorCss(color));
    piece.append(node);
  };
  if (style === 'underline') {
    full('day-under'); // 縁は単色。下辺だけ属性色の帯
    return;
  }
  piece.classList.add('edge-attr');
  piece.style.setProperty('--pc', color);
  if (style === 'stripes') full('day-stripe');
}

/** セルの文字の色: 属性が1つならセルの文字すべてをその属性色に、複数なら属性の字(火・水・木・光・闇)をそれぞれの属性色にする。 */
function colorAttrs(node: HTMLElement, text: string): void {
  const attrs = new Set(text.match(/[火水木光闇]/g) ?? []);
  if (attrs.size === 1) {
    const only = attributeColor([...attrs][0] as Attribute);
    if (only && paint(node, only)) node.classList.add('qname');
    return;
  }
  node.textContent = '';
  for (const part of text.split(/([火水木光闇])/)) {
    if (part === '') continue;
    const color = part.length === 1 ? attributeColor(part as Attribute) : undefined;
    if (color) {
      const sp = el('span', undefined, part);
      if (paint(sp, color)) sp.classList.add('qname');
      node.append(sp);
    } else node.append(part);
  }
}

/** 公式の色を要素に渡す(`--pc`。CSSの `.colored` が文字・点・バーに使う)。`#rrggbb` 以外は無視する。 */
function paint(node: HTMLElement, color: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return false;
  node.style.setProperty('--pc', color);
  node.classList.add('colored');
  return true;
}

/** 注意書きと要望窓口。リポジトリURL(VITE_REPO_URL)があるときだけIssueへのリンクを出す。 */
function footer(): HTMLElement {
  const f = el('footer', 'site-footer');
  f.dataset.testid = 'footer';
  f.append(el('p', undefined, '公式ニュースから自動で収集しているため、誤りや抜け、反映の遅れがあることがあります。正確な情報は公式のお知らせをご確認ください。'));
  f.append(el('p', undefined, '非公式の個人・非営利プロジェクトです。株式会社MIXIとは関係ありません。'));
  const repo = import.meta.env.VITE_REPO_URL;
  if (repo && /^https:\/\//.test(repo)) {
    const a = el('a', undefined, '要望・不具合の報告(GitHub Issues)');
    a.href = `${repo.replace(/\/+$/, '')}/issues/new/choose`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const p = el('p');
    p.append(a);
    f.append(p);
  }
  return f;
}

export function render(root: HTMLElement, state: AppState): void {
  const rerender = () => render(root, state);
  root.replaceChildren();

  const header = el('header', 'bar');
  const stamp = el('span', 'stamp', `公式サイト収集: ${state.collectedAt ? `${formatJst(state.collectedAt)} (JST)` : '不明'}`);
  stamp.dataset.testid = 'collected-at';
  header.append(el('h1', undefined, appTitle()), stamp);

  const nav = el('nav', 'view-nav');
  nav.setAttribute('aria-label', '表示切替');
  const btn = (text: string, testid: string, on: () => void, pressed?: boolean, aria?: string): HTMLButtonElement => {
    const b = el('button', pressed ? 'vbtn active' : 'vbtn', text);
    b.dataset.testid = testid;
    if (aria) {
      b.setAttribute('aria-label', aria);
      b.title = aria;
    }
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
    b.onclick = () => {
      state.selection = null;
      on();
      rerender();
      root.querySelector<HTMLElement>(`[data-testid="${testid}"]`)?.focus();
    };
    return b;
  };
  // 週⇄月の切替では、切替前の左端の日を切替後も左端にする
  const toggleView = (): void => {
    if (state.view === 'week') {
      state.monthStart = state.weekStart;
      state.view = 'month';
    } else {
      state.weekStart = state.monthStart;
      state.view = 'week';
    }
  };
  // 週⇄月の切替は、切替先のカレンダーの記号(押すとどうなるかは aria-label・title)
  const viewBtn = btn('', 'view-toggle', toggleView, undefined, state.view === 'week' ? '月表示にする' : '週表示にする');
  viewBtn.classList.add('icon-btn');
  viewBtn.append(icon(state.view === 'week' ? 'calendar-month' : 'calendar-week'));
  nav.append(viewBtn);
  const month = state.view === 'month';
  nav.append(
    btn('<', 'nav-prev', () => (month ? (state.monthStart = clampToWindow(addMonthsToDay(state.monthStart, -1), state.today)) : (state.weekStart = clampToWindow(addDays(state.weekStart, -7), state.today))), undefined, month ? '前の月' : '前の週'),
    btn('●', 'nav-today', () => {
      state.weekStart = state.today;
      state.monthStart = state.today;
    }, undefined, month ? '今月に戻る' : '今日に戻る'),
    btn('>', 'nav-next', () => (month ? (state.monthStart = clampToWindow(addMonthsToDay(state.monthStart, 1), state.today)) : (state.weekStart = clampToWindow(addDays(state.weekStart, 7), state.today))), undefined, month ? '次の月' : '次の週'),
  );
  const atBase = month ? state.monthStart === state.today : state.weekStart === state.today;
  (nav.querySelector('[data-testid="nav-today"]') as HTMLButtonElement).disabled = atBase;
  (nav.querySelector('[data-testid="nav-today"]') as HTMLButtonElement).classList.add('dot-btn'); // ● を少し小さく
  // 表示範囲(過去・未来それぞれ config/display/window.json の月数)を超えて移動できない
  const range = windowRange(state.today);
  const cur = month ? state.monthStart : state.weekStart;
  (nav.querySelector('[data-testid="nav-prev"]') as HTMLButtonElement).disabled = cur <= range.from;
  (nav.querySelector('[data-testid="nav-next"]') as HTMLButtonElement).disabled = cur >= range.to;
  if (state.refresh) {
    const refresh = state.refresh;
    const ub = el('button', 'vbtn', state.updating ? '更新中…' : '更新');
    ub.dataset.testid = 'update';
    ub.disabled = state.updating;
    ub.title = '最新のニュースを取り込む(数十秒かかります)';
    ub.onclick = () => {
      state.updating = true;
      state.updateMessage = '';
      rerender();
      void refresh().then(
        (r) => {
          state.updateMessage = r.message;
          state.updating = false;
          state.selection = null;
          rerender();
        },
        (e: unknown) => {
          state.updateMessage = `更新に失敗しました: ${String(e)}`;
          state.updating = false;
          rerender();
        },
      );
    };
    nav.append(ub);
    if (state.updateMessage) {
      const m = el('span', 'update-msg', state.updateMessage);
      m.dataset.testid = 'update-msg';
      m.setAttribute('role', 'status');
      nav.append(m);
    }
  }
  // 画面の色(ライト/ダーク)の切替(既定はライト。選んだ色は保存する)
  const dark = currentTheme() === 'dark';
  // 切替先の記号(ライト中は月=ダークにする、ダーク中は太陽=ライトにする)
  const themeBtn = el('button', 'vbtn icon-btn theme-toggle');
  themeBtn.append(icon(dark ? 'sun' : 'moon'));
  themeBtn.dataset.testid = 'theme-toggle';
  themeBtn.setAttribute('aria-label', dark ? 'ライト表示にする' : 'ダーク表示にする');
  themeBtn.title = dark ? 'ライト表示にする' : 'ダーク表示にする';
  themeBtn.onclick = () => {
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    saveTheme(next);
    rerender();
    root.querySelector<HTMLElement>('[data-testid="theme-toggle"]')?.focus();
  };
  nav.append(themeBtn);
  header.append(nav);

  const days = state.view === 'week' ? weekDays(state.weekStart) : monthWindow(state.monthStart);
  const grid = el('div', 'gantt');
  grid.style.setProperty('--cols', String(days.length));
  if (state.view === 'month') {
    grid.style.setProperty('--colw', '1.7rem');
    grid.classList.add('month');
  }
  grid.dataset.testid = 'gantt';
  // 日付行の下に、行とメンテナンスの帯(全行を貫く。日付ヘッダのクリックは奪わない)を同じ幅の箱に入れる
  const body = el('div', 'g-inner');
  const rowsBox = el('div', 'g-rows');
  grid.append(body);
  const dateRow = el('div', 'g-row g-dates');
  const ymLabel = el('div', 'g-label');
  ymLabel.append(...numSpans(((d: string) => `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月`)(state.view === 'week' ? state.weekStart : state.monthStart)));
  dateRow.append(ymLabel);
  for (const day of days) {
    const wd = weekdayOf(day);
    const cls = ['day', 'g-date', wd === '土' ? 'sat' : wd === '日' ? 'sun' : '', day === state.today ? 'today' : ''].filter(Boolean).join(' ');
    const head = el('button', cls);
    head.dataset.day = day;
    if (day.endsWith('-01') && day !== state.today) {
      const mon = el('span', 'dmon');
      mon.append(...numSpans(day.endsWith('-01-01') ? `${day.slice(0, 4)}年1月` : `${Number(day.slice(5, 7))}月`));
      head.append(mon);
    }
    head.append(el('span', 'dnum', String(Number(day.slice(8, 10)))), el('span', 'dwd', wd));
    head.title = dayLabel(day);
    head.onclick = () => {
      state.selection = { day };
      rerender();
    };
    dateRow.append(head);
  }
  body.append(dateRow, rowsBox);
  const sections = ganttSections([...state.events, ...monthlyEvents(days[0] as string, days[days.length - 1] as string, state.monthly)], days);
  if (sections.length === 0) rowsBox.append(el('p', 'empty', state.view === 'week' ? '今日から7日間に表示するイベントはありません' : 'この月に表示するイベントはありません'));
  // 描く単位: 概要(撮影)は設定の blocks の順(セクションの大見出しなし)、ほかはセクションごと(大見出しあり)
  const sectionGroup = (sectionId: string, e: ExportEvent): string | null =>
    sectionId === 'quest' ? questGroup(e) : sectionId === 'gacha' ? gachaGroup(e) : campaignGroup(e);
  const entries: { section: (typeof sections)[number]['section']; rows: BarSpan[][]; header: boolean; headings: boolean }[] =
    state.shot === 'summary'
      ? summaryBlocks(sections, sectionGroup).map((b) => ({ ...b, header: false }))
      : sections
          .filter((x) => !state.shot || state.shot === x.section.id)
          // 撮影モードだけ、進化の行を詰める(種別ごと1行に)
          .map((x) => ({ section: x.section, rows: state.shot && x.section.id === 'gacha' ? compactEvolutionRows(x.rows) : x.rows, header: true, headings: true }));
  for (const { section, rows, header, headings } of entries) {
    const folded = header && !state.shot && state.collapsed.has(section.id);
    if (header) {
      const h = el('div', 'g-section', folded ? `${section.label}(${rows.length})` : section.label);
      h.dataset.section = section.id;
      paintSection(h, section);
      h.setAttribute('role', 'button');
      h.setAttribute('aria-expanded', String(!folded));
      h.tabIndex = 0;
      const toggle = () => {
        if (folded) state.collapsed.delete(section.id);
        else state.collapsed.add(section.id);
        saveCollapsed(state.collapsed);
        rerender();
      };
      h.onclick = toggle;
      h.onkeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          toggle();
          // 再描画で見出しが作り直されるため、キーボード操作ではフォーカスを戻す
          root.querySelector<HTMLElement>(`.g-section[data-section="${section.id}"]`)?.focus();
        }
      };
      rowsBox.append(h);
    }
    if (folded) continue;
    const shown = new Set<string>(); // 出した小見出し(同じ見出しを重複して出さない)
    // 小見出し(キャンペーン: 先頭固定の月次項目〈グループなし〉には見出しを付けず、グループの後ろのグループなしは「その他」。ほかは全行が小見出しに属する)
    const groupOf = (event: ExportEvent, shownCount: number): string | null =>
      !headings ? null : section.id === 'quest' ? questGroup(event) : section.id === 'gacha' ? gachaGroup(event) : (campaignGroup(event) ?? (shownCount > 0 ? 'other' : null));
    const groupRows = new Map<string, number>();
    {
      const seen = new Set<string>();
      for (const r of rows) {
        const g = groupOf((r[0] as BarSpan).event, seen.size);
        if (g !== null) {
          seen.add(g);
          groupRows.set(g, (groupRows.get(g) ?? 0) + 1);
        }
      }
    }
    for (const rowBars of rows) {
      const first = rowBars[0] as BarSpan;
      const event = first.event;
      const g = groupOf(event, shown.size);
      // 小見出しもセクションと同じく畳める(畳んだ状態は同じ保存先。撮影モードでは畳まない)
      const groupKey = `${section.id}/${g ?? ''}`;
      const groupFolded = g !== null && !state.shot && state.collapsed.has(groupKey);
      if (g !== null && !shown.has(g)) {
        shown.add(g);
        const title = g === 'other' ? 'その他' : g;
        const sub = el('div', 'g-group', groupFolded ? `${title}(${groupRows.get(g) ?? 0})` : title);
        sub.dataset.group = g;
        sub.dataset.groupKey = groupKey;
        paintSection(sub, section);
        if (!state.shot) {
          sub.setAttribute('role', 'button');
          sub.setAttribute('aria-expanded', String(!groupFolded));
          sub.tabIndex = 0;
          const toggleGroup = () => {
            if (groupFolded) state.collapsed.delete(groupKey);
            else state.collapsed.add(groupKey);
            saveCollapsed(state.collapsed);
            rerender();
          };
          sub.onclick = toggleGroup;
          sub.onkeydown = (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              toggleGroup();
              // 再描画で見出しが作り直されるため、キーボード操作ではフォーカスを戻す
              Array.from(root.querySelectorAll<HTMLElement>('.g-group')).find((x) => x.dataset.groupKey === groupKey)?.focus();
            }
          };
        }
        rowsBox.append(sub);
      }
      if (groupFolded) continue;
      const row = el('div', 'g-row');
      paintSection(row, section);
      const label = el('div', 'g-label');
      const open = () => {
        state.selection = { day: days[first.from] as string, eventId: event.id };
        rerender();
      };
      label.setAttribute('role', 'button');
      label.tabIndex = 0;
      label.onclick = open;
      // 超究極・絶級のボス名の公式の色(ラベルの文字だけ。バーは既定)
      // (撮影モードの進化の種別ラベルは、キャラごとに色が違うので色を付けない)
      const evolutionChips = state.shot !== undefined && event.character !== undefined && event.character.kind !== '新限定';
      if (event.color && !evolutionChips) paint(label, event.color);
      if (event.pickup) {
        // ピックアップの行: インデント表示。ホバーで `作品｜ピックアップ名`
        label.classList.add('pickup');
        label.title = event.name.replace(/^ガチャ「(.*)」$/, '$1');
        if (event.pickup.color) paint(label, event.pickup.color);
      }
      label.onkeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      };
      const lines = rowLabel(section.id, event);
      if (evolutionChips) {
        label.append(el('span', 'g-l1', event.character?.kind ?? ''));
      } else {
        label.append(el('span', lines.wrap ? 'g-l1 wrap' : 'g-l1', lines.l1));
        if (lines.l2) label.append(el('span', 'g-l2', lines.l2));
      }
      row.append(label);
      if (evolutionChips) {
        // 撮影モードの進化: 種別ごとの1行。解禁日の枠にキャラ名を縦に並べる(属性色)
        for (let i = 0; i < days.length; i++) {
          const cell = el('div', i === days.indexOf(state.today) ? 'g-cell today' : 'g-cell');
          cell.style.gridColumn = String(i + 2);
          const box = el('div', 'g-chips');
          for (const bar of rowBars.filter((b) => b.from === i)) {
            const chip = el('span', 'g-chip', bar.event.name.replace(/（[^（）]*）$/, ''));
            if (bar.event.color) paint(chip, bar.event.color);
            box.append(chip);
          }
          cell.append(box);
          row.append(cell);
        }
        rowsBox.append(row);
        continue;
      }
      for (let i = 0; i < days.length; i++) {
        // 列を明示する。auto だとバーの占める列を避けて暗黙列へはみ出し、罫線が消え行が横に伸びる
        const cell = el('div', i === days.indexOf(state.today) ? 'g-cell today' : 'g-cell');
        cell.style.gridColumn = String(i + 2);
        row.append(cell);
      }
      for (const bar of rowBars) {
        const ev = bar.event;
        // 列内の開始/終了時刻(ゲーム日4:00基準)に応じて左右を詰める。マージン%は占有する列群の幅が基準
        const n = bar.to - bar.from + 1;
        // 撮影モードだけ: 4:00 開始・終了のバーを同じ幅だけ伸ばし(矢印が入るように)、0:00 開始・24:00 終了は余白を付けず罫線に接する
        const startFrac = state.shot ? shotStartFrac(bar.startFrac) : bar.startFrac;
        const endFrac = state.shot ? shotEndFrac(bar.endFrac) : bar.endFrac;
        /** 左端の余白(cols=バーの占める列数)。null は既定(CSS)。 */
        const leftMargin = (cols: number): string | null => {
          if (!bar.clippedLeft && startFrac > 0) return `calc(${((startFrac / cols) * 100).toFixed(3)}%${state.shot && startFrac === SHOT_4AM_FRAC ? '' : ' + 2px'})`; // 4:00 の位置は開始・終了とも同じ線(余白なし)
          return state.shot && !bar.clippedLeft ? '0' : null;
        };
        const rightMargin = (cols: number): string | null => {
          if (!bar.clippedRight && !bar.openEnded && endFrac < 1) return `calc(${(((1 - endFrac) / cols) * 100).toFixed(3)}%${state.shot && endFrac === SHOT_4AM_FRAC ? '' : ' + 2px'})`;
          return state.shot && !bar.clippedRight && !bar.openEnded ? '0' : null;
        };
        const newText = ev.new_names?.length ? `新限定: ${ev.new_names.map((x) => (x.attr ? `${x.name}(${x.attr})` : x.name)).join('・')}` : '';
        /** クリックで詳細・ツールチップ・読み上げ(バーでも、日ごとに分けた1つ1つでも同じ) */
        const wire = (btn: HTMLButtonElement): void => {
          btn.dataset.eventId = ev.id;
          btn.title = [ev.name, newText, whenText(ev)].filter(Boolean).join('\n');
          btn.setAttribute('aria-label', [ev.pickup ? ev.name : shortLabel(ev.name), newText, whenText(ev)].filter(Boolean).join(' '));
          btn.onclick = () => {
            state.selection = { day: days[bar.from] as string, eventId: ev.id };
            rerender();
          };
        };
        // 日ごとに対象の属性が決まっているバー(書庫・特Lの園・ノーマルクエストなど)は、罫線で区切られた日(セル)ごとにバー(縁あり)を作る。
        // 連続する日の境目は角を丸めず、縁は日ごとの属性色(見せ方は config/display/bar-style.json)
        const dayStyle = dayStyleOf(section.id);
        const dayColors = dayStyle === 'off' || ev.new_names?.length ? null : dayAttrColors(ev);
        if (dayColors && dayEdgeSegments(bar, days, dayColors) !== null) {
          const wrap = el('div', `bar-days ${dayStyle}`);
          wrap.style.gridColumn = `${bar.from + 2} / ${bar.to + 3}`;
          wrap.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
          // 1日(セル)に属性が複数あれば、色ごとにバーを作る(その日のセルを等分)。全体の左端・右端以外は角を丸めず、余白なしでつなぐ
          const perDay = Array.from({ length: n }, (_, i) => {
            const cs = (dayColors.get(days[bar.from + i] as string) ?? []).slice();
            return cs.length === 0 ? [null] : cs;
          });
          perDay.forEach((cs, i) => {
            const cell = el('div', 'day-cell');
            cell.style.gridColumn = String(i + 1);
            cs.forEach((c, j) => {
              const piece = el('button', 'bar-ev day-piece');
              wire(piece);
              const isFirst = i === 0 && j === 0;
              const isLast = i === n - 1 && j === cs.length - 1;
              if (isFirst) {
                if (bar.clippedLeft) piece.classList.add('clip-l');
                piece.style.marginLeft = leftMargin(1) ?? (bar.clippedLeft ? '0' : '2px');
              } else {
                piece.classList.add('cont-l');
                piece.style.marginLeft = '0';
              }
              if (isLast) {
                if (bar.clippedRight) piece.classList.add('clip-r');
                if (bar.openEnded) piece.classList.add('open');
                piece.style.marginRight = rightMargin(1) ?? (bar.clippedRight || bar.openEnded ? '0' : '2px');
              } else {
                piece.classList.add('cont-r');
                piece.style.marginRight = '0';
              }
              paintDayPiece(piece, c, dayStyle);
              cell.append(piece);
            });
            wrap.append(cell);
          });
          row.append(wrap);
          continue;
        }
        const b = el('button', 'bar-ev');
        b.style.gridColumn = `${bar.from + 2} / ${bar.to + 3}`;
        const ml = leftMargin(n);
        if (ml !== null) b.style.marginLeft = ml;
        const mr = rightMargin(n);
        if (mr !== null) b.style.marginRight = mr;
        if (bar.clippedLeft) b.classList.add('clip-l');
        if (bar.clippedRight) b.classList.add('clip-r');
        if (bar.openEnded) b.classList.add('open');
        // 新限定キャラ: 週表示(撮影モード含む)はバーの中に名前(属性色)を折り返して書き、バーの高さは中身に合わせて伸びる。月表示は短く「NEW」だけ(名前はツールチップ・詳細パネル)
        if (ev.new_names?.length) {
          b.classList.add('has-names');
          // 1人だけなら「NEW！」も属性色、2人以上なら「NEW！」は既定の色(名前だけが属性色)
          const solo = ev.new_names.length === 1 ? ev.new_names[0]?.color : undefined;
          if (state.view === 'month') {
            const nw = el('span', 'bar-new', 'NEW');
            if (solo) paint(nw, solo);
            b.append(nw);
          } else {
            // `NEW！名前`(2人は `NEW！A・B`)
            const names = el('span', 'bar-names');
            const label = el('span', 'bar-new-label', 'NEW！');
            if (solo) paint(label, solo);
            names.append(label);
            ev.new_names.forEach((x, i) => {
              if (i > 0) names.append(el('span', 'bar-sep', '・'));
              const nm = el('span', 'g-name', x.name);
              if (x.color) paint(nm, x.color);
              names.append(nm);
            });
            b.append(names);
          }
        }
        // 進化: 週表示(撮影モードを除く)だけ、バーの中に `12:00解禁`(属性色)
        if (ev.character !== undefined && ev.character.kind !== '新限定' && ev.character.at !== undefined && state.view === 'week' && !state.shot) {
          const t = el('span', 'bar-unlock', `${ev.character.at.slice(11, 16)}解禁`);
          if (ev.color) paint(t, ev.color);
          b.append(t);
        }
        // 縁の色: 新限定・ピックアップ・キャラクター(進化)は属性色。2人なら左右半分ずつ。色が無い・3人以上は既定の縁
        const edge = barEdgeColors(ev);
        if (edge.length === 1) {
          b.classList.add('edge-attr');
          b.style.setProperty('--pc', edge[0] as string);
        } else if (edge.length === 2) {
          b.classList.add('edge-split');
          b.style.setProperty('--pc1', edge[0] as string);
          b.style.setProperty('--pc2', edge[1] as string);
        }
        wire(b);
        row.append(b);
      }
      rowsBox.append(row);
    }
  }

  const mbars = maintenanceBars(state.events, days);
  if (mbars.length > 0) {
    const overlay = el('div', 'g-maint-layer');
    for (const bar of mbars) {
      const ev = bar.event;
      const b = el('button', state.selection?.eventId === ev.id ? 'g-maint on' : 'g-maint');
      b.dataset.maintId = ev.id;
      b.style.gridColumn = `${bar.from + 1} / ${bar.to + 2}`;
      const n = bar.to - bar.from + 1;
      if (!bar.clippedLeft && bar.startFrac > 0) b.style.marginLeft = `${((bar.startFrac / n) * 100).toFixed(3)}%`;
      if (!bar.clippedRight && bar.endFrac < 1) b.style.marginRight = `${(((1 - bar.endFrac) / n) * 100).toFixed(3)}%`;
      b.title = [fullLabel(ev.name), whenText(ev)].filter(Boolean).join('\n');
      b.setAttribute('aria-label', [fullLabel(ev.name), whenText(ev)].filter(Boolean).join(' '));
      b.onclick = () => {
        state.selection = { day: days[bar.from] as string, eventId: ev.id };
        rerender();
      };
      overlay.append(b);
    }
    rowsBox.append(overlay);
  }

  if (!state.shot) attachDrag(grid, state, rerender);

  if (state.shot) {
    // 撮影モード: カレンダーと隅の注記だけ(操作・詳細・注意書きは出さない)。撮影の対象は .shot
    const frame = el('div', 'shot');
    frame.dataset.testid = 'shot';
    frame.dataset.shot = state.shot;
    frame.append(grid);
    root.append(frame);
    return;
  }
  const detail = renderDetail(state, rerender);
  root.append(header, grid, detail, footer());
  // 選択したら詳細パネルまで自動で移動する(見えていれば動かさない)。環境が未対応/動きを減らす設定なら即時移動
  if (state.selection && typeof detail.scrollIntoView === 'function') {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    detail.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }
}
