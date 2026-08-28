import { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

/**
 * 섹션 이동 막대.
 *
 * 화면 안의 `[data-section]` 을 훑어 목록을 만든다. 화면마다 목록을 따로
 * 넘겨줄 필요가 없고, 섹션을 더하거나 빼도 여기를 고칠 일이 없다.
 *
 * 휠은 그대로 자유롭게 굴러간다(CSS scroll-snap 은 쓰지 않는다 — index.css 주석 참고).
 * 구획 단위 이동은 여기서 명시적으로 한다: 점을 누르거나 Alt + ↑/↓.
 */

interface Item {
  id: string;
  label: string;
}

/** 화면이 바뀌면 다시 훑도록 key 를 넘겨 준다 */
export default function SectionNav({ deps }: { deps: unknown }) {
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState(0);

  // ── 목록 만들기 ──
  useEffect(() => {
    const collect = () => {
      const found = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'));
      setItems(
        found.map((el, i) => {
          if (!el.id) el.id = `sec-${i}`;
          return { id: el.id, label: el.dataset.section || `구획 ${i + 1}` };
        }),
      );
    };
    collect();
    // 결과가 그려진 뒤에 섹션이 늘어나는 경우가 있어 한 번 더 훑는다
    const t = setTimeout(collect, 300);
    return () => clearTimeout(t);
  }, [deps]);

  // ── 지금 보고 있는 구획 ──
  //
  // 구획이 네댓 개뿐이라 스크롤할 때 위치를 직접 재는 편이 단순하고 어긋날 일도 없다.
  useEffect(() => {
    if (items.length === 0) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const els = items.map((it) => document.getElementById(it.id));
      // 고정 머리말 바로 아래(140px)를 지난 구획 중 마지막 것
      let idx = 0;
      els.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= 140) idx = i;
      });
      setCurrent(idx);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [items]);

  const go = (idx: number) => {
    const i = Math.max(0, Math.min(items.length - 1, idx));
    const it = items[i];
    if (!it) return;
    // 부드럽게 내려가는 동안에도 연달아 누를 수 있도록 표시를 먼저 옮긴다
    setCurrent(i);
    document.getElementById(it.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Alt + ↑/↓ 로 한 구획씩 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      go(current + (e.key === 'ArrowDown' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (items.length < 2) return null;

  return (
    <nav
      aria-label="구획 이동"
      className="hidden xl:flex fixed right-3 top-1/2 -translate-y-1/2 z-30 flex-col items-end gap-1"
    >
      <button
        type="button"
        onClick={() => go(current - 1)}
        disabled={current === 0}
        aria-label="이전 구획"
        className="p-1.5 rounded-md text-slate-400 hover:text-blue-700 hover:bg-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
      >
        <ChevronUp className="w-4 h-4" aria-hidden="true" />
      </button>

      <ul className="flex flex-col gap-1">
        {items.map((it, i) => {
          const on = i === current;
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={on ? 'true' : undefined}
                className={`group flex items-center gap-2 justify-end w-full transition-colors ${
                  on ? 'text-blue-700' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span
                  className="text-xs font-bold whitespace-nowrap rounded-md px-2 py-1
                             border border-slate-200 bg-white shadow-sm
                             opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100
                             transition-opacity pointer-events-none"
                >
                  {it.label}
                </span>
                <span
                  className={`w-1.5 rounded-full transition-all ${
                    on ? 'h-6 bg-blue-600' : 'h-1.5 bg-slate-300 group-hover:bg-slate-400'
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => go(current + 1)}
        disabled={current === items.length - 1}
        aria-label="다음 구획"
        title="Alt + ↑ / ↓ 로도 넘길 수 있습니다"
        className="p-1.5 rounded-md text-slate-400 hover:text-blue-700 hover:bg-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
      >
        <ChevronDown className="w-4 h-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
