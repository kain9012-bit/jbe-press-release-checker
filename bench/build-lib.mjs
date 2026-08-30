// 검사 알맹이를 node 에서 부를 수 있게 묶는다. 하네스는 브라우저 없이 돈다.
import { build } from 'esbuild';
await build({
  entryPoints: ['bench/entry.ts'],
  bundle: true, format: 'esm', platform: 'neutral',
  outfile: 'bench/lib.mjs', loader: { '.json': 'json' },
  define: { 'import.meta.env.VITE_PROXY_URL': '""' },
  logLevel: 'error',
});
console.log('bench/lib.mjs 만듦');
