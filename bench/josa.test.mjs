/**
 * 실제로 나간 보도자료에서 나온 망가진 글을 그대로 재현해 막는다.
 *
 * 2026-08-12 ‘공문 분류도 AI가 척척’ 초안을 넣어 받은 hwpx 에 이런 것이 있었다.
 *   ‘AI가 척척’                → ‘인공지능(AI)이가 척척’
 *   ‘시스템을 전국 최초로’      → ‘체계를을 전국 최초로’
 *   ‘이 시스템은 그동안’        → ‘이 체계는은 그동안’
 *   ‘인공지능(AI) 기술을’       → ‘인공지능(인공지능(AI)) 기술을’
 *
 * 앞의 셋은 낱말만 바꾸고 뒤에 남는 조사를 그대로 두어서 생긴 것이다. 고칠 말이 조사를
 * 달고 오면 겹조사(‘이가’)가 되고, 안 달고 오면 안 맞는 조사(‘체계은’)가 남는다.
 * 마지막 하나는 이미 병기가 된 괄호 속 로마자를 또 잡아서 생긴 겹병기다.
 */
import { analyze, buildRevised, trailingJosaFix, insideByunggi, guard2 } from './lib.mjs';

let bad = 0;
const check = (name, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name} — ${got}${ok ? '' : ` (기대 ${want})`}`);
};

/** 지적 하나를 손으로 만들어 수정본을 뽑아 본다 */
function revise(text, spanText, rep) {
  const start = text.indexOf(spanText);
  const f = {
    key: 'k', axis: '용이성', sub: '① 외국 글자(로마자) 사용',
    start, end: start + spanText.length, text: spanText,
    fixes: [rep], why: '', src: '', severity: '오류', counted: true,
  };
  return buildRevised(text, [f], { k: { on: true, pick: 0 } });
}

console.log('겹조사 — 고칠 말이 조사를 달고 오면 원문의 조사를 먹는다');
check('AI가 → 인공지능(AI)이',
  revise('공문 분류도 AI가 척척', 'AI', '인공지능(AI)이'),
  '공문 분류도 인공지능(AI)이 척척');
check('시스템을 → 체계를',
  revise('구축하는 시스템을 전국 최초로', '시스템', '체계를'),
  '구축하는 체계를 전국 최초로');
check('시스템은 → 체계는',
  revise('이 시스템은 그동안', '시스템', '체계는'),
  '이 체계는 그동안');

console.log('\n멀쩡한 자리는 건드리지 않는다');
check('고칠 말에 조사가 없으면 그대로',
  revise('접수공문 AI 자동 배부', 'AI', '인공지능(AI)'),
  '접수공문 인공지능(AI) 자동 배부');
check('지적 자리가 이미 조사를 품었으면 그대로',
  revise('실습 등를 접하며', '등를', '등을'),
  '실습 등을 접하며');
check('뒷말이 조사로 시작하는 낱말이면 안 먹는다',
  revise('시스템 은행 계좌', '시스템', '체계를'),
  '체계를 은행 계좌');
check('먹을 것이 없으면 0', JSON.stringify(trailingJosaFix('체계 운영', 2, '체계', '체계를')), '{"skip":0,"add":""}');

console.log('\n남은 조사가 새 낱말에 맞게 바뀐다');
check('AI가 → 인공지능(AI)이 (괄호는 안 읽는다)',
  revise('공문 분류도 AI가 척척', 'AI', '인공지능(AI)'),
  '공문 분류도 인공지능(AI)이 척척');
check('시스템은 → 체계는',
  revise('이 시스템은 그동안', '시스템', '체계'),
  '이 체계는 그동안');
check('시스템을 → 체계를',
  revise('구축하는 시스템을 전국', '시스템', '체계'),
  '구축하는 체계를 전국');
check('이미 맞는 조사는 그대로',
  revise('워크샵을 열었다', '워크샵', '연수'),
  '연수를 열었다');

console.log('\n겹병기 — 이미 병기가 된 괄호 속은 아무도 못 건드린다');
const SRC = '전북교육청이 인공지능(AI) 기술을 활용해 구축했다.';
check('괄호 속 AI 는 병기 안', insideByunggi(SRC, SRC.indexOf('AI'), SRC.indexOf('AI') + 2), true);
const t = {};
check('2차가 괄호 속을 집으면 버린다',
  guard2({ quote: 'AI', suggestion: '인공지능(AI)', sub: '외국어 표현' }, SRC, [], t), null);
check('1차의 어느 규칙도 괄호 속을 안 짚는다',
  analyze(SRC).findings.filter((f) => f.start === SRC.indexOf('AI')).length, 0);
check('괄호 일부만 짚는 것은 그대로 둔다',
  analyze('부재(출장·복무 등) 시 워크샵을 열었다').findings.some((f) => f.text === '워크샵'), true);

console.log(bad ? '\n✗ 어긋난 곳이 있습니다' : '\n✓ 나갔던 망가진 글이 다시 나오지 않습니다');
process.exit(bad ? 1 : 0);
