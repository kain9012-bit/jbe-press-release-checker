import { SCORING, EXCLUDED, CHECKLIST } from '../data/checklist';
import { DATA_COUNTS } from '../lib/analyze';

const CARD = 'rounded-lg border border-slate-200 bg-white p-5';

export default function CriteriaView() {
  return (
    <div className="space-y-6">
      <section className={CARD}>
        <h2 className="mb-1 text-xl font-bold">2026년 공문서등 평가는 이렇게 이뤄집니다</h2>
        <p className="text-sm text-slate-600">
          문화체육관광부 국어정책과와 국립국어원이 국어기본법 제14조에 따라 시도 교육청 17곳과 공공기관
          342곳을 전수 평가합니다. 평가 기간은 2026. 3. 1.~10. 31.이고 결과는 2027년 2월에 발표합니다.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-slate-300 bg-slate-50 text-left">
                <th className="px-3 py-2 font-bold">대상</th>
                <th className="px-3 py-2 font-bold">평가 항목</th>
                <th className="px-3 py-2 font-bold">지표</th>
                <th className="px-3 py-2 text-right font-bold">배점</th>
              </tr>
            </thead>
            <tbody>
              {SCORING.map((s) => (
                <tr key={s.item} className="border-b border-slate-200">
                  <td className="px-3 py-2 text-slate-600">{s.target}</td>
                  <td className="px-3 py-2 font-bold">{s.axis}</td>
                  <td className="px-3 py-2">{s.item}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{s.point}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          보도자료는 3~9월 사이 기관 누리집에 올린 정책 보도자료를 월 1건씩 임의로 골라 정량 평가합니다.
          {' '}
          <b>{EXCLUDED.join(', ')}</b>는 평가 대상에서 빠집니다. 하나의 보도자료 안에서 같은 오류 표현이
          여러 번 나오면 중복해서 지적합니다.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="mb-3 text-xl font-bold">이 도구가 보는 기준</h2>
        <ul className="space-y-3 text-sm">
          <li className="rounded-md border border-slate-200 p-3">
            <b className="text-blue-700">용이성</b> — ① 외국 글자(로마자·한자) 사용 ② 어려운 한자어나
            우리말로 대체 가능한 외래어(외국어) ③ 제도명·사업명·행사명 등에 우리말이 아닌 외국어 표현·표기
            <div className="mt-1 text-slate-500">
              평가용 용어 목록 {DATA_COUNTS.terms.toLocaleString()}개, 필수 개선 행정용어{' '}
              {DATA_COUNTS.admin}개, 일본어 투 용어 {DATA_COUNTS.japanese}개로 대조합니다.
            </div>
          </li>
          <li className="rounded-md border border-slate-200 p-3">
            <b className="text-red-700">정확성</b> — ① 표기의 정확성(한글 맞춤법, 표준어 규정, 외래어
            표기법, 국어의 로마자 표기법) ② 표현의 정확성(호응·접속·생략·조사·어미·어휘 등 비문법적 표현)
            <div className="mt-1 text-slate-500">
              두음 법칙, 괄호 뒤 조사, 띄어쓰기, 번역 투, 이중 피동 등 규칙 {DATA_COUNTS.patterns}개를
              적용합니다.
            </div>
          </li>
          <li className="rounded-md border border-slate-200 p-3">
            <b className="text-amber-700">소통성</b> — ① 이해가능성(외국 문자·한자·어려운 한자어·외국어,
            지나치게 긴 문장) ② 공공성(권위적·차별적 표현)
          </li>
        </ul>
      </section>

      <section className={CARD}>
        <h2 className="mb-1 text-xl font-bold">공공언어의 요건</h2>
        <p className="mb-3 text-sm text-slate-600">
          국립국어원 『개정판 한눈에 알아보는 공공언어 바로 쓰기』 첫째 마당의 요건표입니다. 검토 결과
          화면의 점검표가 이 표를 그대로 씁니다.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {['정확성', '소통성'].map((area) => (
            <div key={area} className="rounded-md border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold">
                {area}
              </div>
              <ul className="divide-y divide-slate-100">
                {CHECKLIST.filter((c) => c.area === area).map((c) => (
                  <li key={c.id} className="px-3 py-2 text-sm">
                    <span className="mr-2 text-xs font-bold text-slate-400">{c.group}</span>
                    {c.question}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
