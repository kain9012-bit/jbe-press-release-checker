/**
 * 웹페이지가 중계 서버에 **OpenAI 규격으로** 묻는지 본다.
 *
 * 상류를 오픈라우터로 옮기면서 주고받는 모양이 바뀌었다. 제미나이 고유 형식
 * (contents·generationConfig·responseSchema)이 아니라 messages·response_format 이다.
 * 부르는 모형은 그대로 gemini-3.6-flash 이고 통로만 바뀐 것인데, 몸통 모양을
 * 하나라도 옛것으로 두면 상류가 400 을 낸다.
 *
 * 그리고 스키마를 못 받는 모형이 섞일 수 있다. 그때 통째로 실패하지 않고
 * 한 번만 모양 지정을 빼고 다시 묻는지도 본다 — 틀린 답은 뒤의 검사관이 어차피 거른다.
 */
import { rewriteDraft, proxyUrl, PROXY_URL, PROXY_MODELS } from './lib.mjs';

let bad = 0;
const check = (name, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${String(name).padEnd(30)} ${got}${ok ? '' : ` (기대 ${want})`}`);
};

const CFG = { provider: 'proxy', apiKey: '', model: 'gemini-3.6-flash' };
const PARAS = ['가 문단', '나 문단'];

const ANSWER = {
  paragraphs: [{ i: 0, text: '가 문단' }, { i: 1, text: '나 문단' }],
  changes: [],
  confirm: [],
  summary: '총평',
};

/** status 가 주어지면 그 번호로 한 번 거절했다가 다음부터 받아 준다 */
function stub({ refuseSchema = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body });
    if (refuseSchema && body.response_format?.type === 'json_schema') {
      return { ok: false, status: 400, text: async () => 'schema not supported' };
    }
    const payload = body.messages[0].content.startsWith('너는 전북특별자치도교육청')
      ? { judged: [] }
      : ANSWER;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    };
  };
  return calls;
}

console.log('주소는 중계 서버, 모형 이름은 주소 끝에');
check('기본 주소', PROXY_URL, '/api/ai');
check('모형이 주소 끝에', proxyUrl(CFG), '/api/ai/gemini-3.6-flash');
check('허용 모형 목록이 비어 있지 않다', PROXY_MODELS.length > 0, true);

console.log('\nOpenAI 규격으로 묻는다 (제미나이 고유 형식이 아니다)');
let calls = stub();
await rewriteDraft(CFG, PARAS, [], 2);
const b = calls[0].body;
check('주소', calls[0].url, '/api/ai/gemini-3.6-flash');
check('messages 로 보낸다', Array.isArray(b.messages), true);
check('지시문은 system 자리에', b.messages[0].role, 'system');
check('원고는 user 자리에', b.messages[1].role, 'user');
check('제미나이 고유 형식이 안 섞였다', 'contents' in b || 'generationConfig' in b, false);
check('온도 0', b.temperature, 0);
check('모양을 못 박는다', b.response_format.type, 'json_schema');
check('엄격 모드', b.response_format.json_schema.strict, true);

console.log('\n엄격 모드가 요구하는 것을 갖췄다');
const schema = b.response_format.json_schema.schema;
check('덧붙임 금지', schema.additionalProperties, false);
check('모든 속성이 required', schema.required.join(','), Object.keys(schema.properties).join(','));
const conf = schema.properties.confirm.items;
check('배열 안쪽도 덧붙임 금지', conf.additionalProperties, false);
// 원래 선택이던 item 도 엄격 모드에서는 필수여야 한다
check('선택이던 item 도 필수로', conf.required.includes('item'), true);

console.log('\n스키마를 못 받으면 한 번만 모양 지정을 빼고 다시 묻는다');
calls = stub({ refuseSchema: true });
const got = await rewriteDraft(CFG, PARAS, [], 2);
const withSchema = calls.filter((c) => c.body.response_format?.type === 'json_schema').length;
const plain = calls.filter((c) => c.body.response_format?.type === 'json_object').length;
check('스키마로 먼저 묻고', withSchema > 0, true);
check('거절당하면 맨몸으로 다시', plain > 0, true);
check('한 번 거절에 한 번만 다시', plain, withSchema);
check('결과는 그대로 나온다', got.paragraphs.join('|'), '가 문단|나 문단');

console.log(bad ? '\n✗ 어긋난 곳이 있습니다' : '\n✓ 중계 서버에 제 모양으로 묻습니다');
process.exit(bad ? 1 : 0);
