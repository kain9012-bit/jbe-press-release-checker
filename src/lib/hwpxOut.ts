/**
 * 전북교육청 보도자료 hwpx 양식에 내용을 채워 넣는다.
 *
 * jbe-press-release-assistant/scripts/make_hwpx.py 와 같은 방식이다.
 * 양식의 서식(글꼴·크기·표·여백)은 건드리지 않고 <hp:t> 안 글자만 갈아 끼운다.
 */

import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { TEMPLATE_HWPX_B64 } from '../data/template';

const SECTION = 'Contents/section0.xml';
const PREVIEW = 'Preview/PrvText.txt';
const WEEKDAYS = '월화수목금토일';

/* 양식에 들어 있는 자리표시 문자열 */
const PH_TITLE = '제목(HY헤드라인 24포인트)';
const PH_SUBTITLE = '부제목(HY헤드라인 14포인트)';
const PH_DIST = '배포일: 2026. 7. 6. (월)';
const PH_EMBARGO = '보도시점: 배포 즉시 가능';
const PH_MEDIA = ' 사진(0) 영상(0)';

/**
 * 문의 표는 자리로 채운다.
 *
 * 전에는 양식에 박아 둔 ‘과장’·‘담당’·‘장학사’ 라는 글자를 찾아 갈아 끼웠다. 그래서
 * 원본의 직위가 무엇이냐를 코드가 알아야 했고, ‘선임’·‘주임’ 처럼 모르는 말이 나오면
 * 그 사람이 통째로 사라졌다. 이제는 원본 표의 (줄, 열) 을 그대로 양식의 (줄, 열) 에
 * 옮긴다. 무슨 말이 적혀 있는지 볼 일이 없다.
 */
/** 양식 문의 표에서 사람 칸이 시작하는 열 (0=라벨, 1=부서, 2·3·4=직위·이름·전화) */
const PEOPLE_COL0 = 2;
const DEPT_COL = 1;

const BODY_PARA_ATTR = 'paraPrIDRef="38"';
const SUB_PARA_ATTR = 'paraPrIDRef="40"';

export class TemplateError extends Error {}

export interface ReleaseMeta {
  배포일: string;
  보도시점: string;
  사진: string;
  영상: string;
  제목: string;
  부제: string[];
  부서: string;
  /** 문의 표를 자리 그대로. 줄마다 [직위, 이름, 전화] — 적혀 있던 글자 그대로 쓴다. */
  문의: string[][];
}

/** 양식 문의 표의 줄 수 */
export const 문의줄 = 3;
/** 빈 문의 표 (줄 수는 양식에 맞춘다) */
export const emptyContacts = (): string[][] =>
  Array.from({ length: 문의줄 }, () => ['', '', '']);

export const EMPTY_META: ReleaseMeta = {
  배포일: '',
  보도시점: '배포 즉시 가능',
  사진: '0',
  영상: '0',
  제목: '',
  부제: [],
  부서: '',
  문의: emptyContacts(),
};

/* ------------------------------------------------------------------ */

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* --- 표 칸을 자리로 찾아 채우는 부분 -------------------------------- */

/** 여는 표 태그의 자리부터 짝이 맞는 </hp:tbl> 까지 */
function tableSpan(xml: string, from: number): { start: number; end: number } | null {
  const open = xml.indexOf('<hp:tbl', from);
  if (open < 0) return null;
  const re = /<hp:tbl\b|<\/hp:tbl>/g;
  re.lastIndex = open;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    depth += m[0] === '</hp:tbl>' ? -1 : 1;
    if (depth === 0) return { start: open, end: m.index + m[0].length };
  }
  return null;
}

/** ‘담당 부서’ 가 적힌 표를 찾는다. 자리표시 글자가 아니라 표 자체를 찾는 것이다. */
function findContactTable(xml: string): { start: number; end: number } {
  let at = 0;
  for (;;) {
    const span = tableSpan(xml, at);
    if (!span) throw new TemplateError('양식에서 문의 표를 찾지 못했습니다.');
    const inner = xml.slice(span.start, span.end);
    if (/담\s*당[\s\S]{0,40}?부\s*서/.test(inner.replace(/<[^>]+>/g, ''))) return span;
    at = span.end;
  }
}

/** 칸 하나의 글을 갈아 끼운다. 첫 <hp:t> 에 넣고 나머지 <hp:t> 는 비운다. */
function setCellText(cell: string, text: string): string {
  const body = `<hp:t>${xmlEscape(text)}</hp:t>`;
  let first = true;
  if (!/<hp:t>/.test(cell)) {
    return cell.replace(/(<hp:run\b[^>]*)\/>/, `$1>${body}</hp:run>`);
  }
  return cell.replace(/<hp:t>[\s\S]*?<\/hp:t>/g, () => {
    if (first) {
      first = false;
      return body;
    }
    return '<hp:t></hp:t>';
  });
}

/**
 * 표 안의 칸을 자리(열·줄)로 찾아 채운다.
 * put 이 null 을 주면 그 칸은 손대지 않는다.
 */
function fillCells(
  xml: string,
  span: { start: number; end: number },
  put: (col: number, row: number) => string | null,
): string {
  const table = xml.slice(span.start, span.end);
  const re = /<hp:tc\b|<\/hp:tc>/g;
  const out: string[] = [];
  let at = 0;
  let m: RegExpExecArray | null;
  let depth = 0;
  let cellStart = -1;
  while ((m = re.exec(table))) {
    if (m[0] === '</hp:tc>') {
      depth -= 1;
      if (depth !== 0) continue;
      const cell = table.slice(cellStart, m.index + m[0].length);
      // 칸 안에 또 표가 있으면 그 안쪽 칸 주소는 우리 것이 아니다
      const addr = /<hp:cellAddr\b[^>]*\/?>/.exec(cell);
      const col = Number(/colAddr="(\d+)"/.exec(addr?.[0] ?? '')?.[1] ?? NaN);
      const row = Number(/rowAddr="(\d+)"/.exec(addr?.[0] ?? '')?.[1] ?? NaN);
      const text = Number.isFinite(col) && Number.isFinite(row) ? put(col, row) : null;
      out.push(table.slice(at, cellStart));
      out.push(text === null ? cell : setCellText(cell, text));
      at = m.index + m[0].length;
      continue;
    }
    if (depth === 0) cellStart = m.index;
    depth += 1;
  }
  out.push(table.slice(at));
  return xml.slice(0, span.start) + out.join('') + xml.slice(span.end);
}

export function formatDistDate(value: string): string {
  if (!value) return '배포일: ';
  const m = /^(\d{4})[-.\s/]+(\d{1,2})[-.\s/]+(\d{1,2})/.exec(value.trim());
  if (!m) return `배포일: ${value.trim()}`;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return `배포일: ${value.trim()}`;
  }
  // 자바스크립트는 일요일이 0이므로 월요일 기준으로 옮긴다
  const w = WEEKDAYS[(dt.getDay() + 6) % 7];
  return `배포일: ${y}. ${mo}. ${d}. (${w})`;
}

function replaceT(xml: string, oldText: string, newText: string): string {
  const target = `<hp:t>${xmlEscape(oldText)}</hp:t>`;
  if (!xml.includes(target)) {
    throw new TemplateError(`양식에서 자리표시를 찾지 못했습니다: ${oldText}`);
  }
  return xml.replace(target, `<hp:t>${xmlEscape(newText)}</hp:t>`);
}

function findBlocks(xml: string, attr: string): { start: number; end: number; text: string }[] {
  const re = new RegExp(`<hp:p\\b[^>]*${escRe(attr)}[^>]*>[\\s\\S]*?</hp:p>`, 'g');
  const out: { start: number; end: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return out;
}

/** 자리표시 문단을 본떠 새 문단 XML 을 만든다. 줄 배치 정보는 한글이 다시 계산한다. */
function makePara(prototype: string, text: string): string {
  let p = prototype
    .replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, '')
    .replace(/<hp:linesegarray\s*\/>/g, '');
  const body = `<hp:t>${xmlEscape(text)}</hp:t>`;
  if (p.includes('<hp:t>')) {
    p = p.replace(/<hp:t>[\s\S]*?<\/hp:t>/, body);
  } else {
    p = p.replace(/(<hp:run\b[^>]*)\/>/, `$1>${body}</hp:run>`);
  }
  return p;
}

function replaceBlockRun(
  xml: string,
  blocks: { start: number; end: number; text: string }[],
  texts: string[],
): string {
  if (blocks.length === 0) throw new TemplateError('교체할 문단 블록을 찾지 못했습니다.');
  let prototype = blocks[0].text;
  if (!prototype.includes('<hp:t>')) {
    const withText = blocks.find((b) => b.text.includes('<hp:t>'));
    if (withText) prototype = withText.text;
  }
  const start = blocks[0].start;
  const end = blocks[blocks.length - 1].end;
  const inner = texts.length ? texts.map((t) => makePara(prototype, t)).join('') : '';
  return xml.slice(0, start) + inner + xml.slice(end);
}

export const withBullet = (p: string) => (/^[○◯]/.test(p.trim()) ? p.trim() : `○ ${p.trim()}`);

function fillSection(xml: string, meta: ReleaseMeta, body: string[]): string {
  xml = replaceT(xml, PH_DIST, formatDistDate(meta.배포일));
  xml = replaceT(xml, PH_EMBARGO, `보도시점: ${meta.보도시점 || '배포 즉시 가능'}`);
  xml = replaceT(xml, PH_MEDIA, ` 사진(${meta.사진 || '0'}) 영상(${meta.영상 || '0'})`);

  /*
   * 문의 표: 원본의 (줄, 열) 을 양식의 (줄, 열) 에 그대로 옮긴다.
   * 사람이 없는 줄은 세 칸을 다 비운다 — 양식의 ‘김xx’ 가 남아 나가면 안 된다.
   */
  const 문의 = meta.문의 ?? [];
  xml = fillCells(xml, findContactTable(xml), (col, row) => {
    if (col === DEPT_COL) return meta.부서;
    if (col < PEOPLE_COL0) return null;
    return (문의[row]?.[col - PEOPLE_COL0] ?? '').trim();
  });

  xml = replaceT(xml, PH_TITLE, meta.제목);

  const subs = meta.부제.map((s) => s.trim()).filter(Boolean);
  const subBlocks = findBlocks(xml, SUB_PARA_ATTR);
  if (subBlocks.length) {
    xml = replaceBlockRun(xml, subBlocks, subs.length ? subs : ['']);
  } else if (subs.length) {
    xml = replaceT(xml, PH_SUBTITLE, subs.join(' '));
  }

  const paras = body.map((p) => p.trim()).filter(Boolean).map(withBullet);
  const bodyBlocks = findBlocks(xml, BODY_PARA_ATTR);
  if (bodyBlocks.length === 0) {
    throw new TemplateError('본문 문단을 찾지 못했습니다. 양식이 바뀐 것 같습니다.');
  }
  return replaceBlockRun(xml, bodyBlocks, paras.length ? paras : ['']);
}

function buildPreview(meta: ReleaseMeta, body: string[]): string {
  const lines = [
    '<>',
    `<${formatDistDate(meta.배포일)}><보도시점: ${meta.보도시점 || '배포 즉시 가능'}>< 사진(${
      meta.사진 || '0'
    }) 영상(${meta.영상 || '0'})>`,
    '',
    `<${meta.제목}>`,
    ...meta.부제.filter(Boolean).map((s) => `<${s}>`),
    ...body.filter((p) => p.trim()).map(withBullet),
  ];
  return lines.join('\r\n') + '\r\n';
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 양식을 채워 hwpx 바이트를 만든다. */
export function buildHwpx(meta: ReleaseMeta, body: string[]): Uint8Array {
  const files = unzipSync(b64ToBytes(TEMPLATE_HWPX_B64));
  if (!files[SECTION]) throw new TemplateError(`${SECTION} 가 없습니다. hwpx 양식이 맞습니까?`);

  files[SECTION] = strToU8(fillSection(strFromU8(files[SECTION]), meta, body));
  if (files[PREVIEW]) files[PREVIEW] = strToU8(buildPreview(meta, body));

  // mimetype 은 반드시 첫 항목이면서 무압축이어야 한다 (OCF 규약)
  const ordered: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  if (files.mimetype) ordered.mimetype = [files.mimetype, { level: 0 }];
  for (const name of Object.keys(files)) {
    if (name === 'mimetype') continue;
    ordered[name] = [files[name], { level: 6 }];
  }
  return zipSync(ordered as never);
}

const INVALID_FILENAME = /[\\/:*?"<>|\r\n\t]/g;

/** 전북교육청 첨부파일 관행에 맞춘 파일명: '260805-제목.hwpx' */
export function defaultFileName(meta: ReleaseMeta): string {
  let title = (meta.제목 || '보도자료').replace(INVALID_FILENAME, '').trim();
  title = title.replace(/\s+/g, ' ').slice(0, 60) || '보도자료';
  let prefix = '';
  const m = /^(\d{4})[-.\s/]+(\d{1,2})[-.\s/]+(\d{1,2})/.exec((meta.배포일 || '').trim());
  if (m) {
    const p = (n: number) => String(n).padStart(2, '0');
    prefix = `${p(Number(m[1]) % 100)}${p(Number(m[2]))}${p(Number(m[3]))}-`;
  }
  return `${prefix}${title}.hwpx`;
}
