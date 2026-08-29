import { useState } from 'react';
import { X, KeyRound, ShieldCheck, RefreshCw, Loader2, AlertTriangle, CircleCheck, Plug, Server } from 'lucide-react';
import {
  DEFAULT_MODEL,
  KEY_HELP,
  PROVIDER_LABEL,
  listModels,
  testModel,
  compatUrl,
  isConfigured,
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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const compat = cfg.provider === 'compat';
  const ready = isConfigured(cfg);
  /** https 로 연 화면에서 http 주소를 부르면 브라우저가 막는다 */
  const mixed =
    compat &&
    location.protocol === 'https:' &&
    /^http:\/\//i.test((cfg.baseUrl ?? '').trim()) &&
    !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test((cfg.baseUrl ?? '').trim());

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await testModel(cfg);
      setTestResult({ ok: true, msg: `‘${cfg.model}’ 로 잘 불러왔습니다.` });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

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
      setTestResult(null);
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
            {compat ? (
              <span>
                키와 주소는 이 브라우저에만 저장됩니다. 검토를 누르면 원고가 <b>적어 넣은 그 서버로</b>{' '}
                전송됩니다. 사내망 안의 서버라면 원고가 밖으로 나가지 않지만, 바깥 주소를 적으면 그곳으로
                나갑니다. 주소를 다시 한 번 확인해 주세요.
              </span>
            ) : (
              <span>
                키는 이 브라우저에만 저장되고 서버로 보내지 않습니다. 검토를 누를 때 원고가 선택한 회사의
                모형에 직접 전송되므로, <b>대외비 원고는 키를 넣지 말고 규칙 검사만</b> 쓰시기 바랍니다.
              </span>
            )}
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
                setTestResult(null);
              }}
            >
              {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          {compat && (
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700" htmlFor="baseurl">
                서버 주소
              </label>
              <div className="relative">
                <Server
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  id="baseurl"
                  type="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="http://127.0.0.1:8000"
                  className="h-11 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 font-mono text-sm
                             text-slate-800 outline-none focus:border-blue-600"
                  value={cfg.baseUrl ?? ''}
                  onChange={(e) => {
                    setCfg({ ...cfg, baseUrl: e.target.value });
                    setModels([]);
                    setListError('');
                    setTestResult(null);
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                vLLM · Ollama · LiteLLM 처럼 OpenAI 규격을 따르는 서버면 됩니다.{' '}
                <code className="font-mono">/v1/chat/completions</code> 는 알아서 붙이니 주소만 적으면
                됩니다{cfg.baseUrl?.trim() ? ' — ' : '.'}
                {cfg.baseUrl?.trim() && (
                  <b className="font-mono text-slate-700">{compatUrl(cfg.baseUrl, 'chat/completions')}</b>
                )}
              </p>
              {mixed && (
                <p className="mt-1.5 flex gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    이 화면은 https 로 열려 있는데 서버 주소는 http 입니다. 브라우저가 막을 수 있습니다.
                    막히면 내려받은 <b>단일 html 파일</b>을 열어서 쓰시거나, 서버에 https 를 붙이세요.
                  </span>
                </p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700" htmlFor="apikey">
              API 키{compat && <span className="ml-1 font-normal text-slate-500">서버가 요구할 때만</span>}
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
                disabled={loading || !ready}
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
                onChange={(e) => {
                  setCfg({ ...cfg, model: e.target.value });
                  setTestResult(null);
                }}
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

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runTest}
                disabled={testing || !ready || !cfg.model.trim()}
                className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold
                           text-slate-700 hover:border-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plug className="w-3.5 h-3.5" aria-hidden />
                )}
                이 모형으로 시험 호출
              </button>
              <span className="text-xs text-slate-500">한 마디만 물어봅니다</span>
            </div>

            {testResult && (
              <p
                className={`mt-1.5 flex gap-1.5 rounded-md border p-2 text-xs ${
                  testResult.ok
                    ? 'border-green-100 bg-green-50 text-green-700'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {testResult.ok ? (
                  <CircleCheck className="mt-0.5 w-3.5 h-3.5 shrink-0" aria-hidden />
                ) : (
                  <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" aria-hidden />
                )}
                <span className="break-all">{testResult.msg}</span>
              </p>
            )}

            {listError ? (
              <p className="mt-1.5 flex gap-1.5 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" aria-hidden />
                <span className="break-all">목록을 받지 못했습니다 — {listError}</span>
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">
                {models.length > 0
                  ? compat
                    ? `서버에 올라와 있는 ${models.length}개를 받아 왔습니다. 고른 뒤 한 번 시험해 보세요.`
                    : `${models.length}개를 새 판 순서로 받아 왔습니다. 목록에 있어도 내 키로는 막혀 있는 것이 있으니, 고른 뒤 한 번 시험해 보세요. 값싸고 빠른 것(flash·mini 계열)으로 충분합니다.`
                  : compat
                    ? '서버 주소를 넣고 위 단추를 누르면 그 서버에 올라와 있는 모형을 받아 옵니다. 목록을 안 내주는 서버면 이름을 직접 적으세요.'
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
