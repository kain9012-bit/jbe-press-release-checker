import React from 'react';

/**
 * 화면 공통 조각.
 *
 * jbe-weekly-policy-meeting 의 `src/components/Ui.tsx` 와 같은 규격을 쓴다.
 * 내가 만드는 웹 화면은 한 벌처럼 보여야 하므로 여기서 벗어나지 않는다.
 */

export type Tone = 'blue' | 'slate' | 'amber' | 'green' | 'red';

/** 항목·상태 배지 — KRDS 색 토큰 위에서 쓰는 공통 조각 */
export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode }> = ({
  tone = 'slate',
  children,
}) => {
  const cls = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    green: 'bg-green-50 text-green-700 border-green-100',
    red: 'bg-red-50 text-red-700 border-red-200',
  }[tone];
  return (
    <span className={`px-2 py-0.5 rounded border text-xs font-bold whitespace-nowrap ${cls}`}>
      {children}
    </span>
  );
};

export const SectionTitle: React.FC<{
  children: React.ReactNode;
  count?: number;
  unit?: string;
  desc?: string;
}> = ({ children, count, unit = '건', desc }) => (
  <div className="flex items-baseline gap-2 flex-wrap">
    <h3 className="text-lg font-bold text-slate-900">{children}</h3>
    {count !== undefined && (
      <span className="text-sm font-bold text-blue-700 tabular-nums">
        {count}
        {unit}
      </span>
    )}
    {desc && <span className="text-xs text-slate-500">{desc}</span>}
  </div>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc?: string;
  children?: React.ReactNode;
}> = ({ icon, title, desc, children }) => (
  <div className="bg-white rounded-lg border border-slate-200 p-12 text-center space-y-3">
    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
      {icon}
    </div>
    <h3 className="text-base font-bold text-slate-800">{title}</h3>
    {desc && <p className="text-sm text-slate-500 max-w-md mx-auto">{desc}</p>}
    {children}
  </div>
);

/** 지표 카드 */
export const Stat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  bar?: { ratio: number; tone: Tone };
}> = ({ icon, label, value, sub, bar }) => {
  const barCls = { blue: 'bg-blue-600', slate: 'bg-slate-500', amber: 'bg-amber-500', green: 'bg-green-600', red: 'bg-red-500' };
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {bar && (
        <div className="h-1.5 w-full rounded-full bg-slate-100">
          <div
            className={`h-1.5 rounded-full ${barCls[bar.tone]}`}
            style={{ width: `${Math.max(2, Math.min(100, bar.ratio))}%` }}
          />
        </div>
      )}
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
};

/** 알림 띠 — 자동 판정의 한계를 밝힐 때 쓴다 */
export const Notice: React.FC<{ tone?: 'amber' | 'blue' | 'red'; title: string; children?: React.ReactNode }> = ({
  tone = 'amber',
  title,
  children,
}) => {
  const cls = {
    amber: 'border-amber-300 bg-amber-50',
    blue: 'border-blue-200 bg-blue-50',
    red: 'border-red-200 bg-red-50',
  }[tone];
  return (
    <div role="note" className={`rounded-lg border p-4 space-y-1 ${cls}`}>
      <p className="font-bold text-slate-900 text-sm">{title}</p>
      {children && <div className="text-sm text-slate-700">{children}</div>}
    </div>
  );
};

/** 버튼 두 벌 — 화면마다 다르게 쓰지 않는다 */
export const BTN_PRIMARY =
  'inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-colors disabled:bg-slate-300';
export const BTN_GHOST =
  'inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-slate-300 hover:border-blue-600 hover:text-blue-700 text-slate-700 text-sm font-bold transition-colors disabled:opacity-50';
export const CARD = 'bg-white rounded-lg border border-slate-200';
