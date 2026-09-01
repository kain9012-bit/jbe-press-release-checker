/**
 * 버셀 중계의 문이 제대로 좁혀졌는지 본다.
 *
 * 엣지에서 노드로 옮겼다(엣지의 25초 벽에 걸려 실제로 끊겼다). 주고받는 모양이
 * Request/Response 에서 (req, res) 로 바뀌었으므로 여기 흉내도 그 모양으로 낸다.
 */
import handler, { config } from '../api/gemini/[model].js';
import { Readable } from 'node:stream';

process.env.GEMINI_API_KEY = 'SECRET-KEY';
let seen = null;
globalThis.fetch = async (url, init) => {
  seen = { url: String(url), key: init.headers['x-goog-api-key'] };
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
  req.url = `/api/gemini/${model}`;
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

const cases = [
  ['우리 웹페이지에서', {}, 200],
  ['남의 사이트에서', { site: 'cross-site' }, 403],
  ['표시 없이 (curl 등)', { site: null }, 403],
  ['옛 브라우저, 같은 호스트', { site: null, origin: `https://${HOST}` }, 200],
  ['옛 브라우저, 남의 호스트', { site: null, origin: 'https://evil.example' }, 403],
  ['허용 안 된 모형', { model: 'gemini-3.1-pro-preview' }, 400],
  ['원고가 너무 김', { body: 'x'.repeat(70000) }, 413],
  ['GET 으로', { method: 'GET' }, 405],
];

let bad = 0;
for (const [name, opt, want] of cases) {
  const res = await run(opt);
  const ok = res.statusCode === want;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(24)} ${res.statusCode} (기대 ${want})`);
}

// 엣지의 25초 벽에 걸려 실제로 끊겼다. 다시 엣지로 돌아가지 않도록 못 박는다.
const okDur = (config?.maxDuration ?? 0) >= 60 && config?.runtime !== 'edge';
if (!okDur) bad++;
console.log(
  `  ${okDur ? '✓' : '✗'} 시간 제한 없는 런타임    maxDuration ${config?.maxDuration}초` +
    `${config?.runtime ? ` / runtime ${config.runtime}` : ''}`,
);

console.log('\n상류로 나간 주소:', seen.url);
console.log('키가 붙었나:', seen.key === 'SECRET-KEY' ? '예 (서버에서만)' : '아니오');
const res = await run({});
console.log(
  '응답에 키가 새나:',
  JSON.stringify([res.headers, res.payload]).includes('SECRET') ? '샌다!' : '아니오',
);

delete process.env.GEMINI_API_KEY;
console.log('키를 안 넣었을 때:', (await run({})).statusCode, '(500 이어야 함)');
process.exit(bad ? 1 : 0);
