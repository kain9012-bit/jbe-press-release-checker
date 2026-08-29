import type { Finding } from './analyze';

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'compat';

export interface AiConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  /** OpenAI 호환 서버 주소. provider 가 'compat' 일 때만 쓴다. */
  baseUrl?: string;
}

/** 물어볼 준비가 됐는지. 사내 서버는 키를 요구하지 않는 경우가 많다. */
export function isConfigured(cfg: AiConfig): boolean {
  return cfg.provider === 'compat'
    ? Boolean(cfg.baseUrl?.trim())
    : Boolean(cfg.apiKey.trim());
}

/**
 * 사내 서버 주소를 실제 부를 주소로 바꾼다.
 *
 * 사람마다 적는 모양이 다르다. 'http://127.0.0.1:8000' 도, 뒤에 '/v1' 을 붙인 것도,
 * '/v1/chat/completions' 까지 통째로 적은 것도 다 받아 준다.
 */
export function compatUrl(baseUrl: string, tail: 'chat/completions' | 'models'): string {
  let b = (baseUrl ?? '').trim().replace(/\/+$/, '');
  b = b.replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
  if (!/\/v\d+$/.test(b)) b += '/v1';
  return `${b}/${tail}`;
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
  compat: '',
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: '앤트로픽 클로드',
  openai: '오픈에이아이',
  gemini: '구글 제미나이',
  compat: 'OpenAI 호환 (사내·오프라인 LLM)',
};

export const KEY_HELP: Record<Provider, string> = {
  anthropic: 'console.anthropic.com 에서 발급한 키(sk-ant-…)',
  openai: 'platform.openai.com 에서 발급한 키(sk-…)',
  gemini: 'aistudio.google.com 에서 발급한 키(AIza…)',
  compat: '서버가 키를 요구하지 않으면 비워 두셔도 됩니다',
};

const SYSTEM = `당신은 대한민국 공공기관의 보도자료를 국립국어원 공문서등 평가 기준으로 검토하는 국어 전문가다.

판정 기준은 다음 세 가지다.
1) 용이성 — ① 외국 글자(로마자·한자) 사용 ② 우리말로 대체 가능한 외래어·어려운 한자어 ③ 제도명·사업명·행사명에 우리말이 아닌 외국어 표현·표기
2) 정확성 — ① 표기의 정확성(한글 맞춤법, 표준어 규정, 외래어 표기법, 로마자 표기법) ② 표현의 정확성(주술 호응, 접속, 생략, 조사·어미·어휘 사용 등 비문법적 표현)
3) 소통성 — ① 이해가능성(어려운 말, 지나치게 긴 문장) ② 공공성(권위적·차별적 표현)

지켜야 할 것
- 단순 낱말 치환은 이미 규칙 검사가 끝났다. 당신은 **문맥을 봐야 판단할 수 있는 것**에 집중한다.
  주어와 서술어의 호응, 접속의 대등성, 조사·어미의 생략, 수식 관계의 모호함, 중복·군더더기,
  한 문장에 정보가 너무 많은 경우, 사업명·행사명에 쓰인 외국어 표현, 권위적·차별적 어조.
- quote 는 원문에 **글자 그대로** 존재하는 짧은 조각이어야 한다. 지어내지 마라.
- 확신이 없으면 넣지 마라. 억지로 개수를 채우지 마라.
- 보도자료의 사실관계(수치, 날짜, 기관명)는 바꾸지 마라.
- 시제와 종결 어미도 바꾸지 마라. 과거형은 과거형으로 고친다.

출력은 다른 말 없이 JSON 객체 하나만 낸다.
{"findings":[{"quote":"원문 그대로","suggestion":"고친 표현","axis":"용이성|정확성|소통성","sub":"짧은 지표명","why":"왜 고쳐야 하는지 한 문장"}],
 "summary":"초안 전체에 대한 두세 문장 총평"}`;

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
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');
}

/** 키가 없으면 Authorization 을 아예 안 붙인다. 사내 서버는 키를 안 받는 일이 흔하다. */
function openAiHeaders(cfg: AiConfig): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.apiKey.trim()) h.authorization = `Bearer ${cfg.apiKey.trim()}`;
  return h;
}

/**
 * 브라우저가 서버에 닿지도 못했을 때는 이유를 알려 주지 않고 그냥 'Failed to fetch' 라고만 한다.
 * 서버가 안 떠 있는 것, 포트가 틀린 것, 떠 있는데 브라우저가 막은 것이 다 같은 말로 나온다.
 * 셋은 고치는 법이 완전히 다르므로 갈라 준다.
 */

/**
 * 서버가 살아 있기는 한지 따로 물어본다.
 *
 * `mode: 'no-cors'` 로 부르면 브라우저가 응답 내용을 안 보여 주는 대신 **CORS 를 따지지 않는다.**
 * 그래서 이게 성공하면 서버는 떠 있고 길도 뚫려 있다는 뜻이고, 앞의 실패는 CORS 다.
 * 이것마저 실패하면 서버가 없거나 포트가 틀렸거나 사설망 차단에 걸린 것이다.
 */
async function serverAlive(url: string): Promise<boolean> {
  // 대답 없는 주소를 부르면 운영체제가 포기할 때까지(수십 초) 매달린다.
  // 살았는지만 보면 되니 잠깐 기다렸다 끊는다.
  try {
    await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    return true;
  } catch {
    return false;
  }
}

const CORS_HOWTO =
  'vLLM 은 --allowed-origins "*", Ollama 는 OLLAMA_ORIGINS="*", LiteLLM 은 --cors 로 엽니다.';

async function fetchCompat(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const origin = (() => {
      try {
        return new URL(url).origin;
      } catch {
        return url;
      }
    })();

    if (await serverAlive(origin)) {
      throw new Error(
        `서버는 떠 있는데 브라우저가 막았습니다 — ${origin}\n` +
          `이 웹페이지(${location.origin})에서 오는 요청을 서버가 받아 주도록 CORS 를 열어야 합니다.\n` +
          `${CORS_HOWTO}\n${detail}`,
      );
    }

    const localTarget = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
      origin,
    );
    const fromWeb = location.protocol === 'https:';
    throw new Error(
      `서버에 닿지 못했습니다 — ${origin}\n` +
        '① 그 서버가 지금 떠 있는지 ② 주소와 포트가 맞는지 확인해 주세요.\n' +
        (localTarget && fromWeb
          ? '③ 인터넷에 올린 이 주소(https)에서 내 컴퓨터 안의 주소를 부르는 것을 크롬이 막기도 합니다' +
            '(사설망 차단). 그럴 때는 내려받은 단일 html 파일을 열어서 쓰세요.\n'
          : `③ 떠 있는데도 이러면 CORS 입니다. ${CORS_HOWTO}\n`) +
        detail,
    );
  }
}

const openAiChatUrl = (cfg: AiConfig) =>
  cfg.provider === 'compat'
    ? compatUrl(cfg.baseUrl ?? '', 'chat/completions')
    : 'https://api.openai.com/v1/chat/completions';

/**
 * OpenAI Chat Completions 규격으로 부른다. 오픈에이아이와 사내 호환 서버가 같이 쓴다.
 *
 * `response_format` 은 오픈에이아이는 받지만 사내 서버(올라마·옛 vLLM 등)는 모르고
 * 400 을 뱉기도 한다. 한 번 막히면 그것만 빼고 다시 부른다. JSON 을 코드 울타리에
 * 감싸 보내는 서버도 있는데 그건 `parseJson()` 이 알아서 걷어낸다.
 */
/** response_format 을 못 받는 서버로 판명된 주소. 한 번 겪으면 그 뒤로는 안 보낸다. */
const noJsonMode = new Set<string>();

async function callOpenAI(cfg: AiConfig, user: string, system: string = SYSTEM) {
  const url = openAiChatUrl(cfg);
  const body = (json: boolean) =>
    JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    });

  const go = cfg.provider === 'compat' ? fetchCompat : fetch;
  const useJson = !noJsonMode.has(url);
  let res = await go(url, { method: 'POST', headers: openAiHeaders(cfg), body: body(useJson) });
  if (useJson && !res.ok && res.status >= 400 && res.status < 500) {
    noJsonMode.add(url);
    res = await go(url, { method: 'POST', headers: openAiHeaders(cfg), body: body(false) });
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(cfg: AiConfig, user: string, system: string = SYSTEM) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cfg.model,
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json' },
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
}

export async function reviewWithAi(
  cfg: AiConfig,
  text: string,
  already: Finding[],
): Promise<AiResult> {
  const user = buildUserPrompt(text, already);
  const raw =
    cfg.provider === 'anthropic'
      ? await callAnthropic(cfg, user)
      : cfg.provider === 'gemini'
        ? await callGemini(cfg, user)
        : await callOpenAI(cfg, user);

  const parsed = parseJson(raw);
  const findings: Finding[] = [];
  let dropped = 0;
  const used: [number, number][] = [];

  for (const f of parsed.findings ?? []) {
    const quote: string = (f.quote ?? '').trim();
    if (!quote) {
      dropped += 1;
      continue;
    }
    let start = -1;
    let from = 0;
    // 이미 잡은 자리와 겹치지 않는 첫 위치를 찾는다.
    while (true) {
      const i = text.indexOf(quote, from);
      if (i < 0) break;
      if (!used.some(([a, b]) => i < b && a < i + quote.length)) {
        start = i;
        break;
      }
      from = i + 1;
    }
    if (start < 0) {
      dropped += 1;
      continue;
    }
    used.push([start, start + quote.length]);
    const axis = ['용이성', '정확성', '소통성'].includes(f.axis) ? f.axis : '정확성';
    findings.push({
      key: `ai-${start}-${quote.length}`,
      axis,
      sub: `AI 검토 — ${f.sub || '문맥 검토'}`,
      start,
      end: start + quote.length,
      text: quote,
      fixes: [String(f.suggestion ?? '').trim() || '문맥에 맞게 다시 쓰기'],
      why: String(f.why ?? '').trim(),
      src: 'AI 문맥 검토(사람이 최종 확인 필요)',
      severity: '검토',
      counted: false,
    });
  }

  return { findings, summary: String(parsed.summary ?? '').trim(), dropped };
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
  if (cfg.provider === 'compat') {
    if (!cfg.baseUrl?.trim()) throw new Error('먼저 서버 주소를 넣어 주세요.');
    const res = await fetchCompat(compatUrl(cfg.baseUrl, 'models'), { headers: openAiHeaders(cfg) });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    // 사내 서버의 이름은 회사마다 제각각이라 판 번호로 줄 세우는 것이 뜻이 없다. 이름순으로 둔다.
    return ((data.data ?? []) as { id: string }[])
      .map((m) => m.id)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

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

  if (cfg.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      cfg.model,
    )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetch(url, {
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

  if (cfg.provider === 'openai' || cfg.provider === 'compat') {
    // max_completion_tokens 는 새 이름이고 사내 서버는 옛 이름(max_tokens)만 아는 것이 많다.
    const go = cfg.provider === 'compat' ? fetchCompat : fetch;
    const res = await go(openAiChatUrl(cfg), {
      method: 'POST',
      headers: openAiHeaders(cfg),
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: ping }],
        ...(cfg.provider === 'compat' ? { max_tokens: 16 } : { max_completion_tokens: 16 }),
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
      ? await callAnthropic(cfg, user, FILL_SYSTEM)
      : cfg.provider === 'gemini'
        ? await callGemini(cfg, user, FILL_SYSTEM)
        : await callOpenAI(cfg, user, FILL_SYSTEM);

  const parsed = parseJson(raw);
  const out: Record<string, string> = {};
  for (const f of parsed.fills ?? []) {
    const id = String(f.id ?? '').trim();
    const rep = String(f.replacement ?? '').trim();
    // 자리표시가 섞여 오면 쓰지 않는다. 그대로 넣을 수 있는 말만 받는다.
    if (!id || !rep || /[~]|\((으|이|가|을|를|과|와|는|은)\)/.test(rep)) continue;
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
