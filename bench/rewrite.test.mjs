/**
 * 검증 하네스 — AI 가 기준에 걸린 곳을 고쳐 오면 코드가 무엇을 막는가.
 *
 * 이 도구는 이미 쓴 보도자료가 기준에 맞는지 보는 곳이다. 그래서 검사관은 두 가지를 본다.
 *   ① 사실이 바뀌었나 — 숫자·날짜, 「 」 안의 이름, 문단 수, 문단 길이
 *   ② 근거를 댔나   — 어느 기준에 걸려서 고쳤는지 못 대면 되돌린다
 *
 * 그리고 화면에 칠할 자리는 AI 가 말한 것을 믿지 않고 두 글을 견주어 코드가 찾는다.
 */
import { checkParagraph, guardRewrite, diffSegments, diffAll, onlyGrounded, fixByunggiJosa } from './lib.mjs';

let bad = 0;
const check = (name, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name} — ${got}${ok ? '' : ` (기대 ${want})`}`);
};

console.log('검사관 — 사실이 바뀐 문단은 안 받는다');
check('멀쩡한 고침은 통과',
  checkParagraph('AI가 척척 새지평 열었다', '인공지능(AI)이 척척 새 지평 열었다'), null);
check('숫자를 바꾸면 물리침',
  checkParagraph('1,000여 명이 참여했다', '1,200여 명이 참여했다'), '숫자가 바뀜');
check('숫자를 지워도 물리침',
  checkParagraph('11개교가 참여했다', '여러 학교가 참여했다'), '숫자가 바뀜');
check('「 」 안 이름을 바꾸면 물리침',
  checkParagraph('「2026 김제 축제」 개최', '「2026 김제 문화 축제」 개최'), '「 」 안 이름이 바뀜');
check('빈 문단은 물리침', checkParagraph('무언가 있었다', '   '), '빈 문단');
check('통째로 줄이면 물리침',
  checkParagraph('그동안 문서 담당자가 수신 공문을 반복적으로 살펴 직접 배부해 왔다', '배부했다'),
  '고친 것이 아니라 다시 씀');
// 길이로 걸러지는 것은 크게 줄이거나 늘린 것뿐이다. 길이가 비슷한 채로 문장을 다시
// 쓴 것은 여기서 안 걸리고, 근거를 못 대는 자리로 onlyGrounded 가 되돌린다.
check('문장을 통째로 다시 쓰면 물리침',
  checkParagraph(
    '이 시스템은 그동안 문서 담당자가 수신 공문을 반복적으로 모니터링해 직접 배부함에 따라 업무 피로도가 가중되던 문제를 해결하기 위해 추진됐다',
    '이 체계는 담당자가 공문을 일일이 살펴 손수 나눠 주던 일을 없애 업무 부담을 크게 덜어 준다',
  ),
  '고친 것이 아니라 다시 씀');
check('기준에 걸린 낱말만 고친 것은 통과',
  checkParagraph(
    '이 시스템은 그동안 문서 담당자가 수신 공문을 반복적으로 모니터링해 직접 배부해 왔다',
    '이 체계는 그동안 문서 담당자가 수신 공문을 반복적으로 점검해 직접 배부해 왔다',
  ),
  null);

console.log('\n문단 수가 안 맞으면 통째로 안 받는다');
const g0 = guardRewrite(['가나다라마바사', '아자차카타파하'], ['가나다라마바사']);
check('원문 그대로 남음', g0.kept.join('|'), '가나다라마바사|아자차카타파하');

console.log('\n걸린 문단만 원문으로 두고 나머지는 받는다');
const g1 = guardRewrite(
  ['AI가 척척 새지평 열었다', '1,000여 명이 참여한 행사였다'],
  ['인공지능(AI)이 척척 새 지평 열었다', '1,200여 명이 참여한 행사였다'],
);
check('고친 문단은 받음', g1.kept[0], '인공지능(AI)이 척척 새 지평 열었다');
check('걸린 문단은 원문', g1.kept[1], '1,000여 명이 참여한 행사였다');
check('몇 번째가 걸렸는지', JSON.stringify(g1.rejected), '[{"index":1,"why":"숫자가 바뀜"}]');

console.log('\n바뀐 자리는 두 글을 견주어 찾는다 (AI 말이 아니라)');
const SRC = '공문 분류도 AI가 척척 새지평 열었다';
const OUT = '공문 분류도 인공지능(AI)이 척척 새 지평 열었다';
const segs = diffSegments(SRC, OUT);
check('두 곳이 바뀜', segs.length, 2);
check('첫 자리', `${SRC.slice(segs[0].start, segs[0].end)}→${segs[0].to}`, 'AI가→인공지능(AI)이');
check('둘째 자리', `${SRC.slice(segs[1].start, segs[1].end)}→${segs[1].to}`, '새지평→새 지평');
check('안 바뀐 글은 빈손', diffSegments('그대로 둔다', '그대로 둔다').length, 0);

// 견주기가 어긋나면 글자가 새거나 붙는다. 찾은 자리를 되짚어 원래 글이 나오는지 본다.
const REAL_A = '○ 전북교육청은 부서 내 접수공문 AI 자동 배부 시스템인 ‘K뚝배기’를 자체 개발했다.';
const REAL_B = '○ 전북교육청은 부서 내 접수 공문 인공지능(AI) 자동 배부 시스템인 ‘K뚝배기’를 자체 개발했다.';
const rebuilt = (() => {
  let out = ''; let at = 0;
  for (const g of diffSegments(REAL_A, REAL_B)) { out += REAL_A.slice(at, g.start) + g.to; at = g.end; }
  return out + REAL_A.slice(at);
})();
check('찾은 자리를 되짚으면 고쳐 쓴 글이 그대로 나온다', rebuilt, REAL_B);
check('이름은 자리에 안 들어감', diffSegments(REAL_A, REAL_B).some((g) => g.from.includes('K뚝배기')), false);

console.log('\n근거를 못 대면 되돌린다 — 검증이지 대필이 아니다');
const SEGS = [
  { start: 0, end: 2, from: 'AI', to: '인공지능(AI)' },
  { start: 10, end: 13, from: '새지평', to: '새 지평' },
  { start: 20, end: 26, from: '마련했다', to: '마련하였습니다' },
];
const GROUNDS = [
  { from: 'AI', to: '인공지능(AI)', item: '외국 글자' },
  { from: '새지평', to: '새 지평', item: '띄어쓰기' },
];
const kept = onlyGrounded(SEGS, GROUNDS);
check('근거 있는 것만 남음', kept.map((g) => g.from).join(','), 'AI,새지평');
check('근거 없는 고침은 빠짐', kept.some((g) => g.from === '마련했다'), false);
check('내역이 자리를 품고 있어도 같은 것으로 본다',
  onlyGrounded([{ start: 0, end: 5, from: '접수공문 AI', to: '접수 공문 인공지능(AI)' }],
    [{ from: 'AI', to: '인공지능(AI)' }]).length, 1);

console.log('\n병기 뒤 조사는 계산이라 코드가 맞춘다');
// 배포본에서 같은 원고를 두 번 돌렸더니 한 번은 '이', 한 번은 '가' 가 나왔다.
check('인공지능(AI)가 → 인공지능(AI)이',
  fixByunggiJosa('한국어 특화 인공지능(AI)가 적용된 체계'), '한국어 특화 인공지능(AI)이 적용된 체계');
check('이미 맞으면 그대로', fixByunggiJosa('인공지능(AI)이 척척'), '인공지능(AI)이 척척');
check('받침 없는 앞말은 가 (‘차’)',
  fixByunggiJosa('전기차(EV)이 늘었다'), '전기차(EV)가 늘었다');
check('받침 있는 앞말은 이 (‘실’)',
  fixByunggiJosa('가상현실(VR)가 놀랍다'), '가상현실(VR)이 놀랍다');
check('을/를도 맞춘다',
  fixByunggiJosa('인공지능(AI)를 활용해'), '인공지능(AI)을 활용해');
// ‘으로/로’ 만 ㄹ 받침을 받침 없음처럼 다룬다
check('ㄹ 받침은 로 (‘실’)',
  fixByunggiJosa('가상현실(VR)으로 배운다'), '가상현실(VR)로 배운다');
check('ㄹ 아닌 받침은 으로 (‘망’)',
  fixByunggiJosa('구름 망(클라우드)로 옮겼다'), '구름 망(클라우드)으로 옮겼다');
check('병기가 아닌 자리는 안 건드린다',
  fixByunggiJosa('학생들이 참여했다'), '학생들이 참여했다');
check('검사관이 받아 줄 때 같이 고친다',
  guardRewrite(['한국어 특화 AI가 적용된 체계'], ['한국어 특화 인공지능(AI)가 적용된 체계']).kept[0],
  '한국어 특화 인공지능(AI)이 적용된 체계');

console.log('\n문단이 여럿이면 원고 전체 자리로 옮긴다');
const all = diffAll(['AI 교육', '새지평 열다'], ['인공지능(AI) 교육', '새 지평 열다'], '\n');
const JOINED = ['AI 교육', '새지평 열다'].join('\n');
check('둘째 문단 자리도 맞음',
  JOINED.slice(all[1].start, all[1].end), '새지평');

console.log(bad ? '\n✗ 어긋난 곳이 있습니다' : '\n✓ 검사관이 제 것을 막습니다');
process.exit(bad ? 1 : 0);
