import { Languages, SpellCheck, MessagesSquare } from 'lucide-react';
import { SCORING, EXCLUDED, CHECKLIST } from '../data/checklist';
import { DATA_COUNTS } from '../lib/analyze';
import { Badge, SectionTitle, CARD } from './Ui';

export default function CriteriaView() {
  return (
    <div className="space-y-8 pb-12">
      {/* ── 평가 개요 ── */}
      <section className="space-y-3">
        <SectionTitle desc="문화체육관광부 국어정책과 · 국립국어원">
          2026년 공문서등 평가
        </SectionTitle>
        <div className={`${CARD} p-5 space-y-4`}>
          <p className="text-slate-700 leading-relaxed">
            국어기본법 제14조에 따라 시도 교육청 17곳과 공공기관 342곳을 전수 평가합니다. 평가 기간은
            2026. 3. 1.~10. 31.이고 결과는 2027년 2월에 발표합니다. 시도 교육청은 순위를 공개하고,
            공공기관은 우수(상위 20%)·보통(70%)·미흡(하위 10%) 등급을 매깁니다.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-xs text-slate-500">
                  <th className="text-left font-bold px-4 py-3 whitespace-nowrap">대상</th>
                  <th className="text-left font-bold px-4 py-3 whitespace-nowrap">평가 항목</th>
                  <th className="text-left font-bold px-4 py-3">지표</th>
                  <th className="text-right font-bold px-4 py-3 whitespace-nowrap">배점</th>
                </tr>
              </thead>
              <tbody>
                {SCORING.map((s) => (
                  <tr key={s.item} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{s.target}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge
                        tone={s.axis === '용이성' ? 'blue' : s.axis === '정확성' ? 'red' : 'amber'}
                      >
                        {s.axis}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-800">{s.item}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                      {s.point}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            보도자료는 3~9월 사이 기관 누리집에 올린 정책 보도자료를 월 1건씩 임의로 골라 정량 평가합니다.{' '}
            {EXCLUDED.map((x) => (
              <span key={x} className="mr-1">
                <Badge>{x}</Badge>
              </span>
            ))}
            는 평가 대상에서 빠집니다. 하나의 보도자료 안에서 같은 오류 표현이 여러 번 나오면 중복해서
            지적합니다.
          </p>
        </div>
      </section>

      {/* ── 이 도구가 보는 기준 ── */}
      <section className="space-y-3">
        <SectionTitle desc="자동으로 대조하는 자료와 규칙">이 도구가 보는 기준</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            {
              axis: '용이성' as const,
              tone: 'blue' as const,
              icon: <Languages className="w-4 h-4" aria-hidden="true" />,
              body: '① 외국 글자(로마자·한자) 사용 ② 어려운 한자어나 우리말로 대체 가능한 외래어(외국어) ③ 제도명·사업명·행사명 등에 우리말이 아닌 외국어 표현·표기',
              sub: `평가용 용어 목록 ${DATA_COUNTS.terms.toLocaleString()}개, 필수 개선 행정용어 ${DATA_COUNTS.admin}개, 일본어 투 용어 ${DATA_COUNTS.japanese}개로 대조합니다.`,
            },
            {
              axis: '정확성' as const,
              tone: 'red' as const,
              icon: <SpellCheck className="w-4 h-4" aria-hidden="true" />,
              body: '① 표기의 정확성(한글 맞춤법, 표준어 규정, 외래어 표기법, 국어의 로마자 표기법) ② 표현의 정확성(호응·접속·생략·조사·어미·어휘 등 비문법적 표현)',
              sub: `두음 법칙, 괄호 뒤 조사, 띄어쓰기, 번역 투, 이중 피동 등 규칙 ${DATA_COUNTS.patterns}개를 적용합니다.`,
            },
            {
              axis: '소통성' as const,
              tone: 'amber' as const,
              icon: <MessagesSquare className="w-4 h-4" aria-hidden="true" />,
              body: '① 이해가능성(외국 문자·한자·어려운 한자어·외국어, 지나치게 긴 문장) ② 공공성(권위적·차별적 표현)',
              sub: '평가에서는 홍보물을 대상으로 하지만, 보도자료에도 같은 눈으로 봐 둘 만합니다.',
            },
          ].map((x) => (
            <div key={x.axis} className={`${CARD} p-5 space-y-2`}>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">{x.icon}</span>
                <Badge tone={x.tone}>{x.axis}</Badge>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed">{x.body}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{x.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 공공언어의 요건 ── */}
      <section className="space-y-3">
        <SectionTitle
          count={CHECKLIST.length}
          unit="항목"
          desc="『개정판 한눈에 알아보는 공공언어 바로 쓰기』 첫째 마당"
        >
          공공언어의 요건
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['정확성', '소통성'] as const).map((area) => (
            <div key={area} className={`${CARD} overflow-hidden`}>
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                {area}
              </div>
              <ul className="divide-y divide-slate-100">
                {CHECKLIST.filter((c) => c.area === area).map((c) => (
                  <li key={c.id} className="px-4 py-3 text-sm text-slate-800">
                    <span className="mr-2 text-xs font-bold text-slate-400">{c.group}</span>
                    {c.question}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          검토 결과 화면의 점검표가 이 표를 그대로 씁니다. 단락 구성·정보의 양과 배열·시각적 편의는
          자동 검사 대상이 아니라 작성자가 직접 확인해야 합니다.
        </p>
      </section>
    </div>
  );
}
