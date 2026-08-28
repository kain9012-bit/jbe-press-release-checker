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

export default function MetaForm({ value, onChange, lockTitle }: Props) {
  const set = (k: keyof ReleaseMeta, v: string | string[]) => onChange({ ...value, [k]: v });

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
        {(
          [
            ['과장', '김○○ | 063-239-3000'],
            ['담당', '이○○ | 063-239-3001'],
            ['장학사', '박○○ | 063-239-3002'],
          ] as const
        ).map(([k, ph]) => (
          <div key={k}>
            <label className={L} htmlFor={`m-${k}`}>
              {k} <span className="font-normal text-slate-500">이름 | 전화</span>
            </label>
            <input
              id={`m-${k}`}
              className={I}
              value={value[k]}
              onChange={(e) => set(k, e.target.value)}
              placeholder={ph}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
