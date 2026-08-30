/**
 * 답이 들쑥날쑥해도 결과가 일정한지 본다.
 *
 * 회차마다 다르게 답하는 가짜 모형을 물린다.
 *   - '을 통해' 는 세 번 다 짚는다        → 살아남아야 함
 *   - '개최했다' 는 두 번 짚는다          → 살아남아야 함
 *   - 나머지는 회차마다 하나씩만 짚는다   → 표가 모자라 버려져야 함
 */
import { reviewWithAi } from './lib.mjs';

const TEXT = '○ 김제교육지원청은 축제를 개최했다. 실습 등을 통해 배웠다. 진로 상담을 운영한다. 자리를 마련 했다.';
const ROUND = [
  [['을 통해','으로'], ['개최했다','열었다'], ['운영한다','운영했다']],
  [['을 통해','으로'], ['개최했다','열었다'], ['마련 했다','마련했다']],
  [['을 통해','으로'], ['상담을','상담'],     ['배웠다','익혔다']],
];
let call = 0;
globalThis.fetch = async () => {
  const set = ROUND[call++ % ROUND.length];
  return new Response(JSON.stringify({ candidates:[{ content:{ parts:[{ text: JSON.stringify({
    findings: set.map(([q, sug]) => ({ quote:q, suggestion:sug, sub:'조사·어미', why:'시험' })),
    summary: '시험',
  }) }] } }] }), { status:200, headers:{'content-type':'application/json'} });
};

const cfg = { provider:'gemini', apiKey:'x', model:'gemini-3.6-flash' };
const r = await reviewWithAi(cfg, TEXT, []);
console.log(`${r.rounds}회 물어봄 → 채택 ${r.findings.length}건, 표 모자라 버린 것 ${r.thin}건`);
for (const f of r.findings) console.log(`   「${f.text}」 ${f.src.match(/\d+회 중 \d+회/)?.[0]}`);

// 표 세기를 끄면(1회) 회차마다 답이 달라진다 — 그걸 보여 준다
call = 0;
const one = [];
for (let i = 0; i < 3; i++) one.push((await reviewWithAi(cfg, TEXT, [], 1)).findings.map(f=>f.text).sort().join(','));
console.log(`\n1회만 물으면: ${new Set(one).size}가지 결과`);
one.forEach((x,i)=>console.log(`   ${i+1}번째: ${x}`));
console.log(`3회 표 세기: 1가지 결과로 고정`);

const ok = r.findings.length === 2 && r.findings.every(f=>['을 통해','개최했다'].includes(f.text)) && new Set(one).size === 3;
console.log(ok ? '\n✓ 들쑥날쑥한 답을 표로 걸러 냅니다' : '\n✗ 표 세기가 어긋납니다');
process.exit(ok ? 0 : 1);
