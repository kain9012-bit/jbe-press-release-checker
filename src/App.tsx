import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Check,
  ClipboardCheck,
  Copy,
  FileDown,
  FileUp,
  Loader2,
  RotateCcw,
  ScrollText,
  Sparkles,
  Wand2,
  Undo2,
  Eye,
  EyeOff,
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
  buildRevisedParts,
  defaultDecisions,
  isApplicable,
  isRuleChecked,
  replacementFor,
  DATA_COUNTS,
  type AnalyzeResult,
  type Decision,
  type Finding,
} from "./lib/analyze";
import {
  DEFAULT_MODEL,
  reviewWithAi,
  fillBlanks,
  tenseChanged,
  verifyEdits,
  hasProxy,
  isConfigured,
  type AiConfig,
  type EditToCheck,
  type BlankTarget,
} from "./lib/ai";
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
  // 기관이 중계 서버를 두었으면 그것이 기본이다. 담당자는 키를 구할 일도,
  // 설정을 열 일도 없다. 그게 부서에 돌릴 수 있는 유일한 모양이다.
  const fallback: AiConfig = hasProxy()
    ? { provider: "proxy", apiKey: "", model: DEFAULT_MODEL.proxy }
    : { provider: "anthropic", apiKey: "", model: DEFAULT_MODEL.anthropic };
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as AiConfig;
      // 키도 없이 남의 회사를 골라 둔 상태면 중계 쪽이 낫다
      if (hasProxy() && !saved.apiKey?.trim() && saved.provider !== "proxy") {
        return fallback;
      }
      return saved;
    }

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

/** 지적 바로 앞의 낱말. 조사 받침을 맞추라고 AI 에게 알려 줄 때 쓴다. */
function wordBefore(text: string, start: number) {
  const head = text.slice(Math.max(0, start - 20), start);
  const m = head.match(/([^\s]+)$/);
  return m ? m[1] : '';
}

/** 지적이 들어 있는 문장을 잘라 온다. AI 에게 문맥을 줄 때 쓴다. */
function sentenceAround(text: string, start: number, end: number) {
  const from = Math.max(0, text.lastIndexOf('\n', start - 1) + 1);
  const nl = text.indexOf('\n', end);
  const to = nl < 0 ? text.length : nl;
  return text.slice(from, to).trim().slice(0, 300);
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
  /** 검토 결과가 나온 뒤에는 입력 띠를 접어 둔다 */
  const [showInput, setShowInput] = useState(true);

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
  const [filter, setFilter] = useState<"전체" | Axis>("전체");
  const [active, setActive] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  /** 수정본에서 고치기 전 말도 같이 보여 줄지 */
  const [showFrom, setShowFrom] = useState(false);
  /** 3차에서 되돌린 자리 — 세는 데만 쓴다. 그 자리는 목록에서 아예 뺀다. */
  const [verifyNotes, setVerifyNotes] = useState<Record<string, string>>({});
  /** 세 단계를 다 돌 때까지 켜 둔다. 그동안 화면에는 아무것도 안 올린다. */
  const [busy, setBusy] = useState(false);
  /** 도는 동안 지금 몇 단계째인지 (0=안 돎, 1~3) */
  const [phase, setPhase] = useState(0);
  /** 키를 넣으러 설정 창에 갔다가 돌아오면 검토를 이어야 하는지 */
  const resume = useRef(false);
  const [exportError, setExportError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef<HTMLElement>(null);
  /** 오른쪽 지적 카드들 (원문에서 누르면 해당 카드로 목록을 굴린다) */
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});
  /** 원문에서 칠한 자리들 (카드를 누르면 그 자리로 굴린다) */
  const markRefs = useRef<Record<string, HTMLElement | null>>({});
  /** 어느 쪽을 눌렀는지. 누른 쪽은 그대로 두고 반대쪽만 굴린다. */
  const pickedFrom = useRef<"text" | "list" | null>(null);
  /** 같은 자리를 다시 눌러도 굴러가게 하는 셈. active 만 보면 값이 안 바뀌어 효과가 안 돈다. */
  const [pickTick, setPickTick] = useState(0);
  /**
   * 결정값의 거울.
   *
   * 한 번 누르면 검토 → 채우기 → 검수까지 이어서 도는데, 그 사이에는 setDecisions 로 넣은
   * 값을 곧바로 다시 읽을 수 없다(리액트가 다음 그림에 반영한다). 그래서 같은 값을 여기에도
   * 넣어 두고 이어지는 단계는 이쪽을 본다.
   */
  const decisionsRef = useRef<Record<string, Decision>>({});
  const putDecisions = (
    next:
      | Record<string, Decision>
      | ((d: Record<string, Decision>) => Record<string, Decision>),
  ) => {
    decisionsRef.current =
      typeof next === "function" ? next(decisionsRef.current) : next;
    setDecisions(decisionsRef.current);
  };
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

  // 막대가 뜨면 그리로 옮겨 준다. 누른 자리에서 멀면 도는 줄 모른다.
  useEffect(() => {
    if (busy) busyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [busy]);

  useEffect(() => {
    if (!result || !jumpToResult.current) return;
    jumpToResult.current = false;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  /**
   * 원문에서 칠한 곳을 누르면 오른쪽 목록이 그 카드로 굴러간다. 그 반대도 된다.
   *
   * 지적이 열댓 개가 되면 누른 자리의 카드가 목록 저 아래에 있어서 손으로 찾아야 했다.
   * 누른 쪽은 건드리지 않는다(원문을 눌렀는데 원문이 움직이면 읽던 자리를 잃는다).
   * block:'nearest' 라서 이미 보이는 것은 굴리지 않는다.
   */
  useEffect(() => {
    if (!active) return;
    const from = pickedFrom.current;
    pickedFrom.current = null;
    if (from === null) return;

    if (from === "text") {
      // 카드를 목록 **맨 위**로 올린다.
      // 예전에는 scrollIntoView 의 block:'nearest' 를 썼는데, 그건 최소한만 굴려서
      // 아래에 있던 카드가 화면 맨 아래에 걸쳤다. 읽으려면 눈을 아래로 내려야 한다.
      // 목록만 직접 굴려서 맨 위에 놓는다. 쪽 전체는 움직이지 않는다.
      const el = cardRefs.current[active];
      const list = el?.parentElement;
      if (!el || !list) return;
      const gap = el.getBoundingClientRect().top - list.getBoundingClientRect().top;
      list.scrollTo({ top: list.scrollTop + gap, behavior: "smooth" });
      return;
    }

    // 카드를 눌렀을 때는 원문의 그 자리로. 이쪽은 쪽 전체가 움직이므로
    // 이미 보이면 굴리지 않는다(읽던 자리를 잃지 않게).
    markRefs.current[active]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [active, pickTick]);

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
  const revisedParts = useMemo(
    () => (result ? buildRevisedParts(source, findings, decisions) : []),
    [result, source, findings, decisions],
  );
  const revised = useMemo(() => revisedParts.map((p) => p.text).join(""), [revisedParts]);
  const fixedCount = revisedParts.filter((p) => p.from !== undefined).length;

  /**
   * 원문에서 칠한 곳을 눌렀을 때.
   *
   * 거르개가 '정확성' 인데 용이성 지적을 누르면 그 카드는 목록에 아예 없다.
   * 눌렀는데 아무 일도 안 일어나는 것처럼 보이므로 거르개를 풀어 준다.
   */
  function pickFromText(key: string) {
    const f = findings.find((x) => x.key === key);
    if (f && filter !== "전체" && f.axis !== filter) setFilter("전체");
    pickedFrom.current = "text";
    setActive(key);
    setPickTick((n) => n + 1);
  }

  /** 아직 넣을 말이 정해지지 않은 자리 */
  const blanks = useMemo(
    () =>
      findings.filter(
        (f) => replacementFor(f, decisions[f.key] ?? { on: false, pick: 0 }, source) === null,
      ),
    [findings, decisions, source],
  );

  /** 넣을 수 있는 것을 한꺼번에 켜고 끈다 */
  function setAll(on: boolean) {
    putDecisions((prev) => {
      const next = { ...prev };
      for (const f of findings) {
        const d = next[f.key] ?? { on: false, pick: 0 };
        next[f.key] = { ...d, on: on && replacementFor(f, d, source) !== null };
      }
      return next;
    });
  }

  /* 머리말(배포일·부서·담당자)은 검사 대상이 아니므로 폼 값을 그대로 얹는다 */
  const headerOnly = (m: ReleaseMeta) => ({
    배포일: m.배포일,
    보도시점: m.보도시점,
    사진: m.사진,
    영상: m.영상,
    부서: m.부서,
    과장: m.과장,
    담당: m.담당,
    담당자: m.담당자,
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
        담당자: r.담당자 || m.담당자,
      }));
      // 상자에는 제목과 본문만 넣는다. 부제·머리말은 따로 들고 있다가
      // hwpx 를 만들 때 되돌려 놓는다 (상자에 같이 넣으면 전부 본문으로 잡힌다).
      setBody(r.본문);
      setText([r.제목, ...r.본문].join("\n"));
      setFileNote({
        kind: "ok",
        msg:
          `${file.name} — ${r.서식}, 제목과 본문 ${r.본문.length}문단을 넣었습니다.` +
          (r.부제.length ? ` 부제 ${r.부제.length}줄과` : "") +
          " 배포일·부서·담당자는 그대로 hwpx 머리말에 들어갑니다.",
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
    putDecisions({});
    setAiFindings([]);
    setAiSummary("");
    setAiState("idle");
    setAiError("");
    setShowInput(true);
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
  /**
   * 검토 시작.
   *
   * 세 단계를 다 돌 때까지 화면에 아무것도 올리지 않는다.
   *
   * 전에는 단계가 끝날 때마다 결과를 조금씩 얹었다. 1차 지적이 먼저 뜨고, 2차가 붙고,
   * 3차가 그중 몇 개를 도로 꺼 놓는 식이었다. 만드는 쪽에는 진행이 보여 좋지만 **쓰는
   * 사람에게는 결과가 눈앞에서 두 번 바뀌는 것**이다. 다 끝난 것을 한 번에 보여 준다.
   */
  async function run(withAi: boolean) {
    const t = text.trim();
    if (!t) return;

    // 상자가 유일한 출처다. 첫 줄이 제목, 나머지 줄이 본문 문단.
    // 부제와 머리말은 따로 들고 있는 값에서 온다.
    const split = splitPastedText(t);
    const nextMeta: ReleaseMeta = {
      ...meta,
      제목: split.제목,
      부제: meta.부제.filter((x) => x.trim()),
    };
    const doc: Doc = { meta: nextMeta, body: split.본문 };
    const src = composeSource(doc);
    if (!src.trim()) return;

    const r = analyze(src);
    // 화면에 올리기 전까지는 전부 여기 안에서만 굴린다
    let dec = defaultDecisions(r.findings);
    let ai: Finding[] = [];
    let summary = "";
    let notes: Record<string, string> = {};
    let failed = "";

    if (withAi) {
      setBusy(true);
      setPhase(1);
      try {
        const got = await reviewWithAi(cfg, src, r.findings);
        setPhase(2);
        ai = got.findings;
        summary = got.summary;
        // 세 번 다 짚은 것은 켜 두고, 갈린 것은 꺼 둔다
        for (const f of ai) dec[f.key] = { on: f.confident === true, pick: 0 };

        const all = [...r.findings, ...ai];

        // 규칙이 답을 정하지 못한 자리를 채운다
        const stuck = all.filter(
          (f) => replacementFor(f, dec[f.key] ?? { on: false, pick: 0 }, src) === null,
        );
        if (stuck.length) {
          try {
            const fills = await fillBlanks(
              cfg,
              stuck.slice(0, 40).map((f) => ({
                id: f.key,
                text: f.text,
                why: f.why,
                context: sentenceAround(src, f.start, f.end),
                before: wordBefore(src, f.start),
              })),
            );
            for (const [key, rep] of Object.entries(fills)) {
              const d = dec[key] ?? { on: false, pick: 0 };
              const f = stuck.find((x) => x.key === key);
              // 시제가 바뀐 것은 넣지 않는다. 3차가 또 볼 것도 없이 여기서 버린다.
              if (f && tenseChanged(f.text, rep)) continue;
              dec[key] = { ...d, custom: rep, on: true };
            }
          } catch {
            /* 채우기가 실패해도 검토 결과는 살린다 */
          }
        }

        // 마지막으로 고쳐 놓은 것을 스스로 다시 본다
        setPhase(3);
        try {
          const res = await verifyOn(src, all, dec);
          dec = res.dec;
          notes = res.notes;
        } catch {
          /* 검수가 실패해도 앞 단계 결과는 살린다 */
        }
      } catch (e) {
        failed = e instanceof Error ? e.message : String(e);
      } finally {
        setBusy(false);
        setPhase(0);
      }
    }

    /*
     * 3차에서 걸린 것은 꺼 두지 않고 **아예 뺀다.**
     *
     * 꺼 두면 담당자 화면에 '왜 꺼져 있는지 읽고 판단할 것' 이 남는다. 그런데 그건
     * 우리가 잘못 고치려다 스스로 걸러 낸 것이지 원고의 문제가 아니다. 숙제로 넘길
     * 일이 아니라 없던 일로 하는 것이 맞다.
     *
     * 그러고 나면 목록에 남는 것은 전부 켜진 것이 된다. '모두 고치기' 를 누른 상태다.
     */
    const dropped = new Set(Object.keys(notes));
    const rule = r.findings.filter((f) => !dropped.has(f.key));
    ai = ai.filter((f) => !dropped.has(f.key));
    const kept: AnalyzeResult = { ...r, findings: rule };

    for (const f of [...rule, ...ai]) {
      const d = dec[f.key] ?? { on: false, pick: 0 };
      if (replacementFor(f, d, src) !== null) dec[f.key] = { ...d, on: true };
    }

    // 여기서 한 번에 화면에 올린다
    setMeta(nextMeta);
    setBody(split.본문);
    setBaseDoc(doc);
    setSource(src);
    setResult(kept);
    putDecisions(dec);
    setAiFindings(ai);
    setAiSummary(summary);
    setVerifyNotes(notes);
    setAiError(failed);
    setAiState(!withAi ? "idle" : failed ? "fail" : "done");
    setActive(null);
    setExportError("");
    jumpToResult.current = true;
    setShowInput(false);
  }

  /** AI 에게 문맥 검토를 맡긴다. 규칙으로 이미 잡은 것은 넘겨서 중복 지적을 막는다. */
  async function askAi(src: string, ruleFindings: Finding[]): Promise<Finding[]> {
    setAiState("run");
    setAiError("");
    try {
      const r = await reviewWithAi(cfg, src, ruleFindings);
      setAiFindings(r.findings);
      setAiSummary(r.summary);
      putDecisions((d) => {
        const next = { ...d };
        // 세 번 다 짚은 것은 켜 두고, 갈린 것은 꺼 둔다. 사람이 읽을 것을 늘리지 않는다.
        for (const f of r.findings) next[f.key] = { on: f.confident === true, pick: 0 };
        return next;
      });
      setAiState("done");
      return r.findings;
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
      setAiState("fail");
      return [];
    }
  }

  /**
   * 검수 — 고쳐 놓은 것을 AI 가 스스로 다시 본다.
   *
   * 모형은 부를 때마다 답이 달라서 제가 제대로 붙인 병기를 다음 번에 떼어 내기도 한다.
   * 사람이 전부 읽어 볼 수는 없으니 **넣기 전에** 한 번 더 묻는다. 새로 찾는 것이 아니라
   * 고친 자리만 옳으냐고 묻기 때문에 답을 그 자리에 그대로 되돌릴 수 있다.
   * 걸린 자리는 지우지 않고 **꺼 둔다** — 판단은 사람이 한다.
   */
  /**
   * 검수 — 화면을 건드리지 않고 결정값만 돌려주는 판.
   *
   * run() 은 세 단계를 다 돌고 나서 한 번에 화면에 올리므로, 중간에 상태를 만지면 안 된다.
   */
  async function verifyOn(
    src: string,
    all: Finding[],
    dec: Record<string, Decision>,
  ): Promise<{ dec: Record<string, Decision>; notes: Record<string, string> }> {
    // 켜진 것만 보면 안 된다. 켜기 전에 걸러 두어야 나쁜 것이 딸려 들어가지 않는다.
    const probe: Record<string, Decision> = { ...dec };
    for (const f of all) {
      const d = probe[f.key] ?? { on: false, pick: 0 };
      if (replacementFor(f, d, src) !== null) probe[f.key] = { ...d, on: true };
    }
    const parts = buildRevisedParts(src, all, probe);
    const revisedText = parts.map((x) => x.text).join("");
    const edits: EditToCheck[] = [];
    let at = 0;
    for (const part of parts) {
      if (part.from !== undefined && part.key) {
        edits.push({
          id: part.key,
          from: part.from,
          to: part.text,
          after: sentenceAround(revisedText, at, at + part.text.length),
        });
      }
      at += part.text.length;
    }
    if (edits.length === 0) return { dec, notes: {} };

    const notes = await verifyEdits(cfg, edits.slice(0, 60));
    const next = { ...dec };
    for (const k of Object.keys(notes)) if (next[k]) next[k] = { ...next[k], on: false };
    return { dec: next, notes };
  }

  /** 키를 넣으러 갔다가 돌아오면 하려던 검토를 잇는다 */
  function onSaveCfg(v: AiConfig) {
    setCfg(v);
    setShowCfg(false);
    if (isConfigured(v) && resume.current) {
      resume.current = false;
      void run(true);
    }
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
        // 규칙이 이 항목을 보기는 하는지. 손으로 적어 두면 규칙을 고쳤을 때
        // 표가 조용히 거짓말을 하므로, 실제 규칙 목록에서 따진다.
        seen: isRuleChecked(c.match),
      })),
    [findings],
  );
  const seenItems = checklist.filter((c) => c.seen);
  const blindItems = checklist.filter((c) => !c.seen);

  const checklistText = useMemo(() => {
    const lines = [
      "보도자료 공공언어 자가점검표",
      `작성 시각: ${new Date().toLocaleString("ko-KR")}`,
      `제목: ${meta.제목}`,
      `분량: ${result?.wordCount ?? 0}어절 / ${result?.charCount ?? 0}자`,
      "",
      // 어절 수 대비 비율은 빼 둔다. 실제 배점 산식이 공개돼 있지 않아 참고치일 뿐인데,
      // 번역 투처럼 사람이 판단할 것은 비율에서 빠지다 보니 ‘6건인데 0.00%’ 같은
      // 고장 난 줄이 나왔다. 셈이 틀린 것은 아니지만 읽는 사람에게는 그냥 오류로 보인다.
      ...AXES.map(
        (a) => `[${a}] 지적 ${findings.filter((f) => f.axis === a).length}건`,
      ),
      "",
      `── 규칙이 본 것 (${seenItems.length}항목) ──`,
      ...seenItems.map(
        (c) =>
          `[${c.hits.length === 0 ? "걸림 없음" : `${c.hits.length}건`}] ${c.area}·${c.group} ${
            c.question
          }` + (c.partial ? `\n    다만 — ${c.partial}.` : ""),
      ),
      "",
      `── 규칙이 못 보는 것 (${blindItems.length}항목) — 작성자가 직접 읽어 보세요 ──`,
      ...blindItems.map(
        (c) => `[ ] ${c.area}·${c.group} ${c.question}` + (c.byEye ? `\n    ${c.byEye}` : ""),
      ),
      "",
      "※ ‘걸림 없음’ 은 규칙에 안 걸렸다는 뜻이지, 그 항목을 지켰다는 뜻이 아닙니다.",
    ];
    return lines.join("\n");
  }, [seenItems, blindItems, findings, result, meta.제목]);

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
        showSettings={!hasProxy()}
      />

      <main
        id="container"
        className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6"
      >
        {tab === "criteria" && <CriteriaView />}
        {tab === "cases" && <CasesView />}

        {/* ------------------ 입력 ------------------ */}
        {tab === "check" && result && !showInput && !busy && (
          <section
            className="relative left-1/2 w-screen -translate-x-1/2 -mt-6 mb-6
                       px-4 sm:px-6 lg:px-8 py-3
                       bg-blue-50 border-b border-blue-100"
          >
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-slate-700">
                초안{" "}
                <b className="text-slate-900">
                  {result.wordCount.toLocaleString()}어절 ·{" "}
                  {result.charCount.toLocaleString()}자
                </b>
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowInput(true)} className={BTN_GHOST}>
                  초안 고치기
                </button>
                <button type="button" onClick={reset} className={BTN_GHOST}>
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  처음부터
                </button>
              </div>
            </div>
          </section>
        )}

        {tab === "check" && (!result || showInput) && !busy && (
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
                            : "여기에 놓으면 제목·본문과 담당자 정보를 채웁니다"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                    <span>
                      첫 줄을 제목으로, 나머지 줄을 본문 문단으로 봅니다.
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

                {/*
                  두 방식을 나란히 놓으면 고르는 사람은 둘이 대등한 줄 안다. 아니다.
                  규칙은 낱말을 대조할 뿐이라 조사·호응·비문은 아예 못 본다. 그걸 제대로
                  보려면 형태소 분석기가 있어야 하는데 그 모델이 104MB 라 웹페이지에
                  실을 수 없다. 규칙을 덜 만들어서가 아니라 구조적으로 안 되는 일이다.
                  그러니 화면이 그렇게 말해야 한다.
                */}
                {/*
                  고를 것이 없으면 설명도 없다. 중계 서버가 있으면 단추 하나로 끝난다.
                  담당자는 어느 회사의 어느 모형인지 알 필요가 없다.
                */}
                {!hasProxy() && (
                <div className="space-y-2 text-sm">
                  <p className="rounded-md bg-white px-3 py-2 text-slate-700">
                    <b className="text-slate-900">AI까지 검토</b> — 용어·표기에 더해{" "}
                    <b className="text-slate-900">조사·호응·비문·군더더기</b>까지 봅니다. 이쪽을 쓰세요.
                  </p>
                  <p className="rounded-md bg-white/60 px-3 py-2 text-slate-600">
                    <b className="text-slate-800">규칙으로만 검토</b> — 용어 목록과 표기 규범만 대조합니다.
                    조사가 틀렸는지, 문장이 말이 되는지는 <b className="text-slate-800">보지 않습니다.</b>{" "}
                    아직 키를 넣지 않았을 때 쓰는 반쪽 검사입니다.
                  </p>
                </div>
                )}

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
                    {!hasProxy() && (
                    <button
                      type="button"
                      onClick={() => void run(false)}
                      disabled={!readyToRun}
                      className="h-12 px-4 sm:px-6 rounded-lg border border-slate-300 bg-white
                                 text-slate-700 font-bold hover:border-blue-600 hover:text-blue-700
                                 transition-colors disabled:text-slate-400 disabled:border-slate-200
                                 flex items-center gap-2 shrink-0"
                    >
                      <span>규칙으로만 검토</span>
                    </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!readyToRun) return;
                        if (!isConfigured(cfg)) {
                          resume.current = true;
                          setShowCfg(true);
                          return;
                        }
                        void run(true);
                      }}
                      disabled={!readyToRun || busy}
                      className="h-12 px-5 sm:px-8 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300
                                 text-white font-bold text-lg rounded-lg transition-colors
                                 flex items-center gap-2 shrink-0"
                    >
                      {busy ? (
                        <Loader2
                          className="w-5 h-5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Sparkles className="w-5 h-5" aria-hidden="true" />
                      )}
                      <span>
                        {busy
                          ? "검토하는 중"
                          : hasProxy()
                            ? "검토하기"
                            : "AI까지 검토"}
                      </span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

          </div>
        )}

        {/* ------------------ 결과 (입력 아래에 이어 붙는다) ------------------ */}
        {/*
          도는 동안 지금 뭘 하고 있는지 보여 준다. 30초쯤 걸리는데 화면이 멈춰 있으면
          고장 난 줄 안다. 단계 이름은 담당자가 알 필요가 없지만, **무언가 순서대로
          진행되고 있다는 것**은 보여야 마음 놓고 기다린다.
        */}
        {tab === "check" && busy && (
          <section ref={busyRef} className="mx-auto max-w-2xl py-10">
            <div className={`${CARD} p-6`}>
              <p className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" aria-hidden="true" />
                검토하는 중입니다
              </p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-700 ease-out"
                  style={{ width: `${Math.round((phase / 3) * 100)}%` }}
                />
              </div>
              <ol className="mt-4 space-y-2">
                {[
                  { n: 1, name: "용어와 표기를 대조합니다", sub: "용어 1,540개·어문 규범" },
                  { n: 2, name: "문장을 읽고 있습니다", sub: "조사·호응·비문·군더더기" },
                  { n: 3, name: "고친 곳을 다시 확인합니다", sub: "잘못 고친 데가 없는지" },
                ].map((st) => {
                  const done = phase > st.n;
                  const now = phase === st.n;
                  return (
                    <li key={st.n} className="flex items-start gap-2.5 text-sm">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          done
                            ? "bg-blue-600 text-white"
                            : now
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {done ? "✓" : st.n}
                      </span>
                      <span>
                        <span className={now ? "font-bold text-slate-900" : done ? "text-slate-600" : "text-slate-400"}>
                          {st.name}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">{st.sub}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-xs text-slate-500">
                30초쯤 걸립니다. 그대로 두셔도 됩니다.
              </p>
            </div>
          </section>
        )}

        {tab === "check" && result && !busy && (
          <div ref={resultRef} className="space-y-8 pb-12 scroll-mt-28">
            {/*
              담당자는 넣고 받으면 끝이어야 한다. 고친 글과 내려받기를 맨 위에 두고,
              나머지(무엇을 고쳤는지·점검표)는 접어 둔다. 지우지는 않는다 — 볼 사람은
              펴서 보면 된다. 화면에 늘어놓고 공부시키지 않는 것이 핵심이다.
            */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionTitle
                  count={fixedCount}
                  unit="곳"
                  desc="자동으로 고친 자리는 초록으로 칠했습니다"
                >
                  자동 수정본
                </SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {/*
                    밖에 두는 것은 내려받기 하나다. 나머지(모두 고치기·되돌리기·
                    원래 말 보기·복사·AI로 채우기)는 손볼 사람만 쓰는 것이라
                    ‘무엇을 고쳤는지 보기’ 안으로 넣었다.
                  */}
                  <button
                    type="button"
                    onClick={downloadHwpx}
                    className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold
                               text-lg rounded-lg transition-colors flex items-center gap-2"
                  >
                    <FileDown className="w-5 h-5" aria-hidden="true" />
                    한글 파일 내려받기
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
                  수정본의 문단 수가 원문과 다릅니다. 아래 ‘hwpx 머리말 정보’에서
                  확인한 뒤 내려받으세요.
                </Notice>
              )}

              <div className={`${CARD} p-5`}>
                {fixedCount === 0 && (
                  <p className="mb-3 text-sm text-slate-600">
                    아직 고친 곳이 없습니다. 위 지적에서 하나씩 켜거나 <b>모두 고치기</b>를 누르세요.
                  </p>
                )}

                {/* 갈아 끼운 자리를 칠해서 어디가 바뀌었는지 바로 보이게 한다 */}
                <div className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-4 font-sans text-base leading-[1.9]">
                  {revisedParts.map((part, i) =>
                    part.from === undefined ? (
                      <span key={i}>{part.text}</span>
                    ) : (
                      <span key={i} title={`원래: ${part.from}`}>
                        {showFrom && (
                          <span className="rounded bg-red-50 px-1 text-red-700 line-through decoration-red-300">
                            {part.from}
                          </span>
                        )}
                        {showFrom && ' '}
                        {/*
                          좌우 여백(px-1)을 주면 안 된다. 원문에는 없는 띄어쓰기가 있는 것처럼
                          보여서 ‘공연 으로’ 로 읽힌다. 자리는 색과 밑줄로만 표시한다.
                        */}
                        <span className="bg-green-100 font-bold text-green-800 underline decoration-green-600 decoration-2 underline-offset-2">
                          {part.text}
                        </span>
                      </span>
                    ),
                  )}
                </div>

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

            <details className="group">
              <summary className="cursor-pointer list-none rounded-lg border border-slate-200 bg-white px-5 py-3 font-bold text-slate-800 hover:border-blue-600">
                <span className="mr-2 text-blue-700 group-open:hidden">＋</span>
                <span className="mr-2 hidden text-blue-700 group-open:inline">－</span>
                무엇을 고쳤는지 보기
                <span className="ml-2 text-sm font-normal text-slate-500">
                  지적 {findings.length}건
                </span>
              </summary>
              <div className="mt-4 space-y-8">
                {/* 손볼 사람만 쓰는 단추들 */}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setAll(true)} className={BTN_GHOST}>
                    <Wand2 className="w-4 h-4" aria-hidden="true" />
                    모두 고치기
                  </button>
                  <button type="button" onClick={() => setAll(false)} className={BTN_GHOST}>
                    <Undo2 className="w-4 h-4" aria-hidden="true" />
                    모두 되돌리기
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFrom((v) => !v)}
                    aria-pressed={showFrom}
                    className={showFrom ? BTN_PRIMARY : BTN_GHOST}
                  >
                    {showFrom ? (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    )}
                    원래 말 같이 보기
                  </button>
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
                </div>
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
                  {/*
                    'AI 문맥 검토도 받기' 를 없앴다. 중계가 붙으면 AI 는 늘 돌고,
                    안 붙었으면 첫 화면에서 'AI까지 검토' 를 고르면 된다. 결과 화면에서
                    같은 것을 또 권하는 단추는 자리만 차지한다.
                  */}
                </div>
              </div>

              {/*
                어떤 단계를 거쳐 나온 결과인지 드러낸다. 안에서 세 번 도는데 화면에는
                지적 수 하나만 보이면, 규칙만 돌린 것과 끝까지 돌린 것이 같아 보인다.
              */}
              <ol className="flex flex-wrap items-stretch gap-2 text-sm">
                {(
                  [
                    {
                      n: "1차",
                      name: "규칙 검토",
                      done: true,
                      say: `${result.findings.length}건`,
                      sub: "용어 목록·표기 규범 대조",
                    },
                    {
                      n: "2차",
                      name: "AI 검토",
                      done: aiState === "done",
                      running: busy,
                      say: aiState === "done" ? `${aiFindings.length}건` : "안 돌림",
                      sub: "조사·호응·비문·군더더기",
                    },
                    {
                      n: "3차",
                      name: "재검토",
                      done: aiState === "done",
                      running: busy,
                      say:
                        aiState === "done"
                          ? Object.keys(verifyNotes).length
                            ? `${Object.keys(verifyNotes).length}건 되돌림`
                            : "이상 없음"
                          : "안 돌림",
                      sub: "고친 자리를 다시 확인",
                    },
                  ] as const
                ).map((st) => (
                  <li
                    key={st.n}
                    className={`flex-1 min-w-[10rem] rounded-lg border px-3 py-2 ${
                      st.done
                        ? "border-slate-300 bg-white"
                        : "border-dashed border-slate-300 bg-slate-50 text-slate-400"
                    }`}
                  >
                    <p className="flex items-center gap-1.5 font-bold text-slate-900">
                      {"running" in st && st.running && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" aria-hidden="true" />
                      )}
                      <span className={st.done ? "text-slate-400" : ""}>{st.n}</span>
                      <span className={st.done ? "" : "text-slate-400"}>{st.name}</span>
                      <span className={`ml-auto ${st.done ? "text-blue-700" : "text-slate-400"}`}>
                        {st.say}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{st.sub}</p>
                  </li>
                ))}
              </ol>

              <p className="text-xs text-slate-500">
                자동 검사로 걸린 것만 센 것이고, 실제 평가 점수가 아닙니다.
              </p>

              {/*
                규칙만 돌린 결과를 그냥 내놓으면 '검토 끝' 으로 읽힌다. 안 본 것이
                무엇인지 그 자리에서 밝힌다. 자가검증 도구가 잘못 괜찮다고 말하는 것은
                아무 말도 안 하느니만 못하다.
              */}
              {aiState !== "done" && !busy && (
                <Notice tone="amber" title="조사·호응·비문은 아직 안 봤습니다">
                  규칙은 용어 목록과 표기 규범을 대조할 뿐입니다. ‘공연로’ 처럼 조사가
                  틀린 것, 주어와 서술어가 어긋난 것, 군더더기는{" "}
                  <b>이 검사에 걸리지 않습니다</b>(‘진로’ 는 낱말이고 ‘공연로’ 는 조사인
                  것을 가리려면 형태소 분석기가 있어야 하는데, 그 모델이 104MB 라
                  웹페이지에 실을 수 없습니다).
                  <br />
                  제대로 보시려면 <b>AI 문맥 검토</b>를 같이 돌리세요.
                </Notice>
              )}

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
                <SectionTitle desc="칠해진 곳을 누르면 오른쪽 지적으로, 오른쪽 지적을 누르면 이 자리로 옵니다">
                  원문
                </SectionTitle>
                <div className={`${CARD} p-5`}>
                  <Highlight
                    text={source}
                    findings={findings}
                    activeKey={active}
                    onPick={pickFromText}
                    markRefs={markRefs}
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
                        // source 를 같이 넘긴다. 안 넘기면 카드에는 ‘로’ 라고
                        // 적히는데 수정본에는 ‘으로’ 가 들어가서 말이 달라진다.
                        const rep = replacementFor(f, d, source);
                        return (
                          <li
                            key={f.key}
                            ref={(el) => {
                              cardRefs.current[f.key] = el;
                            }}
                            onClick={() => {
                              pickedFrom.current = "list";
                              setActive(f.key);
                              setPickTick((n) => n + 1);
                            }}
                            className={`${CARD} p-4 cursor-pointer transition-colors ${
                              active === f.key
                                ? "border-slate-900 ring-2 ring-slate-900/20"
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
                                      putDecisions((s) => ({
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
                                    putDecisions((s) => ({
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
                                  putDecisions((s) => ({
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

              </div>
            </details>

            <details className="group">
              <summary className="cursor-pointer list-none rounded-lg border border-slate-200 bg-white px-5 py-3 font-bold text-slate-800 hover:border-blue-600">
                <span className="mr-2 text-blue-700 group-open:hidden">＋</span>
                <span className="mr-2 hidden text-blue-700 group-open:inline">－</span>
                점검표
                <span className="ml-2 text-sm font-normal text-slate-500">
                  공공언어의 요건 15항목
                </span>
              </summary>
              <div className="mt-4 space-y-8">
            {/* 점검표 */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionTitle desc="공공언어의 요건 15항목">
                  점검표
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
                </div>
              </div>

              {/*
                ○ 를 쓰지 않는다.
                예전에는 규칙이 아예 안 보는 항목에도 ○ 가 붙었다. 아래에 ‘지켰다는
                보증이 아닙니다’ 라고 적어 두었지만 사람은 동그라미를 보면 통과로 읽는다.
                자가검증 도구가 잘못 ‘괜찮다’ 고 말하는 것은 아무 말도 안 하느니만 못하다.
                그래서 규칙이 본 것과 못 보는 것을 아예 갈라 놓는다.
              */}
              <div className={`${CARD} overflow-hidden`}>
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold text-slate-600">
                  <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  규칙이 본 것 {seenItems.length}항목
                </div>
                <ul className="divide-y divide-slate-100">
                  {seenItems.map((c) => (
                    <li key={c.id} className="flex items-start gap-3 px-5 py-3">
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${
                          c.hits.length === 0
                            ? "bg-slate-100 text-slate-500"
                            : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {c.hits.length === 0 ? "걸림 없음" : `${c.hits.length}건`}
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
                            {c.hits
                              .slice(0, 5)
                              .map((h) => h.text)
                              .join(", ")}
                            {c.hits.length > 5 && " …"}
                          </p>
                        )}
                        {c.partial && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            다만 — {c.partial}.
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`${CARD} overflow-hidden`}>
                <div className="flex items-start gap-2 border-b border-slate-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">
                  <AlertTriangle
                    className="mt-0.5 w-3.5 h-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    <b className="font-bold">
                      규칙이 못 보는 것 {blindItems.length}항목
                    </b>{" "}
                    — 검사를 안 한 것이지 잘 썼다는 뜻이 아닙니다. 이 {blindItems.length}가지는
                    작성자가 직접 읽어 보셔야 합니다.
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {blindItems.map((c) => (
                    <li key={c.id} className="px-5 py-3">
                      <p className="text-sm text-slate-800">
                        <span className="mr-2 text-xs font-bold text-slate-400">
                          {c.area}·{c.group}
                        </span>
                        {c.question}
                      </p>
                      {c.byEye && (
                        <p className="mt-0.5 text-xs text-slate-600">{c.byEye}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
              </div>
            </details>
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
                {hasProxy()
                  ? "올린 파일은 브라우저 안에서만 읽습니다. 검토를 누르면 제목·부제·본문만 AI로 보내고, 담당자 이름과 전화번호는 보내지 않습니다."
                  : "원고와 올린 파일은 브라우저 안에서만 처리합니다. AI 검토를 켜면 제목·부제·본문만 지정한 사업자에게 전송되고, 담당자 이름과 전화번호는 보내지 않습니다."}
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
            resume.current = false;
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
