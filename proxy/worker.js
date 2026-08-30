/**
 * 전북교육청 보도자료 검증 — 제미나이 중계
 *
 * 왜 있나
 *   API 키는 브라우저가 읽을 수 있으면 사람도 읽을 수 있다. 정적 웹페이지에 키를 넣으면
 *   F12 한 번에 그대로 보이고, 공개 저장소를 훑는 크롤러가 몇 시간 안에 가져간다.
 *   그래서 키를 들고 대신 요청해 주는 것을 하나 둔다. 키는 여기에만 있다.
 *
 * 무엇을 하나
 *   생김새 그대로 구글에 넘기고 답을 그대로 돌려준다. 다만 아무나 못 쓰게 문을 좁힌다.
 *     - 허용한 웹주소에서 온 것만 받는다
 *     - 정해 둔 모형만 부를 수 있다
 *     - 글이 너무 길면 거절한다
 *     - 분당 횟수를 제한한다
 *
 * 솔직히 말해 두는 것
 *   Origin 머리글은 브라우저가 붙이는 것이라 브라우저 밖에서는 꾸며 낼 수 있다. 이 문은
 *   크롤러와 지나가는 사람을 막지, 작정한 사람을 막지는 못한다. 그래서 **구글 쪽에 결제
 *   상한을 반드시 걸어 두어야 한다.** 다만 키가 통째로 새는 것과는 전혀 다르다.
 *   여기서는 언제든 이 중계를 꺼 버리면 끝이고, 키를 다시 발급할 필요도 없다.
 */

const UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta/models';

/** 부를 수 있는 모형. 여기 없는 이름은 거절한다. */
const ALLOWED_MODELS = new Set([
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]);

/** 보도자료 한 건은 아무리 길어도 이 안이다. 그보다 크면 우리 쓰임새가 아니다. */
const MAX_BODY = 64 * 1024;

const cors = (origin) => ({
  'access-control-allow-origin': origin,
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
  vary: 'Origin',
});

const deny = (status, message, origin) =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin ?? '') },
  });

/** ALLOWED_ORIGINS 는 쉼표로 나눈 목록이다. 예: https://kain9012-bit.github.io */
function allowedOrigin(request, env) {
  const list = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get('Origin') ?? '';
  return list.includes(origin) ? origin : null;
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);

    if (request.method === 'OPTIONS') {
      // 문을 두드린 곳이 허용 목록에 없으면 예비 요청부터 막는다
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (!origin) return deny(403, '허용되지 않은 주소에서 온 요청입니다.');
    if (request.method !== 'POST') return deny(405, 'POST 만 받습니다.', origin);

    // 주소 끝의 모형 이름만 본다. 바깥에서 넘긴 주소를 그대로 따라가지 않는다.
    const model = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
    if (!ALLOWED_MODELS.has(model)) {
      return deny(400, `쓸 수 없는 모형입니다: ${model}`, origin);
    }

    const body = await request.text();
    if (body.length > MAX_BODY) {
      return deny(413, '원고가 너무 깁니다.', origin);
    }

    if (env.LIMITER) {
      // 같은 곳에서 쏟아붓는 것을 막는다. 사람이 쓰는 속도는 이 안에 들어온다.
      const who = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const { success } = await env.LIMITER.limit({ key: who });
      if (!success) return deny(429, '잠시 뒤에 다시 눌러 주세요.', origin);
    }

    const upstream = await fetch(`${UPSTREAM}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body,
    });

    // 구글이 준 답을 그대로 넘긴다. 다만 키가 섞여 나갈 수 있는 머리글은 새로 쓴다.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        ...cors(origin),
      },
    });
  },
};
