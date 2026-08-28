import React from 'react';
import { SpellCheck, Settings } from 'lucide-react';

export type Tab = 'check' | 'criteria' | 'cases';

const TABS: { id: Tab; label: string }[] = [
  { id: 'check', label: '검토' },
  { id: 'criteria', label: '평가 기준' },
  { id: 'cases', label: '고친 사례' },
];

interface Props {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  onOpenSettings: () => void;
  /** 규칙이 어느 시점 자료 기준인지 */
  dataAsOf?: string;
}

export const Header: React.FC<Props> = ({ activeTab, setActiveTab, onOpenSettings, dataAsOf }) => (
  <header className="bg-white sticky top-0 z-30 border-b border-slate-200">
    {/* 안내 띠 — 공식 평가가 아님을 먼저 밝힌다 (KRDS 마스트헤드 관례) */}
    <div className="bg-slate-50 text-slate-600 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <span>
          국립국어원 공개 기준을 옮겨 담은{' '}
          <strong className="font-bold text-slate-900">비공식</strong> 자가검증 도구입니다
        </span>
        {dataAsOf && <span className="shrink-0">기준 자료 {dataAsOf}</span>}
      </div>
    </div>

    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6">
        <button
          type="button"
          onClick={() => setActiveTab('check')}
          className="flex items-center gap-2.5 py-3.5 text-left group shrink-0"
        >
          <span className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0 group-hover:bg-blue-700 transition-colors">
            <SpellCheck className="w-5 h-5" aria-hidden="true" />
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-900 whitespace-nowrap">
              보도자료 공공언어 검증
            </span>
            <span className="hidden sm:inline text-xs font-medium text-slate-400 whitespace-nowrap">
              전북특별자치도교육청
            </span>
          </span>
        </button>

        <div className="flex items-center gap-1 w-full sm:w-auto">
          <nav aria-label="주 메뉴" className="-mb-px flex-1 sm:flex-none">
            <ul className="flex overflow-x-auto overflow-y-hidden no-scrollbar" role="tablist">
              {TABS.map(({ id, label }) => {
                const on = activeTab === id;
                return (
                  <li key={id} role="presentation" className="shrink-0">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setActiveTab(id)}
                      className={`px-3.5 sm:px-4 py-4 text-base font-bold whitespace-nowrap
                                  border-b-[3px] transition-colors ${
                                    on
                                      ? 'text-blue-700 border-blue-600'
                                      : 'text-slate-600 border-transparent hover:text-slate-900'
                                  }`}
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="AI 검토 설정"
            className="shrink-0 p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </header>
);
