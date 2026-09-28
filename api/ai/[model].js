/**
 * AI 중계 — 버셀 판. 상류는 오픈라우터다.
 *
 * 웹페이지와 **같은 주소**에서 도니 CORS 도, 허용 주소 목록도 없다.
 * 키는 버셀 환경변수(OPENROUTER_API_KEY)에만 있다. 브라우저로는 나가지 않는다.
 *
 * 왜 구글 직통에서 오픈라우터로 옮겼나
 *   기관 예산으로 키를 사야 하는데, 오픈라우터는 키 하나로 여러 회사의 모형을 부른다.
 *   나중에 모형을 바꿀 때 결제를 새로 만들지 않아도 된다. 선불 크레딧이라 상한도 뚜렷하다.
 *   부르는 모형은 그대로 gemini-3.6-flash 다. 통로와 결제만 바뀐 것이다.
 *
 * 왜 엣지가 아니라 노드인가
 *   엣지 함수는 25초 안에 응답을 시작해야 한다. 배포본에서 재 보니 한국어 문단 셋을
 *   고쳐 쓰는 데 22초까지 걸렸다. 실제로 FUNCTION_INVOCATION_TIMEOUT 이 났다.
 *   노드 런타임에는 그 제한이 없다.
 *
 * 솔직히 말해 두는 것
 *   같은 주소에서만 받게 막았지만 그 표시는 브라우저가 붙이는 것이라 브라우저 밖에서는
 *   꾸며 낼 수 있다. 이 문은 크롤러와 지나가는 사람을 막지, 작정한 사람을 막지는 못한다.
 *   **오픈라우터 크레딧 잔액이 마지막 안전장치다.** 다만 키가 통째로 새는 것과는 다르다.
 *   이상하면 환경변수를 지우면 끝이다.
 */

/** 넉넉히 잡는다. 상류가 늦어도 우리가 먼저 끊지는 않는다. */
export const config = { maxDuration: 60 };

const UPSTREAM = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * 부를 수 있는 모형. 여기 없는 이름은 거절한다.
 *
 * 왼쪽은 웹페이지가 쓰는 짧은 이름(ai.ts 의 PROXY_MODELS 와 맞춘다),
 * 오른쪽은 오픈라우터의 실제 이름이다. 몸통에 적혀 온 model 은 믿지 않고 이걸로 덮어쓴다.
 */
const ALLOWED_MODELS = new Map([
  ['gemini-3.6-flash', 'google/gemini-3.6-flash'],
  ['gemini-3.7-flash', 'google/gemini-3.7-flash'],
  ['gemini-2.5-flash', 'google/gemini-2.5-flash'],
  ['gemini-2.5-flash-lite', 'google/gemini-2.5-flash-lite'],
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

/**
 * 살았는지만 물어보는 자리 (GET).
 *
 * 함수가 통째로 죽으면 버셀이 FUNCTION_INVOCATION_FAILED 만 내놓는다. 그 화면에는
 * 까닭이 없어서, 로그를 볼 수 없는 자리에서는 손쓸 도리가 없다. 실제로 그렇게 막혔다.
 * 키 **값**은 내놓지 않는다. 설정돼 있는지와 부를 수 있는 모형만 말한다 —
 * 둘 다 이미 웹페이지 꾸러미에 들어 있는 것이라 새로 새는 것이 없다.
 */
function health(res) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(
    JSON.stringify({
      ok: true,
      keySet: Boolean(process.env.OPENROUTER_API_KEY),
      models: [...ALLOWED_MODELS.keys()],
      upstream: UPSTREAM,
      node: process.version,
    }),
  );
  return res;
}

async function serve(req, res) {
  if (req.method === 'GET') return health(res);
  if (req.method !== 'POST') return deny(res, 405, 'POST 만 받습니다.');

  const host = req.headers.host ?? '';
  if (!fromOurPage(req.headers, host)) {
    return deny(res, 403, '이 웹페이지에서 온 요청이 아닙니다.');
  }

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return deny(res, 500, '서버에 OPENROUTER_API_KEY 가 설정되지 않았습니다.');

  // 주소 끝의 모형 이름만 본다. 바깥에서 넘긴 주소를 그대로 따라가지 않는다.
  const path = (req.url ?? '').split('?')[0];
  const short = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '');
  const model = ALLOWED_MODELS.get(short);
  if (!model) return deny(res, 400, `쓸 수 없는 모형입니다: ${short}`);

  const raw = await readBody(req);
  if (raw === null || raw.length > MAX_BODY) return deny(res, 413, '원고가 너무 깁니다.');

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return deny(res, 400, '보낸 내용이 JSON 이 아닙니다.');
  }

  /*
   * model 과 provider 는 여기서 정한다.
   *
   * 몸통에 적혀 온 것을 그대로 따르면 허용 목록이 아무 소용이 없다. 주소로 고른
   * 모형으로 덮어쓴다. data_collection: 'deny' 는 **학습에 쓰는 경유지를 뺀다** —
   * 보도자료라 대외비는 아니지만, 기관 자료를 남의 학습에 흘릴 이유가 없다.
   */
  body.model = model;
  body.provider = { ...(body.provider ?? {}), data_collection: 'deny' };

  let upstream;
  try {
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        /*
         * 오픈라우터 대시보드에서 어느 도구가 쓴 것인지 알아보라고 붙인다.
         * **머리글 값에 한글을 넣으면 안 된다.** HTTP 머리글은 Latin-1 만 담는다.
         * 처음에 '보도자료 공공언어 검증' 이라고 적었다가 fetch 가 통째로 던졌다
         * (Cannot convert argument to a ByteString … value of 48372).
         * 하네스가 fetch 를 흉내 내고 있어 못 잡았다. 그래서 검사를 따로 뒀다.
         */
        'HTTP-Referer': `https://${host}`,
        'X-Title': 'JBE press release checker',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // 상류에 닿지 못한 것을 함수가 죽는 것으로 두지 않는다. 죽으면 까닭이 안 남는다.
    return deny(res, 502, `상류(오픈라우터)에 닿지 못했습니다: ${e?.message ?? e}`);
  }

  // 상류가 준 답을 그대로 넘긴다. 키가 섞여 나갈 수 있는 머리글은 새로 쓴다.
  const text = await upstream.text();
  res.statusCode = upstream.status;
  res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(text);
  return res;
}

/**
 * 무슨 일이 있어도 **까닭을 남기고** 끝낸다.
 *
 * 처음 올렸을 때 FUNCTION_INVOCATION_FAILED 만 나왔다. 그건 버셀이 내는 말이라
 * 우리 화면에는 아무 단서가 없고, 로그를 못 보는 자리에서는 고칠 수가 없다.
 * 터지더라도 우리 손으로 잡아 무엇이 터졌는지 적어 보낸다.
 */
export default async function handler(req, res) {
  try {
    return await serve(req, res);
  } catch (e) {
    try {
      return deny(res, 500, `중계가 멈췄습니다: ${e?.message ?? e}`);
    } catch {
      return res;
    }
  }
}
