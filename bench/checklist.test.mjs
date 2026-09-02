/**
 * 점검표 — 요건마다 어긋난 것이 있었는지 제대로 적히는가.
 *
 * 배포본에서 AI 가 열 곳을 고쳐 놓고도 점검표는 열다섯 항목 전부 ‘걸림 없음’ 이었다.
 * 지적의 이름을 글자로 견주어 요건을 찾았는데, 지적을 내는 쪽이 규칙에서 AI 로
 * 바뀌면서 이름이 달라져 연결이 통째로 끊겼기 때문이다. 아무 소리도 나지 않았다.
 *
 * 그래서 이름을 닫힌 목록으로 못 박고, 여기서 그 연결을 지킨다.
 *   ① 목록의 이름은 하나도 빠짐없이 어느 요건엔가 붙는다
 *   ② 목록 밖의 이름은 조용히 사라지지 않고 따로 보인다
 *   ③ 고친 것이 있으면 그 요건이 ‘없음’ 이라고 말하지 않는다
 */
import { rollUp, verdict, measureSentences, sentences, LONG_SENTENCE, CHECKLIST, CODES } from './lib.mjs';

let bad = 0;
const check = (name, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name} — ${got}${ok ? '' : ` (기대 ${want})`}`);
};
const row = (roll, id) => roll.rows.find((r) => r.id === id);

console.log('요건은 열다섯 항목, 차례는 기준 그대로');
check('항목 수', CHECKLIST.length, 15);
check('차례', CHECKLIST.map((c) => c.id).join(','), 'A1,A2,A3,A4,A5,A6,B1,B2,B3,B4,B5,B6,B7,B8,B9');

console.log('\n닫힌 목록의 이름은 하나도 빠짐없이 요건에 붙는다');
{
  const 붙은것 = CODES.filter((code) => {
    const r = rollUp([{ from: '가', to: '나', why: '', item: code }], [], [], ['가']);
    return r.strays.length === 0;
  });
  check('붙은 이름 수', 붙은것.length, CODES.length);
  const 안붙음 = CODES.filter((c) => !붙은것.includes(c));
  check('안 붙은 이름', 안붙음.join(',') || '(없음)', '(없음)');
}

console.log('\n실제로 고친 것이 그 요건에 적힌다 (배포본에서 깨졌던 자리)');
const 고침 = rollUp(
  [
    { from: 'AI', to: '인공지능(AI)', why: '로마자입니다', item: '외국 글자' },
    { from: 'AI가', to: '인공지능(AI)이', why: '로마자입니다', item: '외국 글자' },
    { from: '새지평', to: '새 지평', why: '띄어 씁니다', item: '띄어쓰기' },
    { from: '모니터링해', to: '점검해', why: '쉬운 말로', item: '쉬운 우리말' },
  ],
  [],
  [],
  ['공문 분류도 AI가 척척 새지평 열었다'],
);
check('띄어쓰기 요건', verdict(row(고침, 'A2')), '1건');
check('쉽고 친숙한 용어 요건 (외국 글자 + 쉬운 우리말)', verdict(row(고침, 'B8')), '3건');
check('무엇을 고쳤는지도 적힌다', row(고침, 'A2').hits[0].to, '새 지평');
check('안 걸린 요건은 어긋난 곳 없음', verdict(row(고침, 'A1')), '어긋난 곳 없음');

console.log('\n목록에 없는 이름은 조용히 사라지지 않는다');
const 낯선 = rollUp([{ from: '가', to: '나', why: '', item: '문맥 검토' }], [], [], ['가']);
check('따로 모인다', 낯선.strays.length, 1);
check('이름도 남는다', 낯선.strays[0].item, '문맥 검토');

console.log('\nAI 가 끊기면 규칙 지적이 오른다 — 그 긴 이름도 요건에 붙는다');
const 규칙 = rollUp(
  [
    { from: 'AI', to: '인공지능(AI)', why: '', item: '① 외국 글자(로마자) 사용' },
    { from: '새지평', to: '새 지평', why: '', item: '표기의 정확성 — 띄어쓰기' },
    { from: '모니터링', to: '점검', why: '', item: '② 우리말로 대체 가능한 외래어(보완 목록)' },
  ],
  [],
  [],
  ['가'],
);
check('요건에 못 붙인 것 없음', 규칙.strays.length, 0);
check('띄어쓰기', verdict(row(규칙, 'A2')), '1건');
check('쉽고 친숙한 용어', verdict(row(규칙, 'B8')), '2건');

console.log('\n짚기만 하는 요건 — 없으면 ‘AI 가 짚은 것 없음’');
const 짜임 = rollUp(
  [],
  [{ from: '[3] 이 시스템은', to: '', why: '한 문단에 두 이야기가 섞였습니다', item: '단락 구성' }],
  [],
  ['가'],
);
check('단락 구성', verdict(row(짜임, 'A6')), '1건');
check('정보 배열은 빈손', verdict(row(짜임, 'B6')), 'AI 가 짚은 것 없음');
check('고침 요건의 빈손과 말이 다르다', verdict(row(짜임, 'A1')), '어긋난 곳 없음');

console.log('\n작성자 확인은 그 요건에 붙는다');
const 확인 = rollUp(
  [],
  [],
  [{ from: 'K뚝배기', to: '', why: '고유 명칭입니다', item: '외국 글자' },
   { from: '문서등록대장', to: '', why: '붙여 쓴 말입니다', item: '띄어쓰기' }],
  ['가'],
);
check('K뚝배기 → 쉽고 친숙한 용어', row(확인, 'B8').asks.length, 1);
check('문서등록대장 → 띄어쓰기', row(확인, 'A2').asks.map((a) => a.from).join(','), '문서등록대장');
check('확인만 있고 고친 것이 없으면 건수로 세지 않는다', verdict(row(확인, 'A2')), '어긋난 곳 없음');

console.log('\n문장 길이는 판단이 아니라 셈이다');
check('문장 가르기', sentences('한 문장이다. 두 문장이다!').length, 2);
const 짧음 = measureSentences(['짧은 문장이다.']);
check('가장 긴 문장 어절 수', 짧음.words, 2);
check('긴 문장 없음', 짧음.over, 0);
const 긴글 = `이 시스템은 그동안 문서 담당자가 수신 공문을 반복적으로 살펴 직접 배부함에 따라 업무 피로도가 가중되고 담당자 부재 시 공문 배부가 중단되는 병목 현상을 근본적으로 해결하기 위해 추진된 것이다.`;
const 잼 = measureSentences([긴글]);
check(`${LONG_SENTENCE}어절 넘는 문장을 센다`, 잼.over, 1);
const 잰표 = rollUp([], [], [], [긴글]);
check('B7 은 잰 값을 적는다', verdict(row(잰표, 'B7')).startsWith('가장 긴 문장'), true);
check('긴 문장은 그대로 보여 준다', row(잰표, 'B7').hits.length, 1);

console.log(bad ? '\n✗ 어긋난 곳이 있습니다' : '\n✓ 점검표가 요건마다 제 말을 합니다');
process.exit(bad ? 1 : 0);
