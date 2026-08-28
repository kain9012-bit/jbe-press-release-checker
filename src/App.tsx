import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCheck,
  Copy,
  Download,
  FileDown,
  FileText,
  FileUp,
  Loader2,
  RotateCcw,
  Settings,
  Sparkles,
} from 'lucide-react';
import Highlight from './components/Highlight';
import SettingsModal from './components/SettingsModal';
import CriteriaView from './components/CriteriaView';
import CasesView from './components/CasesView';
import MetaForm from './components/MetaForm';
import { CHECKLIST } from './data/checklist';
import {
  analyze,
  buildRevised,
  defaultDecisions,
  isApplicable,
  DATA_COUNTS,
  type AnalyzeResult,
  type Decision,
  type Finding,
} from './lib/analyze';
import { DEFAULT_MODEL, reviewWithAi, type AiConfig } from './lib/ai';
import { parsePressRelease } from './lib/hwp';
import { buildHwpx, defaultFileName, EMPTY_META, type ReleaseMeta } from './lib/hwpxOut';
import { composeSource, decompose, splitPastedText, type Doc } from './lib/doc';

type Tab = '검토' | '기준' | '사례';
const TABS: Tab[] = ['검토', '기준', '사례'];
const AXES = ['용이성', '정확성', '소통성'] as const;

const AXIS_TONE: Record<string, { chip: string; bar: string; text: string }> = {
  용이성: { chip: 'bg-blue-50 text-blue-700 border-blue-200', bar: 'bg-blue-600', text: 'text-blue-700' },
  정확성: { chip: 'bg-red-50 text-red-700 border-red-200', bar: 'bg-red-500', text: 'text-red-700' },
  소통성: { chip: 'bg-amber-50 text-amber-800 border-amber-200', bar: 'bg-amber-500', text: 'text-amber-800' },
};

const CFG_KEY = 'prc.ai.config.v1';

function loadCfg(): AiConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) return JSON.parse(raw) as AiConfig;
  } catch {
    /* 저장소를 못 쓰는 브라우저도 있다 */
  }
  return { provider: 'anthropic', apiKey: '', model: DEFAULT_MODEL.anthropic };
}

export default function App() {
  const [tab, setTab] = useState<Tab>('검토');
  const [inputMode, setInputMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [meta, setMeta] = useState<ReleaseMeta>(EMPTY_META);
  const [body, setBody] = useState<string[]>([]);
  const [fileNote, setFileNote] = useState<{ kind: 'ok' | 'fail'; msg: string } | null>(null);
  const [reading, setReading] = useState(false);

  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [source, setSource] = useState('');
  const [baseDoc, setBaseDoc] = useState<Doc | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [aiFindings, setAiFindings] = useState<Finding[]>([]);
  const [aiSummary, setAiSummary] = useState('');
  const [aiState, setAiState] = useState<'idle' | 'run' | 'done' | 'fail'>('idle');
  const [aiError, setAiError] = useState('');
  const [cfg, setCfg] = useState<AiConfig>(loadCfg);
  const [showCfg, setShowCfg] = useState(false);
  const [filter, setFilter] = useState<'전체' | (typeof AXES)[number]>('전체');
  const [active, setActive] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [exportError, setExportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    } catch {
      /* 무시 */
    }
  }, [cfg]);

  const findings = useMemo(
    () => [...(result?.findings ?? []), ...aiFindings].sort((a, b) => a.start - b.start),
    [result, aiFindings],
  );
  const shown = useMemo(
    () => findings.filter((f) => filter === '전체' || f.axis === filter),
    [findings, filter],
  );
  const revised = useMemo(
    () => (result ? buildRevised(source, findings, decisions) : ''),
    [result, source, findings, decisions],
  );
  /** 수정본을 제목·부제·본문으로 되돌린 것 */
  const revisedDoc = useMemo(() => {
    if (!baseDoc) return null;
    const d = decompose(revised, baseDoc);
    if (!d) return null;
    return { meta: { ...d.meta, ...pickHeaderOnly(meta) }, body: d.body };
  }, [revised, baseDoc, meta]);

  /* 머리말(배포일·부서·담당자)은 결과 화면에서 고쳐도 검사 대상이 아니므로 그대로 얹는다 */
  function pickHeaderOnly(m: ReleaseMeta) {
    const { 배포일, 보도시점, 사진, 영상, 부서, 과장, 담당, 장학사 } = m;
    return { 배포일, 보도시점, 사진, 영상, 부서, 과장, 담당, 장학사 };
  }

  /* ---------------- 파일 읽기 ---------------- */

  async function readFile(file: File) {
    setReading(true);
    setFileNote(null);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const r = parsePressRelease(buf);
      if (!r.ok) {
        setFileNote({ kind: 'fail', msg: r.error || '보도자료 내용을 찾지 못했습니다.' });
        return;
      }
      setMeta((m) => ({
        ...m,
        배포일: r.배포일 || m.배포일,
        보도시점: r.보도시점 || m.보도시점,
        사진: r.사진 || m.사진,
        영상: r.영상 || m.영상,
        제목: r.제목,
        부제: r.부제,
        부서: r.부서 || m.부서,
        과장: r.과장 || m.과장,
        담당: r.담당 || m.담당,
        장학사: r.장학사 || m.장학사,
      }));
      setBody(r.본문);
      setText([r.제목, ...r.부제, ...r.본문].join('\n'));
      setFileNote({
        kind: 'ok',
        msg: `${file.name} — ${r.서식}, 제목 1줄 · 부제 ${r.부제.length}줄 · 본문 ${r.본문.length}문단을 읽었습니다.`,
      });
    } catch (e) {
      setFileNote({ kind: 'fail', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setReading(false);
    }
  }

  /* ---------------- 검토 ---------------- */

  function run() {
    let doc: Doc;
    if (inputMode === 'file' && body.length) {
      doc = { meta, body };
    } else {
      const t = text.trim();
      if (!t) return;
      const split = splitPastedText(t);
      const nextMeta: ReleaseMeta = {
        ...meta,
        제목: meta.제목.trim() || split.제목,
        부제: meta.부제.filter((s) => s.trim()),
      };
      const nextBody = meta.제목.trim() ? [split.제목, ...split.본문] : split.본문;
      doc = { meta: nextMeta, body: nextBody };
      setMeta(nextMeta);
      setBody(nextBody);
    }

    const src = composeSource(doc);
    if (!src.trim()) return;
    const r = analyze(src);
    setBaseDoc(doc);
    setSource(src);
    setResult(r);
    setDecisions(defaultDecisions(r.findings));
    setAiFindings([]);
    setAiSummary('');
    setAiState('idle');
    setAiError('');
    setActive(null);
    setExportError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function runAi() {
    if (!result || !cfg.apiKey) {
      setShowCfg(true);
      return;
    }
    setAiState('run');
    setAiError('');
    try {
      const r = await reviewWithAi(cfg, source, result.findings);
      setAiFindings(r.findings);
      setAiSummary(r.summary);
      setDecisions((d) => {
        const next = { ...d };
        for (const f of r.findings) next[f.key] = { on: false, pick: 0 };
        return next;
      });
      setAiState('done');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
      setAiState('fail');
    }
  }

  /* ---------------- 내보내기 ---------------- */

  function copy(what: string, label: string) {
    navigator.clipboard.writeText(what).then(
      () => {
        setCopied(label);
        setTimeout(() => setCopied(''), 1800);
      },
      () => setCopied('실패'),
    );
  }

  function saveBlob(name: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    // 브라우저가 파일 이름을 읽어 갈 틈을 준 뒤에 치운다
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function downloadHwpx() {
    setExportError('');
    const d = revisedDoc ?? (baseDoc ? { meta: { ...baseDoc.meta, ...pickHeaderOnly(meta) }, body: baseDoc.body } : null);
    if (!d) return;
    try {
      const bytes = buildHwpx(d.meta, d.body);
      saveBlob(defaultFileName(d.meta), new Blob([bytes as unknown as BlobPart], { type: 'application/hwp+zip' }));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  }

  /* ---------------- 점검표 ---------------- */

  const checklist = useMemo(
    () =>
      CHECKLIST.map((c) => ({
        ...c,
        hits: findings.filter((f) => c.match.some((m) => f.sub.includes(m))),
      })),
    [findings],
  );

  const checklistText = useMemo(() => {
    const lines = [
      '보도자료 공공언어 자가점검표',
      `작성 시각: ${new Date().toLocaleString('ko-KR')}`,
      `제목: ${meta.제목}`,
      `분량: ${result?.wordCount ?? 0}어절 / ${result?.charCount ?? 0}자`,
      '',
      ...AXES.map((a) => {
        const b = result?.byAxis[a];
        return `[${a}] 지적 ${findings.filter((f) => f.axis === a).length}건 · 어절 수 대비 ${
          b ? b.rate.toFixed(2) : '0.00'
        }%`;
      }),
      '',
      '── 공공언어의 요건 점검 ──',
      ...checklist.map(
        (c) =>
          `[${c.match.length === 0 ? '–' : c.hits.length === 0 ? '○' : '△'}] ${c.area}·${c.group} ${
            c.question
          }${c.hits.length ? `  (지적 ${c.hits.length}건)` : ''}`,
      ),
      '',
      '※ ○ 는 자동 검사에서 걸린 것이 없다는 뜻이고, 지켰다는 보증이 아닙니다.',
      '※ 단락 구성·정보의 양과 배열·시각적 편의는 자동 검사 대상이 아니므로 작성자가 직접 확인하세요.',
    ];
    return lines.join('\n');
  }, [checklist, findings, result, meta.제목]);

  const btnGhost =
    'flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50';

  return (
    <div className="min-h-screen bg-slate-50">
      <a href="#main" className="krds-skip">
        본문 바로가기
      </a>

      <div className="bg-slate-800 text-center text-xs text-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-1.5 sm:px-6 lg:px-8">
          이 도구는 공식 평가 시스템이 아닙니다. 국립국어원이 공개한 기준을 옮겨 담은 자가검증용 보조
          도구이며, 최종 판단은 작성자와 대변인실이 합니다.
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setTab('검토')}
            className="flex shrink-0 items-center gap-2 py-3.5 text-left"
          >
            <FileText className="h-5 w-5 text-blue-600" aria-hidden />
            <span className="text-lg font-bold tracking-tight">보도자료 공공언어 자가검증</span>
          </button>
          <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto" aria-label="주요 메뉴">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`shrink-0 border-b-[3px] px-3 py-3.5 text-sm font-bold ${
                  tab === t
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCfg(true)}
              className="ml-1 shrink-0 rounded-md p-2 text-slate-600 hover:bg-slate-100"
              aria-label="AI 검토 설정"
            >
              <Settings className="h-5 w-5" aria-hidden />
            </button>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {tab === '기준' && <CriteriaView />}
        {tab === '사례' && <CasesView />}

        {/* ------------------ 입력 화면 ------------------ */}
        {tab === '검토' && !result && (
          <div className="mx-auto max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              보도자료 초안을 넣으면 고칠 곳을 짚어 드립니다
            </h1>
            <p className="mt-3 text-slate-600">
              글을 붙여 넣어도 되고 쓰던 한글 파일(.hwp, .hwpx)을 올려도 됩니다. 어느 쪽이든 결과는
              전북교육청 보도자료 양식이 적용된 <b>hwpx 파일</b>로 받습니다. 원고는 브라우저 안에서만
              처리되고 어디로도 올라가지 않습니다.
            </p>

            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
              <div className="mb-4 flex gap-1.5">
                {(
                  [
                    ['text', '글 붙여넣기'],
                    ['file', '한글 파일 올리기'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setInputMode(k)}
                    className={`rounded-full border px-4 py-1.5 text-sm ${
                      inputMode === k
                        ? 'border-blue-600 bg-blue-600 font-bold text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-blue-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {inputMode === 'text' ? (
                <>
                  <label htmlFor="draft" className="mb-2 block font-bold">
                    보도자료 초안
                  </label>
                  <p className="mb-2 text-sm text-slate-500">
                    첫 줄을 제목으로, 나머지 줄을 본문 문단으로 봅니다. 아래 정보 칸에서 고칠 수 있습니다.
                  </p>
                  <textarea
                    id="draft"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={14}
                    placeholder="제목부터 본문까지 그대로 붙여 넣으세요."
                    className="w-full resize-y rounded-md border border-slate-300 p-3 leading-relaxed"
                  />
                </>
              ) : (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".hwp,.hwpx"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void readFile(f);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) void readFile(f);
                    }}
                    className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-6 py-12 hover:border-blue-600 hover:bg-blue-50"
                  >
                    {reading ? (
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
                    ) : (
                      <FileUp className="h-8 w-8 text-slate-400" aria-hidden />
                    )}
                    <span className="font-bold text-slate-700">
                      {reading ? '읽는 중…' : '한글 파일을 끌어다 놓거나 눌러서 고르세요'}
                    </span>
                    <span className="text-sm text-slate-500">.hwp · .hwpx — 파일은 올라가지 않습니다</span>
                  </button>

                  {fileNote && (
                    <p
                      className={`mt-3 rounded-md border p-3 text-sm ${
                        fileNote.kind === 'ok'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-red-200 bg-red-50 text-red-800'
                      }`}
                    >
                      {fileNote.msg}
                    </p>
                  )}

                  {body.length > 0 && (
                    <div className="mt-4">
                      <label htmlFor="bodytext" className="mb-1 block text-sm font-bold text-slate-700">
                        읽어 온 본문 <span className="font-normal text-slate-500">한 줄에 한 문단</span>
                      </label>
                      <textarea
                        id="bodytext"
                        rows={8}
                        className="w-full resize-y rounded-md border border-slate-300 p-3 text-sm leading-relaxed"
                        value={body.join('\n')}
                        onChange={(e) => setBody(e.target.value.split('\n'))}
                      />
                    </div>
                  )}
                </div>
              )}

              <details className="mt-5 rounded-md border border-slate-200 p-4" open={inputMode === 'file'}>
                <summary className="cursor-pointer font-bold">
                  보도자료 정보{' '}
                  <span className="text-sm font-normal text-slate-500">
                    hwpx 머리말 표에 들어갑니다
                  </span>
                </summary>
                <div className="mt-4">
                  <MetaForm value={meta} onChange={setMeta} />
                </div>
              </details>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-slate-500">
                  {inputMode === 'file'
                    ? body.length
                      ? `본문 ${body.length}문단`
                      : '아직 파일을 올리지 않았습니다'
                    : text.trim()
                      ? `${text.trim().split(/\s+/).length}어절 · ${text.length}자`
                      : '아직 비어 있습니다'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setText(SAMPLE);
                      setInputMode('text');
                    }}
                    className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    예시 넣기
                  </button>
                  <button
                    type="button"
                    onClick={run}
                    disabled={inputMode === 'file' ? body.length === 0 : !text.trim()}
                    className="flex items-center gap-1.5 rounded-md bg-blue-600 px-6 py-2.5 font-bold text-white hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    검토하기
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------ 결과 화면 ------------------ */}
        {tab === '검토' && result && (
          <div className="space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold">검토 결과</h1>
                  <p className="mt-1 text-sm text-slate-600">
                    {result.wordCount.toLocaleString()}어절 · {result.charCount.toLocaleString()}자 ·
                    지적 {findings.length}건
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={runAi}
                    disabled={aiState === 'run'}
                    className="flex items-center gap-1.5 rounded-md border border-blue-600 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                  >
                    {aiState === 'run' ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden />
                    )}
                    {aiState === 'run' ? '검토 중' : 'AI 문맥 검토 추가'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null);
                      setAiFindings([]);
                      setAiSummary('');
                    }}
                    className={btnGhost}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    다시 넣기
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {AXES.map((a) => {
                  const n = findings.filter((f) => f.axis === a).length;
                  const rate = result.byAxis[a].rate;
                  return (
                    <div key={a} className="rounded-md border border-slate-200 p-4">
                      <div className="flex items-baseline justify-between">
                        <span className={`font-bold ${AXIS_TONE[a].text}`}>{a}</span>
                        <span className="text-2xl font-bold tabular-nums">{n}</span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                        <div
                          className={`h-1.5 rounded-full ${AXIS_TONE[a].bar}`}
                          style={{ width: `${Math.min(100, rate * 10)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">어절 수 대비 {rate.toFixed(2)}%</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                실제 평가는 어절 수 대비 오류 비율로 점수를 매깁니다(용이성 60%, 정확성 30%). 여기 나오는
                비율은 자동 검사로 걸린 것만 센 참고치이고, 실제 배점 산식과는 다릅니다.
              </p>

              {aiState === 'fail' && (
                <p className="mt-4 flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    AI 검토를 하지 못했습니다. 키와 모형 이름을 확인해 주세요.
                    <br />
                    <span className="font-mono text-xs break-all">{aiError}</span>
                  </span>
                </p>
              )}
              {aiSummary && (
                <p className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-slate-800">
                  <b className="mr-1 text-blue-700">AI 총평</b>
                  {aiSummary}
                </p>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <h2 className="mb-3 font-bold">원문</h2>
                <Highlight text={source} findings={findings} activeKey={active} onPick={setActive} />
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {(['전체', ...AXES] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`rounded-full border px-3 py-1.5 text-sm ${
                        filter === f
                          ? 'border-blue-600 bg-blue-600 font-bold text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-blue-600'
                      }`}
                    >
                      {f}
                      {f !== '전체' && ` ${findings.filter((x) => x.axis === f).length}`}
                    </button>
                  ))}
                </div>

                {shown.length === 0 ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-800">
                    이 항목에서는 걸린 것이 없습니다.
                  </p>
                ) : (
                  <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                    {shown.map((f) => {
                      const d = decisions[f.key] ?? { on: false, pick: 0 };
                      const can = isApplicable(f.fixes[d.pick] ?? '');
                      return (
                        <li
                          key={f.key}
                          className={`rounded-lg border bg-white p-4 ${
                            active === f.key ? 'border-slate-900' : 'border-slate-200'
                          }`}
                          onClick={() => setActive(f.key)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`rounded border px-2 py-0.5 text-xs font-bold ${AXIS_TONE[f.axis].chip}`}
                            >
                              {f.axis}
                            </span>
                            <span
                              className={`text-xs font-bold ${
                                f.severity === '오류' ? 'text-red-600' : 'text-amber-700'
                              }`}
                            >
                              {f.severity}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{f.sub}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                            <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">{f.text}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">
                              {f.fixes[d.pick]}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.why}</p>
                          <p className="mt-1 text-xs text-slate-400">{f.src}</p>

                          {f.fixes.length > 1 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {f.fixes.map((x, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setDecisions((s) => ({ ...s, [f.key]: { ...d, pick: i } }))}
                                  className={`rounded border px-2 py-0.5 text-xs ${
                                    d.pick === i
                                      ? 'border-blue-600 bg-blue-50 font-bold text-blue-700'
                                      : 'border-slate-300 text-slate-600'
                                  }`}
                                >
                                  {x}
                                </button>
                              ))}
                            </div>
                          )}

                          <label
                            className={`mt-3 flex items-center gap-2 text-sm ${
                              can ? 'text-slate-700' : 'text-slate-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={!can}
                              checked={d.on && can}
                              onChange={(e) =>
                                setDecisions((s) => ({ ...s, [f.key]: { ...d, on: e.target.checked } }))
                              }
                              className="h-4 w-4"
                            />
                            {can ? '수정본에 반영' : '수정본 자동 반영 불가 — 직접 고쳐야 합니다'}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            {/* 수정본 + 내보내기 */}
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold">반영한 수정본</h2>
                  <p className="text-sm text-slate-600">
                    체크한 {Object.values(decisions).filter((d) => d.on).length}건을 갈아 끼운 글입니다.
                    문맥을 봐야 하는 항목은 자동으로 넣지 않습니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => copy(revised, '수정본')} className={btnGhost}>
                    {copied === '수정본' ? (
                      <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                    복사
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      saveBlob(
                        '보도자료_수정본.txt',
                        new Blob([revised], { type: 'text/plain;charset=utf-8' }),
                      )
                    }
                    className={btnGhost}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    txt
                  </button>
                  <button
                    type="button"
                    onClick={downloadHwpx}
                    className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                  >
                    <FileDown className="h-4 w-4" aria-hidden />
                    hwpx로 내려받기
                  </button>
                </div>
              </div>

              {exportError && (
                <p className="mb-3 flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  hwpx를 만들지 못했습니다: {exportError}
                </p>
              )}
              {!revisedDoc && (
                <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  수정본의 문단 수가 원문과 달라 제목·부제 위치를 자동으로 되돌리지 못했습니다. 아래
                  정보 칸에서 확인한 뒤 내려받으세요.
                </p>
              )}

              <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-4 font-sans text-base leading-[1.9]">
                {revised}
              </pre>

              <details className="mt-4 rounded-md border border-slate-200 p-4">
                <summary className="cursor-pointer font-bold">
                  hwpx 머리말 정보{' '}
                  <span className="text-sm font-normal text-slate-500">
                    배포일·부서·담당자 — 내려받기 전에 채워 주세요
                  </span>
                </summary>
                <div className="mt-4">
                  <MetaForm value={meta} onChange={setMeta} lockTitle />
                  <p className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-600">
                    제목: <b>{revisedDoc?.meta.제목 || meta.제목 || '(없음)'}</b>
                    {(revisedDoc?.meta.부제 ?? meta.부제).filter(Boolean).length > 0 && (
                      <>
                        <br />
                        부제: {(revisedDoc?.meta.부제 ?? meta.부제).filter(Boolean).join(' / ')}
                      </>
                    )}
                    <br />
                    본문 {(revisedDoc?.body ?? body).filter((b) => b.trim()).length}문단 · 파일명{' '}
                    <span className="font-mono">
                      {defaultFileName({ ...meta, 제목: revisedDoc?.meta.제목 || meta.제목 })}
                    </span>
                  </p>
                </div>
              </details>
            </section>

            {/* 점검표 */}
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-bold">
                  <ClipboardCheck className="h-5 w-5 text-blue-600" aria-hidden />
                  자동 생성 점검표
                </h2>
                <div className="flex gap-2">
                  <button type="button" onClick={() => copy(checklistText, '점검표')} className={btnGhost}>
                    {copied === '점검표' ? (
                      <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                    복사
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      saveBlob(
                        '보도자료_점검표.txt',
                        new Blob([checklistText], { type: 'text/plain;charset=utf-8' }),
                      )
                    }
                    className={btnGhost}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    내려받기
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-slate-100">
                {checklist.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 py-2.5">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        c.match.length === 0
                          ? 'bg-slate-100 text-slate-500'
                          : c.hits.length === 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {c.match.length === 0 ? '–' : c.hits.length === 0 ? '○' : '△'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="mr-2 text-xs font-bold text-slate-400">
                          {c.area}·{c.group}
                        </span>
                        {c.question}
                      </p>
                      {c.hits.length > 0 && (
                        <p className="mt-0.5 text-xs text-amber-800">
                          지적 {c.hits.length}건 — {c.hits.slice(0, 5).map((h) => h.text).join(', ')}
                          {c.hits.length > 5 && ' …'}
                        </p>
                      )}
                      {c.match.length === 0 && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          자동 검사 대상이 아닙니다. 작성자가 직접 확인하세요.
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </main>

      <footer className="mt-12 bg-slate-900 text-slate-300">
        <div className="mx-auto max-w-7xl space-y-2 px-4 py-8 text-sm sm:px-6 lg:px-8">
          <p className="font-bold text-white">근거 자료</p>
          <p>
            2026년 공공기관등 공문서등 평가 설명회 발표 자료(문화체육관광부 국어정책과·국립국어원, 2026.
            3. 10.)
          </p>
          <p>개정판 한눈에 알아보는 공공언어 바로 쓰기(국립국어원, 2022)</p>
          <p>2026년 용이성 평가용 용어 목록({DATA_COUNTS.terms.toLocaleString()}개, 2026. 8. 기준)</p>
          <p>보도자료 양식: 전북특별자치도교육청 공식 hwpx 서식</p>
          <p className="pt-3 text-xs text-slate-400">
            공식 평가 결과가 아닙니다. 원고와 올린 파일은 브라우저 안에서만 처리하며, AI 검토를 켠
            경우에만 사용자가 지정한 사업자의 서버로 전송됩니다.
          </p>
        </div>
      </footer>

      {showCfg && (
        <SettingsModal
          value={cfg}
          onSave={(v) => {
            setCfg(v);
            setShowCfg(false);
          }}
          onClose={() => setShowCfg(false)}
        />
      )}
    </div>
  );
}

const SAMPLE = `○○교육청, AI 기반 스마트 스쿨 구축 워크샵 개최
○○교육청은 오는 3월 15일 도교육청 대강당에서 관내 초·중등 교사 200여 명을 대상으로 'AI 기반 스마트 스쿨 구축 워크샵'을 개최한다고 밝혔다.
이번 워크샵은 미래교육 인프라 구축을 위한 로드맵을 공유하고 현장 교사들의 니즈를 수렴하기 위해 마련되었으며, 교육부의 디지털 전환 정책에 발맞춰 학교 현장의 디지털 리터러시를 제고시키고 학생 개개인의 맞춤형 학습을 지원하는 플랫폼 구축 방안을 논의하는 자리로 마련되었다.
주요 프로그램은 AI 교육 우수사례 공유, 에듀테크 기업의 솔루션 데모데이, 교사 라운드 테이블 등이다. 특히 올해는 거버넌스 구축을 위해 일반인도 참여할 수 있는 세션을 시범적으로 운영한다.
교육청 관계자는 "금일 논의된 내용은 차년도 사업 계획에 반영될 예정"이라며 "참석 대상자는 3월 10일 까지 신청서를 제출할 것"이라고 말했다.
한편 이번 사업은 지난해 시범 운영을 통해 참여 만족도 92%를 기록한 바 있으며, 올해는 실천률을 높이기 위해 컨설팅단을 운영한다.`;
