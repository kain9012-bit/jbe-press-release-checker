import { useState } from 'react';
import { X, KeyRound, ShieldCheck } from 'lucide-react';
import { DEFAULT_MODEL, KEY_HELP, PROVIDER_LABEL, type AiConfig, type Provider } from '../lib/ai';
import { BTN_PRIMARY, BTN_GHOST } from './Ui';

interface Props {
  value: AiConfig;
  onSave: (v: AiConfig) => void;
  onClose: () => void;
}

export default function SettingsModal({ value, onSave, onClose }: Props) {
  const [cfg, setCfg] = useState<AiConfig>(value);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI 검토 설정"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <KeyRound className="h-5 w-5 text-blue-600" aria-hidden />
            AI 문맥 검토 설정
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <p className="flex gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
            <span>
              키는 이 브라우저에만 저장되고 서버로 보내지 않습니다. 검토를 누를 때 원고가 선택한 회사의
              모형에 직접 전송되므로, <b>대외비 원고는 키를 넣지 말고 규칙 검사만</b> 쓰시기 바랍니다.
            </span>
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700" htmlFor="provider">
              어디에 물어볼까요
            </label>
            <select
              id="provider"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={cfg.provider}
              onChange={(e) => {
                const p = e.target.value as Provider;
                setCfg({ ...cfg, provider: p, model: DEFAULT_MODEL[p] });
              }}
            >
              {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700" htmlFor="apikey">
              API 키
            </label>
            <input
              id="apikey"
              type="password"
              autoComplete="off"
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              placeholder={KEY_HELP[cfg.provider]}
              value={cfg.apiKey}
              onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">{KEY_HELP[cfg.provider]}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700" htmlFor="model">
              모형 이름
            </label>
            <input
              id="model"
              type="text"
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              value={cfg.model}
              onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">
              쓸 수 있는 모형 이름은 회사마다 다르고 자주 바뀝니다. 오류가 나면 이 칸을 고치세요.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={() => {
              setCfg({ ...cfg, apiKey: '' });
              onSave({ ...cfg, apiKey: '' });
            }}
            className={BTN_GHOST}
          >
            키 지우기
          </button>
          <button
            type="button"
            onClick={() => onSave(cfg)}
            className={BTN_PRIMARY}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
