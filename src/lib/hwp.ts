/**
 * 한글 문서 읽기 — .hwp(OLE 복합문서 + zlib)와 .hwpx(ZIP + XML)
 *
 * jbe-press-release-assistant/scripts/hwp_text.py 를 브라우저에서 돌도록 옮긴 것이다.
 * 판정 로직(본문·제목·부제 찾기)은 원본과 같게 유지한다.
 */

import { unzipSync, inflateSync, unzlibSync, decompressSync } from 'fflate';

export class HwpError extends Error {}

/* ==================================================================
   1. OLE 복합문서(CFB) 리더
   ================================================================== */

const CFB_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const DIFSECT = 0xfffffffc;

interface DirEntry {
  name: string;
  type: number;
  start: number;
  size: number;
}

class OleFile {
  private v: DataView;
  private sectorSize: number;
  private miniSectorSize: number;
  private miniCutoff: number;
  private fat: number[];
  private minifat: number[];
  private dir: DirEntry[];
  private miniStream: Uint8Array;

  constructor(private data: Uint8Array) {
    if (data.length < 512 || CFB_SIG.some((b, i) => data[i] !== b)) {
      throw new HwpError('OLE 복합문서가 아닙니다(HWP 5.0 형식이 아닐 수 있습니다).');
    }
    this.v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.sectorSize = 1 << this.v.getUint16(0x1e, true);
    this.miniSectorSize = 1 << this.v.getUint16(0x20, true);
    const firstDir = this.v.getUint32(0x30, true);
    this.miniCutoff = this.v.getUint32(0x38, true);
    const firstMiniFat = this.v.getUint32(0x3c, true);
    const firstDifat = this.v.getUint32(0x44, true);

    if (this.sectorSize !== 512 && this.sectorSize !== 4096) {
      throw new HwpError(`지원하지 않는 섹터 크기: ${this.sectorSize}`);
    }

    this.fat = this.buildFat(firstDifat);
    this.dir = this.readDirectory(firstDir);
    this.minifat = this.buildMiniFat(firstMiniFat);
    this.miniStream = this.readMiniStream();
  }

  private sectorOffset(n: number) {
    return 512 + n * this.sectorSize;
  }

  private sector(n: number): Uint8Array {
    const off = this.sectorOffset(n);
    if (off < 0 || off + this.sectorSize > this.data.length) {
      throw new HwpError(`섹터 ${n} 가 파일 범위를 벗어납니다.`);
    }
    return this.data.subarray(off, off + this.sectorSize);
  }

  private u32s(buf: Uint8Array): number[] {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const out: number[] = [];
    for (let i = 0; i + 4 <= buf.length; i += 4) out.push(dv.getUint32(i, true));
    return out;
  }

  private buildFat(firstDifat: number): number[] {
    const difat: number[] = [];
    for (let i = 0; i < 109; i++) difat.push(this.v.getUint32(0x4c + i * 4, true));
    let sect = firstDifat;
    let guard = 0;
    while (sect !== ENDOFCHAIN && sect !== FREESECT && guard < 100000) {
      guard += 1;
      let vals: number[];
      try {
        vals = this.u32s(this.sector(sect));
      } catch {
        break;
      }
      difat.push(...vals.slice(0, -1));
      sect = vals[vals.length - 1];
    }

    const fat: number[] = [];
    for (const s of difat) {
      if (s === FREESECT || s === ENDOFCHAIN || s === DIFSECT) continue;
      try {
        fat.push(...this.u32s(this.sector(s)));
      } catch {
        continue;
      }
    }
    return fat;
  }

  private chain(start: number, fat: number[]): number[] {
    const out: number[] = [];
    let s = start;
    let guard = 0;
    const limit = fat.length + 16;
    while (s !== ENDOFCHAIN && s !== FREESECT && guard < limit) {
      guard += 1;
      out.push(s);
      if (s >= fat.length) break;
      s = fat[s];
    }
    return out;
  }

  private readChainBytes(start: number, size?: number): Uint8Array {
    const parts: Uint8Array[] = [];
    let total = 0;
    for (const s of this.chain(start, this.fat)) {
      try {
        const b = this.sector(s);
        parts.push(b);
        total += b.length;
      } catch {
        break;
      }
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return size === undefined ? out : out.subarray(0, size);
  }

  private readDirectory(firstDir: number): DirEntry[] {
    const raw = this.readChainBytes(firstDir);
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const entries: DirEntry[] = [];
    for (let off = 0; off + 128 <= raw.length; off += 128) {
      const nameLen = dv.getUint16(off + 64, true);
      const etype = raw[off + 66];
      if (etype === 0 || nameLen < 2) {
        entries.push({ name: '', type: 0, start: 0, size: 0 });
        continue;
      }
      let name = '';
      for (let i = 0; i < Math.max(0, nameLen - 2); i += 2) {
        name += String.fromCharCode(dv.getUint16(off + i, true));
      }
      entries.push({
        name,
        type: etype,
        start: dv.getUint32(off + 116, true),
        // 크기는 하위 32비트만 써도 충분하다(2GB 넘는 보도자료는 없다)
        size: dv.getUint32(off + 120, true),
      });
    }
    return entries;
  }

  private buildMiniFat(first: number): number[] {
    if (first === ENDOFCHAIN || first === FREESECT) return [];
    return this.u32s(this.readChainBytes(first));
  }

  private readMiniStream(): Uint8Array {
    for (const e of this.dir) {
      if (e.type === 5) return this.readChainBytes(e.start, e.size);
    }
    return new Uint8Array(0);
  }

  listStreams(): string[] {
    return this.dir.filter((e) => e.type === 2).map((e) => e.name);
  }

  openStream(name: string): Uint8Array {
    for (const e of this.dir) {
      if (e.type !== 2 || e.name !== name) continue;
      if (e.size < this.miniCutoff) {
        const parts: Uint8Array[] = [];
        for (const s of this.chain(e.start, this.minifat)) {
          const off = s * this.miniSectorSize;
          parts.push(this.miniStream.subarray(off, off + this.miniSectorSize));
        }
        const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
        let o = 0;
        for (const p of parts) {
          out.set(p, o);
          o += p.length;
        }
        return out.subarray(0, e.size);
      }
      return this.readChainBytes(e.start, e.size);
    }
    throw new HwpError(`스트림을 찾을 수 없습니다: ${name}`);
  }
}

/* ==================================================================
   2. HWP 5.0 레코드
   ================================================================== */

const HWPTAG_PARA_TEXT = 0x010 + 51;

const CHAR_CTRL = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);
const INLINE_CTRL = new Set([4, 5, 6, 7, 8, 9, 19, 20]);
const EXTENDED_CTRL = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);

function* iterRecords(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 0;
  const n = buf.length;
  while (pos + 4 <= n) {
    const header = dv.getUint32(pos, true);
    pos += 4;
    const tag = header & 0x3ff;
    let size = (header >>> 20) & 0xfff;
    if (size === 0xfff) {
      if (pos + 4 > n) return;
      size = dv.getUint32(pos, true);
      pos += 4;
    }
    if (pos + size > n) return;
    yield { tag, payload: buf.subarray(pos, pos + size) };
    pos += size;
  }
}

function decodeParaText(payload: Uint8Array): string {
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const out: string[] = [];
  const n = Math.floor(payload.length / 2);
  let i = 0;
  while (i < n) {
    const code = dv.getUint16(i * 2, true);
    if (CHAR_CTRL.has(code)) {
      if (code === 10 || code === 13) out.push('\n');
      i += 1;
    } else if (INLINE_CTRL.has(code) || EXTENDED_CTRL.has(code)) {
      if (code === 9) out.push('\t');
      i += 8;
    } else {
      out.push(String.fromCharCode(code));
      i += 1;
    }
  }
  return out.join('');
}

function inflateAny(raw: Uint8Array): Uint8Array {
  try {
    return inflateSync(raw);
  } catch {
    /* raw deflate 가 아니면 zlib 머리를 붙인 것일 수 있다 */
  }
  try {
    return unzlibSync(raw);
  } catch {
    /* 마지막으로 자동 판별 */
  }
  return decompressSync(raw);
}

const squash = (s: string) => s.replace(/[ \t 　]+/g, ' ').trim();

/* ==================================================================
   3. hwpx (ZIP + XML)
   ================================================================== */

const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';

export function extractHwpxParagraphs(data: Uint8Array): string[] {
  const files = unzipSync(data);
  const names = Object.keys(files)
    .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  if (names.length === 0) throw new HwpError('hwpx 안에 Contents/section*.xml 이 없습니다.');

  const dec = new TextDecoder('utf-8');
  const parser = new DOMParser();
  const paragraphs: string[] = [];

  for (const n of names) {
    const doc = parser.parseFromString(dec.decode(files[n]), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new HwpError(`${n} 를 읽지 못했습니다.`);
    }
    const ps = Array.from(doc.getElementsByTagNameNS(HP_NS, 'p'));
    for (const p of ps) {
      // 표·글상자를 품은 바깥 문단은 건너뛴다(안쪽 문단이 따로 잡힌다)
      if (p.getElementsByTagNameNS(HP_NS, 'p').length > 0) continue;
      const ts = Array.from(p.getElementsByTagNameNS(HP_NS, 't'));
      const text = squash(ts.map((t) => t.textContent ?? '').join(''));
      if (text) paragraphs.push(text);
    }
  }
  return paragraphs;
}

/* ==================================================================
   4. 문단 뽑기
   ================================================================== */

export function extractParagraphs(data: Uint8Array): string[] {
  if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) {
    return extractHwpxParagraphs(data);
  }

  const ole = new OleFile(data);

  let compressed = true;
  try {
    const fh = ole.openStream('FileHeader');
    if (fh.length >= 40) {
      const flags = new DataView(fh.buffer, fh.byteOffset, fh.byteLength).getUint32(36, true);
      compressed = (flags & 0x01) !== 0;
      if (flags & 0x02) throw new HwpError('암호가 설정된 문서라 읽을 수 없습니다.');
    }
  } catch (e) {
    if (e instanceof HwpError && e.message.includes('암호')) throw e;
  }

  const sections = ole
    .listStreams()
    .filter((s) => /^Section\d+$/.test(s))
    .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)));
  if (sections.length === 0) throw new HwpError('본문(Section) 스트림이 없습니다.');

  const paragraphs: string[] = [];
  for (const name of sections) {
    let raw = ole.openStream(name);
    if (compressed) {
      try {
        raw = inflateAny(raw);
      } catch {
        continue;
      }
    }
    for (const { tag, payload } of iterRecords(raw)) {
      if (tag !== HWPTAG_PARA_TEXT) continue;
      for (const line of decodeParaText(payload).split('\n')) {
        const t = squash(line);
        if (t) paragraphs.push(t);
      }
    }
  }
  return paragraphs;
}

/* ==================================================================
   5. 전북교육청 보도자료 서식 해석
   ================================================================== */

const BULLETS_MAIN = ['○', '◯'];
const BULLETS_ALT = ['□', '■', '▷', '◇', '·'];
const DIST_DATE_RE = /(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/;
const WEEKDAY_RE = /\(([월화수목금토일])\)/;
const PHOTO_RE = /사진\s*\(\s*([^)]{0,10})\s*\)/;
const VIDEO_RE = /영상\s*\(\s*([^)]{0,10})\s*\)/;
const FIELD_LABELS = ['배포일', '보도시점', '배포부서', '담당자', '연락처'];

const SKIP_IN_HEAD = new RegExp(
  '배\\s*포\\s*일|보\\s*도\\s*시\\s*점|사진\\s*\\(|영상\\s*\\(|담\\s*당\\s*부\\s*서|' +
    '\\(\\s*문\\s*의\\s*\\)|연\\s*락\\s*처|담\\s*당\\s*자|^보\\s*도\\s*자\\s*료$|^즉시\\s*보도|' +
    '^\\d{4}\\s*\\.\\s*\\d{1,2}\\s*\\.|^\\d{2,3}-\\d{3,4}-\\d{4}$|^0\\d{1,2}-\\d{3,4}-\\d{4}|' +
    '^전화|^팩스|^Tel|^www\\.|' +
    '^(?:[가-힣]{2,12})?(?:과장|국장|관장|센터장|팀장|장학관|장학사|주무관|사무관|담당)$|' +
    '^전북특별자치도교육청$|^전라북도교육청$|^전북교육청$',
);
const NAME_ONLY = /^[가-힣]{2,4}$/;

const startsWithAny = (s: string, arr: string[]) => arr.some((b) => s.startsWith(b));
const spaced = (s: string) =>
  s
    .split('')
    .filter((c) => c.trim())
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*');

function fieldValue(lines: string[], label: string, lookahead = 20): string {
  const pat = new RegExp(spaced(label));
  for (let i = 0; i < Math.min(lookahead, lines.length); i++) {
    const m = pat.exec(lines[i]);
    if (!m) continue;
    const tail = lines[i].slice(m.index + m[0].length).replace(/^[\s:：\t]+/, '');
    let value: string;
    if (tail) {
      value = tail;
    } else if (i + 1 < lines.length) {
      const nxt = lines[i + 1];
      const bare = nxt.replace(/^[\s:：]+/, '');
      if (FIELD_LABELS.some((l) => bare.startsWith(l))) return '';
      value = nxt.replace(/^[\s:：\t]+/, '');
    } else {
      return '';
    }
    let cut = value.length;
    for (const other of [...FIELD_LABELS, '사진(', '영상(', '사진 (', '영상 (']) {
      if (other === label) continue;
      const j = value.indexOf(other);
      if (j >= 0 && j < cut) cut = j;
    }
    return value.slice(0, cut).replace(/^[\s:：\t]+|[\s:：\t]+$/g, '');
  }
  return '';
}

function longestRunStart(indices: number[]): number {
  if (indices.length === 0) return 0;
  let bestStart = indices[0];
  let bestLen = 1;
  let curStart = indices[0];
  let curLen = 1;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) curLen += 1;
    else {
      curStart = indices[i];
      curLen = 1;
    }
    if (curLen >= bestLen) {
      bestStart = curStart;
      bestLen = curLen;
    }
  }
  return bestStart;
}

function bodyIndices(paras: string[]): number[] {
  const main = paras.map((p, i) => (startsWithAny(p, BULLETS_MAIN) ? i : -1)).filter((i) => i >= 0);
  if (main.length) return main;
  return paras
    .map((p, i) => (startsWithAny(p, BULLETS_ALT) && p.length > 12 ? i : -1))
    .filter((i) => i >= 0);
}

/**
 * 직위로 볼 수 있는 말.
 *
 * 서식마다 ‘과장’ 이라고만 쓰기도 하고 ‘행정지원과장’ 처럼 앞에 부서를 붙이기도 한다.
 * 한글 사이에 공백을 넣는 서식(‘담 당 자’, ‘중 등 담 당’)도 흔하다.
 * 그래서 공백을 지운 뒤 **끝말**로 판단한다.
 */
const ROLE_SUFFIX = [
  '장학사',
  '장학관',
  '담당자',
  '주무관',
  '사무관',
  '센터장',
  '교육장',
  '과장',
  '국장',
  '관장',
  '실장',
  '부장',
  '팀장',
  '계장',
  '담당',
  '주사',
];
const TEL_RE = /^(0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4})$/;
const DEPT_RE = /(과|관|실|센터|단|팀|국)$/;

const despace = (s: string) => s.replace(/\s+/g, '');

/** 직위면 그 끝말을, 아니면 빈 문자열 */
function roleOf(text: string): string {
  const t = despace(text);
  if (t.length > 12) return '';
  return ROLE_SUFFIX.find((r) => t.endsWith(r)) ?? '';
}

/** 담당 부서 표에서 부서명과 담당자를 뽑는다. */
function parseContacts(paras: string[]) {
  const out = { 부서: '', 사람: [] as { role: string; name: string; tel: string }[] };
  const i = paras.findIndex((p) => /담\s*당\s*부\s*서/.test(p));
  if (i < 0) return out;

  let pending: { role: string; name: string; tel: string } | null = null;
  for (let k = i + 1; k < paras.length; k++) {
    const t = paras[k].trim();
    if (!t || /^\(\s*문\s*의\s*\)$/.test(t)) continue;

    const role = roleOf(t);

    // 부서명이 먼저 온다. ‘행정지원과장’ 처럼 직위로도 읽히는 말은 직위를 우선한다.
    if (!out.부서 && !role && DEPT_RE.test(despace(t)) && despace(t).length >= 3) {
      out.부서 = despace(t);
      continue;
    }
    if (role) {
      if (pending) out.사람.push(pending);
      pending = { role, name: '', tel: '' };
      continue;
    }
    if (!pending) continue;
    if (TEL_RE.test(t)) {
      if (!pending.tel) pending.tel = t;
      continue;
    }
    if (!pending.name && /^[가-힣○◯xX?·\s]{2,10}$/.test(t)) {
      pending.name = despace(t);
      continue;
    }
  }
  if (pending) out.사람.push(pending);
  return out;
}

export interface PressRelease {
  ok: boolean;
  error: string;
  paragraphs: string[];
  배포일: string;
  요일: string;
  보도시점: string;
  사진: string;
  영상: string;
  제목: string;
  부제: string[];
  본문: string[];
  부서: string;
  과장: string;
  담당: string;
  담당자: string;
  서식: string;
}

export function parsePressRelease(data: Uint8Array): PressRelease {
  const r: PressRelease = {
    ok: false,
    error: '',
    paragraphs: [],
    배포일: '',
    요일: '',
    보도시점: '',
    사진: '',
    영상: '',
    제목: '',
    부제: [],
    본문: [],
    부서: '',
    과장: '',
    담당: '',
    담당자: '',
    서식: '',
  };

  let paras: string[];
  try {
    paras = extractParagraphs(data);
  } catch (e) {
    r.error = e instanceof Error ? e.message : String(e);
    return r;
  }
  r.paragraphs = paras;
  if (paras.length === 0) {
    r.error = '본문 문단을 찾지 못했습니다.';
    return r;
  }

  const head = paras.slice(0, 14).join(' ');

  let dist = fieldValue(paras, '배포일');
  let embargo = fieldValue(paras, '보도시점');
  // 옛 서식은 '보도시점' 칸에 배포 날짜를 적는다.
  if (!dist && embargo && DIST_DATE_RE.test(embargo)) {
    dist = embargo;
    embargo = '';
  }
  if (dist) {
    const m = DIST_DATE_RE.exec(dist);
    if (m) {
      r.배포일 = `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
    }
    const w = WEEKDAY_RE.exec(dist);
    if (w) r.요일 = w[1];
  }
  r.보도시점 = embargo;

  const ph = PHOTO_RE.exec(head);
  if (ph) r.사진 = ph[1].trim();
  const vd = VIDEO_RE.exec(head);
  if (vd) r.영상 = vd[1].trim();

  const bullets = bodyIndices(paras);
  if (bullets.length) r.본문 = bullets.map((i) => paras[i]);

  const blockStart = bullets.length ? longestRunStart(bullets) : paras.length;
  const headLines: string[] = [];
  for (let i = blockStart - 1; i >= 0 && headLines.length < 4; i--) {
    const p = paras[i];
    if (startsWithAny(p, BULLETS_MAIN) || SKIP_IN_HEAD.test(p) || NAME_ONLY.test(p) || p.length < 6) {
      break;
    }
    headLines.unshift(p);
  }
  if (headLines.length) {
    // 제목을 두 줄로 앉히는 서식이 있다.
    //   김제교육지원청·김제시,
    //   「2026 김제 청소년 문화 축제」 개최
    // 쉼표로 끝나면 다음 줄까지가 제목이다.
    let 제목 = headLines[0];
    let rest = headLines.slice(1);
    while (/[,，·]$/.test(제목.trim()) && rest.length) {
      제목 = `${제목.trim()} ${rest[0].trim()}`;
      rest = rest.slice(1);
    }
    r.제목 = 제목;
    r.부제 = rest;
  }

  const contacts = parseContacts(paras);
  r.부서 = contacts.부서;
  const join = (p: { name: string; tel: string }) =>
    [p.name, p.tel].filter(Boolean).join(' | ');
  // 서식의 세 칸(과장·담당·담당자)에 넣는다.
  // 과장급은 첫 칸으로, 나머지는 나온 순서대로 담당 → 담당자.
  const rest: string[] = [];
  const 관리직 = ['과장', '국장', '관장', '센터장', '실장', '부장', '교육장'];
  for (const person of contacts.사람) {
    const line = join(person);
    if (!line) continue;
    if (관리직.includes(person.role) && !r.과장) r.과장 = line;
    else if (!r.담당) r.담당 = line;
    else if (!r.담당자) r.담당자 = line;
    else rest.push(line);
  }
  for (const line of rest) {
    if (!r.담당) r.담당 = line;
    else if (!r.담당자) r.담당자 = line;
  }

  r.서식 = fieldValue(paras, '배포일') ? '2026-07 이후' : '이전 서식';
  r.ok = Boolean(r.제목 || r.본문.length);
  return r;
}
