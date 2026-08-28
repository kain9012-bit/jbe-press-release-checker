import type { Axis } from './rules';

/** 2026년 공문서등 평가 배점 (설명회 자료 ‘평가 추진 계획’) */
export const SCORING = [
  { target: '보도자료', axis: '용이성' as Axis, item: '어려운 외국어, 외국 문자 사용', point: 50 },
  { target: '보도자료', axis: '용이성' as Axis, item: '정책 용어 등 우리말 사용 여부', point: 10 },
  { target: '보도자료', axis: '정확성' as Axis, item: '어문규범·어법 오류', point: 30 },
  { target: '홍보물', axis: '소통성' as Axis, item: '이해가능성, 공공성 등', point: 10 },
];

export interface CheckItem {
  id: string;
  area: '정확성' | '소통성';
  group: string;
  question: string;
  /** 이 항목을 건드리는 지적의 sub 앞부분 */
  match: string[];
}

/**
 * 공공언어의 요건 — ‘개정판 한눈에 알아보는 공공언어 바로 쓰기’ 첫째 마당 1-다.
 * 자동 점검 결과를 이 표에 얹어 체크리스트를 만든다.
 */
export const CHECKLIST: CheckItem[] = [
  {
    id: 'A1',
    area: '정확성',
    group: '표기의 정확성',
    question: '한글 맞춤법과 표준어 규정을 지켰는가?',
    match: ['표기의 정확성 — 한글 맞춤법', '표기의 정확성 — 두음 법칙', '표기의 정확성 — 문장 부호'],
  },
  {
    id: 'A2',
    area: '정확성',
    group: '표기의 정확성',
    question: '띄어쓰기를 정확하게 하였는가?',
    match: ['표기의 정확성 — 띄어쓰기'],
  },
  {
    id: 'A3',
    area: '정확성',
    group: '표기의 정확성',
    question: '외래어 표기법과 국어의 로마자 표기법을 지켰는가?',
    match: ['표기의 정확성 — 외래어 표기법'],
  },
  {
    id: 'A4',
    area: '정확성',
    group: '표현의 정확성',
    question: '어휘를 적합하게 선택하였는가?',
    match: ['표현의 정확성 — 어휘 사용', '② 어려운 한자어·외래어', '② 일본어 투 용어'],
  },
  {
    id: 'A5',
    area: '정확성',
    group: '표현의 정확성',
    question: '문장을 문법에 맞게 표현하였는가?',
    match: [
      '표현의 정확성 — 번역 투',
      '표현의 정확성 — 피동 표현',
      '표현의 정확성 — 높임 표현',
      '표기의 정확성 — 괄호 뒤 조사',
      '호응',
      '비문',
    ],
  },
  {
    id: 'A6',
    area: '정확성',
    group: '표현의 정확성',
    question: '단락 구성을 짜임새 있게 하였는가?',
    match: ['단락'],
  },
  {
    id: 'B1',
    area: '소통성',
    group: '공공성',
    question: '공공언어로서의 품격을 갖추었는가?',
    match: ['공공성'],
  },
  {
    id: 'B2',
    area: '소통성',
    group: '공공성',
    question: '고압적·권위적 표현을 삼갔는가?',
    match: ['공공성 — 권위적 표현'],
  },
  {
    id: 'B3',
    area: '소통성',
    group: '공공성',
    question: '차별적 표현(성, 지역, 인종, 장애 등)을 삼갔는가?',
    match: ['공공성 — 차별적 표현'],
  },
  {
    id: 'B4',
    area: '소통성',
    group: '정보성',
    question: '정보를 적절한 형식으로 제시하였는가?',
    match: ['정보성'],
  },
  {
    id: 'B5',
    area: '소통성',
    group: '정보성',
    question: '정보의 양을 적절하게 제시하였는가?',
    match: ['정보량'],
  },
  {
    id: 'B6',
    area: '소통성',
    group: '정보성',
    question: '정보의 배열이 적절하게 이루어졌는가?',
    match: ['배열'],
  },
  {
    id: 'B7',
    area: '소통성',
    group: '용이성',
    question: '문장을 적절한 길이로 작성하였는가?',
    match: ['이해가능성 — 문장 길이'],
  },
  {
    id: 'B8',
    area: '소통성',
    group: '용이성',
    question: '쉽고 친숙한 용어와 어조를 사용하였는가?',
    match: [
      '① 외국 글자(로마자) 사용',
      '① 외국 글자(한자) 사용',
      '② 우리말로 대체 가능한 외래어',
    ],
  },
  {
    id: 'B9',
    area: '소통성',
    group: '용이성',
    question: '시각적 편의를 고려하여 작성하였는가?',
    match: [],
  },
];

/** 평가 대상에서 빠지는 자료 (설명회 자료 ‘평가 자료’ 각주) */
export const EXCLUDED = [
  '기관장 동정',
  '단순 행사 안내',
  '보도 설명·반박·해명 자료',
];
