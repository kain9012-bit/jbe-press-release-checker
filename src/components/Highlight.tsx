import type { Finding } from '../lib/analyze';

const TONE: Record<string, string> = {
  용이성: 'bg-blue-100 border-b-2 border-blue-600',
  정확성: 'bg-red-100 border-b-2 border-red-500',
  소통성: 'bg-amber-100 border-b-2 border-amber-500',
};

interface Props {
  text: string;
  findings: Finding[];
  activeKey: string | null;
  onPick: (key: string) => void;
}

/** 원문에 지적 자리를 칠해서 보여 준다. */
export default function Highlight({ text, findings, activeKey, onPick }: Props) {
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
        onClick={() => onPick(f.key)}
        title={`${f.axis} · ${f.sub}`}
        className={`${TONE[f.axis] ?? 'bg-slate-100'} ${
          active ? 'ring-2 ring-slate-900 ring-offset-1' : ''
        } cursor-pointer rounded-sm px-[1px] text-left`}
      >
        {text.slice(f.start, f.end)}
      </button>,
    );
    cursor = f.end;
  });
  parts.push(<span key="tail">{text.slice(cursor)}</span>);

  return <p className="whitespace-pre-wrap leading-[1.9] text-slate-900">{parts}</p>;
}
