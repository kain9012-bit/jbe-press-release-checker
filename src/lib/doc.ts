import type { ReleaseMeta } from './hwpxOut';

/**
 * 제목·부제·본문을 하나의 글로 이어 붙였다가 다시 쪼갠다.
 *
 * 검사는 이어 붙인 글 위에서 이뤄지고, 수정본은 같은 구조로 되돌려야
 * hwpx 양식의 제 칸에 들어간다. 규칙 수정안은 줄을 새로 만들지 않으므로
 * 문단 개수는 그대로 유지된다.
 */

export const SEP = '\n\n';

/** 이어 붙인 글을 다시 문단으로 쪼갠다 (composeSource 의 짝) */
export const splitSource = (src: string): string[] => src.split(SEP);

export interface Doc {
  meta: ReleaseMeta;
  body: string[];
}

export function composeSource(doc: Doc): string {
  const parts = [
    doc.meta.제목,
    ...doc.meta.부제.filter((s) => s.trim()),
    ...doc.body.filter((s) => s.trim()),
  ].filter((s) => s !== undefined && s !== null);
  return parts.join(SEP);
}

/** 수정본 글을 원래 구조에 맞춰 되돌린다. 구조가 어긋나면 null 을 준다. */
export function decompose(revised: string, doc: Doc): Doc | null {
  const subs = doc.meta.부제.filter((s) => s.trim());
  const body = doc.body.filter((s) => s.trim());
  const parts = revised.split(SEP);
  if (parts.length !== 1 + subs.length + body.length) return null;
  return {
    meta: { ...doc.meta, 제목: parts[0], 부제: parts.slice(1, 1 + subs.length) },
    body: parts.slice(1 + subs.length),
  };
}

/** 붙여 넣은 글을 제목 한 줄 + 본문 문단들로 나눈다. */
export function splitPastedText(raw: string): { 제목: string; 본문: string[] } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { 제목: '', 본문: [] };
  return { 제목: lines[0], 본문: lines.slice(1) };
}
