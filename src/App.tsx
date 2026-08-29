import React, { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { Header, type Tab } from "./components/Header";
import Highlight from "./components/Highlight";
import SettingsModal from "./components/SettingsModal";
import CriteriaView from "./components/CriteriaView";
import CasesView from "./components/CasesView";
import MetaForm from "./components/MetaForm";
import {
  Badge,
  SectionTitle,
  Stat,
  Notice,
  BTN_PRIMARY,
  BTN_GHOST,
  CARD,
  type Tone,
} from "./components/Ui";
import { CHECKLIST } from "./data/checklist";
import {
  analyze,
  buildRevised,
  defaultDecisions,
  isApplicable,
  replacementFor,
  DATA_COUNTS,
  type AnalyzeResult,
  type Decision,
  type Finding,
} from "./lib/analyze";
import { DEFAULT_MODEL, reviewWithAi, type AiConfig } from "./lib/ai";
import { parsePressRelease } from "./lib/hwp";
import {
  buildHwpx,
  defaultFileName,
  EMPTY_META,
  type ReleaseMeta,
} from "./lib/hwpxOut";
import { composeSource, decompose, splitPastedText, type Doc } from "./lib/doc";

const AXES = ["용이성", "정확성", "소통성"] as const;
type Axis = (typeof AXES)[number];

const AXIS_TONE: Record<Axis, Tone> = {
  용이성: "blue",
  정확성: "red",
  소통성: "amber",
};
const AXIS_ICON: Record<Axis, React.ReactNode> = {
  용이성: <Languages className="w-3.5 h-3.5" aria-hidden="true" />,
  정확성: <SpellCheck className="w-3.5 h-3.5" aria-hidden="true" />,
  소통성: <MessagesSquare className="w-3.5 h-3.5" aria-hidden="true" />,
};

const CFG_KEY = "prc.ai.config.v2";
const CFG_KEY_OLD = "prc.ai.config.v1";

/**
 * 저장해 둔 설정을 읽는다.
 *
 * v1 에는 모형 이름까지 저장했는데, 회사가 그 모형을 없애 버리면 브라우저에 죽은
 * 이름이 계속 남아 다음에도 그대로 404 가 났다. v2 로 넘어오면서 **키만 물려받고
 * 모형 이름은 버린다.** 이름은 설정 창에서 목록을 받아 고르는 것이 맞다.
 */
function loadCfg(): AiConfig {
  const fallback: AiConfig = {
    provider: "anthropic",
    apiKey: "",
    model: DEFAULT_MODEL.anthropic,
  };
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) return JSON.parse(raw) as AiConfig;

    const old = localStorage.getItem(CFG_KEY_OLD);
    if (old) {
      const o = JSON.parse(old) as AiConfig;
      localStorage.removeItem(CFG_KEY_OLD);
      const provider = o.provider ?? "anthropic";
      return {
        provider,
        apiKey: o.apiKey ?? "",
        model: DEFAULT_MODEL[provider],
      };
    }
  } catch {
    /* 저장소를 못 쓰는 브라우저도 있다 */
  }
  return fallback;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("check");
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [meta, setMeta] = useState<ReleaseMeta>(EMPTY_META);
  const [body, setBody] = useState<string[]>([]);
  const [fileNote, setFileNote] = useState<{
    kind: "ok" | "fail";
    msg: string;
  } | null>(null);
  const [reading, setReading] = useState(false);

  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [source, setSource] = useState("");
  const [baseDoc, setBaseDoc] = useState<Doc | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [aiFindings, setAiFindings] = useState<Finding[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [aiState, setAiState] = useState<"idle" | "run" | "done" | "fail">(
    "idle",
  );
  const [aiError, setAiError] = useState("");
  const [cfg, setCfg] = useState<AiConfig>(loadCfg);
  const [showCfg, setShowCfg] = useState(false);
  /** 키가 없어 설정 창을 열었을 때, 저장 뒤 이어서 할 일 */
  const [afterKey, setAfterKey] = useState<"run" | "add" | null>(null);
  const [filter, setFilter] = useState<"전체" | Axis>("전체");
  const [active, setActive] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [exportError, setExportError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  /** 검토를 막 끝냈을 때만 결과로 내려간다(체크만 만졌는데 화면이 튀면 안 된다) */
  const jumpToResult = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    } catch {
      /* 무시 */
    }
  }, [cfg]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab]);

  useEffect(() => {
    if (!result || !jumpToResult.current) return;
    jumpToResult.current = false;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const findings = useMemo(
    () =>
      [...(result?.findings ?? []), ...aiFindings].sort(
        (a, b) => a.start - b.start,
      ),
    [result, aiFindings],
  );
  const shown = useMemo(
    () => findings.filter((f) => filter === "전체" || f.axis === filter),
    [findings, filter],
  );
  const revised = useMemo(
    () => (result ? buildRevised(source, findings, decisions) : ""),
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
        setFileNote({
          kind: "fail",
          msg: r.error || "보도자료 내용을 찾지 못했습니다.",
        });
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
      // 상자에는 제목과 본문만 넣는다. 부제는 ‘보도자료 정보’ 칸이 맡는다
      // (상자에 같이 넣으면 첫 줄 다음부터는 전부 본문 문단으로 잡힌다).
      setBody(r.본문);
      setText([r.제목, ...r.본문].join("\n"));
      setFileNote({
        kind: "ok",
        msg:
          `${file.name} — ${r.서식}, 제목과 본문 ${r.본문.length}문단을 넣었습니다.` +
          (r.부제.length ? ` 부제 ${r.부제.length}줄과` : "") +
          " 배포일·부서·담당자는 아래 ‘보도자료 정보’에 채웠습니다.",
      });
    } catch (e) {
      setFileNote({
        kind: "fail",
        msg: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setReading(false);
    }
  }

  /** 넣은 글·파일·머리말까지 전부 비우고 처음 화면으로 (AI 설정은 남긴다) */
  function reset() {
    setResult(null);
    setBaseDoc(null);
    setSource("");
    setDecisions({});
    setAiFindings([]);
    setAiSummary("");
    setAiState("idle");
    setAiError("");
    setText("");
    setBody([]);
    setMeta(EMPTY_META);
    setFileNote(null);
    setDragOver(false);
    jumpToResult.current = false;
    setActive(null);
    setFilter("전체");
    setExportError("");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ---------------- 검토 ---------------- */

  /**
   * 검토 시작.
   *
   * `withAi` 면 규칙 검사를 끝내고 이어서 AI 문맥 검토까지 한 번에 한다.
   * 예전에는 검토를 누른 뒤 결과 화면에서 다시 'AI 검토 추가' 를 눌러야 해서
   * 두 단계인 줄 모르고 지나치기 쉬웠다.
   */
  async function run(withAi: boolean) {
    const t = text.trim();
    if (!t) return;

    // 상자가 유일한 출처다. 첫 줄이 제목, 나머지 줄이 본문 문단.
    // 부제와 머리말은 ‘보도자료 정보’ 칸에서 온다.
    const split = splitPastedText(t);
    const nextMeta: ReleaseMeta = {
      ...meta,
      제목: split.제목,
      부제: meta.부제.filter((x) => x.trim()),
    };
    const doc: Doc = { meta: nextMeta, body: split.본문 };
    setMeta(nextMeta);
    setBody(split.본문);

    const src = composeSource(doc);
    if (!src.trim()) return;
    const r = analyze(src);
    setBaseDoc(doc);
    setSource(src);
    setResult(r);
    setDecisions(defaultDecisions(r.findings));
    setAiFindings([]);
    setAiSummary("");
    setAiState("idle");
    setAiError("");
    setActive(null);
    setExportError("");
    jumpToResult.current = true;

    if (withAi) await askAi(src, r.findings);
  }

  /** AI 에게 문맥 검토를 맡긴다. 규칙으로 이미 잡은 것은 넘겨서 중복 지적을 막는다. */
  async function askAi(src: string, ruleFindings: Finding[]) {
    setAiState("run");
    setAiError("");
    try {
      const r = await reviewWithAi(cfg, src, ruleFindings);
      setAiFindings(r.findings);
      setAiSummary(r.summary);
      setDecisions((d) => {
        const next = { ...d };
        for (const f of r.findings) next[f.key] = { on: false, pick: 0 };
        return next;
      });
      setAiState("done");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
      setAiState("fail");
    }
  }

  /** 결과 화면에서 뒤늦게 AI 검토를 붙일 때 */
  function addAi() {
    if (!result) return;
    if (!cfg.apiKey) {
      setAfterKey("add");
      setShowCfg(true);
      return;
    }
    void askAi(source, result.findings);
  }

  /** 키를 넣으러 갔다가 돌아왔을 때 이어서 할 일 */
  function onSaveCfg(v: AiConfig) {
    setCfg(v);
    setShowCfg(false);
    if (!v.apiKey.trim() || !afterKey) return;
    const next = afterKey;
    setAfterKey(null);
    if (next === "run") void run(true);
    else if (result) void askAi(source, result.findings);
  }

  /* ---------------- 내보내기 ---------------- */

  function copy(what: string, label: string) {
    navigator.clipboard.writeText(what).then(
      () => {
        setCopied(label);
        setTimeout(() => setCopied(""), 1800);
      },
      () => setCopied("실패"),
    );
  }

  function saveBlob(name: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
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
    setExportError("");
    const d =
      revisedDoc ??
      (baseDoc
        ? { meta: { ...baseDoc.meta, ...headerOnly(meta) }, body: baseDoc.body }
        : null);
    if (!d) return;
    try {
      const bytes = buildHwpx(d.meta, d.body);
      saveBlob(
        defaultFileName(d.meta),
        new Blob([bytes as unknown as BlobPart], {
          type: "application/hwp+zip",
        }),
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
      "보도자료 공공언어 자가점검표",
      `작성 시각: ${new Date().toLocaleString("ko-KR")}`,
      `제목: ${meta.제목}`,
      `분량: ${result?.wordCount ?? 0}어절 / ${result?.charCount ?? 0}자`,
      "",
      ...AXES.map((a) => {
        const b = result?.byAxis[a];
        return `[${a}] 지적 ${findings.filter((f) => f.axis === a).length}건 · 어절 수 대비 ${
          b ? b.rate.toFixed(2) : "0.00"
        }%`;
      }),
      "",
      "── 공공언어의 요건 점검 ──",
      ...checklist.map(
        (c) =>
          `[${c.match.length === 0 ? "–" : c.hits.length === 0 ? "○" : "△"}] ${c.area}·${c.group} ${
            c.question
          }${c.hits.length ? `  (지적 ${c.hits.length}건)` : ""}`,
      ),
      "",
      "※ ○ 는 자동 검사에서 걸린 것이 없다는 뜻이고, 지켰다는 보증이 아닙니다.",
      "※ 단락 구성·정보의 양과 배열·시각적 편의는 자동 검사 대상이 아니므로 작성자가 직접 확인하세요.",
    ];
    return lines.join("\n");
  }, [checklist, findings, result, meta.제목]);

  const readyToRun = text.trim().length > 0;

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

      <main
        id="container"
        className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6"
      >
        {tab === "criteria" && <CriteriaView />}
        {tab === "cases" && <CasesView />}

        {/* ------------------ 입력 ------------------ */}
        {tab === "check" && (
          <div className="space-y-8 pb-12">
            {/* ── 입력 띠 ── */}
            <section
              className="relative left-1/2 w-screen -translate-x-1/2 -mt-6
                         px-4 sm:px-6 lg:px-8 py-10 sm:py-14
                         bg-blue-50 border-b border-blue-100"
            >
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="text-center space-y-3">
                  <h2 className="text-3xl sm:text-[2.75rem] font-bold text-slate-900 leading-tight">
                    <span className="block sm:inline">
                      보도자료를 내기 전에
                    </span>{" "}
                    <span className="text-blue-700">공공언어부터 봅니다</span>
                  </h2>
                  <p className="text-base sm:text-lg text-slate-600">
                    글을 붙여 넣거나 쓰던 한글 파일을 올리면{" "}
                    <strong className="font-bold text-slate-900">
                      고칠 곳
                    </strong>{" "}
                    ·
                    <strong className="font-bold text-slate-900">
                      {" "}
                      수정본
                    </strong>{" "}
                    ·
                    <strong className="font-bold text-slate-900">
                      {" "}
                      점검표
                    </strong>
                    를 만들고, 전북교육청 양식 hwpx로 돌려드립니다
                  </p>
                </div>

                {/*
                  붙여 넣기와 파일 올리기를 나누지 않는다. 상자 하나에 글을 붙이거나
                  파일을 끌어다 놓으면 되고, 파일이면 머리말 정보까지 같이 채워 준다.
                */}
                <div className="space-y-2">
                  <label htmlFor="draft" className="sr-only">
                    보도자료 초안
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".hwp,.hwpx"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void readFile(f);
                      e.target.value = "";
                    }}
                  />
                  <div
                    className="relative"
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!dragOver) setDragOver(true);
                    }}
                    onDragLeave={(e) => {
                      // 안쪽 요소를 지날 때 깜빡이지 않게 상자를 완전히 벗어났을 때만 끈다
                      if (!e.currentTarget.contains(e.relatedTarget as Node))
                        setDragOver(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) void readFile(f);
                    }}
                  >
                    <textarea
                      id="draft"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={12}
                      placeholder="제목부터 본문까지 그대로 붙여 넣으시거나, 보도자료 양식의 한글 파일(.hwp, .hwpx)을 여기로 끌어다 놓으세요."
                      className={`w-full resize-y rounded-lg border-2 bg-white p-4
                                  text-base leading-relaxed text-slate-900 placeholder-slate-400
                                  outline-none transition-colors ${
                                    dragOver
                                      ? "border-blue-700 bg-blue-50"
                                      : "border-blue-600 focus:border-blue-700"
                                  }`}
                    />

                    {(dragOver || reading) && (
                      <div
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2
                                      rounded-lg border-2 border-dashed border-blue-600 bg-blue-50/95"
                      >
                        {reading ? (
                          <Loader2
                            className="w-8 h-8 animate-spin text-blue-600"
                            aria-hidden="true"
                          />
                        ) : (
                          <FileUp
                            className="w-8 h-8 text-blue-600"
                            aria-hidden="true"
                          />
                        )}
                        <span className="font-bold text-blue-800">
                          {reading
                            ? "한글 파일을 읽는 중…"
                            : "여기에 놓으면 제목·본문과 보도자료 정보를 채웁니다"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                    <span>
                      첫 줄을 제목으로, 나머지 줄을 본문 문단으로 봅니다. 아래
                      ‘보도자료 정보’에서 고칠 수 있습니다.
                    </span>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="font-bold text-blue-700 underline underline-offset-2 hover:text-blue-800"
                    >
                      끌어다 놓기가 어려우면 파일 고르기
                    </button>
                  </div>

                  {fileNote && (
                    <p
                      className={`rounded-lg border p-3 text-sm ${
                        fileNote.kind === "ok"
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      {fileNote.msg}
                    </p>
                  )}
                </div>

                {/* 두 방식의 차이를 고르기 전에 알려 준다 */}
                <div className="grid gap-2 sm:grid-cols-2 text-sm">
                  <p className="rounded-md bg-white/70 px-3 py-2 text-slate-700">
                    <b className="text-slate-900">규칙으로 검토</b> — 용어
                    목록과 어문 규범으로 대조합니다. 바로 끝나고, 원고는 이
                    브라우저 밖으로 나가지 않습니다.
                  </p>
                  <p className="rounded-md bg-white/70 px-3 py-2 text-slate-700">
                    <b className="text-slate-900">AI까지 검토</b> — 여기에
                    호응·비문·군더더기까지 봅니다.
                    <b className="text-slate-900">
                      {" "}
                      원고가 지정한 사업자에게 전송
                    </b>
                    되니 대외비는 위쪽을 쓰세요.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm text-slate-600 basis-full sm:basis-auto">
                    {text.trim()
                      ? `${text.trim().split(/\s+/).length}어절 · ${text.length}자`
                      : "아직 비어 있습니다"}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setText(SAMPLE)}
                      className="h-12 px-4 rounded-lg bg-white border border-blue-200 text-blue-700 font-bold hover:bg-blue-100 transition-colors"
                    >
                      예시 넣기
                    </button>
                    <button
                      type="button"
                      onClick={reset}
                      className="h-12 px-4 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:border-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4" aria-hidden="true" />
                      초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => void run(false)}
                      disabled={!readyToRun}
                      className="h-12 px-5 sm:px-8 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300
                                 text-white font-bold text-lg rounded-lg transition-colors
                                 flex items-center gap-2 shrink-0"
                    >
                      <span>규칙으로 검토</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!readyToRun) return;
                        if (!cfg.apiKey) {
                          setAfterKey("run");
                          setShowCfg(true);
                          return;
                        }
                        void run(true);
                      }}
                      disabled={!readyToRun || aiState === "run"}
                      className="h-12 px-5 sm:px-8 rounded-lg border-2 border-blue-600 bg-white
                                 text-blue-700 font-bold text-lg hover:bg-blue-100 transition-colors
                                 disabled:border-slate-300 disabled:text-slate-400
                                 flex items-center gap-2 shrink-0"
                    >
                      {aiState === "run" ? (
                        <Loader2
                          className="w-5 h-5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Sparkles className="w-5 h-5" aria-hidden="true" />
                      )}
                      <span>AI까지 검토</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* ── 보도자료 정보 ── */}
            <section className="space-y-3">
              <SectionTitle desc="hwpx 머리말 표에 그대로 들어갑니다. 한글 파일을 놓으면 자동으로 채워집니다">
                보도자료 정보
              </SectionTitle>
              <div className={`${CARD} p-5`}>
                <MetaForm value={meta} onChange={setMeta} hideTitle />
                <p className="mt-3 text-xs text-slate-500">
                  제목은 위 상자의 첫 줄을 그대로 씁니다.
                </p>
              </div>
            </section>

            {/* ── 무엇을 보는지 ── */}
            <section className="space-y-3">
              <SectionTitle desc="국립국어원 2026년 공문서등 평가 기준">
                무엇을 보나
              </SectionTitle>
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

        {/* ------------------ 결과 (입력 아래에 이어 붙는다) ------------------ */}
        {tab === "check" && result && (
          <div ref={resultRef} className="space-y-8 pb-12 scroll-mt-28">
            {/* 요약 */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionTitle
                  count={findings.length}
                  desc={`${result.wordCount.toLocaleString()}어절 · ${result.charCount.toLocaleString()}자`}
                >
                  검토 결과
                </SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {aiFindings.length === 0 && (
                    <button
                      type="button"
                      onClick={addAi}
                      disabled={aiState === "run"}
                      className={BTN_GHOST}
                    >
                      {aiState === "run" ? (
                        <Loader2
                          className="w-4 h-4 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Sparkles className="w-4 h-4" aria-hidden="true" />
                      )}
                      {aiState === "run"
                        ? "AI가 보는 중"
                        : "AI 문맥 검토도 받기"}
                    </button>
                  )}
                  <button type="button" onClick={reset} className={BTN_GHOST}>
                    <RotateCcw className="w-4 h-4" aria-hidden="true" />
                    처음부터
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
                    bar={{
                      ratio: result.byAxis[a].rate * 10,
                      tone: AXIS_TONE[a],
                    }}
                    sub={`어절 수 대비 ${result.byAxis[a].rate.toFixed(2)}%`}
                  />
                ))}
              </div>

              <p className="text-xs text-slate-500">
                실제 평가는 어절 수 대비 오류 비율로 점수를 매깁니다(용이성 60%,
                정확성 30%). 여기 나오는 비율은 자동 검사로 걸린 것만 센
                참고치이고, 실제 배점 산식과는 다릅니다.
              </p>

              {aiState === "fail" && (
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
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
              <div className="space-y-3">
                <SectionTitle desc="칠해진 곳을 누르면 오른쪽 지적과 이어집니다">
                  원문
                </SectionTitle>
                <div className={`${CARD} p-5`}>
                  <Highlight
                    text={source}
                    findings={findings}
                    activeKey={active}
                    onPick={setActive}
                  />
                </div>
              </div>

              {/*
                오른쪽 지적 목록의 높이를 왼쪽 원문 카드에 맞춘다.
                목록을 absolute 로 띄워 두면 목록이 아무리 길어도 줄 높이를 늘리지 못하므로,
                줄 높이는 원문 카드가 정하고 목록은 그 안에서 스크롤된다.
                좁은 화면에서는 위아래로 쌓이니 예전처럼 그냥 흐르게 둔다.
              */}
              <div className="flex flex-col gap-3 lg:min-h-0">
                <div className="flex flex-wrap gap-1.5">
                  {(["전체", ...AXES] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-full border text-sm font-bold transition-colors ${
                        filter === f
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-slate-300 text-slate-700 hover:border-blue-600"
                      }`}
                    >
                      {f}
                      {f !== "전체" &&
                        ` ${findings.filter((x) => x.axis === f).length}`}
                    </button>
                  ))}
                </div>

                {shown.length === 0 ? (
                  <div className={`${CARD} p-8 text-center`}>
                    <p className="font-bold text-slate-800">
                      이 항목에서는 걸린 것이 없습니다
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      자동 검사에 안 걸렸다는 뜻이지, 규범을 지켰다는 보증은
                      아닙니다.
                    </p>
                  </div>
                ) : (
                  <div className="relative flex-1 lg:min-h-0">
                    <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-1 lg:absolute lg:inset-0 lg:max-h-none">
                      {shown.map((f) => {
                        const d = decisions[f.key] ?? { on: false, pick: 0 };
                        const can = isApplicable(f.fixes[d.pick] ?? "");
                        const rep = replacementFor(f, d);
                        return (
                          <li
                            key={f.key}
                            onClick={() => setActive(f.key)}
                            className={`${CARD} p-4 cursor-pointer transition-colors ${
                              active === f.key
                                ? "border-blue-600"
                                : "hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <Badge tone={AXIS_TONE[f.axis as Axis]}>
                                {f.axis}
                              </Badge>
                              <Badge
                                tone={f.severity === "오류" ? "red" : "amber"}
                              >
                                {f.severity}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                              {f.sub}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                              <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                                {f.text}
                              </span>
                              <ArrowRight
                                className="w-3.5 h-3.5 text-slate-400"
                                aria-hidden="true"
                              />
                              <span className="px-1.5 py-0.5 rounded bg-green-50 font-bold text-green-700">
                                {f.fixes[d.pick]}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600">
                              {f.why}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {f.src}
                            </p>

                            {f.fixes.length > 1 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {f.fixes.map((x, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() =>
                                      setDecisions((s) => ({
                                        ...s,
                                        [f.key]: { ...d, pick: i },
                                      }))
                                    }
                                    className={`px-2 py-0.5 rounded border text-xs transition-colors ${
                                      d.pick === i
                                        ? "border-blue-600 bg-blue-50 font-bold text-blue-700"
                                        : "border-slate-300 text-slate-600 hover:border-blue-600"
                                    }`}
                                  >
                                    {x}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/*
                            대안이 지시문이거나 앞말에 따라 달라지는 경우에는 기계가 고를 수
                            없다. 그럴 때는 손으로 적어 넣게 하고, 적으면 그것을 수정본에 쓴다.
                          */}
                            {!can && (
                              <div className="mt-3">
                                <label
                                  htmlFor={`fix-${f.key}`}
                                  className="block text-xs font-bold text-slate-500"
                                >
                                  고쳐 넣을 말을 직접 적으세요
                                </label>
                                <input
                                  id={`fix-${f.key}`}
                                  type="text"
                                  value={d.custom ?? ""}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setDecisions((s) => ({
                                      ...s,
                                      [f.key]: {
                                        ...d,
                                        custom: v,
                                        on: v.trim().length > 0,
                                      },
                                    }));
                                  }}
                                  placeholder={`‘${f.text}’ 자리에 넣을 말`}
                                  className="mt-1 w-full h-9 px-2.5 rounded-md border border-slate-300 bg-white
                                           text-sm font-semibold text-slate-800 outline-none focus:border-blue-600"
                                />
                              </div>
                            )}

                            <label
                              className={`mt-3 flex items-center gap-2 text-sm ${
                                rep ? "text-slate-700" : "text-slate-400"
                              }`}
                            >
                              <input
                                type="checkbox"
                                disabled={!rep}
                                checked={Boolean(d.on && rep)}
                                onChange={(e) =>
                                  setDecisions((s) => ({
                                    ...s,
                                    [f.key]: { ...d, on: e.target.checked },
                                  }))
                                }
                                className="w-4 h-4"
                              />
                              {rep ? (
                                <span>
                                  수정본에{" "}
                                  <b className="text-slate-900">{rep}</b> 넣기
                                </span>
                              ) : (
                                "적어 넣으면 수정본에 반영됩니다"
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </section>

            {/* 수정본 + 내보내기 */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionTitle
                  count={Object.values(decisions).filter((d) => d.on).length}
                  desc="문맥을 봐야 하는 항목은 자동으로 넣지 않습니다"
                >
                  반영한 수정본
                </SectionTitle>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copy(revised, "수정본")}
                    className={BTN_GHOST}
                  >
                    {copied === "수정본" ? (
                      <Check
                        className="w-4 h-4 text-green-600"
                        aria-hidden="true"
                      />
                    ) : (
                      <Copy className="w-4 h-4" aria-hidden="true" />
                    )}
                    복사
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      saveBlob(
                        "보도자료_수정본.txt",
                        new Blob([revised], {
                          type: "text/plain;charset=utf-8",
                        }),
                      )
                    }
                    className={BTN_GHOST}
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    txt
                  </button>
                  <button
                    type="button"
                    onClick={downloadHwpx}
                    className={BTN_PRIMARY}
                  >
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
                <Notice
                  tone="amber"
                  title="제목·부제 위치를 자동으로 되돌리지 못했습니다"
                >
                  수정본의 문단 수가 원문과 다릅니다. 아래 머리말 정보에서
                  확인한 뒤 내려받으세요.
                </Notice>
              )}

              <div className={`${CARD} p-5`}>
                <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-4 font-sans text-base leading-[1.9]">
                  {revised}
                </pre>

                <details className="mt-4 rounded-md border border-slate-200 p-4">
                  <summary className="cursor-pointer font-bold text-slate-900">
                    hwpx 머리말 정보{" "}
                    <span className="text-sm font-normal text-slate-500">
                      배포일·부서·담당자 — 내려받기 전에 채워 주세요
                    </span>
                  </summary>
                  <div className="mt-4 space-y-3">
                    <MetaForm value={meta} onChange={setMeta} lockTitle />
                    <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600 space-y-0.5">
                      <p>
                        제목{" "}
                        <b className="text-slate-900">
                          {revisedDoc?.meta.제목 || meta.제목 || "(없음)"}
                        </b>
                      </p>
                      {(revisedDoc?.meta.부제 ?? meta.부제).filter(Boolean)
                        .length > 0 && (
                        <p>
                          부제{" "}
                          {(revisedDoc?.meta.부제 ?? meta.부제)
                            .filter(Boolean)
                            .join(" / ")}
                        </p>
                      )}
                      <p>
                        본문{" "}
                        {
                          (revisedDoc?.body ?? body).filter((b) => b.trim())
                            .length
                        }
                        문단 · 파일명{" "}
                        <span className="font-mono">
                          {defaultFileName({
                            ...meta,
                            제목: revisedDoc?.meta.제목 || meta.제목,
                          })}
                        </span>
                      </p>
                    </div>
                  </div>
                </details>
              </div>
            </section>

            {/* 점검표 */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionTitle desc="공공언어의 요건 15항목">
                  자동 생성 점검표
                </SectionTitle>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => copy(checklistText, "점검표")}
                    className={BTN_GHOST}
                  >
                    {copied === "점검표" ? (
                      <Check
                        className="w-4 h-4 text-green-600"
                        aria-hidden="true"
                      />
                    ) : (
                      <Copy className="w-4 h-4" aria-hidden="true" />
                    )}
                    복사
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      saveBlob(
                        "보도자료_점검표.txt",
                        new Blob([checklistText], {
                          type: "text/plain;charset=utf-8",
                        }),
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
                  <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />○
                  는 자동 검사에서 걸린 것이 없다는 뜻이고, 지켰다는 보증이
                  아닙니다
                </div>
                <ul className="divide-y divide-slate-100">
                  {checklist.map((c) => (
                    <li key={c.id} className="flex items-start gap-3 px-5 py-3">
                      <span
                        className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                          c.match.length === 0
                            ? "bg-slate-100 text-slate-400"
                            : c.hits.length === 0
                              ? "bg-green-50 text-green-700"
                              : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {c.match.length === 0
                          ? "–"
                          : c.hits.length === 0
                            ? "○"
                            : "△"}
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
                            지적 {c.hits.length}건 —{" "}
                            {c.hits
                              .slice(0, 5)
                              .map((h) => h.text)
                              .join(", ")}
                            {c.hits.length > 5 && " …"}
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
                보도자료 공공언어 검증{" "}
                <span className="text-slate-400 font-medium">
                  전북특별자치도교육청
                </span>
              </p>
              <p className="text-sm text-slate-300">
                공식 평가 결과가 아닙니다. 최종 판단은 작성 부서와 대변인실이
                합니다.
              </p>
              <p className="text-sm text-slate-300">
                원고와 올린 파일은 브라우저 안에서만 처리하며, AI 검토를 켠
                경우에만 지정한 사업자에게 전송됩니다.
              </p>
            </div>
            <div className="text-sm text-slate-300 md:text-right space-y-1">
              <p className="flex items-center gap-1.5 md:justify-end">
                <ScrollText className="w-3.5 h-3.5" aria-hidden="true" />
                근거 자료
              </p>
              <p>
                2026년 공공기관등 공문서등 평가 설명회 자료(문체부·국립국어원)
              </p>
              <p>개정판 한눈에 알아보는 공공언어 바로 쓰기(국립국어원, 2022)</p>
              <p>
                2026년 용이성 평가용 용어 목록{" "}
                {DATA_COUNTS.terms.toLocaleString()}개
              </p>
              <p>보도자료 양식: 전북특별자치도교육청 공식 hwpx 서식</p>
            </div>
          </div>
        </div>
      </footer>

      <ScrollToTopButton />

      {showCfg && (
        <SettingsModal
          value={cfg}
          onSave={onSaveCfg}
          onClose={() => {
            setAfterKey(null);
            setShowCfg(false);
          }}
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
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="맨 위로 이동"
      className={`fixed bottom-6 right-6 z-40 flex items-center gap-1.5 px-4 py-3
                  rounded-full border border-slate-300 bg-white text-slate-700 shadow-lg
                  text-sm font-bold hover:bg-blue-600 hover:border-blue-600 hover:text-white
                  transition-all ${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}`}
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
