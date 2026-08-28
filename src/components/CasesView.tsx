import { useMemo, useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import casesRaw from '../data/cases.json';

interface Case {
  c: string;
  w: string;
  r: string;
  why: string[];
}
const CASES = casesRaw as Case[];
const GROUPS = ['전체', '맞춤법', '띄어쓰기', '낱말', '표현', '표기'];

export default function CasesView() {
  const [q, setQ] = useState('');
  const [g, setG] = useState('전체');

  const list = useMemo(() => {
    const key = q.trim();
    return CASES.filter(
      (c) =>
        (g === '전체' || c.c === g) &&
        (!key || c.w.includes(key) || c.r.includes(key) || c.why.join(' ').includes(key)),
    ).slice(0, 300);
  }, [q, g]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-bold">고친 사례 찾아보기</h2>
        <p className="mt-1 text-sm text-slate-600">
          『개정판 한눈에 알아보는 공공언어 바로 쓰기』(국립국어원, 2022)의 기안문·보도자료·보고서·안내문
          첨삭 사례 {CASES.length}건을 자동으로 뽑아 둔 것입니다. 원문 편집 과정에서 잘린 항목이 섞여 있을 수
          있으니 <b>참고 자료로만</b> 쓰고, 원 책자로 확인하세요.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="예: 통해, 접수, 로써"
              aria-label="사례 검색"
              className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GROUPS.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setG(x)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  g === x
                    ? 'border-blue-600 bg-blue-600 font-bold text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-blue-600'
                }`}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
          찾는 사례가 없습니다.
        </p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {list.map((c, i) => (
            <li key={i} className="rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-600">
              <span className="mb-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                {c.c}
              </span>
              <div className="flex flex-wrap items-start gap-2 text-sm">
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through decoration-red-300">
                  {c.w}
                </span>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">{c.r}</span>
              </div>
              {c.why.length > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{c.why.join(' ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
