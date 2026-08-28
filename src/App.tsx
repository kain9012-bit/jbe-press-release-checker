import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Check,
  ClipboardCheck,
  Copy,
  Download,
  FileDown,
  FileUp,
  Languages,
  Loader2,
  RotateCcw,
  ScrollText,
  SpellCheck,
  Sparkles,
  MessagesSquare,
} from 'lucide-react';
import { Header, type Tab } from './components/Header';
import Highlight from './components/Highlight';
import SectionNav from './components/SectionNav';
import SettingsModal from './components/SettingsModal';
import CriteriaView from './components/CriteriaView';
import CasesView from './components/CasesView';
import MetaForm from './components/MetaForm';
import { Badge, SectionTitle, Stat, Notice, BTN_PRIMARY, BTN_GHOST, CARD, type Tone } from './components/Ui';
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

const AXES = ['용이성', '정확성', '소통성'] as const;
type Axis = (typeof AXES)[number];

const AXIS_TONE: Record<Axis, Tone> = { 용이성: 'blue', 정확성: 'red', 소통성: 'amber' };
const AXIS_ICON: Record<Axis, React.ReactNode> = {
  용이성: <Languages className="w-3.5 h-3.5" aria-hidden="true" />,
  정확성: <SpellCheck className="w-3.5 h-3.5" aria-hidden="true" />,
  소통성: <MessagesSquare className="w-3.5 h-3.5" aria-hidden="true" />,
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
  const [tab, setTab] = useState<Tab>('check');
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
  const [filter, setFilter] = useState<'전체' | Axis>('전체');
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [tab]);

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

  /* 머리말(배포일·부서·담당자)은 검사 대상이 아니므로 폼 값을 그대로 얹는다 */
  const headerOnly = (m: ReleaseMeta) => ({
    배포일: m.배포일,
    보도시점: m.보도시점,
    사진: m.사진,
    영상: m.영상,
    부서: m.부서,
    과장: m.과장,
    담당: m.담당,
    장학사: m.장학사,
  });

  /** 수정본을 제목·부제·본문으로 되돌린 것 */
  const revisedDoc = useMemo(() => {
    if (!baseDoc) return null;
    const d = decompose(revised, baseDoc);
    if (!d) return null;
    return { meta: { ...d.meta, ...headerOnly(meta) }, body: d.body };
  }, [revised, baseDoc, meta]);

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
    const d =
      revisedDoc ??
      (baseDoc ? { meta: { ...baseDoc.meta, ...headerOnly(meta) }, body: baseDoc.body } : null);
    if (!d) return;
    try {
      const bytes = buildHwpx(d.meta, d.body);
      saveBlob(
        defaultFileName(d.meta),
        new Blob([bytes as unknown as BlobPart], { type: 'application/hwp+zip' }),
      );
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

  const readyToRun = inputMode === 'file' ? body.length > 0 : text.trim().length > 0;

  return (
    <div className="min-h-screen overflow-x-clip bg-white text-slate-800 font-sans antialiased flex flex-col selection:bg-blue-600 selection:text-white">
      <a href="#container" className="krds-skip">
        본문 바로가기
      </a>

      <Header
        activeTab={tab}
        setActiveTab={setTab}
        onOpenSettings={() => setShowCfg(true)}
        dataAsOf="2026. 8."
      />

      <main id="container" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === 'criteria' && <CriteriaView />}
        {tab === 'cases' && <CasesView />}

        {/* ------------------ 입력 화면 ------------------ */}
        {tab === 'check' && !result && (
          <div className="space-y-8 pb-12">
            {/* ── 입력 띠 ── */}
            <section
              data-section="초안 넣기"
              className="doc-section relative left-1/2 w-screen -translate-x-1/2 -mt-6
                         px-4 sm:px-6 lg:px-8 py-10 sm:py-14
                         bg-blue-50 border-b border-blue-100"
            >
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="text-center space-y-3">
                  <h2 className="text-3xl sm:text-[2.75rem] font-bold text-slate-900 leading-tight">
                    <span className="block sm:inline">보도자료를 내기 전에</span>{' '}
                    <span className="text-blue-700">공공언어부터 봅니다</span>
                  </h2>
                  <p className="text-base sm:text-lg text-slate-600">
                    글을 붙여 넣거나 쓰던 한글 파일을 올리면{' '}
                    <strong className="font-bold text-slate-900">고칠 곳</strong> ·
                    <strong className="font-bold text-slate-900"> 수정본</strong> ·
                    <strong className="font-bold text-slate-900"> 점검표</strong>를 만들고,
                    전북교육청 양식 hwpx로 돌려드립니다
                  </p>
                </div>

                <div className="flex justify-center gap-2">
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
                      className={`px-4 py-1.5 rounded-full border text-sm font-bold transition-colors ${
                        inputMode === k
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {inputMode === 'text' ? (
                  <div className="space-y-2">
                    <label htmlFor="draft" className="sr-only">
                      보도자료 초안
                    </label>
                    <textarea
                      id="draft"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={12}
                      placeholder="제목부터 본문까지 그대로 붙여 넣으세요."
                      className="w-full resize-y rounded-lg border-2 border-blue-600 bg-white p-4
                                 text-base leading-relaxed text-slate-900 placeholder-slate-400
                                 outline-none focus:border-blue-700"
                    />
                    <p className="text-sm text-slate-600">
                      첫 줄을 제목으로, 나머지 줄을 본문 문단으로 봅니다. 아래 ‘보도자료 정보’에서 고칠 수
                      있습니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
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
                      className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed
                                 border-blue-300 bg-white px-6 py-12 hover:border-blue-600 transition-colors"
                    >
                      {reading ? (
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" aria-hidden="true" />
                      ) : (
                        <FileUp className="w-8 h-8 text-slate-400" aria-hidden="true" />
                      )}
                      <span className="font-bold text-slate-800">
                        {reading ? '읽는 중…' : '한글 파일을 끌어다 놓거나 눌러서 고르세요'}
                      </span>
                      <span className="text-sm text-slate-500">
                        .hwp · .hwpx — 파일은 브라우저 밖으로 나가지 않습니다
                      </span>
                    </button>

                    {fileNote && (
                      <p
                        className={`rounded-lg border p-3 text-sm ${
                          fileNote.kind === 'ok'
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                      >
                        {fileNote.msg}
                      </p>
                    )}

                    {body.length > 0 && (
                      <div className="space-y-1.5">
                        <label htmlFor="bodytext" className="block text-sm font-bold text-slate-700">
                          읽어 온 본문{' '}
                          <span className="font-normal text-slate-500">한 줄에 한 문단</span>
                        </label>
                        <textarea
                          id="bodytext"
                          rows={8}
                          className="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm leading-relaxed"
                          value={body.join('\n')}
                          onChange={(e) => setBody(e.target.value.split('\n'))}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">
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
                      className="px-4 py-3 rounded-lg bg-white border border-blue-200 text-blue-700 font-bold hover:bg-blue-100 transition-colors"
                    >
                      예시 넣기
                    </button>
                    <button
                      type="button"
                      onClick={run}
                      disabled={!readyToRun}
                      className="h-12 px-6 sm:px-10 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300
                                 text-white font-bold text-lg rounded-lg transition-colors
                                 flex items-center gap-2 shrink-0"
                    >
                      <span>검토하기</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* ── 보도자료 정보 ── */}
            <section data-section="보도자료 정보" className="doc-section space-y-3">
              <SectionTitle desc="hwpx 머리말 표에 그대로 들어갑니다">보도자료 정보</SectionTitle>
              <div className={`${CARD} p-5`}>
                <MetaForm value={meta} onChange={setMeta} />
              </div>
            </section>

            {/* ── 무엇을 보는지 ── */}
            <section data-section="무엇을 보나" className="doc-section space-y-3">
              <SectionTitle desc="국립국어원 2026년 공문서등 평가 기준">무엇을 보나</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Stat
                  icon={AXIS_ICON.용이성}
                  label="용이성"
                  value={`${DATA_COUNTS.terms.toLocaleString()}개`}
                  sub="평가용 용어 목록 + 행정용어 100개 + 일본어 투 50개로 외국 글자·외래어를 대조"
                />
                <Stat
                  icon={AXIS_ICON.정확성}
                  label="정확성"
                  value={`${DATA_COUNTS.patterns}개`}
                  sub="두음 법칙·외래어 표기·띄어쓰기·괄호 뒤 조사·번역 투·이중 피동 규칙"
                />
                <Stat
                  icon={AXIS_ICON.소통성}
                  label="소통성"
                  value="권위·차별"
                  sub="고압적 표현과 차별적 표현, 지나치게 긴 문장"
                />
              </div>
            </section>
          </div>
        )}

        {/* ------------------ 결과 화면 ------------------ */}
        {tab === 'check' && result && (
          <div className="space-y-8 pb-12">
            {/* 요약 */}
            <section data-section="검토 결과" className="doc-section space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionTitle
                  count={findings.length}
                  desc={`${result.wordCount.toLocaleString()}어절 · ${result.charCount.toLocaleString()}자`}
                >
                  검토 결과
                </SectionTitle>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={runAi} disabled={aiState === 'run'} className={BTN_GHOST}>
                    {aiState === 'run' ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles className="w-4 h-4" aria-hidden="true" />
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
                    className={BTN_GHOST}
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden="true" />
                    다시 넣기
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {AXES.map((a) => (
                  <Stat
                    key={a}
                    icon={AXIS_ICON[a]}
                    label={a}
                    value={`${findings.filter((f) => f.axis === a).length}건`}
                    bar={{ ratio: result.byAxis[a].rate * 10, tone: AXIS_TONE[a] }}
                    sub={`어절 수 대비 ${result.byAxis[a].rate.toFixed(2)}%`}
                  />
                ))}
              </div>

              <p className="text-xs text-slate-500">
                실제 평가는 어절 수 대비 오류 비율로 점수를 매깁니다(용이성 60%, 정확성 30%). 여기 나오는
                비율은 자동 검사로 걸린 것만 센 참고치이고, 실제 배점 산식과는 다릅니다.
              </p>

              {aiState === 'fail' && (
                <Notice tone="red" title="AI 검토를 하지 못했습니다">
                  키와 모형 이름을 확인해 주세요.
                  <br />
                  <span className="font-mono text-xs break-all">{aiError}</span>
                </Notice>
              )}
              {aiSummary && (
                <Notice tone="blue" title="AI 총평">
                  {aiSummary}
                </Notice>
              )}
            </section>

            {/* 원문 + 지적 */}
            <section
              data-section="원문과 지적"
              className="doc-section grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]"
            >
              <div className="space-y-3">
                <SectionTitle desc="칠해진 곳을 누르면 오른쪽 지적과 이어집니다">원문</SectionTitle>
                <div className={`${CARD} p-5`}>
                  <Highlight text={source} findings={findings} activeKey={active} onPick={setActive} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {(['전체', ...AXES] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-full border text-sm font-bold transition-colors ${
                        filter === f
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-slate-300 text-slate-700 hover:border-blue-600'
                      }`}
                    >
                      {f}
                      {f !== '전체' && ` ${findings.filter((x) => x.axis === f).length}`}
                    </button>
                  ))}
                </div>

                {shown.length === 0 ? (
                  <div className={`${CARD} p-8 text-center`}>
                    <p className="font-bold text-slate-800">이 항목에서는 걸린 것이 없습니다</p>
                    <p className="mt-1 text-sm text-slate-500">
                      자동 검사에 안 걸렸다는 뜻이지, 규범을 지켰다는 보증은 아닙니다.
                    </p>
                  </div>
                ) : (
                  <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                    {shown.map((f) => {
                      const d = decisions[f.key] ?? { on: false, pick: 0 };
                      const can = isApplicable(f.fixes[d.pick] ?? '');
                      return (
                        <li
                          key={f.key}
                          onClick={() => setActive(f.key)}
                          className={`${CARD} p-4 cursor-pointer transition-colors ${
                            active === f.key ? 'border-blue-600' : 'hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <Badge tone={AXIS_TONE[f.axis as Axis]}>{f.axis}</Badge>
                            <Badge tone={f.severity === '오류' ? 'red' : 'amber'}>{f.severity}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{f.sub}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">{f.text}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                            <span className="px-1.5 py-0.5 rounded bg-green-50 font-bold text-green-700">
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
                                  className={`px-2 py-0.5 rounded border text-xs transition-colors ${
                                    d.pick === i
                                      ? 'border-blue-600 bg-blue-50 font-bold text-blue-700'
                                      : 'border-slate-300 text-slate-600 hover:border-blue-600'
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
                              className="w-4 h-4"
                            />
                            {can ? '수정본에 반영' : '자동 반영 불가 — 직접 고쳐야 합니다'}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* 수정본 + 내보내기 */}
            <section data-section="수정본" className="doc-section space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionTitle
                  count={Object.values(decisions).filter((d) => d.on).length}
                  desc="문맥을 봐야 하는 항목은 자동으로 넣지 않습니다"
                >
                  반영한 수정본
                </SectionTitle>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => copy(revised, '수정본')} className={BTN_GHOST}>
                    {copied === '수정본' ? (
                      <Check className="w-4 h-4 text-green-600" aria-hidden="true" />
                    ) : (
                      <Copy className="w-4 h-4" aria-hidden="true" />
                    )}
                    복사
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      saveBlob('보도자료_수정본.txt', new Blob([revised], { type: 'text/plain;charset=utf-8' }))
                    }
                    className={BTN_GHOST}
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    txt
                  </button>
                  <button type="button" onClick={downloadHwpx} className={BTN_PRIMARY}>
                    <FileDown className="w-4 h-4" aria-hidden="true" />
                    hwpx로 내려받기
                  </button>
                </div>
              </div>

              {exportError && (
                <Notice tone="red" title="hwpx를 만들지 못했습니다">
                  {exportError}
                </Notice>
              )}
              {!revisedDoc && (
                <Notice tone="amber" title="제목·부제 위치를 자동으로 되돌리지 못했습니다">
                  수정본의 문단 수가 원문과 다릅니다. 아래 머리말 정보에서 확인한 뒤 내려받으세요.
                </Notice>
              )}

              <div className={`${CARD} p-5`}>
                <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-4 font-sans text-base leading-[1.9]">
                  {revised}
                </pre>

                <details className="mt-4 rounded-md border border-slate-200 p-4">
                  <summary className="cursor-pointer font-bold text-slate-900">
                    hwpx 머리말 정보{' '}
                    <span className="text-sm font-normal text-slate-500">
                      배포일·부서·담당자 — 내려받기 전에 채워 주세요
                    </span>
                  </summary>
                  <div className="mt-4 space-y-3">
                    <MetaForm value={meta} onChange={setMeta} lockTitle />
                    <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600 space-y-0.5">
                      <p>
                        제목 <b className="text-slate-900">{revisedDoc?.meta.제목 || meta.제목 || '(없음)'}</b>
                      </p>
                      {(revisedDoc?.meta.부제 ?? meta.부제).filter(Boolean).length > 0 && (
                        <p>부제 {(revisedDoc?.meta.부제 ?? meta.부제).filter(Boolean).join(' / ')}</p>
                      )}
                      <p>
                        본문 {(revisedDoc?.body ?? body).filter((b) => b.trim()).length}문단 · 파일명{' '}
                        <span className="font-mono">
                          {defaultFileName({ ...meta, 제목: revisedDoc?.meta.제목 || meta.제목 })}
                        </span>
                      </p>
                    </div>
                  </div>
                </details>
              </div>
            </section>

            {/* 점검표 */}
            <section data-section="점검표" className="doc-section space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionTitle desc="공공언어의 요건 15항목">자동 생성 점검표</SectionTitle>
                <div className="flex gap-2">
                  <button type="button" onClick={() => copy(checklistText, '점검표')} className={BTN_GHOST}>
                    {copied === '점검표' ? (
                      <Check className="w-4 h-4 text-green-600" aria-hidden="true" />
                    ) : (
                      <Copy className="w-4 h-4" aria-hidden="true" />
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
                    className={BTN_GHOST}
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    내려받기
                  </button>
                </div>
              </div>

              <div className={`${CARD} overflow-hidden`}>
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
                  <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  ○ 는 자동 검사에서 걸린 것이 없다는 뜻이고, 지켰다는 보증이 아닙니다
                </div>
                <ul className="divide-y divide-slate-100">
                  {checklist.map((c) => (
                    <li key={c.id} className="flex items-start gap-3 px-5 py-3">
                      <span
                        className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                          c.match.length === 0
                            ? 'bg-slate-100 text-slate-400'
                            : c.hits.length === 0
                              ? 'bg-green-50 text-green-700'
                              : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {c.match.length === 0 ? '–' : c.hits.length === 0 ? '○' : '△'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800">
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
              </div>
            </section>
          </div>
        )}
      </main>

      <footer className="bg-slate-900 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
            <div className="space-y-1.5">
              <p className="text-base font-bold text-white">
                보도자료 공공언어 검증{' '}
                <span className="text-slate-400 font-medium">전북특별자치도교육청</span>
              </p>
              <p className="text-sm text-slate-300">
                공식 평가 결과가 아닙니다. 최종 판단은 작성 부서와 대변인실이 합니다.
              </p>
              <p className="text-sm text-slate-300">
                원고와 올린 파일은 브라우저 안에서만 처리하며, AI 검토를 켠 경우에만 지정한 사업자에게
                전송됩니다.
              </p>
            </div>
            <div className="text-sm text-slate-300 md:text-right space-y-1">
              <p className="flex items-center gap-1.5 md:justify-end">
                <ScrollText className="w-3.5 h-3.5" aria-hidden="true" />
                근거 자료
              </p>
              <p>2026년 공공기관등 공문서등 평가 설명회 자료(문체부·국립국어원)</p>
              <p>개정판 한눈에 알아보는 공공언어 바로 쓰기(국립국어원, 2022)</p>
              <p>2026년 용이성 평가용 용어 목록 {DATA_COUNTS.terms.toLocaleString()}개</p>
              <p>보도자료 양식: 전북특별자치도교육청 공식 hwpx 서식</p>
            </div>
          </div>
        </div>
      </footer>

      <SectionNav deps={`${tab}:${result ? 'result' : 'input'}`} />
      <ScrollToTopButton />

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

/** 화면을 어느 정도 내렸을 때만 나타나는 '맨 위로' 버튼 (KRDS 상단이동 패턴) */
function ScrollToTopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="맨 위로 이동"
      className={`fixed bottom-6 right-6 z-40 flex items-center gap-1.5 px-4 py-3
                  rounded-full border border-slate-300 bg-white text-slate-700 shadow-lg
                  text-sm font-bold hover:bg-blue-600 hover:border-blue-600 hover:text-white
                  transition-all ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}
    >
      <ArrowUp className="w-4 h-4" aria-hidden="true" />
      <span className="hidden sm:inline">맨 위로</span>
    </button>
  );
}

const SAMPLE = `○○교육청, AI 기반 스마트 스쿨 구축 워크샵 개최
○○교육청은 오는 3월 15일 도교육청 대강당에서 관내 초·중등 교사 200여 명을 대상으로 'AI 기반 스마트 스쿨 구축 워크샵'을 개최한다고 밝혔다.
이번 워크샵은 미래교육 인프라 구축을 위한 로드맵을 공유하고 현장 교사들의 니즈를 수렴하기 위해 마련되었으며, 교육부의 디지털 전환 정책에 발맞춰 학교 현장의 디지털 리터러시를 제고시키고 학생 개개인의 맞춤형 학습을 지원하는 플랫폼 구축 방안을 논의하는 자리로 마련되었다.
주요 프로그램은 AI 교육 우수사례 공유, 에듀테크 기업의 솔루션 데모데이, 교사 라운드 테이블 등이다. 특히 올해는 거버넌스 구축을 위해 일반인도 참여할 수 있는 세션을 시범적으로 운영한다.
교육청 관계자는 "금일 논의된 내용은 차년도 사업 계획에 반영될 예정"이라며 "참석 대상자는 3월 10일 까지 신청서를 제출할 것"이라고 말했다.
한편 이번 사업은 지난해 시범 운영을 통해 참여 만족도 92%를 기록한 바 있으며, 올해는 실천률을 높이기 위해 컨설팅단을 운영한다.`;
