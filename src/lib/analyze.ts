import { guard1, type Tally } from './stages';
import { PATTERN_RULES, EXTRA_LOANWORDS, ROMAN_KOREAN, checkDueum, type Axis } from '../data/rules';
export type { Axis };
import termsRaw from '../data/terms.json';
import appendixRaw from '../data/appendix.json';

/* ------------------------------------------------------------------ */
/* 자료                                                                */
/* ------------------------------------------------------------------ */

interface TermRow {
  w: string;
  m: string[];
  a: string[];
}
interface AppendixRow {
  w: string;
  r: string;
}

const TERMS = termsRaw as TermRow[];
const APPENDIX = appendixRaw as { admin100: AppendixRow[]; japanese50: AppendixRow[] };

export const DATA_COUNTS = {
  terms: TERMS.length,
  admin: APPENDIX.admin100.length,
  japanese: APPENDIX.japanese50.length,
  patterns: PATTERN_RULES.length,
};

/**
 * 규칙 검사가 실제로 낼 수 있는 지표를 다 모은 것.
 *
 * 점검표에서 ‘이 항목을 규칙이 보기는 하는가’ 를 이걸로 판정한다.
 * 손으로 표를 만들어 두면 규칙을 고쳤을 때 표가 조용히 거짓말을 하게 된다.
 * (실제로 ‘단락’·‘정보성’·‘정보량’·‘배열’ 은 그 지표를 내는 규칙이 아예 없는데도
 *  점검표에서 ○ 를 받고 있었다. 아무도 안 봤다는 뜻인데 지켰다고 읽혔다.)
 */
export const EMITTABLE_SUBS: string[] = [
  '① 외국 글자(로마자) 사용',
  '① 외국 글자(한자) 사용',
  '② 우리말로 대체 가능한 외래어(외국어)',
  '② 우리말로 대체 가능한 외래어(보완 목록)',
  '② 어려운 한자어·외래어',
  '② 일본어 투 용어',
  '표기의 정확성 — 두음 법칙',
  '표기의 정확성 — 괄호 뒤 조사',
  '표기의 정확성 — 조사 받침',
  '이해가능성 — 문장 길이',
  ...new Set(PATTERN_RULES.map((r) => r.sub)),
];

/** 이 점검 항목을 규칙이 보기는 하는가 (런타임 대조와 같은 방식으로 따진다) */
export const isRuleChecked = (match: string[]): boolean =>
  match.some((m) => EMITTABLE_SUBS.some((s) => s.includes(m)));

/* ------------------------------------------------------------------ */
/* 지적 사항                                                            */
/* ------------------------------------------------------------------ */

export type Severity = '오류' | '검토';

export interface Finding {
  key: string;
  axis: Axis;
  sub: string;
  start: number;
  end: number;
  text: string;
  fixes: string[];
  why: string;
  src: string;
  severity: Severity;
  /** 어절 수 대비 오류율 산정에 넣을지 */
  counted: boolean;
  /** AI 가 물어본 횟수만큼 다 짚은 것. 기본으로 켜 둘지 정하는 데만 쓴다. */
  confident?: boolean;
}

/* ------------------------------------------------------------------ */
/* 한글 경계 판정                                                       */
/* ------------------------------------------------------------------ */

const isHangul = (ch: string) => !!ch && /[가-힣]/.test(ch);
/** 낱말 뒤에 바로 붙을 수 있는 조사·어미의 첫 글자 */
const JOSA_HEAD = new Set(
  '은는이가을를에의로과와도만부까처보밖조마라든나야여랑서한께으랍'.split(''),
);

/**
 * 이 자리가 이미 ‘한글(ABC)’ 병기 안의 괄호 속인지.
 *
 * 규칙도 AI 도 이 자리는 건드리면 안 된다. 실제로 ‘인공지능(AI) 기술’ 의 괄호 속 AI 를
 * 또 잡아서 ‘인공지능(인공지능(AI)) 기술’ 이 나간 적이 있다.
 */
export function insideByunggi(text: string, start: number, end: number): boolean {
  const open = text[start - 1];
  const close = text[end];
  const beforeOpen = text[start - 2] ?? '';
  return open === '(' && close === ')' && (isHangul(beforeOpen) || /[)\]]/.test(beforeOpen));
}

function boundaryOk(text: string, start: number, end: number) {
  const before = text[start - 1] ?? '';
  const after = text[end] ?? '';
  if (isHangul(before)) return false;
  if (isHangul(after) && !JOSA_HEAD.has(after)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* 사전 매칭기 (긴 낱말 우선)                                           */
/* ------------------------------------------------------------------ */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildMatcher(words: string[]) {
  const uniq = Array.from(new Set(words.filter((w) => w && w.length >= 2)));
  uniq.sort((a, b) => b.length - a.length);
  return new RegExp(uniq.map(esc).join('|'), 'g');
}

const termIndex = new Map<string, TermRow>();
const termMisIndex = new Map<string, TermRow>();
for (const t of TERMS) {
  termIndex.set(t.w, t);
  for (const m of t.m) termMisIndex.set(m, t);
}
const TERM_RE = buildMatcher([...termIndex.keys(), ...termMisIndex.keys()]);

const adminIndex = new Map<string, AppendixRow>();
for (const row of [...APPENDIX.admin100, ...APPENDIX.japanese50]) {
  // '가료', '동년, 동월, 동일'처럼 쉼표로 묶인 표제어는 쪼갠다.
  for (const w of row.w.split(/[,/]/).map((s) => s.trim())) {
    if (w.length >= 2) adminIndex.set(w, row);
  }
}
const ADMIN_RE = buildMatcher([...adminIndex.keys()]);

const extraIndex = new Map<string, string>(EXTRA_LOANWORDS);
const EXTRA_RE = buildMatcher([...extraIndex.keys()]);

/* ------------------------------------------------------------------ */
/* 본체                                                                */
/* ------------------------------------------------------------------ */

export interface AnalyzeResult {
  /** 1차 하네스에 걸려 버린 것 (규칙 쪽 버그) */
  ruleViolations: Tally;
  findings: Finding[];
  wordCount: number;
  charCount: number;
  sentences: { text: string; start: number; words: number }[];
  byAxis: Record<Axis, { total: number; counted: number; rate: number }>;
  longSentences: number;
}

export function analyze(text: string): AnalyzeResult {
  const raw: Finding[] = [];
  const push = (f: Omit<Finding, 'key'>) =>
    raw.push({ ...f, key: `${f.start}-${f.end}-${f.sub}` });

  /* --- 1. 용이성 ① 외국 글자(로마자) --- */
  {
    const re = /[A-Za-z][A-Za-z0-9&.\-+]*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const s = m.index;
      const e = s + m[0].length;
      // 한글(ABC) 형태의 병기는 허용한다.
      if (insideByunggi(text, s, e)) continue;
      if (/^https?$|^www$/i.test(m[0])) continue;
      // 널리 쓰는 약어는 병기 형태가 정해져 있으니 바로 고칠 수 있게 준다
      const known = ROMAN_KOREAN[m[0].toUpperCase().replace(/[^A-Z0-9]/g, '')];
      push({
        axis: '용이성',
        sub: '① 외국 글자(로마자) 사용',
        start: s,
        end: e,
        text: m[0],
        fixes: known ? [known] : [`한글로 먼저 적고 괄호 안에 ‘${m[0]}’을(를) 넣기`],
        why: '공문서는 한글로 작성하되, 외국 글자를 써야 할 때는 한글로 먼저 적고 괄호 안에 적는다.',
        src: '[평가] 용이성 ① 외국 글자(로마자, 한자 등) 사용 / 국어기본법 제14조',
        severity: '오류',
        counted: true,
      });
    }
  }

  /* --- 2. 용이성 ① 외국 글자(한자) --- */
  {
    const re = /[㐀-鿿]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const s = m.index;
      const e = s + m[0].length;
      const open = text[s - 1];
      const close = text[e];
      if (open === '(' && close === ')' && isHangul(text[s - 2])) continue;
      push({
        axis: '용이성',
        sub: '① 외국 글자(한자) 사용',
        start: s,
        end: e,
        text: m[0],
        fixes: ['한글로 적기(뜻을 정확히 전달해야 하면 한글 뒤 괄호 안에 넣기)'],
        why: '공공기관등은 공문서를 어문 규범에 맞추어 한글로 작성해야 한다.',
        src: '[평가] 용이성 ① 외국 글자(로마자, 한자 등) 사용 / 국어기본법 제14조',
        severity: '오류',
        counted: true,
      });
    }
  }

  /* --- 3. 용이성 ② 우리말로 대체 가능한 외래어(외국어) : 평가용 용어 목록 --- */
  {
    TERM_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TERM_RE.exec(text))) {
      const s = m.index;
      const e = s + m[0].length;
      if (!boundaryOk(text, s, e)) continue;
      const mis = termMisIndex.get(m[0]);
      const row = mis ?? termIndex.get(m[0]);
      if (!row) continue;
      if (mis) {
        push({
          axis: '정확성',
          sub: '표기의 정확성 — 외래어 표기법',
          start: s,
          end: e,
          text: m[0],
          fixes: row.a.length ? row.a : [row.w],
          why: `외래어 표기법에 맞는 표기는 ‘${row.w}’다. 되도록 우리말로 바꿔 쓴다.`,
          src: '[목록] 2026년 용이성 평가용 용어 목록 · 이표기/오표기',
          severity: '오류',
          counted: true,
        });
      } else {
        push({
          axis: '용이성',
          sub: '② 우리말로 대체 가능한 외래어(외국어)',
          start: s,
          end: e,
          text: m[0],
          fixes: row.a.length ? row.a : ['우리말 표현으로 바꾸기'],
          why: '문맥을 고려하여 쉬운 우리말로 바꿔 쓴다.',
          src: `[목록] 2026년 용이성 평가용 용어 목록(${TERMS.length}개)`,
          severity: '오류',
          counted: true,
        });
      }
    }
  }

  /* --- 4. 용이성 ② 어려운 한자어·일본어 투 : 부록 목록 --- */
  {
    ADMIN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ADMIN_RE.exec(text))) {
      const s = m.index;
      const e = s + m[0].length;
      if (!boundaryOk(text, s, e)) continue;
      const row = adminIndex.get(m[0]);
      if (!row) continue;
      const isJp = APPENDIX.japanese50.some((x) => x.w === row.w);
      push({
        axis: '용이성',
        sub: isJp ? '② 일본어 투 용어' : '② 어려운 한자어·외래어',
        start: s,
        end: e,
        text: m[0],
        fixes: row.r.split(/\s*[,/]\s*/).filter(Boolean),
        why: isJp
          ? '일본어 투 용어이므로 권장 표현으로 바꿔 쓴다.'
          : '지나치게 어려운 한자어나 외국어이므로 다듬은 말로 바꿔 쓴다.',
        src: isJp
          ? '[바로] 부록 · 꼭 가려 써야 할 일본어 투 용어 50개'
          : '[바로] 부록 · 필수 개선 행정용어 100개',
        severity: '오류',
        counted: true,
      });
    }
  }

  /* --- 4-2. 보완 목록: 자주 쓰는 외래어 --- */
  {
    EXTRA_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EXTRA_RE.exec(text))) {
      const s = m.index;
      const e = s + m[0].length;
      if (!boundaryOk(text, s, e)) continue;
      const alt = extraIndex.get(m[0]);
      if (!alt) continue;
      push({
        axis: '용이성',
        sub: '② 우리말로 대체 가능한 외래어(보완 목록)',
        start: s,
        end: e,
        text: m[0],
        fixes: alt.split(/\s*,\s*/).filter(Boolean),
        why: '평가용 용어 목록에는 없지만 우리말로 바꿔 쓸 수 있는 말이다. 문맥을 보고 판단한다.',
        src: '[보완] 이 도구가 따로 정리한 목록 — 공식 평가 목록이 아님',
        severity: '검토',
        counted: false,
      });
    }
  }

  /* --- 5. 정규식 규칙 --- */
  for (const rule of PATTERN_RULES) {
    const re = new RegExp(rule.find.source, rule.find.flags.includes('g') ? rule.find.flags : rule.find.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const s = m.index;
      const e = s + m[0].length;
      const fixes = (Array.isArray(rule.fix) ? rule.fix : [rule.fix]).map((f) =>
        f.replace(/\$(\d)/g, (_, d) => m![Number(d)] ?? ''),
      );
      push({
        axis: rule.axis,
        sub: rule.sub,
        start: s,
        end: e,
        text: m[0],
        fixes,
        why: rule.why,
        src: rule.src,
        severity: rule.manual ? '검토' : '오류',
        // 소통성(권위적·차별적 표현)은 사람이 확인해야 하지만 오류율에는 넣는다.
        counted: !rule.manual || rule.axis === '소통성',
      });
    }
  }

  /* --- 6. 두음 법칙 --- */
  for (const h of checkDueum(text)) {
    push({
      axis: '정확성',
      sub: '표기의 정확성 — 두음 법칙',
      start: h.index,
      end: h.index + 1,
      text: h.wrong,
      fixes: [h.right],
      why: h.why,
      src: '[평가] 정확성 ① 표기의 정확성 · 두음 법칙 오류',
      severity: '오류',
      counted: true,
    });
  }

  /*
   * --- 6-2. 조사 받침 (기계가 확실히 아는 것만) ---
   *
   * 조사 받침은 규칙으로 보이지만 대부분 위험하다. ‘로’ 로 끝나는 낱말은 진로·경로·
   * 등산로처럼 널려 있고, ‘가’ 는 평가·물가·국가, ‘는’ 은 먹는·없는·읽는이 걸린다.
   * 가진 자료로 재 보니 그 갈래들은 저마다 열몇 개씩 오탐이 났다.
   *
   * 그런데 **딱 두 갈래는 오탐이 하나도 없다.**
   *   ① 받침(ㄹ 제외) 뒤의 ‘를’ — 그 자리에 오는 우리말 낱말이 없다.
   *      (ㄹ 받침은 뺀다. ‘잠깐 들를 예정’ 의 ‘들를’ 이 진짜 말이다.)
   *   ② 받침 없는 글자 뒤의 ‘으로’ — 마찬가지로 그런 낱말이 없다.
   * 이 둘만 잡는다. 넓히지 않는다.
   *
   * AI 도 이걸 잡기는 하지만 부를 때마다 답이 달라진다(실제로 ‘등를’ 을 놓친 적이
   * 있다). 규칙은 매번 같은 답을 낸다. 그래서 기계가 확실한 것은 규칙이 맡는다.
   */
  {
    const JOSA_FIX: [RegExp, string, string][] = [
      [/([가-힣])를(?=[\s,.)\]"'’”」』]|$)/g, '를', '을'],
      [/([가-힣])으로(?=[\s,.)\]]|$)/g, '으로', '로'],
    ];
    for (const [re, wrong, right] of JOSA_FIX) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const prev = m[1];
        const code = prev.charCodeAt(0) - 0xac00;
        const batchim = code % 28;
        const wantsEul = wrong === '를';
        // ‘를’ 은 받침이 있을 때(ㄹ 빼고) 틀린 것, ‘으로’ 는 받침이 없을 때 틀린 것
        const isWrong = wantsEul ? batchim !== 0 && batchim !== 8 : batchim === 0;
        if (!isWrong) continue;
        const start = m.index + prev.length;
        push({
          axis: '정확성',
          sub: '표기의 정확성 — 조사 받침',
          start,
          end: start + wrong.length,
          text: wrong,
          fixes: [right],
          why: `앞말 ‘${prev}’ 의 받침에 맞지 않는다. ‘${prev}${right}’ 로 적는다.`,
          src: '[평가] 정확성 ② 표현의 정확성 · 조사 사용',
          severity: '오류',
          counted: true,
        });
      }
    }
  }

  /* --- 7. 괄호 뒤 조사 --- */
  {
    const re = /\(([^()]{1,40})\)\s*(으로|로|을|를|와|과|이|가)(?=[\s.,)]|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const inner = m[1];
      const last = [...inner].reverse().find((c) => /[가-힣A-Za-z0-9]/.test(c));
      if (!last) continue;
      let hasBatchim: boolean | null = null;
      if (/[가-힣]/.test(last)) {
        const code = last.charCodeAt(0) - 0xac00;
        hasBatchim = code % 28 !== 0;
      } else if (/[0-9]/.test(last)) {
        hasBatchim = ['0', '1', '3', '6', '7', '8'].includes(last);
      } else {
        // 로마자 약어는 읽는 소리를 기준으로 판단해야 하므로 검토 대상으로만 올린다.
        hasBatchim = null;
      }
      const josa = m[2];
      if (hasBatchim === null) continue;
      const wrong =
        (hasBatchim && ['로', '를', '와', '가'].includes(josa)) ||
        (!hasBatchim && ['으로', '을', '과', '이'].includes(josa));
      if (!wrong) continue;
      const right = hasBatchim
        ? { 로: '으로', 를: '을', 와: '과', 가: '이' }[josa]
        : { 으로: '로', 을: '를', 과: '와', 이: '가' }[josa];
      const s = m.index + m[0].length - josa.length;
      push({
        axis: '정확성',
        sub: '표기의 정확성 — 괄호 뒤 조사',
        start: s,
        end: s + josa.length,
        text: josa,
        fixes: [right!],
        why: `괄호를 빼고 읽었을 때의 소리(‘${inner}’)에 맞추어 조사를 쓴다.`,
        src: '[평가] 정확성 ① 표기의 정확성 · 괄호 뒤 조사를 잘못 사용한 경우',
        severity: '오류',
        counted: true,
      });
    }
  }

  /*
   * 이미 병기가 된 괄호 속은 어느 규칙도 건드리지 않는다.
   *
   * 로마자 규칙만 이 자리를 비켜 갔더니 사전 규칙이 그 틈으로 들어왔다. 실제로
   * ‘인공지능(AI) 기술’ 이 ‘인공지능(① 인공 지능 ② 조류 독감) 기술’ 로 나갔다.
   * 규칙마다 따로 막을 일이 아니라 한곳에서 막는다.
   *
   * 괄호 안을 **통째로** 덮는 지적만 걸린다. ‘부재(출장·복무 등)’ 안의 ‘출장’ 처럼
   * 괄호의 일부만 짚는 것은 그대로 둔다.
   */
  const inParens = raw.filter((f) => insideByunggi(text, f.start, f.end));
  const clean = inParens.length ? raw.filter((f) => !inParens.includes(f)) : raw;

  /* --- 겹치는 지적 정리 : 같은 자리는 긴 것 하나만 --- */
  clean.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const findings: Finding[] = [];
  for (const f of clean) {
    const clash = findings.find((g) => f.start < g.end && g.start < f.end && g.axis === f.axis);
    if (clash) continue;
    findings.push(f);
  }
  findings.sort((a, b) => a.start - b.start);

  /* --- 문장·어절 --- */
  const words = text.split(/\s+/).filter(Boolean);
  const sentences: AnalyzeResult['sentences'] = [];
  {
    const re = /[^\n.!?]+[.!?]?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const t = m[0].trim();
      if (t.length < 2) continue;
      sentences.push({ text: t, start: m.index, words: t.split(/\s+/).filter(Boolean).length });
    }
  }
  const LONG = 40;
  const longSentences = sentences.filter((s) => s.words >= LONG).length;
  for (const s of sentences) {
    if (s.words < LONG) continue;
    findings.push({
      key: `long-${s.start}`,
      axis: '소통성',
      sub: '이해가능성 — 문장 길이',
      start: s.start,
      end: s.start + s.text.length,
      text: s.text.slice(0, 40) + '…',
      fixes: ['여러 문장으로 나누기'],
      why: `한 문장이 ${s.words}어절이다. 여러 정보는 여러 문장으로 나누어 쓴다.`,
      src: '[바로] 첫째 마당 2-나-나) 지나치게 긴 문장 삼가기',
      severity: '검토',
      counted: false,
    });
  }
  findings.sort((a, b) => a.start - b.start);

  const byAxis = { 용이성: mk(), 정확성: mk(), 소통성: mk() } as AnalyzeResult['byAxis'];
  function mk() {
    return { total: 0, counted: 0, rate: 0 };
  }
  for (const f of findings) {
    byAxis[f.axis].total += 1;
    if (f.counted) byAxis[f.axis].counted += 1;
  }
  for (const k of Object.keys(byAxis) as Axis[]) {
    byAxis[k].rate = words.length ? (byAxis[k].counted / words.length) * 100 : 0;
  }

  // 1차 하네스 — 규칙이 낸 것이 원문과 어긋나지 않는지 본다.
  // 여기 걸리는 것은 모형이 아니라 우리 사전·규칙의 버그다.
  const g1 = guard1(findings, text);

  return {
    findings: g1.kept,
    ruleViolations: g1.tally,
    wordCount: words.length,
    charCount: text.length,
    sentences,
    byAxis,
    longSentences,
  };
}

/* ------------------------------------------------------------------ */
/* 수정본 만들기                                                        */
/* ------------------------------------------------------------------ */

export interface Decision {
  /** 반영할지 */
  on: boolean;
  /** 고른 대안의 번호 */
  pick: number;
  /**
   * 사람이 직접 적어 넣은 말.
   *
   * 대안이 ‘한글로 먼저 적고 괄호 안에 넣기’ 처럼 지시문이거나 ‘(으)로 / ~하여’ 처럼
   * 앞말에 따라 달라지는 경우, 기계가 고를 수 없으니 여기에 적은 것을 그대로 쓴다.
   * 비어 있지 않으면 자동 대안보다 우선한다.
   */
  custom?: string;
}

/** 대안 문자열에서 실제로 갈아 끼울 말만 뽑는다. ‘A / B’, ‘A(설명)’ 같은 꼴 처리 */
export function pickText(fix: string) {
  return fix.split('/')[0].trim();
}

/** 자동으로 갈아 끼워도 되는 대안인지 */
/* ------------------------------------------------------------------ */
/* 조사 맞추기                                                          */
/* ------------------------------------------------------------------ */

/** 앞 글자에 받침이 있는지. 한글이 아니면 null */
function hasBatchim(ch: string): boolean | null {
  if (!ch || !/[가-힣]/.test(ch)) return null;
  return (ch.charCodeAt(0) - 0xac00) % 28 !== 0;
}

/** 받침이 ‘ㄹ’인지 (‘으로/로’ 판단에 쓴다) */
function isRieul(ch: string): boolean {
  if (!/[가-힣]/.test(ch)) return false;
  return (ch.charCodeAt(0) - 0xac00) % 28 === 8;
}

const JOSA_PAIRS: [string, string][] = [
  ['으로', '로'],
  ['을', '를'],
  ['이', '가'],
  ['은', '는'],
  ['과', '와'],
  ['이나', '나'],
  ['이란', '란'],
  ['이라', '라'],
];

/**
 * 갈아 끼울 말이 조사로 시작하면 앞말의 받침에 맞춘다.
 *
 * ‘실습 등을 통해’ 에서 ‘을 통해’ 를 바꿀 때 AI 가 ‘를 접하며’ 를 주면
 * ‘등를 접하며’ 가 된다. 받침 판단은 기계가 확실히 할 수 있는 일이므로 여기서 바로잡는다.
 */
export function agreeJosa(prev: string, replacement: string): string {
  // 낱말을 통째로 받아도 되도록 마지막 글자만 본다
  const prevChar = [...(prev ?? '')].pop() ?? '';
  const batchim = hasBatchim(prevChar);
  if (batchim === null) return replacement;

  for (const [withB, withoutB] of JOSA_PAIRS) {
    for (const form of [withB, withoutB]) {
      // 조사 뒤에는 공백이나 글 끝이 와야 한다(‘은’ 으로 시작하는 낱말과 헷갈리지 않게)
      if (!replacement.startsWith(form)) continue;
      const after = replacement[form.length];
      if (after !== undefined && !/[\s,.]/.test(after)) continue;

      const right =
        withB === '으로' ? (batchim && !isRieul(prevChar) ? '으로' : '로') : batchim ? withB : withoutB;
      return right + replacement.slice(form.length);
    }
  }
  return replacement;
}

/**
 * ‘인공지능(AI)’ 처럼 한글 뒤에 외국 글자를 괄호로 단 병기 형태.
 *
 * 조사가 붙어 오는 것도 병기로 본다. ‘인공지능(AI)이’ 를 괄호가 들었다는 이유로 막으면
 * 제목의 ‘AI가’ 가 아예 안 고쳐진다(실제로 그렇게 그대로 나갔다).
 */
const BYUNGGI = /^[가-힣·\s]+\([A-Za-z0-9&.\-+]+\)(으로|이나|이란|이라|로|을|를|이|가|은|는|과|와)?$/;

/** 갈아 끼울 말 끝에 붙어 올 수 있는 조사 — 긴 것부터 본다 */
const TAIL_JOSA = ['으로', '이나', '이란', '이라', '로', '을', '를', '이', '가', '은', '는', '과', '와'];

const endsWithJosa = (s: string) => TAIL_JOSA.find((j) => s.endsWith(j)) ?? null;

const startsWithJosa = (s: string) => {
  const j = TAIL_JOSA.find((x) => s.startsWith(x));
  if (!j) return null;
  // 조사 뒤에는 공백이나 문장 부호가 와야 한다. ‘은행’ 의 ‘은’ 을 조사로 보면 안 된다.
  const after = s[j.length];
  return after === undefined || /[\s,.·”’)]/.test(after) ? j : null;
};

/** 조사를 고를 때 읽는 마지막 글자. 괄호 병기는 읽지 않는다(‘인공지능(AI)’ → ‘능’). */
function readingTail(word: string): string {
  const w = word.replace(/\([^)]*\)\s*$/, '').trim();
  return [...w].pop() ?? '';
}

/** 앞말이 `word` 로 바뀌었을 때 조사 `josa` 가 되어야 할 꼴. 판단할 수 없으면 null. */
function josaAfter(word: string, josa: string): string | null {
  const ch = readingTail(word);
  const batchim = hasBatchim(ch);
  if (batchim === null) return null;
  for (const [withB, withoutB] of JOSA_PAIRS) {
    if (josa !== withB && josa !== withoutB) continue;
    if (withB === '으로') return batchim && !isRieul(ch) ? '으로' : '로';
    return batchim ? withB : withoutB;
  }
  return null;
}

/**
 * 갈아 끼운 뒤 **뒤에 남는 조사**를 어떻게 할지 정한다.
 *
 * 낱말을 바꾸면 그 뒤의 조사도 따라 바뀌어야 하는데, 지적한 자리는 낱말까지다. 그래서
 * 실제로 이런 것이 나갔다.
 *   ‘AI가 척척’            → ‘인공지능(AI)이가 척척’ / ‘인공지능(AI)가 척척’
 *   ‘시스템을 전국 최초로’  → ‘체계를을 전국 최초로’
 *   ‘이 시스템은 그동안’    → ‘이 체계는은 그동안’ / ‘이 체계은 그동안’
 *
 * 두 가지가 겹쳐 있다. 고칠 말이 조사를 달고 오면 겹조사가 되고, 안 달고 오면 앞말에
 * 안 맞는 조사가 남는다. 어느 쪽이든 **원문의 조사를 함께 먹고** 맞는 꼴로 다시 쓴다.
 *
 * skip — 원문에서 더 먹을 글자 수, add — 그 자리에 대신 쓸 조사.
 */
export function trailingJosaFix(
  source: string,
  end: number,
  span: string,
  rep: string,
): { skip: number; add: string } {
  const none = { skip: 0, add: '' };
  const josa = startsWithJosa(source.slice(end));
  if (!josa) return none;
  // 지적한 자리가 이미 조사로 끝나면 원문의 조사는 그 안에 있다. 뒤엣것은 남의 것이다.
  if (endsWithJosa(span)) return none;
  // 고칠 말이 조사를 달고 왔다 — 원문에 남은 조사는 먹어 없앤다
  if (endsWithJosa(rep)) return { skip: josa.length, add: '' };
  const right = josaAfter(rep, josa);
  if (right === null || right === josa) return none;
  return { skip: josa.length, add: right };
}

export function isApplicable(fix: string) {
  const t = pickText(fix);
  if (!t) return false;
  // 괄호가 있어도 병기 형태는 그대로 넣으면 된다
  if (BYUNGGI.test(t)) return true;
  if (/[~()]/.test(t)) return false;
  if (t.length > 24) return false;
  if (/(하기|넣기|바꾸기|나누기|적기|쓰기|삼가기)$/.test(t)) return false;
  return true;
}

/**
 * 이 지적을 수정본에 넣는다면 어떤 말이 들어갈지. 넣을 수 없으면 null.
 *
 * `source` 를 주면 앞말에 맞춰 조사를 바로잡는다.
 */
export function replacementFor(f: Finding, d: Decision | undefined, source?: string): string | null {
  if (!d) return null;
  const custom = (d.custom ?? '').trim();
  const fix = f.fixes[d.pick] ?? '';
  const rep = custom || (isApplicable(fix) ? pickText(fix) : null);
  if (rep === null) return null;
  if (!source) return rep;
  return agreeJosa(source[f.start - 1] ?? '', rep);
}

/** 수정본을 이루는 한 조각. `from` 이 있으면 갈아 끼운 자리다. */
export interface RevisedPart {
  text: string;
  /** 원래 있던 말 (바뀐 자리에만) */
  from?: string;
  axis?: Axis;
  key?: string;
}

/**
 * 수정본을 조각으로 만든다.
 *
 * 어디를 고쳤는지 화면에 보여 주려면 바뀐 자리를 알아야 한다. 글자만 이어 붙이면
 * 그 정보가 사라지므로, 갈아 끼운 자리는 `from` 을 달아 따로 표시해 둔다.
 */
export function buildRevisedParts(
  text: string,
  findings: Finding[],
  decisions: Record<string, Decision>,
): RevisedPart[] {
  const applied = findings
    .filter((f) => decisions[f.key]?.on && replacementFor(f, decisions[f.key], text) !== null)
    .sort((a, b) => a.start - b.start);

  const parts: RevisedPart[] = [];
  let cursor = 0;
  for (const f of applied) {
    // 앞의 지적과 자리가 겹치면 건너뛴다(먼저 잡은 쪽을 살린다)
    if (f.start < cursor) continue;
    const rep = replacementFor(f, decisions[f.key], text);
    if (rep === null) continue;
    if (f.start > cursor) parts.push({ text: text.slice(cursor, f.start) });
    // 낱말이 바뀌면 뒤에 남는 조사도 따라 고친다(겹조사·불일치 막기)
    const span = text.slice(f.start, f.end);
    const { skip, add } = trailingJosaFix(text, f.end, span, rep);
    const end = f.end + skip;
    parts.push({ text: rep + add, from: text.slice(f.start, end), axis: f.axis, key: f.key });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

export function buildRevised(
  text: string,
  findings: Finding[],
  decisions: Record<string, Decision>,
) {
  return buildRevisedParts(text, findings, decisions)
    .map((p) => p.text)
    .join('');
}

/** 처음 열었을 때의 기본 선택: ‘오류’이면서 갈아 끼울 수 있는 것만 켠다 */
export function defaultDecisions(findings: Finding[]) {
  const d: Record<string, Decision> = {};
  for (const f of findings) {
    d[f.key] = { on: f.severity === '오류' && isApplicable(f.fixes[0] ?? ''), pick: 0 };
  }
  return d;
}
