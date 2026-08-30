/**
 * 같은 글을 여러 번 돌려 답이 얼마나 같은지 잰다.
 *
 *   GEMINI_API_KEY=... node bench/consistency.mjs [횟수]
 *
 * 재는 것
 *   ① 일관성  — N 번 돌렸을 때 지적 묶음이 얼마나 겹치나 (자카드)
 *   ② 멱등성  — 수정본을 다시 넣었을 때 또 고치라는 것이 몇 개인가
 *   ③ 되돌림  — 그중 앞서 제대로 고쳐 놓은 것을 되돌리려는 것이 있나
 */
import { analyze, buildRevisedParts, defaultDecisions, replacementFor, reviewWithAi, fillBlanks, verifyEdits } from './lib.mjs';
import { CASES } from './cases.mjs';

const KEY = process.env.GEMINI_API_KEY;
const N = Number(process.argv[2] ?? 3);
if (!KEY) {
  console.log('GEMINI_API_KEY 가 없어 AI 부분은 건너뜁니다.\n' +
              'GEMINI_API_KEY=... node bench/consistency.mjs 3');
  process.exit(0);
}
const cfg = { provider: 'gemini', apiKey: KEY, model: process.env.GEMINI_MODEL ?? 'gemini-3.6-flash' };

const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 1;
};

/** 한 번의 'AI까지 검토' 를 그대로 흉내 낸다 */
async function onePass(text) {
  const r = analyze(text);
  const ai = await reviewWithAi(cfg, text, r.findings);
  const all = [...r.findings, ...ai.findings];
  const dec = defaultDecisions(r.findings);
  for (const f of ai.findings) dec[f.key] = { on: false, pick: 0 };

  const stuck = all.filter((f) => replacementFor(f, dec[f.key], text) === null);
  if (stuck.length) {
    const fills = await fillBlanks(cfg, stuck.slice(0, 40).map((f) => ({
      id: f.key, text: f.text, why: f.why,
      context: text.slice(Math.max(0, f.start - 60), f.end + 60), before: '',
    })));
    for (const [k, v] of Object.entries(fills)) dec[k] = { ...(dec[k] ?? { on: false, pick: 0 }), custom: v, on: true };
  }

  const probe = { ...dec };
  for (const f of all) if (replacementFor(f, probe[f.key] ?? { on: false, pick: 0 }, text) !== null)
    probe[f.key] = { ...(probe[f.key] ?? { pick: 0 }), on: true };
  const parts = buildRevisedParts(text, all, probe);
  const edits = [];
  let at = 0;
  for (const q of parts) {
    if (q.from !== undefined && q.key) edits.push({ id: q.key, from: q.from, to: q.text, after: q.text });
    at += q.text.length;
  }
  const wrong = await verifyEdits(cfg, edits.slice(0, 60));
  for (const k of Object.keys(wrong)) if (probe[k]) probe[k] = { ...probe[k], on: false };

  return {
    keys: all.map((f) => `${f.start}:${f.text}`),
    revised: buildRevisedParts(text, all, probe).map((x) => x.text).join(''),
    rejected: Object.keys(wrong).length,
  };
}

for (const c of CASES) {
  console.log(`\n${'='.repeat(64)}\n[${c.id}]`);
  const runs = [];
  for (let i = 0; i < N; i++) runs.push(await onePass(c.text));

  let sum = 0, pairs = 0;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { sum += jaccard(runs[i].keys, runs[j].keys); pairs++; }
  console.log(`  ① 일관성 ${N}회 — 지적 묶음 겹침 ${pairs ? (sum / pairs * 100).toFixed(1) : 100}%`);
  console.log(`     수정본이 ${new Set(runs.map(r => r.revised)).size}가지 나옴 (1이면 완전히 같음)`);
  console.log(`     검수에서 되돌린 것 ${runs.map(r => r.rejected).join(', ')}건`);

  const again = await onePass(runs[0].revised);
  console.log(`  ② 멱등성 — 수정본을 다시 넣으니 지적 ${again.keys.length}건`);
  const broke = c.keep.filter((k) => runs[0].revised.includes(k) && !again.revised.includes(k));
  console.log(`  ③ 되돌림 — ${broke.length ? '✗ ' + broke.join(', ') : '✓ 없음'}`);
}
