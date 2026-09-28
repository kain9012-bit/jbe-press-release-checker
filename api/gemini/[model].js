/**
 * 옛 주소를 살려 둔다.
 *
 * 버셀 환경변수 VITE_PROXY_URL 이 아직 /api/gemini 를 가리키고 있어도 돌아가게
 * 하려는 것뿐이다. 알맹이는 ../ai/[model].js 하나뿐이고, 상류는 오픈라우터다.
 * 환경변수를 /api/ai 로 바꾼 뒤에는 이 파일을 지워도 된다.
 */
export { default, config } from '../ai/[model].js';
