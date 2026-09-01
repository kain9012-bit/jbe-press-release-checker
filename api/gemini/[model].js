/**
 * 제미나이 중계 — 버셀 판.
 *
 * 웹페이지와 **같은 주소**에서 도니 클라우드플레어 같은 것을 따로 둘 필요가 없다.
 * 주소가 같으므로 CORS 도, 허용 주소 목록도 없다. 배포할 때마다 주소를 맞춰 줄 일이
 * 없다는 뜻이다.
 *
 * 키는 버셀 환경변수(GEMINI_API_KEY)에만 있다. 브라우저로는 나가지 않는다.
 *
 * 왜 엣지가 아니라 노드인가
 *   엣지 함수는 **25초 안에 응답을 시작해야 한다.** 배포본에서 재 보니 제미나이가
 *   한국어 문단 세 개를 고쳐 쓰는 데 22초까지 걸렸다. 3초 남기고 지나가고 있었다는
 *   뜻이고, 조금만 긴 원고가 들어오면 FUNCTION_INVOCATION_TIMEOUT 이 난다.
 *   실제로 그렇게 났다. 노드 런타임에는 그 제한이 없다.
 *   나눠 묻기로 시간을 줄여 놓았지만, 벽 자체를 걷어 내는 편이 옳다.
 *
 * 솔직히 말해 두는 것
 *   같은 주소에서만 받게 막았지만 그 표시는 브라우저가 붙이는 것이라 브라우저 밖에서는
 *   꾸며 낼 수 있다. 이 문은 크롤러와 지나가는 사람을 막지, 작정한 사람을 막지는 못한다.
 *   **구글 쪽 결제 상한이 마지막 안전장치다.**
 *   다만 키가 통째로 새는 것과는 다르다. 이상하면 환경변수를 지우면 끝이다.
 */

/** 넉넉히 잡는다. 제미나이가 늦어도 우리가 먼저 끊지는 않는다. */
export const config = { maxDuration: 60 };

const UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta/models';

/** 부를 수 있는 모형. 여기 없는 이름은 거절한다. */
const ALLOWED_MODELS = new Set([
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]);

/** 보도자료 한 건은 아무리 길어도 이 안이다. */
const MAX_BODY = 64 * 1024;

const deny = (res, status, message) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: { message } }));
  return res;
};

/**
 * 우리 웹페이지에서 온 것인지 본다.
 *
 * 브라우저는 같은 주소에서 보낸 요청에 Sec-Fetch-Site: same-origin 을 붙인다.
 * 그것이 없으면 Origin 이 우리 호스트와 같은지 본다(옛 브라우저 대비).
 */
function fromOurPage(headers, host) {
  const site = headers['sec-fetch-site'];
  if (site) return site === 'same-origin';
  const origin = headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** 버셀이 몸통을 미리 읽어 두면 객체로, 아니면 흐름으로 온다. 양쪽 다 받는다. */
async function readBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    // 다 받아 놓고 재지 않는다. 넘치는 순간 끊는다.
    if (size > MAX_BODY) return null;
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return deny(res, 405, 'POST 만 받습니다.');

  const host = req.headers.host ?? '';
  if (!fromOurPage(req.headers, host)) {
    return deny(res, 403, '이 웹페이지에서 온 요청이 아닙니다.');
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return deny(res, 500, '서버에 GEMINI_API_KEY 가 설정되지 않았습니다.');

  // 주소 끝의 모형 이름만 본다. 바깥에서 넘긴 주소를 그대로 따라가지 않는다.
  const path = (req.url ?? '').split('?')[0];
  const model = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '');
  if (!ALLOWED_MODELS.has(model)) return deny(res, 400, `쓸 수 없는 모형입니다: ${model}`);

  const body = await readBody(req);
  if (body === null || body.length > MAX_BODY) return deny(res, 413, '원고가 너무 깁니다.');

  const upstream = await fetch(`${UPSTREAM}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body,
  });

  // 구글이 준 답을 그대로 넘긴다. 키가 섞여 나갈 수 있는 머리글은 새로 쓴다.
  const text = await upstream.text();
  res.statusCode = upstream.status;
  res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(text);
  return res;
}
