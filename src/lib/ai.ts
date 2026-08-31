import type { Finding } from './analyze';
import { AXIS_OF, STEP_IDS, procedureText, checkReplacement } from './procedure';
import { guard2, guard3, type Tally } from './stages';

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'proxy';

/**
 * 기관 중계 서버 주소. 빌드할 때 VITE_PROXY_URL 로 넣는다.
 *
 * 이건 비밀이 아니다. 그냥 주소다. 비밀인 API 키는 그 서버 안에만 있다.
 * 이 값이 있으면 부서 담당자는 설정을 만질 필요 없이 그냥 검토를 누르면 된다.
 */
export const PROXY_URL: string = (import.meta.env?.VITE_PROXY_URL ?? '').trim();
export const hasProxy = () => PROXY_URL.length > 0;

/** 중계 서버가 열어 둔 모형 (worker.js 의 ALLOWED_MODELS 와 맞춘다) */
export const PROXY_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

/** 물어볼 준비가 됐는지. 중계 서버를 쓰면 키가 필요 없다. */
export function isConfigured(cfg: AiConfig): boolean {
  return cfg.provider === 'proxy' ? hasProxy() : Boolean(cfg.apiKey.trim());
}

export interface AiConfig {
  provider: Provider;
  apiKey: string;
  model: string;
}

/**
 * 처음 값일 뿐이다. 모형 이름은 회사 사정으로 수시로 사라진다
 * (실제로 gemini-2.5-flash 가 신규 사용자에게 막혔다).
 * 그래서 설정 화면에서 `listModels()` 로 실제 쓸 수 있는 목록을 받아 고르게 한다.
 */
export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-3.6-flash',
  proxy: 'gemini-3.6-flash',
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: '앤트로픽 클로드',
  openai: '오픈에이아이',
  gemini: '구글 제미나이',
  proxy: '기관 중계 서버 (키 없이 바로)',
};

export const KEY_HELP: Record<Provider, string> = {
  anthropic: 'console.anthropic.com 에서 발급한 키(sk-ant-…)',
  openai: 'platform.openai.com 에서 발급한 키(sk-…)',
  gemini: 'aistudio.google.com 에서 발급한 키(AIza…)',
  proxy: '키가 필요 없습니다. 기관이 대신 냅니다',
};

const SYSTEM = `당신은 대한민국 공공기관의 보도자료를 국립국어원 공문서등 평가 기준으로 검토하는
국어 전문가다. **아래 절차를 1번부터 차례대로 밟는다.** 앞 단계에서 다룬 것은 뒤에서 다시
꺼내지 않는다.

[절차]
${procedureText()}

낱말을 하나씩 바꾸는 일은 이미 규칙 검사가 끝냈다. 당신은 **문맥을 봐야 아는 것**만 본다.

[지켜야 할 규약 — 어기면 그 항목은 버려진다]
- sub 는 위 절차의 대괄호 안 이름을 **글자 그대로** 쓴다. 그 밖의 이름은 받지 않는다.
- quote 는 원문에 **글자 그대로** 있는 짧은 조각이어야 한다. 지어내지 마라.
- suggestion 안의 **숫자·날짜·비율은 원래 그대로**여야 한다. 하나라도 다르면 버려진다.
- ‘높이기(UP)’, ‘가상현실(VR)’ 처럼 한글 뒤 괄호에 로마자를 넣은 것은 **이미 바른 표기다.**
  괄호를 지우지 마라. 다는 것은 괜찮다.
- 물결(~)이나 ‘(으)로’ 같은 자리표시를 쓰지 마라. 그대로 끼울 수 있는 완성된 말만 낸다.
- **이름은 사실이다.** 사업명·시스템명·제품명·행사명은 그 기관이 정한 것이라 손대지 마라.
  ‘K뚝배기’, ‘JB메신저’ 처럼 로마자가 한글에 붙어 한 낱말을 이루면 이름이다. 병기를 다는
  것도 안 된다 — ‘케이(K)뚝배기’ 는 다른 물건 이름이 된다.
  이름이 아니라 표어·문구면(‘지평선 너머, 꿈 UP! 미래 UP!’) 따옴표 안이라도 고쳐도 된다.
- 확신이 없으면 넣지 마라. 억지로 개수를 채우지 마라. 취향으로 바꾸지 마라.

출력은 다른 말 없이 JSON 객체 하나만 낸다.
{"findings":[{"quote":"원문 그대로","suggestion":"고친 표현","sub":"절차의 이름 그대로","why":"왜 고쳐야 하는지 한 문장"}],
 "summary":"초안 전체에 대한 두세 문장 총평"}`;

/** 2차가 낼 수 있는 모양. 이 밖의 것은 모형이 만들지도 못한다. */
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          quote: { type: 'string' },
          suggestion: { type: 'string' },
          sub: { type: 'string', enum: [...STEP_IDS] },
          why: { type: 'string' },
        },
        required: ['quote', 'suggestion', 'sub', 'why'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['findings', 'summary'],
};

function buildUserPrompt(text: string, already: Finding[]) {
  const dup = Array.from(new Set(already.map((f) => f.text))).slice(0, 120);
  return `[규칙 검사에서 이미 잡은 표현 — 다시 지적하지 말 것]
${dup.length ? dup.join(', ') : '(없음)'}

[검토할 보도자료 초안]
"""
${text}
"""`;
}

async function callAnthropic(cfg: AiConfig, user: string, system: string = SYSTEM) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 4000,
      // 온도 0. 같은 글을 두 번 넣으면 같은 답이 나와야 한다. 안 정해 두면
      // 회사 기본값(대개 1.0)이라 부를 때마다 답이 달라진다.
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');
}

async function callOpenAI(cfg: AiConfig, user: string, system: string = SYSTEM) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * 제미나이를 부를 주소.
 *
 * 중계 서버를 쓰면 키를 붙이지 않는다. 키는 그 서버 안에만 있다.
 * 브라우저가 읽을 수 있는 것은 사람도 읽을 수 있으므로, 정적 웹페이지에 키를 둘 자리는 없다.
 */
export function geminiUrl(cfg: AiConfig): string {
  if (cfg.provider === 'proxy') {
    return `${PROXY_URL.replace(/\/+$/, '')}/${encodeURIComponent(cfg.model)}`;
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cfg.model,
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
}

async function callGemini(
  cfg: AiConfig,
  user: string,
  system: string = SYSTEM,
  schema?: unknown,
) {
  const url = geminiUrl(cfg);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0,
        // 나온 뒤에 걸러 내는 것보다 애초에 그 모양만 나오게 하는 편이 낫다.
        // sub 는 절차의 여덟 이름 중에서만 고를 수 있다.
        ...(schema ? { responseSchema: schema } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('');
}

function parseJson(raw: string) {
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('AI 응답에서 JSON을 찾지 못했습니다.');
  return JSON.parse(raw.slice(s, e + 1));
}

export interface AiResult {
  findings: Finding[];
  summary: string;
  /** 원문에서 위치를 찾지 못해 버린 지적 수 */
  dropped: number;
  /** 규약을 어겨 버린 것들 — 무엇을 몇 번 어겼나 */
  violations: Tally;
  /** 실제로 물어본 횟수 */
  rounds: number;
  /** 표가 모자라 버린 지적 수 (한 번만 나온 것) */
  thin: number;
}

/**
 * 몇 번 돌려 표를 셀 것인가.
 *
 * 온도를 0 으로 못 박아도 답이 완전히 같지는 않다(회사 쪽 배치 처리 탓이다).
 * 그래서 같은 글을 여러 번 물어 **여러 번 나온 것만 채택한다.**
 * 한 번만 나온 지적은 대개 헛것이고, 이것이 답이 들쑥날쑥한 것을 가장 크게 줄인다.
 * 세 번을 한꺼번에 물어보므로 기다리는 시간은 거의 그대로다.
 */
export const ROUNDS = 3;
export const MIN_VOTES = 2;

export async function reviewWithAi(
  cfg: AiConfig,
  text: string,
  already: Finding[],
  rounds: number = ROUNDS,
): Promise<AiResult> {
  const user = buildUserPrompt(text, already);
  const ask = async () => {
    const raw =
      cfg.provider === 'anthropic'
        ? await callAnthropic(cfg, user)
        : cfg.provider === 'gemini' || cfg.provider === 'proxy'
          ? await callGemini(cfg, user, SYSTEM, REVIEW_SCHEMA)
          : await callOpenAI(cfg, user);
    return parseJson(raw);
  };

  // 한꺼번에 물어본다. 하나가 실패해도 나머지로 표를 센다.
  const settled = await Promise.allSettled(
    Array.from({ length: Math.max(1, rounds) }, () => ask()),
  );
  const answers = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (answers.length === 0) {
    const first = settled[0];
    throw first && first.status === 'rejected' ? first.reason : new Error('AI 응답이 없습니다.');
  }
  const need = answers.length >= 2 ? Math.min(MIN_VOTES, answers.length) : 1;

  const violations: Tally = {};
  const taken: [number, number][] = already.map((f) => [f.start, f.end]);

  // 회차마다 같은 자리를 같은 이름으로 짚었는지로 표를 센다
  const votes = new Map<
    string,
    { n: number; quote: string; fix: string; sub: string; start: number; why: string }
  >();
  for (const parsed of answers) {
    const seen = new Set<string>();
    for (const raw2 of parsed.findings ?? []) {
      const ok = guard2(raw2, text, taken, violations);
      if (!ok) continue;
      const id = `${ok.start}:${ok.quote}:${ok.sub}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const got = votes.get(id);
      if (got) got.n += 1;
      else votes.set(id, { n: 1, ...ok, why: String(raw2.why ?? '').trim() });
    }
  }

  const findings: Finding[] = [];
  const used: [number, number][] = [];
  let thin = 0;
  for (const v of [...votes.values()].sort((a2, b2) => b2.n - a2.n || a2.start - b2.start)) {
    if (v.n < need) {
      thin += 1;
      continue;
    }
    if (used.some(([a2, b2]) => v.start < b2 && a2 < v.start + v.quote.length)) continue;
    used.push([v.start, v.start + v.quote.length]);
    findings.push({
      key: `ai-${v.start}-${v.quote.length}`,
      axis: AXIS_OF[v.sub] ?? '정확성',
      sub: `AI 검토 — ${v.sub}`,
      start: v.start,
      end: v.start + v.quote.length,
      text: v.quote,
      fixes: [v.fix || '문맥에 맞게 다시 쓰기'],
      why: v.why,
      src: 'AI 문맥 검토(사람이 최종 확인 필요)',
      severity: '검토',
      counted: false,
      // 물어본 만큼 다 짚은 것만 기본으로 켠다. 한두 번만 나온 것은 사람이 보고 정한다.
      confident: v.n >= answers.length,
    });
  }
  findings.sort((a2, b2) => a2.start - b2.start);

  const summary =
    answers.map((a2) => String(a2.summary ?? '').trim()).find(Boolean) ?? '';
  const dropped = Object.values(violations).reduce((a2, b2) => a2 + b2, 0);
  return { findings, summary, dropped, violations, rounds: answers.length, thin };
}

/* ------------------------------------------------------------------ */
/* 쓸 수 있는 모형 목록                                                 */
/* ------------------------------------------------------------------ */

/** 글을 만드는 모형이 아닌 것 (그림·음성·임베딩 등) */
const NOT_TEXT = /embedding|aqa|tts|imagen|veo|image-generation|audio|realtime|whisper|dall-e|moderation|davinci|babbage/i;

/** 이름에서 판 번호를 뽑는다. gemini-3.6-flash → 3.6, claude-sonnet-4-5-… → 4.5 */
function versionOf(id: string): number {
  const m = id.match(/(\d+)[.\-](\d+)/) ?? id.match(/(\d+)/);
  if (!m) return 0;
  return m[2] === undefined ? Number(m[1]) : Number(m[1]) + Number(m[2]) / 100;
}

/**
 * 새 판을 위로 올린다.
 *
 * 목록을 그대로 두면 오래된 판(제미나이 2.5 같은 것)이 위에 떠서 그걸 고르게 된다.
 * 그 모형은 신규 사용자에게 막혀 있어 고르는 순간 404 가 난다.
 * 시험판(preview·exp)은 뒤로 미룬다.
 */
function rankModels(ids: string[]): string[] {
  return ids
    .filter((id) => !NOT_TEXT.test(id))
    .sort((a, b) => {
      const trial = (x: string) => (/(preview|exp|experimental)/i.test(x) ? 1 : 0);
      return trial(a) - trial(b) || versionOf(b) - versionOf(a) || a.localeCompare(b);
    });
}

/**
 * 넣어 둔 키로 그 회사에 물어 실제 쓸 수 있는 모형 이름을 받아 온다.
 * 이름을 코드에 박아 두면 반드시 낡는다. 목록은 키를 넣은 사람만 볼 수 있다.
 *
 * 다만 **이 목록에 있다고 내 키로 다 되는 것은 아니다.** 구글은 신규 사용자에게
 * 막은 옛 모형도 목록에는 그대로 내려 준다. 그래서 `testModel()` 로 실제로
 * 한 번 불러 보게 해 둔다.
 */
export async function listModels(cfg: AiConfig): Promise<string[]> {
  // 중계 서버는 정해 둔 모형만 받는다. 목록을 물어볼 곳이 없으니 그대로 돌려준다.
  if (cfg.provider === 'proxy') return [...PROXY_MODELS];

  if (!cfg.apiKey.trim()) throw new Error('먼저 API 키를 넣어 주세요.');

  if (cfg.provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cfg.apiKey)}&pageSize=200`,
    );
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    return rankModels(
      (data.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          (m.supportedGenerationMethods ?? []).includes('generateContent'),
        )
        .map((m: { name: string }) => m.name.replace(/^models\//, '')),
    );
  }

  if (cfg.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    return rankModels(
      (data.data ?? []).map((m: { id: string }) => m.id).filter((id: string) => /^(gpt|o\d|chatgpt)/i.test(id)),
    );
  }

  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return rankModels((data.data ?? []).map((m: { id: string }) => m.id));
}

/**
 * 고른 모형으로 실제 한 번 불러 본다.
 *
 * 목록에 있다고 내 키로 되는 게 아니라서(구글이 옛 모형을 신규 사용자에게 막는다),
 * 고르고 나서 바로 확인할 수 있게 둔다. 아주 짧게 물어 값도 거의 안 든다.
 */
export async function testModel(cfg: AiConfig): Promise<void> {
  const ping = '안녕하세요라고만 답하세요.';

  if (cfg.provider === 'gemini' || cfg.provider === 'proxy') {
    const res = await fetch(geminiUrl(cfg), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: ping }] }],
        generationConfig: { maxOutputTokens: 16 },
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return;
  }

  if (cfg.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: ping }],
        max_completion_tokens: 16,
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 16,
      messages: [{ role: 'user', content: ping }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

/* ------------------------------------------------------------------ */
/* 자동으로 못 고치는 자리를 AI 가 채운다                                */
/* ------------------------------------------------------------------ */

const FILL_SYSTEM = `당신은 대한민국 공공기관 보도자료를 다듬는 국어 전문가다.
문장에서 고쳐야 할 조각과 그 이유를 준다. **그 자리에 그대로 끼워 넣을 말만** 만들어라.

지켜야 할 것
- 준 조각을 대신할 말만 낸다. 앞뒤 문장을 다시 쓰지 마라.
- 조각이 조사로 시작하면 **앞 낱말의 받침에 맞춘다.** 예: ‘실습 등을 통해’ 의 ‘을 통해’ 를 바꿀 때
  앞말이 ‘등’ 이므로 ‘를 …’ 이 아니라 ‘을 …’ 로 시작해야 한다.
- 조사와 어미가 앞뒤와 자연스럽게 이어지게 한다(‘~을 통해’ → ‘(으)로’ 가 아니라 실제 문맥에 맞는 ‘로’ 또는 ‘하여’).
- 외국 글자는 한글로 먼저 적고 괄호 안에 넣는다. 예: AI → 인공지능(AI)
- 물결(~)이나 ‘(으)로’ 같은 자리표시를 쓰지 마라. 완성된 말만 낸다.
- **시제와 종결 어미를 바꾸지 마라.** 원문이 ‘…되었다’ 면 고친 말도 과거형이어야 한다.
  보도자료는 이미 있었던 일을 적는 글이라 시제가 어긋나면 문서 전체가 틀어진다.
- 사실관계(수치, 날짜, 기관명, 사람 이름)는 바꾸지 마라.
- ‘높이기(UP)’ 처럼 한글 뒤 괄호에 로마자를 넣은 것은 이미 바른 표기다. 괄호를 지우지 마라.
- 마땅한 말이 없으면 그 항목은 빼라. 억지로 채우지 마라.

출력은 다른 말 없이 JSON 객체 하나만 낸다.
{"fills":[{"id":"준 id 그대로","replacement":"그 자리에 넣을 말"}]}`;

export interface BlankTarget {
  id: string;
  /** 고쳐야 할 조각 */
  text: string;
  /** 왜 고쳐야 하는지 */
  why: string;
  /** 조각이 들어 있는 문장 */
  context: string;
  /** 조각 바로 앞의 낱말 (조사 받침을 맞추라고 알려 준다) */
  before?: string;
}

/** 자동으로 못 고치는 자리들을 한 번에 물어 채운다. id → 넣을 말 */
export async function fillBlanks(
  cfg: AiConfig,
  targets: BlankTarget[],
): Promise<Record<string, string>> {
  if (targets.length === 0) return {};

  const user = targets
    .map(
      (t) =>
        `- id: ${t.id}\n  고칠 조각: ${t.text}\n  바로 앞말: ${t.before || '(문장 첫머리)'}\n  이유: ${t.why}\n  들어 있는 문장: ${t.context}`,
    )
    .join('\n');

  const raw =
    cfg.provider === 'anthropic'
      ? await callAnthropic({ ...cfg }, user, FILL_SYSTEM)
      : cfg.provider === 'openai'
        ? await callOpenAI({ ...cfg }, user, FILL_SYSTEM)
        : await callGemini({ ...cfg }, user, FILL_SYSTEM);

  const parsed = parseJson(raw);
  const out: Record<string, string> = {};
  const byId = new Map(targets.map((t) => [t.id, t]));
  for (const f of parsed.fills ?? []) {
    const id = String(f.id ?? '').trim();
    const rep = String(f.replacement ?? '').trim();
    const t = byId.get(id);
    if (!id || !t) continue;
    // 부탁이 아니라 확인이다. 규약을 어긴 답은 안 쓴다.
    if (checkReplacement(t.text, rep)) continue;
    out[id] = rep;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 시제 어긋남 확인                                                     */
/* ------------------------------------------------------------------ */

const PAST = /(았|었|였|했)(다|음|으며|고|지만)?[.]?\s*$/;
const PRESENT = /(는다|ㄴ다|한다|된다|이다|간다|온다)[.]?\s*$/;

/**
 * 고친 말이 원래 말과 시제가 다른지.
 *
 * ‘시간을 갖게 되었다’ 를 ‘시간을 갖는다’ 로 바꾸면 문장은 매끄러워도 시제가 틀어진다.
 * 보도자료는 이미 있었던 일을 적는 글이라 이건 그냥 넘길 수 없다.
 * 기계가 고쳐 주기는 어려우니, 자동으로 넣지 않고 사람에게 보여 준다.
 */
export function tenseChanged(before: string, after: string): boolean {
  const wasPast = PAST.test(before);
  const nowPast = PAST.test(after);
  const wasPresent = PRESENT.test(before);
  const nowPresent = PRESENT.test(after);
  if (wasPast && nowPresent) return true;
  if (wasPresent && nowPast) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* 검수 — 고쳐 놓은 것을 스스로 다시 본다                                */
/* ------------------------------------------------------------------ */

const VERIFY_SYSTEM = `당신은 대한민국 공공기관 보도자료를 최종 검수하는 국어 전문가다.

앞 단계에서 원고의 여러 자리를 고쳤다. 그 목록을 준다. **고침 하나하나를 그 문맥에서
판정하라.** 새로 고칠 곳을 찾는 일이 아니다.

앞 단계는 낱말 사전이라 문맥을 못 읽는다. ‘K’ 를 ‘케이(K)’ 로 바꾸라고만 할 뿐, 그 ‘K’ 가
시스템 이름 ‘K뚝배기’ 의 첫 글자인지 아닌지는 모른다. **그 판단이 네 일이다.**

무엇을 잘못이라고 하는가
- 고친 뒤 문장이 말이 안 되는 것. 조사 받침이 어긋난 것(‘등를’, ‘공연로’).
- 시제가 앞뒤와 어긋난 것. 이미 있었던 일인데 현재형으로 바뀐 것.
- **원래가 맞았는데 괜히 바꾼 것.** 특히 ‘높이기(UP)’ 처럼 한글 뒤 괄호에 로마자를 넣은 것은
  규범에 맞는 형태이니, 괄호를 지운 것은 잘못이다.
- **이름을 건드린 것.** 사업명·시스템명·제품명·행사명은 사실이다. ‘K뚝배기’, ‘JB메신저’,
  ‘K에듀파인’ 처럼 로마자가 한글에 붙어 한 낱말을 이루면 그것이 그 물건의 이름이다.
  이름을 바꾸면 다른 물건이 된다. 규범보다 사실이 앞선다.
- 사실관계(수치, 날짜, 기관명, 사람 이름)가 달라진 것.

무엇을 잘못이라고 하지 않는가
- 취향 차이. 원래도 되고 고친 것도 되면 그냥 둔다.
- 더 나은 표현이 따로 있다는 것. 여기서는 옳고 그름만 본다.
- **따옴표 안이라는 이유 하나.** 이름이 아니라 표어·문구라면 따옴표 안이라도 고친다.
  ‘지평선 너머, 꿈 UP! 미래 UP!’ 은 이름이 아니라 표어다. 가락은 지키면서 표기만
  바로잡는다(예: ‘업(UP)’). 이름인지 표어인지는 네가 문맥을 읽어 정하라.

**옳은 것은 내지 마라. 잘못된 것만 낸다.** 잘못이 없으면 빈 목록을 낸다.

자리마다 fix 에 **그 자리에 실제로 들어갈 말**을 적는다. 지시문이나 설명이 아니라
갈아 끼울 말 그대로다.
- 다르게 고쳐야 하면 → 네가 옳게 고쳐서 적는다.
- 손대지 말았어야 하면 → **‘고치기 전’ 말을 그대로 적는다.** 그 자리는 원래대로 두고,
  지적은 담당자 목록에 남는다. 없어지는 것이 아니니 마음 놓고 그대로 두라고 하라.

출력은 다른 말 없이 JSON 객체 하나만 낸다.
{"wrong":[{"id":"준 id 그대로","fix":"그 자리에 넣을 옳은 말"}]}`;

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    wrong: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, fix: { type: 'string' } },
        required: ['id', 'fix'],
      },
    },
  },
  required: ['wrong'],
};

export interface EditToCheck {
  id: string;
  /** 원래 있던 말 */
  from: string;
  /** 갈아 끼운 말 */
  to: string;
  /** 고친 뒤의 문장 */
  after: string;
}

/**
 * 고쳐 놓은 자리들을 한 번에 다시 물어, 잘못 고친 것을 **옳게 고쳐 온다.**
 *
 * 모형은 부를 때마다 답이 달라서, 스스로 제대로 붙여 놓은 병기를 다음 번에 떼어 내기도 한다
 * (실제로 ‘높이기(UP)’ 를 ‘높이기’ 로 되돌린 적이 있다). 사람이 전부 읽어 볼 수는 없으니
 * 넣기 전에 기계가 한 번 더 본다.
 *
 * 전에는 잘못된 것을 끄고 화면에 이유를 적었다. 그러면 담당자가 읽을 것이 늘 뿐이고,
 * 조사가 어긋난 자리는 여전히 어긋난 채 남는다. 지금은 **옳은 말을 받아서 갈아 끼운다.**
 * 손대지 말았어야 할 자리면 ‘고치기 전’ 말이 돌아오고, 그 자리는 조용히 원래대로 둔다.
 *
 * 돌려주는 것: id → 그 자리에 넣을 옳은 말.
 */
export async function verifyEdits(
  cfg: AiConfig,
  edits: EditToCheck[],
): Promise<Record<string, string>> {
  if (edits.length === 0) return {};

  const user = edits
    .map((e) => `- id: ${e.id}\n  고치기 전: ${e.from}\n  고친 뒤: ${e.to}\n  고친 뒤 문장: ${e.after}`)
    .join('\n');

  const raw =
    cfg.provider === 'anthropic'
      ? await callAnthropic(cfg, user, VERIFY_SYSTEM)
      : cfg.provider === 'gemini' || cfg.provider === 'proxy'
        ? await callGemini(cfg, user, VERIFY_SYSTEM, VERIFY_SCHEMA)
        : await callOpenAI(cfg, user, VERIFY_SYSTEM);

  const parsed = parseJson(raw);
  const from = new Map(edits.map((e) => [e.id, e.from]));
  return guard3(parsed.wrong ?? [], from, {});
}
