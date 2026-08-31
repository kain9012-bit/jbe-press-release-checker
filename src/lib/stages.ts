/**
 * 단계별 하네스.
 *
 * 검토는 세 단계로 돈다. 단계마다 **받는 것 · 하는 일 · 하지 말아야 할 일 · 내는 것**을
 * 여기 한곳에 적고, 그것을 지켰는지 확인하는 함수를 같이 둔다.
 *
 * 왜 한곳인가
 *   전에는 확인이 흩어져 있었다. 2차에는 규약이 있고 3차에는 id 거르기가 있고 1차에는
 *   아무것도 없었다. 그러면 어느 단계가 무엇을 보장하는지 아무도 말할 수 없다.
 *
 * 어긴 것은 버리고 센다. 그 숫자를 bench 가 그대로 뽑아 본다.
 */

import { STEP_IDS, checkReplacement, type Violation } from './procedure';
import type { Finding } from './analyze';

export interface StageSpec {
  no: '1차' | '2차' | '3차';
  name: string;
  /** 이 단계가 받는 것 */
  takes: string;
  /** 이 단계가 하는 일 */
  does: string;
  /** 이 단계가 하면 안 되는 일 */
  never: string[];
  /** 이 단계가 내는 것 */
  gives: string;
}

export type Tally = Partial<Record<Violation | StageViolation, number>>;
export type StageViolation =
  | '자리가 원문과 어긋남'
  | '축이 셋 중에 없음'
  | '1차가 이미 잡은 자리'
  | '묻지 않은 것을 답함';

const AXES = new Set(['용이성', '정확성', '소통성']);

const count = (t: Tally, v: Violation | StageViolation) => {
  t[v] = (t[v] ?? 0) + 1;
};

/* ------------------------------------------------------------------ */
/* 1차 — 규칙 검토                                                      */
/* ------------------------------------------------------------------ */

export const STAGE1: StageSpec = {
  no: '1차',
  name: '규칙 검토',
  takes: '보도자료 원문',
  does: '용어 목록 1,540개와 어문 규범을 글자 그대로 대조한다. 같은 글이면 늘 같은 답이 나온다.',
  never: [
    '문맥을 보고 판단하는 것 — 그건 2차 몫이다',
    '원문에 없는 자리를 짚는 것',
    '숫자·날짜를 바꾸는 고침을 내는 것',
  ],
  gives: '지적 목록 (자리·고칠 말·근거)',
};

/**
 * 규칙이 낸 지적이 원문과 어긋나지 않는지 본다.
 *
 * 규칙은 사람이 손으로 늘리는 것이라 사전을 잘못 고치면 자리가 밀리거나 숫자를 건드리는
 * 고침이 나올 수 있다. 화면에 올리기 전에 여기서 걸러 낸다. 여기 걸리는 것은 **모형이
 * 아니라 우리 코드의 버그**다.
 */
export function guard1(findings: Finding[], source: string) {
  const tally: Tally = {};
  const kept = findings.filter((f) => {
    if (source.slice(f.start, f.end) !== f.text) {
      count(tally, '자리가 원문과 어긋남');
      return false;
    }
    if (!AXES.has(f.axis)) {
      count(tally, '축이 셋 중에 없음');
      return false;
    }
    for (const fix of f.fixes) {
      // 규칙의 고침은 ‘한글로 풀어 쓰기’ 같은 안내문일 수도 있다. 그런 것은 넘긴다.
      if (!fix || /[~]/.test(fix) || fix.length > 24) continue;
      const bad = checkReplacement(f.text, fix);
      if (bad === '숫자가 바뀜' || bad === '병기를 떼어 냄') {
        count(tally, bad);
        return false;
      }
    }
    return true;
  });
  return { kept, tally };
}

/* ------------------------------------------------------------------ */
/* 2차 — AI 검토                                                        */
/* ------------------------------------------------------------------ */

export const STAGE2: StageSpec = {
  no: '2차',
  name: 'AI 검토',
  takes: '원문 + 1차가 이미 잡은 표현 목록',
  does: '규칙이 못 보는 것을 절차 여덟 단계로 훑는다 — 조사·어미, 주술 호응, 접속·수식, 시제, 군더더기, 문장 길이, 외국어 표현, 권위·차별.',
  never: [
    '1차가 이미 잡은 자리를 다시 짚는 것',
    '절차에 없는 지표 이름을 쓰는 것',
    '숫자·날짜를 바꾸거나 한글(로마자) 병기를 떼어 내는 것',
    '원문에 없는 조각을 지어내는 것',
  ],
  gives: '지적 목록 + 총평',
};

export interface RawFinding {
  quote?: string;
  suggestion?: string;
  sub?: string;
  why?: string;
}

/**
 * 모형이 낸 지적 하나가 2차의 계약을 지키는지 본다.
 *
 * `taken` 은 1차가 이미 차지한 자리다. 중복은 지시문으로 부탁했지만 부탁은 부탁일 뿐이라
 * 여기서 코드가 막는다.
 */
export function guard2(
  raw: RawFinding,
  source: string,
  taken: [number, number][],
  tally: Tally,
): { quote: string; fix: string; sub: string; start: number } | null {
  const quote = (raw.quote ?? '').trim();
  if (!quote) return null;

  const sub = String(raw.sub ?? '').trim();
  if (!STEP_IDS.has(sub)) {
    count(tally, '지표 이름이 목록에 없음');
    return null;
  }

  const fix = String(raw.suggestion ?? '').trim();
  if (fix) {
    const bad = checkReplacement(quote, fix);
    if (bad) {
      count(tally, bad);
      return null;
    }
  }

  // 이미 차지한 자리와 겹치지 않는 첫 자리를 찾는다
  let start = -1;
  for (let from = 0; ; ) {
    const i = source.indexOf(quote, from);
    if (i < 0) break;
    if (!taken.some(([a, b]) => i < b && a < i + quote.length)) {
      start = i;
      break;
    }
    from = i + 1;
  }
  if (start < 0) {
    // 원문에 아예 없는 것과, 1차가 이미 잡은 것을 갈라서 센다
    count(tally, source.includes(quote) ? '1차가 이미 잡은 자리' : '원문에 없는 조각을 지어냄');
    return null;
  }
  return { quote, fix, sub, start };
}

/* ------------------------------------------------------------------ */
/* 3차 — 재검토                                                         */
/* ------------------------------------------------------------------ */

export const STAGE3: StageSpec = {
  no: '3차',
  name: '재검토',
  takes: '1·2차가 고쳐 놓은 자리 목록 (고치기 전 · 고친 뒤 · 그 문장)',
  does: '잘못 고친 자리를 찾아 그 자리에 들어갈 옳은 말을 낸다. 손대지 말았어야 할 자리면 고치기 전 말을 그대로 돌려준다.',
  never: [
    '새로 고칠 곳을 찾는 것 — 그건 2차가 이미 했다',
    '묻지 않은 자리를 답하는 것',
    '취향으로 트집 잡는 것 — 규범에 어긋난 것만 본다',
    '무엇이 잘못이었는지 화면에 늘어놓는 것 — 담당자가 받을 것은 읽을거리가 아니라 고쳐진 글이다',
  ],
  gives: '잘못 고친 자리의 id 와 그 자리에 넣을 옳은 말',
};

/**
 * 검수 답을 받는다.
 *
 * 물어본 자리만 받고, 돌려준 말이 규약(숫자·병기·자리표시)을 지키는지 본다. 어긴 답은
 * 버린다 — 검수가 오히려 글을 망치게 둘 수는 없다.
 *
 * `asked` 는 id → 고치기 전 말. 규약 검사는 그 원문을 기준으로 한다.
 */
export function guard3(
  raw: { id?: string; fix?: string }[],
  asked: Map<string, string>,
  tally: Tally,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of raw ?? []) {
    const id = String(w.id ?? '').trim();
    if (!id) continue;
    const from = asked.get(id);
    if (from === undefined) {
      count(tally, '묻지 않은 것을 답함');
      continue;
    }
    const fix = String(w.fix ?? '').trim();
    if (!fix) continue;
    const bad = checkReplacement(from, fix);
    if (bad) {
      count(tally, bad);
      continue;
    }
    out[id] = fix;
  }
  return out;
}

export const STAGES = [STAGE1, STAGE2, STAGE3];
