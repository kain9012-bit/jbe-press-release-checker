import type { Finding } from '../lib/analyze';

/** 지적 자리 표시 색 — 배지 색(Ui.tsx)과 같은 계열을 쓴다 */
const TONE: Record<string, string> = {
  용이성: 'bg-blue-50 border-b-2 border-blue-600',
  정확성: 'bg-red-50 border-b-2 border-red-500',
  소통성: 'bg-amber-50 border-b-2 border-amber-500',
};

interface Props {
  text: string;
  findings: Finding[];
  activeKey: string | null;
  onPick: (key: string) => void;
  /** 오른쪽 카드를 눌렀을 때 이 자리로 굴러올 수 있게 자리를 등록해 둔다 */
  markRefs?: React.MutableRefObject<Record<string, HTMLElement | null>>;
}

/** 원문에 지적 자리를 칠해서 보여 준다. */
export default function Highlight({ text, findings, activeKey, onPick, markRefs }: Props) {
  const marks = [...findings].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  marks.forEach((f, i) => {
    if (f.start < cursor) return;
    if (f.start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, f.start)}</span>);
    const active = activeKey === f.key;
    parts.push(
      <button
        key={f.key}
        type="button"
        ref={(el) => {
          if (markRefs) markRefs.current[f.key] = el;
        }}
        onClick={() => onPick(f.key)}
        title={`${f.axis} · ${f.sub}`}
        className={`${TONE[f.axis] ?? 'bg-slate-100'} ${
          active ? 'ring-2 ring-slate-900 ring-offset-1' : ''
        } cursor-pointer scroll-mt-28 rounded-sm px-[1px] text-left transition-colors`}
      >
        {text.slice(f.start, f.end)}
      </button>,
    );
    cursor = f.end;
  });
  parts.push(<span key="tail">{text.slice(cursor)}</span>);

  return <p className="whitespace-pre-wrap leading-[1.9] text-slate-900">{parts}</p>;
}
