/**
 * 다시 쓰기 하네스 — AI 가 원고 전체를 고쳐 써 오면 코드가 무엇을 막는가.
 *
 * 이 단계에서 AI 는 저자다. 그러니 검사관은 **사실이 바뀌었는지**만 본다.
 * 숫자·날짜, 「 」 안의 이름, 문단 수. 걸린 문단은 받지 않고 원문 그대로 둔다.
 *
 * 그리고 화면에 칠할 자리는 AI 가 말한 것을 믿지 않고 두 글을 견주어 코드가 찾는다.
 */
import { checkParagraph, guardRewrite, diffSegments, diffAll } from './lib.mjs';

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
check('절반 밑으로 줄면 물리침',
  checkParagraph('그동안 문서 담당자가 수신 공문을 반복적으로 살펴 직접 배부해 왔다', '배부했다'),
  '길이가 지나치게 달라짐');

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

console.log('\n문단이 여럿이면 원고 전체 자리로 옮긴다');
const all = diffAll(['AI 교육', '새지평 열다'], ['인공지능(AI) 교육', '새 지평 열다'], '\n');
const JOINED = ['AI 교육', '새지평 열다'].join('\n');
check('둘째 문단 자리도 맞음',
  JOINED.slice(all[1].start, all[1].end), '새지평');

console.log(bad ? '\n✗ 어긋난 곳이 있습니다' : '\n✓ 검사관이 제 것을 막습니다');
process.exit(bad ? 1 : 0);
