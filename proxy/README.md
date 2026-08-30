# 제미나이 중계 서버

API 키를 웹페이지에서 떼어 내기 위한 것이다. 키는 여기에만 있다.

## 왜 필요한가

브라우저가 읽을 수 있으면 사람도 읽는다. 정적 웹페이지에 키를 넣으면 F12 한 번에 그대로
보이고, 깃허브 Secrets 로 넣어도 **빌드 결과물에 박히므로 마찬가지다.** Secrets 는 Actions
안에서만 비밀이다. 키를 감추려면 키를 들고 대신 요청해 주는 것이 하나 있어야 한다.

## 올리는 법

```bash
npm i -g wrangler
cd proxy
wrangler login
wrangler secret put GEMINI_API_KEY      # 키를 여기에 넣는다. 저장소에는 남지 않는다.
wrangler deploy
```

올리고 나면 `https://jbe-press-release-proxy.<계정>.workers.dev` 같은 주소가 나온다.
그 주소로 웹페이지를 빌드한다.

```bash
VITE_PROXY_URL=https://jbe-press-release-proxy.<계정>.workers.dev npm run build
```

`VITE_PROXY_URL` 은 비밀이 아니다. 그냥 주소다. 깃허브 Actions 변수에 넣어도 되고
워크플로에 그대로 적어도 된다.

이 값이 있으면 **부서 담당자는 설정을 열 일이 없다.** 글을 넣고 ‘AI까지 검토’ 를 누르면 된다.

## 문을 어떻게 좁혔나

| | |
|---|---|
| `ALLOWED_ORIGINS` | 이 웹주소에서 온 것만 받는다 (`wrangler.toml`) |
| `ALLOWED_MODELS` | 정해 둔 모형만 부를 수 있다 (`worker.js`) |
| `MAX_BODY` | 64KB 넘는 원고는 거절한다 |
| `LIMITER` | 같은 IP 에서 분당 30회까지 |

주소 끝의 모형 이름만 보고 구글 주소를 서버가 직접 만든다. 바깥에서 넘긴 주소를 따라가지
않는다.

## 솔직히 말해 두는 것

`Origin` 머리글은 브라우저가 붙이는 것이라 브라우저 밖에서는 꾸며 낼 수 있다. 이 문은
크롤러와 지나가는 사람을 막지, 작정한 사람을 막지는 못한다.

**그러니 구글 클라우드 콘솔에서 결제 상한을 먼저 걸어 두어야 한다.**

다만 키가 통째로 새는 것과는 전혀 다르다. 여기서는 이상하면 이 중계를 꺼 버리면 끝이고,
키를 다시 발급할 필요도 없다. 새어 나갈 키가 애초에 웹페이지에 없다.

## 확인

```bash
node ../bench/worker.test.mjs
```

허용된 주소·모형만 통과하고, 남의 사이트·Origin 없는 요청·허용 안 된 모형·너무 긴 원고·
GET 이 각각 막히는지 본다. 응답에 키가 섞여 나가지 않는 것도 본다.
