import type { ReleaseMeta } from '../lib/hwpxOut';

interface Props {
  value: ReleaseMeta;
  onChange: (v: ReleaseMeta) => void;
  /** 제목·부제는 본문과 함께 검사하므로 결과 화면에서는 읽기 전용으로 보여 준다 */
  lockTitle?: boolean;
}

const L = 'mb-1 block text-sm font-bold text-slate-700';
const I =
  'w-full h-11 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-800 outline-none focus:border-blue-600';
const TA =
  'w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-800 outline-none focus:border-blue-600';

const CONTACT_COLS: [string, string][] = [
  ['직위', '과장'],
  ['이름', '김○○'],
  ['전화', '063-239-3000'],
];

export default function MetaForm({ value, onChange, lockTitle }: Props) {
  const set = (k: keyof ReleaseMeta, v: string | string[]) => onChange({ ...value, [k]: v });
  const setCell = (row: number, col: number, v: string) => {
    const 문의 = value.문의.map((r, i) =>
      i === row ? r.map((c, j) => (j === col ? v : c)) : r,
    );
    onChange({ ...value, 문의 });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={L} htmlFor="m-date">
            배포일
          </label>
          <input
            id="m-date"
            type="date"
            className={I}
            value={value.배포일}
            onChange={(e) => set('배포일', e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={L} htmlFor="m-embargo">
            보도시점
          </label>
          <input
            id="m-embargo"
            className={I}
            value={value.보도시점}
            onChange={(e) => set('보도시점', e.target.value)}
            placeholder="배포 즉시 가능"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={L} htmlFor="m-photo">
              사진
            </label>
            <input
              id="m-photo"
              className={I}
              value={value.사진}
              onChange={(e) => set('사진', e.target.value)}
            />
          </div>
          <div>
            <label className={L} htmlFor="m-video">
              영상
            </label>
            <input
              id="m-video"
              className={I}
              value={value.영상}
              onChange={(e) => set('영상', e.target.value)}
            />
          </div>
        </div>
      </div>

      {!lockTitle && (
        <>
          <div>
            <label className={L} htmlFor="m-title">
              제목
            </label>
            <input
              id="m-title"
              className={I}
              value={value.제목}
              onChange={(e) => set('제목', e.target.value)}
              placeholder="전북교육청, ○○○ 추진"
            />
          </div>
          <div>
            <label className={L} htmlFor="m-sub">
              부제 <span className="font-normal text-slate-500">한 줄에 하나</span>
            </label>
            <textarea
              id="m-sub"
              rows={2}
              className={TA}
              value={value.부제.join('\n')}
              onChange={(e) => set('부제', e.target.value.split('\n'))}
            />
          </div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={L} htmlFor="m-dept">
            배포 부서
          </label>
          <input
            id="m-dept"
            className={I}
            value={value.부서}
            onChange={(e) => set('부서', e.target.value)}
            placeholder="중등교육과"
          />
        </div>
      </div>

      {/*
        문의 표는 원본 표의 자리 그대로다. 직위 칸도 손으로 고칠 수 있게 열어 둔다 —
        부서마다 ‘전산행정담당’·‘학부모지원팀 선임’ 처럼 쓰는 말이 다르고, 그것을
        코드가 맞히려 들면 모르는 말이 나올 때마다 사람이 사라진다.
      */}
      <div>
        <div className={L}>문의 표</div>
        <div className="space-y-2">
          {value.문의.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-3">
              {CONTACT_COLS.map(([label, ph], c) => (
                <input
                  key={c}
                  className={I}
                  aria-label={`${i + 1}번째 줄 ${label}`}
                  value={row[c] ?? ''}
                  onChange={(e) => setCell(i, c, e.target.value)}
                  placeholder={ph}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
