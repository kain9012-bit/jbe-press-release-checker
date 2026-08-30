/** 규약을 코드가 실제로 막는지 본다. 지시문에 적어 두는 것만으로는 안 된다. */
import { checkReplacement, STEP_IDS, STEPS, procedureText } from './lib.mjs';

const cases = [
  ['숫자를 늘림',      '1,000여 명이',    '1,200여 명이',      '숫자가 바뀜'],
  ['숫자를 지움',      '11개교가 참여',   '여러 학교가 참여',  '숫자가 바뀜'],
  ['숫자 그대로',      '1,000여 명이',    '1,000여 명은',      null],
  ['병기를 떼어 냄',   '높이기(UP)',      '높이기',            '병기를 떼어 냄'],
  ['병기를 닮',        'UP',              '높이기(UP)',        null],
  ['병기 유지',        '가상현실(VR) 체험','가상현실(VR) 경험', null],
  ['자리표시 물결',    '을 통해',         '~로',               '자리표시가 섞임'],
  ['자리표시 (으)로',  '을 통해',         '(으)로',            '자리표시가 섞임'],
  ['빈 답',            '을 통해',         '   ',               '고친 말이 비었음'],
  ['멀쩡한 답',        '을 통해',         '으로',              null],
];
let bad = 0;
console.log('규약 검사 — 코드가 막는지');
for (const [name, from, to, want] of cases) {
  const got = checkReplacement(from, to);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(16)} 「${from}」→「${to}」  ${got ?? '통과'}`);
}
console.log(`\n절차 ${STEPS.length}단계, 지표 이름 ${STEP_IDS.size}개`);
console.log(procedureText().split('\n').slice(0, 3).join('\n') + '\n   …');
process.exit(bad ? 1 : 0);
