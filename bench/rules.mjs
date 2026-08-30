/** 규칙 검사만 잰다. 키가 필요 없다. */
import { analyze } from './lib.mjs';
import { CASES } from './cases.mjs';

let miss = 0, falsePos = 0;
for (const c of CASES) {
  const found = analyze(c.text).findings;
  const texts = found.map((f) => f.text);
  const got = c.expect.filter((e) => texts.some((t) => t.includes(e) || e.includes(t)));
  const hit = c.keep.filter((k) => texts.some((t) => t.trim() === k.trim()));
  miss += c.expect.length - got.length;
  falsePos += hit.length;
  console.log(`\n[${c.id}] 지적 ${found.length}건`);
  console.log(`  잡아야 할 것 ${c.expect.length}개 중 ${got.length}개 잡음` +
    (got.length < c.expect.length ? `  ✗ 놓침: ${c.expect.filter(e=>!got.includes(e)).join(', ')}` : '  ✓'));
  console.log(`  건드리면 안 되는 것 ${c.keep.length}개` + (hit.length ? `  ✗ 건드림: ${hit.join(', ')}` : '  ✓'));
}
console.log(`\n합계 — 놓친 것 ${miss}개, 잘못 잡은 것 ${falsePos}개`);
process.exit(falsePos > 0 ? 1 : 0);
