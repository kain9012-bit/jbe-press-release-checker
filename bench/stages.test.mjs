/** 단계마다 제 하네스가 제 것을 막는지 본다. */
import { STAGES, guard1, guard2, guard3, analyze } from './lib.mjs';

console.log('단계별 하네스\n');
for (const st of STAGES) {
  console.log(`[${st.no} ${st.name}]`);
  console.log(`  받는 것: ${st.takes}`);
  console.log(`  하는 일: ${st.does}`);
  st.never.forEach((n) => console.log(`  안 하는 일: ${n}`));
  console.log(`  내는 것: ${st.gives}\n`);
}

let bad = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name} — ${got} (기대 ${want})`);
};

const SRC = '○ 김제교육지원청은 1,000여 명이 참여하는 축제를 개최했다. 실습 등을 통해 배웠다.';

console.log('1차 — 규칙이 낸 것이 원문과 어긋나면 버리는지');
const good = analyze(SRC);
check('멀쩡한 원문에서 걸리는 것', Object.keys(good.ruleViolations).length, 0);
const fake = [
  { key:'a', axis:'정확성', sub:'x', start:0, end:3, text:'딴글자', fixes:[], why:'', src:'', severity:'오류', counted:true },
  { key:'b', axis:'없는축',  sub:'x', start:0, end:1, text:'○',     fixes:[], why:'', src:'', severity:'오류', counted:true },
];
const g1 = guard1(fake, SRC);
check('자리가 어긋난 것을 버림', g1.tally['자리가 원문과 어긋남'], 1);
check('축이 이상한 것을 버림',   g1.tally['축이 셋 중에 없음'], 1);
check('남은 것',                 g1.kept.length, 0);

console.log('\n2차 — 계약을 어긴 답을 버리는지');
const t2 = {};
const taken = [[SRC.indexOf('개최했다'), SRC.indexOf('개최했다') + 4]];
check('1차가 이미 잡은 자리',
  guard2({ quote:'개최했다', suggestion:'열었다', sub:'군더더기' }, SRC, taken, t2) === null
    ? t2['1차가 이미 잡은 자리'] : 0, 1);
check('절차에 없는 지표 이름',
  guard2({ quote:'배웠다', suggestion:'익혔다', sub:'아무말' }, SRC, [], t2) === null
    ? t2['지표 이름이 목록에 없음'] : 0, 1);
check('숫자를 바꾼 답',
  guard2({ quote:'1,000여 명이', suggestion:'1,200여 명이', sub:'조사·어미' }, SRC, [], t2) === null
    ? t2['숫자가 바뀜'] : 0, 1);
check('멀쩡한 답은 통과',
  guard2({ quote:'배웠다', suggestion:'익혔다', sub:'군더더기' }, SRC, [], t2) !== null, true);

console.log('\n3차 — 옳은 말을 받아 오는지, 어긴 답은 버리는지');
const t3 = {};
const asked = new Map([['등를', '등를'], ['숫자', '1,000여 명이'], ['표어', 'UP']]);
const out = guard3(
  [
    { id: '등를',       fix: '등을' },
    { id: '안물어본것',  fix: '아무말' },
    { id: '숫자',       fix: '1,200여 명이' },
    { id: '표어',       fix: 'UP' },   // 고치기 전 그대로 = 되돌리기
  ],
  asked,
  t3,
);
check('묻지 않은 것을 버림',   t3['묻지 않은 것을 답함'], 1);
check('숫자를 바꾼 답도 버림', t3['숫자가 바뀜'], 1);
check('되돌리려는 답을 버림',  t3['고치기 전으로 되돌리려 함'], 1);
check('옳은 말만 남음',        JSON.stringify(out), '{"등를":"등을"}');

console.log(bad ? '\n✗ 어긋난 곳이 있습니다' : '\n✓ 세 단계 모두 제 것을 막습니다');
process.exit(bad ? 1 : 0);
