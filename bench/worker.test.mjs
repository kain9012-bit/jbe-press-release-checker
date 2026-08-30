import worker from '../proxy/worker.js';
const ENV = { GEMINI_API_KEY:'SECRET-KEY', ALLOWED_ORIGINS:'https://kain9012-bit.github.io' };
// 구글 대신 대답하는 가짜 상류
const real = globalThis.fetch;
let seen = null;
globalThis.fetch = async (url, init) => {
  seen = { url: String(url), key: init.headers['x-goog-api-key'], body: init.body };
  return new Response(JSON.stringify({ candidates:[{content:{parts:[{text:'{}'}]}}] }),
    { status:200, headers:{'content-type':'application/json'} });
};
const OK = 'https://kain9012-bit.github.io';
const req = (o, m='gemini-3.6-flash', body='{"contents":[]}', method='POST') =>
  new Request(`https://proxy.workers.dev/${m}`, { method, headers: o?{Origin:o,'content-type':'application/json'}:{}, body: method==='POST'?body:undefined });

const cases = [
  ['허용된 주소 + 허용된 모형', req(OK), 200],
  ['예비 요청(OPTIONS)',        req(OK, 'gemini-3.6-flash', '', 'OPTIONS'), 204],
  ['남의 사이트에서',            req('https://evil.example'), 403],
  ['Origin 없이 (curl 등)',      req(null), 403],
  ['허용 안 된 모형',            req(OK, 'gemini-3.1-pro-preview'), 400],
  ['원고가 너무 김',             req(OK, 'gemini-3.6-flash', 'x'.repeat(70000)), 413],
  ['GET 으로',                   req(OK, 'gemini-3.6-flash', '', 'GET'), 405],
];
for (const [name, r, want] of cases) {
  const res = await worker.fetch(r, ENV);
  const ok = res.status === want ? '✓' : '✗';
  console.log(`  ${ok} ${name.padEnd(26)} ${res.status} (기대 ${want})`);
}
console.log('\n상류로 나간 요청:', seen.url);
console.log('키가 붙었나:', seen.key === 'SECRET-KEY' ? '예 (서버에서만)' : '아니오');
const res = await worker.fetch(req(OK), ENV);
console.log('응답에 키가 새어 나오나:', JSON.stringify([...res.headers]).includes('SECRET') ? '샌다!' : '아니오');
console.log('CORS 머리글:', res.headers.get('access-control-allow-origin'));
globalThis.fetch = real;
