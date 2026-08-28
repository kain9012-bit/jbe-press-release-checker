import { PATTERN_RULES, EXTRA_LOANWORDS, checkDueum, type Axis } from '../data/rules';
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
}

/* ------------------------------------------------------------------ */
/* 한글 경계 판정                                                       */
/* ------------------------------------------------------------------ */

const isHangul = (ch: string) => !!ch && /[가-힣]/.test(ch);
/** 낱말 뒤에 바로 붙을 수 있는 조사·어미의 첫 글자 */
const JOSA_HEAD = new Set(
  '은는이가을를에의로과와도만부까처보밖조마라든나야여랑서한께으랍'.split(''),
);

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
      const open = text[s - 1];
      const close = text[e];
      const beforeOpen = text[s - 2];
      if (open === '(' && close === ')' && (isHangul(beforeOpen) || /[)\]]/.test(beforeOpen ?? ''))) continue;
      if (/^https?$|^www$/i.test(m[0])) continue;
      push({
        axis: '용이성',
        sub: '① 외국 글자(로마자) 사용',
        start: s,
        end: e,
        text: m[0],
        fixes: [`한글로 먼저 적고 괄호 안에 ‘${m[0]}’을(를) 넣기`],
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

  /* --- 겹치는 지적 정리 : 같은 자리는 긴 것 하나만 --- */
  raw.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const findings: Finding[] = [];
  for (const f of raw) {
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

  return {
    findings,
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
export function isApplicable(fix: string) {
  const t = pickText(fix);
  if (!t) return false;
  if (/[~()]/.test(t)) return false;
  if (t.length > 24) return false;
  if (/(하기|넣기|바꾸기|나누기|적기|쓰기|삼가기)$/.test(t)) return false;
  return true;
}

/** 이 지적을 수정본에 넣는다면 어떤 말이 들어갈지. 넣을 수 없으면 null */
export function replacementFor(f: Finding, d: Decision | undefined): string | null {
  if (!d) return null;
  const custom = (d.custom ?? '').trim();
  if (custom) return custom;
  const fix = f.fixes[d.pick] ?? '';
  return isApplicable(fix) ? pickText(fix) : null;
}

export function buildRevised(
  text: string,
  findings: Finding[],
  decisions: Record<string, Decision>,
) {
  const applied = findings
    .filter((f) => decisions[f.key]?.on && replacementFor(f, decisions[f.key]) !== null)
    .sort((a, b) => b.start - a.start);

  let out = text;
  for (const f of applied) {
    const rep = replacementFor(f, decisions[f.key]);
    if (rep === null) continue;
    out = out.slice(0, f.start) + rep + out.slice(f.end);
  }
  return out;
}

/** 처음 열었을 때의 기본 선택: ‘오류’이면서 갈아 끼울 수 있는 것만 켠다 */
export function defaultDecisions(findings: Finding[]) {
  const d: Record<string, Decision> = {};
  for (const f of findings) {
    d[f.key] = { on: f.severity === '오류' && isApplicable(f.fixes[0] ?? ''), pick: 0 };
  }
  return d;
}
