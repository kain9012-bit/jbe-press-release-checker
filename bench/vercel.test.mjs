/**
 * 버셀 중계의 문이 제대로 좁혀졌는지 본다.
 *
 * 상류를 구글 직통에서 오픈라우터로 옮겼다. 그래서 여기서 보는 것이 셋 늘었다.
 *   ① 키가 Authorization: Bearer 로 붙는가 (구글은 x-goog-api-key 였다)
 *   ② 몸통의 model 을 **주소로 고른 것으로 덮어쓰는가** — 안 그러면 허용 목록이
 *      아무 소용이 없다. 바깥에서 아무 모형이나 적어 보낼 수 있다.
 *   ③ 학습에 쓰는 경유지를 빼는가 (provider.data_collection = deny)
 *
 * 노드 런타임인 것도 계속 못 박는다. 엣지의 25초 벽에 걸려 실제로 끊긴 적이 있다.
 */
import handler, { config } from '../api/ai/[model].js';
import { Readable } from 'node:stream';

process.env.OPENROUTER_API_KEY = 'SECRET-KEY';
let seen = null;
globalThis.fetch = async (url, init) => {
  seen = {
    url: String(url),
    auth: init.headers.authorization,
    body: JSON.parse(init.body),
  };
  return new Response('{"ok":1}', { status: 200, headers: { 'content-type': 'application/json' } });
};

const HOST = 'jbe-checker.vercel.app';

/** 버셀 노드 함수가 받는 모양을 흉내 낸다 */
function make(opt = {}) {
  const {
    model = 'gemini-3.6-flash',
    site = 'same-origin',
    origin,
    method = 'POST',
    body = '{}',
  } = opt;
  const headers = { host: HOST, 'content-type': 'application/json' };
  if (site) headers['sec-fetch-site'] = site;
  if (origin) headers.origin = origin;

  const req = Readable.from(method === 'POST' ? [Buffer.from(body)] : []);
  req.method = method;
  req.url = `/api/ai/${model}`;
  req.headers = headers;

  const res = {
    statusCode: 0,
    headers: {},
    payload: '',
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(t) {
      this.payload = t ?? '';
    },
  };
  return { req, res };
}

const run = async (opt) => {
  const { req, res } = make(opt);
  await handler(req, res);
  return res;
};

let bad = 0;
const check = (name, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${String(name).padEnd(28)} ${got}${ok ? '' : ` (기대 ${want})`}`);
};

console.log('문이 좁혀졌는가');
const cases = [
  ['우리 웹페이지에서', {}, 200],
  ['남의 사이트에서', { site: 'cross-site' }, 403],
  ['표시 없이 (curl 등)', { site: null }, 403],
  ['옛 브라우저, 같은 호스트', { site: null, origin: `https://${HOST}` }, 200],
  ['옛 브라우저, 남의 호스트', { site: null, origin: 'https://evil.example' }, 403],
  ['허용 안 된 모형', { model: 'gpt-4o' }, 400],
  ['JSON 이 아닌 몸통', { body: '이건 JSON 이 아니다' }, 400],
  ['원고가 너무 김', { body: 'x'.repeat(70000) }, 413],
  ['GET 으로', { method: 'GET' }, 405],
];
for (const [name, opt, want] of cases) {
  check(name, (await run(opt)).statusCode, want);
}

console.log('\n키는 서버에만 있다');
await run({});
check('상류 주소', seen.url, 'https://openrouter.ai/api/v1/chat/completions');
check('Bearer 로 붙는다', seen.auth, 'Bearer SECRET-KEY');
const res = await run({});
check('응답에 키가 새나', JSON.stringify([res.headers, res.payload]).includes('SECRET'), false);

console.log('\n모형은 주소로 고른 것으로 덮어쓴다 (몸통을 믿지 않는다)');
await run({ model: 'gemini-3.6-flash', body: JSON.stringify({ model: 'openai/gpt-4o', messages: [] }) });
check('오픈라우터 이름으로 바뀜', seen.body.model, 'google/gemini-3.6-flash');
await run({ model: 'gemini-2.5-flash-lite' });
check('다른 모형도 제 이름으로', seen.body.model, 'google/gemini-2.5-flash-lite');

console.log('\n학습에 쓰는 경유지는 뺀다');
await run({});
check('data_collection', seen.body.provider.data_collection, 'deny');
await run({ body: JSON.stringify({ provider: { order: ['google-ai-studio'] } }) });
check('원래 있던 설정은 남는다', seen.body.provider.order?.join(','), 'google-ai-studio');
check('그래도 deny 는 붙는다', seen.body.provider.data_collection, 'deny');

console.log('\n시간 제한 없는 런타임');
check(
  `maxDuration ${config?.maxDuration}초${config?.runtime ? ` / runtime ${config.runtime}` : ''}`,
  (config?.maxDuration ?? 0) >= 60 && config?.runtime !== 'edge',
  true,
);

console.log('\n키를 안 넣었을 때');
delete process.env.OPENROUTER_API_KEY;
check('500 으로 막는다', (await run({})).statusCode, 500);

console.log(bad ? '\n✗ 어긋난 곳이 있습니다' : '\n✓ 중계의 문이 제 몫을 합니다');
process.exit(bad ? 1 : 0);
