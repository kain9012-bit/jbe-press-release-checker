/** 규약을 어긴 모형 답을 실제로 버리는지 본다. 가짜 모형을 물려 시험한다. */
import { reviewWithAi } from './lib.mjs';

const TEXT = '○ 김제교육지원청은 1,000여 명이 참여하는 축제를 개최했다. ‘꿈 높이기(UP)!’ 을 주제로 열렸다.';
const BAD = {
  findings: [
    { quote: '1,000여 명이', suggestion: '1,200여 명이', sub: '조사·어미', why: '숫자를 바꿔 봄' },
    { quote: '높이기(UP)',   suggestion: '높이기',        sub: '외국어 표현', why: '병기를 떼어 봄' },
    { quote: '을 주제로',    suggestion: '~로',            sub: '조사·어미', why: '자리표시를 넣어 봄' },
    { quote: '개최했다',     suggestion: '열었다',         sub: '아무말지표',  why: '없는 지표 이름' },
    { quote: '있지도 않은 말', suggestion: '무엇',          sub: '군더더기',   why: '원문에 없는 조각' },
    { quote: '개최했다',     suggestion: '열었다',         sub: '군더더기',   why: '이건 멀쩡한 것' },
  ],
  summary: '시험',
};

globalThis.fetch = async () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(BAD) }] } }],
}), { status: 200, headers: { 'content-type': 'application/json' } });

const r = await reviewWithAi({ provider: 'gemini', apiKey: 'x', model: 'gemini-3.6-flash' }, TEXT, []);
console.log(`모형이 6개를 냈고, 살아남은 것 ${r.findings.length}개 (1개여야 함)`);
console.log('버린 이유:');
for (const [k, v] of Object.entries(r.violations)) console.log(`   ${k} ${v}건`);
console.log('살아남은 것:', r.findings.map(f => `${f.text}→${f.fixes[0]} [${f.sub}]`).join(', '));
const ok = r.findings.length === 1 && r.findings[0].text === '개최했다';
console.log(ok ? '\n✓ 어긴 것만 정확히 걸렀습니다' : '\n✗ 걸러내기가 어긋납니다');
process.exit(ok ? 0 : 1);
