/**
 * 검증 하네스 — AI 가 기준에 어긋난 곳을 고쳐 오면, 코드가 그것을 검사한다.
 *
 * 이 도구가 하는 일은 **이미 쓴 보도자료가 국립국어원 기준에 맞는지 보고 맞게 고치는 것**
 * 이다. 글을 새로 쓰거나 더 낫게 다듬는 곳이 아니다. 기준에 걸리지 않는 문장은 글자
 * 하나도 달라지면 안 된다. 담당자가 쓴 글이지 우리 글이 아니다.
 *
 * 왜 AI 가 고치는가
 *   낱말 사전으로는 닿을 수 없는 기준이 있다. ‘문서학습기능 → 문서 학습 기능’ 같은
 *   띄어쓰기는 사전에 올릴 수 있는 것이 아니고, ‘K뚝배기’ 의 K 가 이름의 첫 글자라는
 *   것도 사전은 모른다. 그래서 판단은 AI 가 하고, **코드는 저자가 아니라 검사관이 된다.**
 *   규칙 1,540개는 AI 에게 넘길 근거와 점검표·오류율 집계로 남는다.
 *
 * 검사관이 보는 것
 *   guardRewrite  — 문단 수 · 숫자와 날짜 · 「 」 안의 이름 · 문단 길이.
 *                   어긋난 문단은 받지 않고 원문 그대로 둔다.
 *   fixByunggiJosa — ‘인공지능(AI)가’ 처럼 병기 뒤 조사가 틀린 것을 바로잡는다.
 *                   판단이 아니라 계산이라 코드가 맞추는 편이 옳다.
 *   onlyGrounded  — **어느 기준에 걸려서 고쳤는지 대지 못한 자리는 되돌린다.**
 *                   검증 도구가 근거 없이 남의 글을 고치면 그건 검증이 아니다.
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
  | '고친 것이 아니라 다시 씀';

/**
 * 고쳐 온 문단 하나를 받아도 되는지 본다. 안 되면 왜 안 되는지 준다.
 *
 * 길이는 0.7~1.5배까지만 본다. 병기를 달면 늘고 군더더기 낱말을 걷으면 준다. 그 밖으로
 * 벗어났다면 고친 것이 아니라 **다시 쓴 것**이다. 검증 도구가 할 일이 아니다.
 */
export function checkParagraph(from: string, to: string): RewriteReject | null {
  const t = (to ?? '').trim();
  if (!t) return '빈 문단';
  if (bag(from, NUMBERS) !== bag(t, NUMBERS)) return '숫자가 바뀜';
  if (bag(from, BRACKET_NAME) !== bag(t, BRACKET_NAME)) return '「 」 안 이름이 바뀜';
  const ratio = t.length / Math.max(1, from.length);
  if (ratio < 0.7 || ratio > 1.5) return '고친 것이 아니라 다시 씀';
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
      // 병기 뒤 조사는 계산으로 정해진다. 모형이 흔들려도 여기서 맞춘다.
      kept.push(fixByunggiJosa(rewritten[i].trim()));
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

/* ------------------------------------------------------------------ */
/* 3. 근거 없는 고침은 되돌린다                                          */
/* ------------------------------------------------------------------ */

export interface Grounds {
  from: string;
  to: string;
  item?: string;
}

/**
 * 고친 자리 가운데 **어느 기준에 걸렸는지 댈 수 있는 것만** 남긴다.
 *
 * 이 도구는 검증 도구다. 담당자가 쓴 글을 우리가 더 낫다고 여겨 고쳐 놓으면 그건
 * 검증이 아니라 대필이다. 그래서 AI 가 changes 에 적어 내지 않은 자리는 되돌린다.
 * 되돌린다는 것은 그 자리에 원문을 그대로 둔다는 뜻이고, 화면에도 올리지 않는다.
 *
 * 무르게 견준다 — 고친 자리와 적어 낸 내역이 글자까지 똑같기를 바라지 않는다.
 * 한쪽이 다른 쪽을 품고 있으면 같은 자리로 본다. 자리를 잘게 나누는 것은 코드가
 * 하는 일이고 AI 는 무엇을 왜 고쳤는지만 대면 된다.
 */
export function onlyGrounded(segs: Segment[], grounds: Grounds[]): Segment[] {
  const has = (a: string, b: string) => {
    const x = a.trim();
    const y = b.trim();
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  };
  return segs.filter((sg) =>
    grounds.some((g) => has(sg.from, g.from) && has(sg.to, g.to)),
  );
}

/* ------------------------------------------------------------------ */
/* 4. 병기 뒤 조사는 기계가 바로잡는다                                   */
/* ------------------------------------------------------------------ */

/**
 * ‘인공지능(AI)가’ 처럼 병기 뒤에 잘못 붙은 조사를 바로잡는다.
 *
 * 배포본에서 같은 원고를 두 번 돌려 봤더니 한 번은 ‘인공지능(AI)이’, 한 번은
 * ‘인공지능(AI)가’ 가 나왔다. 괄호 때문에 앞말 받침이 헷갈리는 자리라 모형이
 * 부를 때마다 흔들린다.
 *
 * 그런데 이건 **판단이 아니라 계산이다.** 괄호 안은 읽지 않으므로 ‘인공지능’ 의
 * 끝 글자 ‘능’ 에 받침이 있는지만 보면 답이 하나로 정해진다. 판단은 AI 에게 맡기되,
 * 계산으로 정해지는 것은 코드가 맞춘다. 그래야 몇 번을 돌려도 여기서는 안 흔들린다.
 *
 * 괄호 뒤 조사만 본다. 여느 자리의 조사까지 손대면 입말·고유명사를 건드릴 수 있다.
 * 괄호 안에 무엇이 들었든(로마자든 한글이든) 읽지 않는 것은 마찬가지라 똑같이 다룬다.
 */
const BYUNGGI_JOSA =
  /([가-힣])\(([^()]{1,40})\)(으로|로|을|를|이|가|은|는|과|와)(?=[\s,.·…”’)\]]|$)/g;

const JOSA_PAIR: Record<string, [string, string]> = {
  으로: ['으로', '로'],
  로: ['으로', '로'],
  을: ['을', '를'],
  를: ['을', '를'],
  이: ['이', '가'],
  가: ['이', '가'],
  은: ['은', '는'],
  는: ['은', '는'],
  과: ['과', '와'],
  와: ['과', '와'],
};

const batchimOf = (ch: string) => (ch.charCodeAt(0) - 0xac00) % 28;

export function fixByunggiJosa(text: string): string {
  return text.replace(BYUNGGI_JOSA, (whole, ch: string, inside: string, josa: string) => {
    const jong = batchimOf(ch);
    const pair = JOSA_PAIR[josa];
    if (!pair) return whole;
    // ‘으로/로’ 만 ㄹ 받침(종성 8)을 받침 없음처럼 다룬다
    const hasB = pair[0] === '으로' ? jong !== 0 && jong !== 8 : jong !== 0;
    const right = hasB ? pair[0] : pair[1];
    return `${ch}(${inside})${right}`;
  });
}
