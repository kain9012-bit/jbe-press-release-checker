import { useState } from 'react';
import { X, KeyRound, ShieldCheck, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import {
  DEFAULT_MODEL,
  KEY_HELP,
  PROVIDER_LABEL,
  listModels,
  type AiConfig,
  type Provider,
} from '../lib/ai';
import { BTN_PRIMARY, BTN_GHOST } from './Ui';

interface Props {
  value: AiConfig;
  onSave: (v: AiConfig) => void;
  onClose: () => void;
}

export default function SettingsModal({ value, onSave, onClose }: Props) {
  const [cfg, setCfg] = useState<AiConfig>(value);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');

  async function loadModels() {
    setLoading(true);
    setListError('');
    try {
      const list = await listModels(cfg);
      setModels(list);
      // 지금 적힌 이름이 목록에 없으면(없어진 모형이면) 첫 번째로 바꿔 준다
      if (list.length > 0 && !list.includes(cfg.model)) setCfg({ ...cfg, model: list[0] });
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setModels([]);
    } finally {
      setLoading(false);
    }
  }

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
              className="w-full h-11 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-800"
              value={cfg.provider}
              onChange={(e) => {
                const p = e.target.value as Provider;
                setCfg({ ...cfg, provider: p, model: DEFAULT_MODEL[p] });
                setModels([]);
                setListError('');
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
              className="w-full h-11 px-3 rounded-md border border-slate-300 bg-white font-mono text-sm text-slate-800 outline-none focus:border-blue-600"
              placeholder={KEY_HELP[cfg.provider]}
              value={cfg.apiKey}
              onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">{KEY_HELP[cfg.provider]}</p>
          </div>

          <div>
            <div className="mb-1.5 flex items-end justify-between gap-2">
              <label className="block text-sm font-bold text-slate-700" htmlFor="model">
                모형
              </label>
              <button
                type="button"
                onClick={loadModels}
                disabled={loading || !cfg.apiKey.trim()}
                className="flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-800 disabled:text-slate-400"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                )}
                쓸 수 있는 모형 불러오기
              </button>
            </div>

            {models.length > 0 ? (
              <select
                id="model"
                className="w-full h-11 px-3 rounded-md border border-slate-300 bg-white font-mono text-sm text-slate-800"
                value={cfg.model}
                onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="model"
                type="text"
                className="w-full h-11 px-3 rounded-md border border-slate-300 bg-white font-mono text-sm text-slate-800 outline-none focus:border-blue-600"
                value={cfg.model}
                onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
              />
            )}

            {listError ? (
              <p className="mt-1.5 flex gap-1.5 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" aria-hidden />
                <span className="break-all">목록을 받지 못했습니다 — {listError}</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                {models.length > 0
                  ? `${models.length}개를 받아 왔습니다. 값싸고 빠른 것(flash·mini 계열)으로도 충분합니다.`
                  : '모형 이름은 회사 사정으로 수시로 없어집니다. 키를 넣고 위 단추를 누르면 지금 쓸 수 있는 것만 골라 줍니다.'}
              </p>
            )}
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
