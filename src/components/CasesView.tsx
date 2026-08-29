import { useMemo, useState } from 'react';
import { Search, ArrowRight, BookOpen } from 'lucide-react';
import casesRaw from '../data/cases.json';
import { Badge, SectionTitle, EmptyState, CARD } from './Ui';

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
    );
  }, [q, g]);

  return (
    <div className="space-y-8 pb-12">
      {/* ── 검색 띠 ── */}
      <section
        className="relative left-1/2 w-screen -translate-x-1/2 -mt-6
                   px-4 sm:px-6 lg:px-8 py-10
                   bg-blue-50 border-b border-blue-100"
      >
        <div className="max-w-3xl mx-auto text-center space-y-5">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
            국립국어원이 <span className="text-blue-700">실제로 고친 사례</span>를 찾아봅니다
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            『개정판 한눈에 알아보는 공공언어 바로 쓰기』(2022)의 기안문·보도자료·보고서·안내문 첨삭
            사례 {CASES.length}건
          </p>

          <div>
            <label htmlFor="caseSearch" className="sr-only">
              사례 검색
            </label>
            <div className="relative max-w-xl mx-auto">
              <Search
                className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="caseSearch"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="예: 통해, 접수, 로써, 개최"
                className="w-full h-14 pl-11 pr-4 text-base text-slate-900 placeholder-slate-400
                           bg-white border-2 border-blue-600 rounded-lg outline-none focus:border-blue-700"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {GROUPS.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setG(x)}
                className={`px-3 py-1.5 rounded-full border text-sm font-semibold transition-colors ${
                  g === x
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-100'
                }`}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle count={list.length}>찾은 사례</SectionTitle>

        <p className="text-xs text-slate-500">
          원본 책자 PDF에서 자동으로 뽑은 것이라 편집 과정에서 잘린 항목이 섞여 있을 수 있습니다.
          자동 수정에는 쓰지 않고 참고용으로만 둡니다.
        </p>

        {list.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-6 h-6" aria-hidden="true" />}
            title="찾는 사례가 없습니다"
            desc="다른 낱말로 찾아보거나 분류를 바꿔 보세요."
          />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {list.map((c, i) => (
              <li key={i} className={`${CARD} p-4 hover:border-blue-600 transition-colors`}>
                <Badge>{c.c}</Badge>
                <div className="mt-2 flex flex-wrap items-start gap-2 text-sm">
                  <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 line-through decoration-red-300">
                    {c.w}
                  </span>
                  <ArrowRight className="mt-1 w-3.5 h-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="px-1.5 py-0.5 rounded bg-green-50 font-bold text-green-700">{c.r}</span>
                </div>
                {c.why.length > 0 && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{c.why.join(' ')}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
