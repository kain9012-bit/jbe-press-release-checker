import type { Finding } from './analyze';

export type Provider = 'anthropic' | 'openai' | 'gemini';

export interface AiConfig {
  provider: Provider;
  apiKey: string;
  model: string;
}

export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: '앤트로픽 클로드',
  openai: '오픈에이아이',
  gemini: '구글 제미나이',
};

export const KEY_HELP: Record<Provider, string> = {
  anthropic: 'console.anthropic.com 에서 발급한 키(sk-ant-…)',
  openai: 'platform.openai.com 에서 발급한 키(sk-…)',
  gemini: 'aistudio.google.com 에서 발급한 키(AIza…)',
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

async function callAnthropic(cfg: AiConfig, user: string) {
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
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');
}

async function callOpenAI(cfg: AiConfig, user: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(cfg: AiConfig, user: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cfg.model,
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
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
      : cfg.provider === 'openai'
        ? await callOpenAI(cfg, user)
        : await callGemini(cfg, user);

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
