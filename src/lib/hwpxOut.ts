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
const PH_DEPT = '000000과';
/**
 * 문의 표의 세 칸.
 *   ph      — 양식에 들어 있는 직위 자리표시
 *   label   — 실제로 찍을 직위 (양식은 ‘장학사’ 지만 쓰는 이름은 ‘담당자’ 다)
 *   namePh  — 이름 자리표시
 */
const PEOPLE_PH: { ph: string; label: string; namePh: string }[] = [
  { ph: '과장', label: '과장', namePh: '김xx' },
  { ph: '담당', label: '담당', namePh: '이xx' },
  { ph: '장학사', label: '담당자', namePh: '박xx' },
];
const PH_TEL = '063-239-3xxx';

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
  과장: string;
  담당: string;
  담당자: string;
  /** 원본 문의 표에 적혀 있던 직위 글자 (과장·담당·담당자 칸 순서). 비면 양식 이름을 쓴다. */
  직위?: string[];
}

export const EMPTY_META: ReleaseMeta = {
  배포일: '',
  보도시점: '배포 즉시 가능',
  사진: '0',
  영상: '0',
  제목: '',
  부제: [],
  부서: '',
  과장: '',
  담당: '',
  담당자: '',
  직위: [],
};

/* ------------------------------------------------------------------ */

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function splitPerson(value: string): [string, string] {
  if (!value) return ['', ''];
  const parts = value.split(/\s*[|｜/,]\s*/);
  if (parts.length >= 2) return [parts[0].trim(), parts.slice(1).join(' ').trim()];
  const m = /(0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4})/.exec(value);
  if (m) return [value.slice(0, m.index).trim(), m[1].trim()];
  return [value.trim(), ''];
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

  xml = replaceT(xml, PH_DEPT, meta.부서);

  const raws = [meta.과장, meta.담당, meta.담당자];
  PEOPLE_PH.forEach(({ ph, label, namePh }, i) => {
    const [name, tel] = splitPerson(raws[i]);
    xml = replaceT(xml, namePh, name);
    // 전화번호 칸 세 개를 순서대로 하나씩 채운다
    xml = xml.replace(`<hp:t>${PH_TEL}</hp:t>`, `<hp:t>${xmlEscape(tel)}</hp:t>`);
    // 원본에 적혀 있던 직위가 있으면 그것을 쓴다. ‘전산행정담당’ 을 ‘담당’ 으로
    // 덮어쓰면 고쳐 달라고 한 적 없는 사실이 바뀐다.
    const shown = meta.직위?.[i]?.trim() || label;
    // 사람이 없으면 직위 칸도 비운다
    xml = replaceT(xml, ph, name || tel ? shown : '');
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
