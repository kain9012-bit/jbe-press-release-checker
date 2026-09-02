/**
 * 문의 표는 자리로 옮긴다 — 낱말로 맞히지 않는다.
 *
 * 학부모지원센터 보도자료를 넣었더니 세 사람 중 한 사람만 남고 첫 줄과 끝 줄이
 * 비어 나왔다. 원인은 표를 표로 읽지 않은 것이었다. 문단 목록으로 납작하게 편 뒤
 * ‘어느 줄이 직위인가’ 를 낱말 목록으로 맞히려 하니, 목록에 없는 ‘선임’·‘주임’ 이
 * 나오자 그 줄이 지나가고 뒤따르는 이름·전화가 갈 곳을 잃었다. 게다가 첫 칸을
 * 관리직 전용으로 두어 팀장만 있는 부서는 첫 줄이 통째로 비었다.
 *
 * hwpx 는 칸마다 열·줄 번호(cellAddr)를 파일에 적어 둔다. 그것을 그대로 읽어
 * 그대로 다시 넣으면 무슨 말이 적혀 있든 상관이 없다. 여기서 그것을 못 박는다.
 */
import { DOMParser } from '@xmldom/xmldom';
globalThis.DOMParser = DOMParser;

const { contactTableOf, parsePressRelease, buildHwpx, EMPTY_META } = await import('./lib.mjs');

let bad = 0;
const check = (name, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name} — ${got}${ok ? '' : ` (기대 ${want})`}`);
};

/** 표 칸 하나를 손으로 짓는다 (열, 줄, 가로합침, 세로합침, 글) */
const cell = (col, row, colSpan, rowSpan, text) => ({ col, row, colSpan, rowSpan, text });

console.log('전북 서식 — 왼쪽 두 칸은 세 줄을 합쳐 쓴다');
const 전북 = contactTableOf([
  {
    rows: 3,
    cols: 5,
    cells: [
      cell(0, 0, 1, 3, '담당 부서(문   의)'),
      cell(1, 0, 1, 3, '학부모지원센터'),
      cell(2, 0, 1, 1, '학부모지원팀장'), cell(3, 0, 1, 1, '김학엽'), cell(4, 0, 1, 1, '063-223-1396'),
      cell(2, 1, 1, 1, '학부모지원팀 선임'), cell(3, 1, 1, 1, '김영랑'), cell(4, 1, 1, 1, '063-223-1396'),
      cell(2, 2, 1, 1, '학부모지원팀 주임'), cell(3, 2, 1, 1, '김병도'), cell(4, 2, 1, 1, '063-223-1396'),
    ],
  },
]);
check('부서', 전북.부서, '학부모지원센터');
check('세 줄 다 남는다', 전북.사람.length, 3);
check(
  '적힌 글자 그대로',
  전북.사람.map((r) => r.join('/')).join(' · '),
  '학부모지원팀장/김학엽/063-223-1396 · 학부모지원팀 선임/김영랑/063-223-1396 · 학부모지원팀 주임/김병도/063-223-1396',
);

console.log('\n직위가 무엇이든 상관없다 — 목록에 없는 말도 그대로 온다');
const 낯선 = contactTableOf([
  {
    rows: 2,
    cols: 5,
    cells: [
      cell(0, 0, 1, 2, '담당 부서(문   의)'),
      cell(1, 0, 1, 2, '창의인재교육과'),
      cell(2, 0, 1, 1, '늘봄지원관'), cell(3, 0, 1, 1, '박○○'), cell(4, 0, 1, 1, '063-239-3000'),
      cell(2, 1, 1, 1, '파견교사'), cell(3, 1, 1, 1, '최○○'), cell(4, 1, 1, 1, '063-239-3001'),
    ],
  },
]);
check('두 줄', 낯선.사람.map((r) => r[0]).join(','), '늘봄지원관,파견교사');

console.log('\n칸이 뒤죽박죽 적혀 있어도 자리대로 세운다');
const 뒤섞 = contactTableOf([
  {
    rows: 2,
    cols: 4,
    cells: [
      cell(3, 1, 1, 1, '063-000-0002'), cell(2, 1, 1, 1, '나중'),
      cell(0, 0, 1, 2, '담 당 부 서'), cell(1, 0, 1, 2, '총무과'),
      cell(2, 0, 1, 1, '먼저'), cell(3, 0, 1, 1, '063-000-0001'),
    ],
  },
]);
check('줄 차례', 뒤섞.사람.map((r) => r.join('/')).join(' · '), '먼저/063-000-0001 · 나중/063-000-0002');

console.log('\n문의 표가 없으면 빈손');
check('없음', contactTableOf([{ rows: 1, cols: 1, cells: [cell(0, 0, 1, 1, '제목')] }]), null);

console.log('\n한 바퀴 돌려 본다 — 넣은 그대로 다시 나오는가');
const 원본 = [
  ['학부모지원팀장', '김학엽', '063-223-1396'],
  ['학부모지원팀 선임', '김영랑', '063-223-1396'],
  ['학부모지원팀 주임', '김병도', '063-223-1396'],
];
const 되읽음 = parsePressRelease(
  buildHwpx(
    {
      ...EMPTY_META,
      배포일: '2026-07-13',
      제목: '보도자료 한 건',
      부제: ['부제 한 줄'],
      부서: '학부모지원센터',
      문의: 원본,
    },
    ['○ 본문 한 줄입니다.'],
  ),
);
check('부서', 되읽음.부서, '학부모지원센터');
check('문의 표가 그대로', JSON.stringify(되읽음.문의), JSON.stringify(원본));
check('제목도 그대로', 되읽음.제목, '보도자료 한 건');

console.log('\n사람이 한 명뿐이면 나머지 줄은 비운다 (양식의 ‘김xx’ 가 남으면 안 된다)');
const 한명 = parsePressRelease(
  buildHwpx(
    {
      ...EMPTY_META,
      제목: '한 명짜리',
      부서: '총무과',
      문의: [['과장', '김○○', '063-000-0000'], ['', '', ''], ['', '', '']],
    },
    ['○ 본문.'],
  ),
);
check('한 줄만 남는다', JSON.stringify(한명.문의), JSON.stringify([['과장', '김○○', '063-000-0000']]));
check(
  '양식 자리표시가 안 새어 나온다',
  한명.paragraphs.some((p) => /김xx|이xx|박xx|063-239-3xxx|000000과/.test(p)),
  false,
);

console.log('\n옛 .hwp — 칸 자리가 없어 줄만 훑는다. 그래도 사람은 안 버린다');
const { parseContacts } = await import('./lib.mjs');
const 옛 = parseContacts([
  '담당 부서', '(문   의)', '학부모지원센터',
  '학부모지원팀장', '김학엽', '063-223-1396',
  '학부모지원팀 선임', '김영랑', '063-223-1396',
  '학부모지원팀 주임', '김병도', '063-223-1396',
]);
check('부서', 옛.부서, '학부모지원센터');
check(
  '목록에 없는 ‘선임·주임’ 도 남는다',
  옛.사람.map((p) => `${p.label}/${p.name}`).join(' · '),
  '학부모지원팀장/김학엽 · 학부모지원팀 선임/김영랑 · 학부모지원팀 주임/김병도',
);

console.log(bad ? '\n✗ 어긋난 곳이 있습니다' : '\n✓ 문의 표가 자리 그대로 오갑니다');
process.exit(bad ? 1 : 0);
