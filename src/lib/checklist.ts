/**
 * 점검표 — 이 원고가 공공언어의 요건 15항목을 충족했는가.
 *
 * 이 표는 **기준 충족 여부**를 보는 곳이지, 누가 검사했는지를 알리는 곳이 아니다.
 * 그래서 요건 차례를 그대로 두고, 요건마다 어긋난 것이 있었는지를 적는다.
 *
 * 어떻게 잇는가
 *   AI 가 지적마다 적어 내는 item 은 **닫힌 목록**(data/checklist 의 codes)에서만
 *   고르게 했다. 코드는 그 이름으로 요건을 찾는다. 전에는 규칙이 붙이던 긴 이름을
 *   부분 일치로 뒤졌는데, 지적을 AI 가 내게 되자 이름이 달라져 연결이 끊겼고
 *   열 곳을 고쳐 놓고도 점검표는 전 항목 ‘걸림 없음’ 이었다.
 *
 *   목록 밖의 이름이 와도 버리지 않는다. ‘그 밖의 지적’ 으로 따로 보인다.
 *   조용히 사라지면 또 같은 거짓말을 하게 된다.
 */
import { ALIASES, CHECKLIST, type CheckItem } from '../data/checklist';

export interface Hit {
  /** 원문에 있던 말 (판정 항목은 짚은 자리) */
  from: string;
  /** 고친 말. 판정 항목은 빈칸 */
  to: string;
  why: string;
}

export interface Row extends CheckItem {
  hits: Hit[];
  /** AI 가 사람에게 넘긴 것 (작성자 확인) 가운데 이 요건에 드는 것 */
  asks: Hit[];
  /** 계산 항목이 잰 값 */
  measure?: string;
}

export interface Roll {
  rows: Row[];
  /** 닫힌 목록에 없는 이름으로 온 지적 */
  strays: (Hit & { item: string })[];
  /** 요건에 이어 붙이지 못한 작성자 확인 */
  looseAsks: Hit[];
}

interface Named {
  item?: string;
}

const norm = (s: string) => s.replace(/\s+/g, '').trim();

/** 문장 하나를 어절로 센다 */
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * 문장을 가른다. 마침표·물음표·느낌표 뒤에서만 끊는다.
 * ‘8월 12일.’ 처럼 숫자 뒤 마침표는 문장 끝이 아니므로 뒤에 공백이나 끝이 와야 한다.
 */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 국립국어원 권고 — 한 문장은 50자 안팎, 어절로는 스물을 넘기지 않는 것이 좋다 */
export const LONG_SENTENCE = 20;

export interface Longest {
  words: number;
  over: number;
  text: string;
}

export function measureSentences(paras: string[]): Longest {
  let best: Longest = { words: 0, over: 0, text: '' };
  let over = 0;
  for (const p of paras) {
    for (const s of sentences(p)) {
      const n = words(s);
      if (n > LONG_SENTENCE) over += 1;
      if (n > best.words) best = { words: n, over: 0, text: s };
    }
  }
  return { ...best, over };
}

/**
 * AI 가 낸 것을 요건마다 모은다.
 *
 * @param changes 고친 자리   { from, to, item, why }
 * @param checks  짚기만 한 것 { from, why, item } — 글 짜임에 관한 요건
 * @param asks    작성자 확인  { from(about), why, item }
 * @param paras   원고 문단 (계산 항목에 쓴다)
 */
export function rollUp(
  changes: (Hit & Named)[],
  checks: (Hit & Named)[],
  asks: (Hit & Named)[],
  paras: string[],
): Roll {
  const byCode = new Map<string, CheckItem[]>();
  for (const c of CHECKLIST) {
    for (const code of c.codes) {
      const list = byCode.get(norm(code));
      if (list) list.push(c);
      else byCode.set(norm(code), [c]);
    }
  }
  const find = (item?: string) => {
    const key = norm(item ?? '');
    const direct = byCode.get(key);
    if (direct) return direct;
    // AI 검토가 끊기면 규칙 지적이 화면에 오른다. 그 긴 이름도 요건에 붙인다.
    const alias = ALIASES.find(([long]) => key.startsWith(norm(long)));
    return alias ? (byCode.get(norm(alias[1])) ?? []) : [];
  };

  const hits = new Map<string, Hit[]>();
  const wants = new Map<string, Hit[]>();
  const strays: (Hit & { item: string })[] = [];
  const looseAsks: Hit[] = [];

  const push = (map: Map<string, Hit[]>, id: string, h: Hit) => {
    const list = map.get(id);
    if (list) list.push(h);
    else map.set(id, [h]);
  };

  for (const c of [...changes, ...checks]) {
    const owners = find(c.item);
    if (!owners.length) {
      strays.push({ ...c, item: (c.item ?? '').trim() || '이름 없음' });
      continue;
    }
    for (const o of owners) push(hits, o.id, c);
  }
  for (const a of asks) {
    const owners = find(a.item);
    if (!owners.length) {
      looseAsks.push(a);
      continue;
    }
    for (const o of owners) push(wants, o.id, a);
  }

  const long = measureSentences(paras);
  const rows: Row[] = CHECKLIST.map((c) => {
    const row: Row = { ...c, hits: hits.get(c.id) ?? [], asks: wants.get(c.id) ?? [] };
    if (c.how === '계산' && c.id === 'B7') {
      row.measure = long.words
        ? `가장 긴 문장 ${long.words}어절` +
          (long.over ? ` · ${LONG_SENTENCE}어절 넘는 문장 ${long.over}개` : '')
        : '';
      // 셈은 판단이 아니다. 긴 문장이 있으면 그 문장을 그대로 보여 준다.
      if (long.over) row.hits = [{ from: long.text, to: '', why: `${long.words}어절입니다.` }];
    }
    return row;
  });

  return { rows, strays, looseAsks };
}

/** 화면과 복사본이 같은 말을 쓰도록 한곳에 둔다 */
export function verdict(row: Row): string {
  if (row.how === '계산') return row.measure || '잴 것이 없음';
  if (row.hits.length) return `${row.hits.length}건`;
  return row.how === '판정' ? 'AI 가 짚은 것 없음' : '어긋난 곳 없음';
}

export const CAUTION =
  '‘없음’ 은 어긋난 것을 못 찾았다는 뜻이지, 그 요건을 지켰다는 보증이 아닙니다. ' +
  '최종 판단은 작성 부서와 대변인실이 합니다.';
