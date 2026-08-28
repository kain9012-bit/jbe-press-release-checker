# 보도자료 공공언어 자가검증

보도자료 초안을 넣으면 **국립국어원 공문서등 평가 기준**에 따라 고칠 곳을 짚고,
반영한 수정본과 점검표를 만들어 주는 웹 도구입니다.

넣는 방법은 두 가지입니다. 글을 그대로 붙여 넣어도 되고, 쓰던 한글 파일(.hwp, .hwpx)을
올려도 됩니다. 어느 쪽이든 결과는 **전북교육청 보도자료 양식이 적용된 hwpx 파일**로 나옵니다.

작성 부서가 스스로 검증하고, 대변인실의 반복 검토·수정 부담을 줄이는 것이 목적입니다.

## 화면 규격

내가 만드는 웹 화면은 한 벌처럼 보여야 하므로 [jbe-weekly-policy-meeting](https://github.com/kain9012-bit/jbe-weekly-policy-meeting)
과 같은 규격을 쓴다. 새 화면을 붙일 때도 여기서 벗어나지 않는다.

- `src/index.css` — KRDS 토큰을 Tailwind 기본 팔레트에 덮어씌운 것. k-edu-policy 것을 그대로 가져왔다.
- `src/components/Ui.tsx` — `Badge` `SectionTitle` `EmptyState` `Stat` `Notice`,
  그리고 버튼 두 벌(`BTN_PRIMARY` 진회색 / `BTN_GHOST` 테두리)과 `CARD`.
- `src/components/Header.tsx` — 회색 안내 띠(비공식 고지) + 파란 사각 로고 + 서비스명·기관명 + 탭(`border-b-[3px]`).
- 본문은 `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`, 첫 화면은 화면 폭을 채우는 `bg-blue-50` 띠.
- 푸터는 `bg-slate-900` 두 칸(왼쪽 서비스 설명 / 오른쪽 출처), 오른쪽 아래 '맨 위로' 버튼.
- `src/components/SectionNav.tsx` — 오른쪽 구획 이동 막대. 화면 안의 `[data-section]` 을 훑어
  목록을 만들므로, 구획을 더하거나 뺄 때 이 파일을 고칠 일은 없다.
  구획에는 `data-section="이름"` 과 `className="doc-section"` 을 같이 준다.

  CSS `scroll-snap` 은 **일부러 쓰지 않았다.** proximity 로도 시험해 봤는데, 화면보다 긴
  구획(원문·지적 목록, 점검표) 안에서 휠을 조금 굴리면 방금 지나온 경계로 도로 끌려가
  안쪽을 읽을 수가 없었다. 그래서 휠은 그대로 두고, 구획 이동은 막대와 Alt + ↑/↓ 로 한다.

## 무엇을 보나

| 평가 항목 | 지표 | 이 도구가 하는 일 |
|---|---|---|
| 용이성 | 외국 글자(로마자·한자) 사용 | 한글 병기 없이 쓴 로마자·한자를 모두 찾아냅니다 |
| 용이성 | 우리말로 대체 가능한 외래어 | 평가용 용어 목록 1,540개 + 필수 개선 행정용어 100개 + 일본어 투 50개로 대조 |
| 정확성 | 표기의 정확성 | 두음 법칙, 외래어 표기법, 띄어쓰기, 괄호 뒤 조사, 문장 부호 |
| 정확성 | 표현의 정확성 | 번역 투, 이중 피동, 사물 존대, 어휘 오용 |
| 소통성 | 공공성 | 권위적 표현, 차별적 표현 |
| 소통성 | 이해가능성 | 지나치게 긴 문장 |

문맥을 봐야 판단할 수 있는 것(주술 호응, 접속의 대등성, 생략, 중복)은 규칙으로 잡지 않고
**AI 문맥 검토**에 맡깁니다. AI는 선택 사항이고, 키를 넣지 않아도 규칙 검사는 그대로 돌아갑니다.

## 한글 파일 읽고 쓰기

브라우저 안에서 직접 처리합니다. 서버도 변환기도 쓰지 않습니다.

- `src/lib/hwp.ts` — .hwp(OLE 복합문서 + zlib)와 .hwpx(ZIP + XML)를 읽는다.
  `jbe-press-release-assistant/scripts/hwp_text.py` 를 타입스크립트로 옮긴 것이고,
  제목·부제·배포일·보도시점·사진/영상·배포 부서·담당자까지 뽑아 낸다.
- `src/lib/hwpxOut.ts` — 전북교육청 양식 hwpx의 자리표시를 갈아 끼워 새 파일을 만든다.
  `scripts/make_hwpx.py` 와 같은 방식이라 서식(글꼴·표·여백)은 그대로 남는다.
- `src/data/template.ts` — 양식 hwpx를 base64로 묻어 둔 것.
  원본은 `jbe-press-release-assistant/templates/jbe-press-release-form.hwpx`.
  **양식이 바뀌면 이 파일을 다시 만들어야 한다.**

  ```bash
  python3 - <<'EOF'
  import base64
  b = open('../jbe-press-release-assistant/templates/jbe-press-release-form.hwpx','rb').read()
  s = base64.b64encode(b).decode()
  lines = [s[i:i+120] for i in range(0, len(s), 120)]
  out = "export const TEMPLATE_HWPX_B64 =\n"
  out += "\n".join("  '%s' +" % l for l in lines[:-1]) + "\n  '%s';\n" % lines[-1]
  open('src/data/template.ts','w').write(out)
  EOF
  ```

## 근거 자료

- 2026년 공공기관등 공문서등 평가 설명회 발표 자료(문화체육관광부 국어정책과·국립국어원, 2026. 3. 10.)
- 개정판 한눈에 알아보는 공공언어 바로 쓰기(국립국어원, 2022)
- 2026년 용이성 평가용 용어 목록(1,540개, 2026. 8. 기준)

## 원고는 어디로 가나

- 규칙 검사: 브라우저 안에서만 처리합니다. 서버로 아무것도 보내지 않습니다.
- AI 검토: 사용자가 설정에서 키를 넣고 버튼을 눌렀을 때만, 그 회사의 API로 원고가 전송됩니다.
  키는 브라우저 저장소에만 남습니다. **대외비 원고는 AI 검토를 쓰지 마세요.**

## 실행

```bash
npm install
npm run dev      # http://localhost:3100
npm run build    # dist/ 생성
npm run lint     # 타입 검사
```

`vite.config.ts` 의 `base: './'` 때문에 GitHub Pages 하위 경로에서도 그대로 동작합니다.

## 배포

`.github/workflows/pages.yml` 이 `main` 에 push 될 때마다 빌드해서 GitHub Pages 에 올립니다.
처음 한 번만 아래를 하면 됩니다.

```bash
git remote add origin https://github.com/<계정>/jbe-press-release-checker.git
git branch -M main
git push -u origin main
```

그다음 저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 바꿉니다.
(기본값인 'Deploy from a branch' 로 두면 워크플로가 올린 결과가 나오지 않습니다.)

배포된 주소는 `https://<계정>.github.io/jbe-press-release-checker/` 입니다.
이후로는 고친 것을 push 하기만 하면 2~3분 안에 반영됩니다.

원고는 배포된 뒤에도 브라우저 안에서만 처리됩니다. 서버가 없으니 올라갈 곳도 없습니다.

## 한계

- 자동 검사에서 걸린 것이 없다고 해서 규범을 지켰다는 보증이 아닙니다.
- 화면에 나오는 오류율은 자동 검사로 걸린 것만 센 참고치이며, 실제 평가 배점 산식과 다릅니다.
- 단락 구성, 정보의 양과 배열, 시각적 편의는 자동 검사 대상이 아닙니다.
- ‘사례’ 탭의 첨삭 사례는 원 책자 PDF에서 자동으로 뽑은 것이라 일부 항목이 잘려 있을 수 있습니다.
