/**
 * 나눠 묻기 — 원고를 통째로 물으면 답이 길어 중계 서버가 끊긴다.
 *
 * 실제로 버셀 엣지 함수가 25초를 못 넘겨 FUNCTION_INVOCATION_TIMEOUT 이 났다.
 * 그래서 몇 문단씩 나눠 나란히 묻는다. 여기서 재는 것은 세 가지다.
 *   ① 정말 나눠서 묻는가 (한 번에 내야 할 글이 줄었는가)
 *   ② 한 묶음이 끊겨도 나머지는 살아남는가
 *   ③ 다 끊기면 '검토했다' 고 하지 않고 실패로 던지는가
 */
import { rewriteDraft } from './lib.mjs';

let bad = 0;
const check = (name, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name} — ${got}${ok ? '' : ` (기대 ${want})`}`);
};

const PARAS = ['가 문단', '나 문단', '다 문단', '라 문단', '마 문단', '바 문단', '사 문단'];
const CFG = { provider: 'gemini', apiKey: 'x', model: 'gemini-3.6-flash' };

/** 물어본 문단 번호를 뽑는다 (지시문에 적어 보낸 그대로) */
const wanted = (body) => {
  const text = JSON.parse(body).contents[0].parts[0].text;
  const tail = text.split('이 번호만 paragraphs 에 담는다')[1] ?? '';
  return tail
    .split('\n')
    .map((l) => Number((l.match(/^\[(\d+)\]/) ?? [])[1]))
    .filter(Number.isInteger);
};

/** fail 에 든 순번의 묶음만 끊는다 */
function stub(fail = []) {
  let n = 0;
  const asked = [];
  globalThis.fetch = async (_url, init) => {
    const idx = wanted(init.body);
    asked.push(idx);
    const mine = n++;
    if (fail.includes(mine)) return { ok: false, status: 504, text: async () => 'TIMEOUT' };
    const body = {
      paragraphs: idx.map((i) => ({ i, text: `${PARAS[i]}(고침)` })),
      changes: [{ from: '문단', to: '문단(고침)', axis: '정확성', item: '띄어쓰기', why: '' }],
      confirm: [{ about: '이름', why: '', suggest: '' }],
      summary: '총평',
    };
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }),
    };
  };
  return asked;
}

console.log('나눠서 묻는다');
let asked = stub();
let r = await rewriteDraft(CFG, PARAS, [], 3);
check('묶음 수', asked.length, 3);
check('묶음별 문단 수', asked.map((a) => a.length).join(','), '3,3,1');
check('모든 문단이 한 번씩만 물어진다',
  asked.flat().sort((a, b) => a - b).join(','), '0,1,2,3,4,5,6');
check('전문도 같이 준다(맥락)', r.paragraphs.length, PARAS.length);
check('다 고쳐져 돌아옴', r.paragraphs.every((p) => p.endsWith('(고침)')), true);
check('못 받은 문단 없음', r.missed.length, 0);
check('같은 내역은 한 번만', r.changes.length, 1);
check('같은 확인거리도 한 번만', r.confirm.length, 1);

console.log('\n한 묶음이 끊겨도 나머지는 살린다');
stub([1]);
r = await rewriteDraft(CFG, PARAS, [], 3);
check('끊긴 문단은 원문 그대로', r.paragraphs[3], '라 문단');
check('나머지는 고쳐짐', r.paragraphs[0], '가 문단(고침)');
check('못 받은 문단을 알려 준다', r.missed.join(','), '3,4,5');

console.log('\n다 끊기면 검토했다고 하지 않는다');
stub([0, 1, 2]);
let threw = '';
try {
  await rewriteDraft(CFG, PARAS, [], 3);
} catch (e) {
  threw = String(e.message ?? e);
}
check('실패로 던진다', threw.includes('504') || threw.includes('검토'), true);

console.log(bad ? '\n✗ 어긋난 곳이 있습니다' : '\n✓ 나눠 묻기가 제 몫을 합니다');
process.exit(bad ? 1 : 0);
