/**
 * 다시 쓰기 — AI 가 원고 전체를 고쳐 쓰고, 코드는 그것을 검사한다.
 *
 * 왜 뒤집었나
 *   전에는 규칙(낱말 사전)이 글을 고치고 AI 는 옆에서 거들었다. 그러면 사전에 없는 것은
 *   영영 안 잡힌다. ‘문서학습기능 → 문서 학습 기능’ 같은 띄어쓰기는 사전에 올릴 수 있는
 *   것이 아니고, ‘K뚝배기’ 의 K 가 이름의 첫 글자라는 것도 사전이 알 수 없다. 실제로
 *   같은 원고를 젬에 넣으니 띄어쓰기 여덟 곳을 잡고 이름은 그대로 두었다. 사전으로는
 *   닿을 수 없는 자리다.
 *
 *   그래서 **AI 가 원고 전체를 다시 쓰고, 코드는 저자가 아니라 검사관이 된다.**
 *   규칙 1,540개는 없어지지 않는다. AI 에게 근거로 넘기고 점검표·오류율에 그대로 쓴다.
 *   다만 글자를 갈아 끼우는 일에서는 손을 뗀다.
 *
 * 검사관이 보는 것 (guardRewrite)
 *   문단 수 · 숫자와 날짜 · 「 」 안의 이름 · 문단이 통째로 사라지거나 늘어난 것.
 *   어긋난 문단은 받지 않고 원문 그대로 둔다. AI 를 믿는 것과 안 보는 것은 다르다.
 */

/* ------------------------------------------------------------------ */
/* 1. 검사관                                                            */
/* ------------------------------------------------------------------ */

/** 숫자·날짜·비율 — 하나라도 달라지면 사실이 바뀐 것이다 */
const NUMBERS = /\d[\d,.]*/g;
/** 「 」 안의 이름 — 기관이 정한 것이라 글자 그대로여야 한다 */
const BRACKET_NAME = /「[^」]{1,60}」/g;

const bag = (s: string, re: RegExp) => (s.match(re) ?? []).slice().sort().join('|');

export type RewriteReject =
  | '빈 문단'
  | '숫자가 바뀜'
  | '「 」 안 이름이 바뀜'
  | '길이가 지나치게 달라짐';

/**
 * 다시 쓴 문단 하나를 받아도 되는지 본다. 안 되면 왜 안 되는지 준다.
 *
 * 길이는 0.5~1.8배까지 본다. 병기를 달면 늘고 군더더기를 걷으면 준다. 그 밖으로
 * 벗어나면 문단을 합쳤거나 빼먹은 것이다.
 */
export function checkParagraph(from: string, to: string): RewriteReject | null {
  const t = (to ?? '').trim();
  if (!t) return '빈 문단';
  if (bag(from, NUMBERS) !== bag(t, NUMBERS)) return '숫자가 바뀜';
  if (bag(from, BRACKET_NAME) !== bag(t, BRACKET_NAME)) return '「 」 안 이름이 바뀜';
  const ratio = t.length / Math.max(1, from.length);
  if (ratio < 0.5 || ratio > 1.8) return '길이가 지나치게 달라짐';
  return null;
}

export interface GuardReport {
  /** 문단마다 받아들인 글 (물리치면 원문 그대로) */
  kept: string[];
  /** 물리친 문단 — 몇 번째 문단을 왜 */
  rejected: { index: number; why: RewriteReject }[];
}

/**
 * 다시 쓴 원고 전체를 검사한다.
 *
 * 문단 수가 다르면 아예 받지 않는다. 짝을 지을 수 없으면 무엇이 사라졌는지 셀 수도 없다.
 */
export function guardRewrite(source: string[], rewritten: string[]): GuardReport {
  if (rewritten.length !== source.length) {
    return {
      kept: source.slice(),
      rejected: source.map((_, i) => ({ index: i, why: '빈 문단' as RewriteReject })),
    };
  }
  const kept: string[] = [];
  const rejected: GuardReport['rejected'] = [];
  source.forEach((from, i) => {
    const why = checkParagraph(from, rewritten[i]);
    if (why) {
      rejected.push({ index: i, why });
      kept.push(from);
    } else {
      kept.push(rewritten[i].trim());
    }
  });
  return { kept, rejected };
}

/* ------------------------------------------------------------------ */
/* 2. 어디가 바뀌었나 — 두 글을 견주어 코드가 찾는다                     */
/* ------------------------------------------------------------------ */

export interface Segment {
  /** 원문에서의 자리 */
  start: number;
  end: number;
  /** 원래 있던 말 */
  from: string;
  /** 고쳐 쓴 말 */
  to: string;
}

/**
 * 어절 단위로 쪼갠다. **뒤따르는 공백까지 한 조각에 붙인다.**
 *
 * 공백을 따로 떼면 견주는 과정에서 낱말과 공백의 짝이 어긋나 공백 하나가 사라진다.
 * 실제로 ‘인공지능(AI) 자동’ 이 ‘인공지능(AI)자동’ 으로 붙어 나온 적이 있다.
 */
function tokenize(s: string): string[] {
  return s.match(/\S+\s*|\s+/g) ?? [];
}

/**
 * 두 글의 가장 긴 공통 부분을 찾아 그 사이를 ‘바뀐 자리’ 로 낸다.
 *
 * AI 는 ‘무엇을 고쳤다’ 를 말로도 주지만 그 말은 틀릴 수 있다(자리를 잘못 짚거나
 * 빠뜨린다). 실제로 무엇이 바뀌었는지는 **두 글을 견주면 틀릴 수가 없다.**
 * 그래서 화면에 칠하는 자리와 되돌리기는 이쪽을 쓴다.
 */
export function diffSegments(from: string, to: string): Segment[] {
  const a = tokenize(from);
  const b = tokenize(to);

  // 앞뒤로 같은 부분을 걷어 내면 가운데만 견주면 된다
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const offset = a.slice(0, head).join('').length;
  if (midA.length === 0 && midB.length === 0) return [];

  // 가운데를 다시 어절 단위로 견주어 잘게 나눈다 (LCS)
  const segs: Segment[] = [];
  const lcs = lcsPairs(midA, midB);
  let ia = 0;
  let ib = 0;
  let at = offset;
  const flush = (ea: number, eb: number) => {
    let f = midA.slice(ia, ea).join('');
    let t = midB.slice(ib, eb).join('');
    const from0 = at;
    // 양쪽 끝의 같은 공백은 자리에서 뺀다. 칠한 자리가 공백까지 물면 보기 사납다.
    let lead = 0;
    while (lead < f.length && lead < t.length && f[lead] === t[lead] && /\s/.test(f[lead])) lead += 1;
    let trail = 0;
    while (
      trail < f.length - lead &&
      trail < t.length - lead &&
      f[f.length - 1 - trail] === t[t.length - 1 - trail] &&
      /\s/.test(f[f.length - 1 - trail])
    ) {
      trail += 1;
    }
    f = f.slice(lead, f.length - trail);
    t = t.slice(lead, t.length - trail);
    if (f !== t && (f.trim() || t.trim())) {
      segs.push({ start: from0 + lead, end: from0 + lead + f.length, from: f, to: t });
    }
    at = from0 + midA.slice(ia, ea).join('').length;
  };
  for (const [pa, pb] of lcs) {
    flush(pa, pb);
    // 같은 조각은 그대로 지나간다
    at += midA[pa].length;
    ia = pa + 1;
    ib = pb + 1;
  }
  flush(midA.length, midB.length);
  const out = segs.filter((s) => s.from !== s.to);

  /*
   * 견준 결과가 맞는지 스스로 확인한다.
   *
   * 찾은 자리를 그대로 갈아 끼웠을 때 고쳐 쓴 글이 다시 나와야 한다. 안 나오면 견주기가
   * 어긋난 것이고, 그대로 쓰면 글자가 새거나 붙는다. 그럴 때는 잘게 나누기를 포기하고
   * **문단 하나를 통째로 한 자리**로 본다. 화면에서 잘게 못 고를 뿐, 글은 정확하다.
   */
  if (apply(from, out) !== to) {
    return [{ start: 0, end: from.length, from, to }];
  }
  return out;
}

/** 찾은 자리를 원문에 갈아 끼워 본다 (견주기가 맞는지 확인하는 데 쓴다) */
function apply(from: string, segs: Segment[]): string {
  let out = '';
  let at = 0;
  for (const s of segs) {
    out += from.slice(at, s.start) + s.to;
    at = s.end;
  }
  return out + from.slice(at);
}

/** 두 배열의 공통 부분 짝 (i, j) 을 차례대로 준다 */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  // 문단 하나라 크지 않지만, 그래도 지나치게 크면 포기하고 통째로 바뀐 것으로 본다
  if (n * m > 250_000) return [];
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push([i, j]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1;
    else j += 1;
  }
  return out;
}

/**
 * 문단마다 견준 것을 원고 전체 자리로 옮긴다.
 *
 * `join` 은 문단을 잇는 글자(원고를 한 덩어리로 볼 때 쓰는 것)다.
 */
export function diffAll(source: string[], revised: string[], join: string): Segment[] {
  const out: Segment[] = [];
  let base = 0;
  source.forEach((from, i) => {
    for (const s of diffSegments(from, revised[i] ?? from)) {
      out.push({ ...s, start: s.start + base, end: s.end + base });
    }
    base += from.length + join.length;
  });
  return out;
}
