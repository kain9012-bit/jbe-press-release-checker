/** 버셀 중계의 문이 제대로 좁혀졌는지 본다. */
import handler from '../api/gemini/[model].js';

process.env.GEMINI_API_KEY = 'SECRET-KEY';
let seen = null;
globalThis.fetch = async (url, init) => {
  seen = { url: String(url), key: init.headers['x-goog-api-key'] };
  return new Response('{"ok":1}', { status: 200, headers: { 'content-type': 'application/json' } });
};

const req = (opt = {}) => {
  const { model = 'gemini-3.6-flash', site = 'same-origin', origin, method = 'POST', body = '{}' } = opt;
  const h = { 'content-type': 'application/json' };
  if (site) h['Sec-Fetch-Site'] = site;
  if (origin) h['Origin'] = origin;
  return new Request(`https://jbe-checker.vercel.app/api/gemini/${model}`, {
    method, headers: h, body: method === 'POST' ? body : undefined,
  });
};

const cases = [
  ['우리 웹페이지에서',        req(), 200],
  ['남의 사이트에서',          req({ site: 'cross-site' }), 403],
  ['표시 없이 (curl 등)',      req({ site: null }), 403],
  ['옛 브라우저, 같은 호스트',  req({ site: null, origin: 'https://jbe-checker.vercel.app' }), 200],
  ['옛 브라우저, 남의 호스트',  req({ site: null, origin: 'https://evil.example' }), 403],
  ['허용 안 된 모형',          req({ model: 'gemini-3.1-pro-preview' }), 400],
  ['원고가 너무 김',           req({ body: 'x'.repeat(70000) }), 413],
  ['GET 으로',                 req({ method: 'GET' }), 405],
];
let bad = 0;
for (const [name, r, want] of cases) {
  const res = await handler(r);
  const ok = res.status === want;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(24)} ${res.status} (기대 ${want})`);
}
console.log('\n상류로 나간 주소:', seen.url);
console.log('키가 붙었나:', seen.key === 'SECRET-KEY' ? '예 (서버에서만)' : '아니오');
const res = await handler(req());
console.log('응답에 키가 새나:', JSON.stringify([...res.headers]).includes('SECRET') ? '샌다!' : '아니오');

delete process.env.GEMINI_API_KEY;
console.log('키를 안 넣었을 때:', (await handler(req())).status, '(500 이어야 함)');
process.exit(bad ? 1 : 0);
