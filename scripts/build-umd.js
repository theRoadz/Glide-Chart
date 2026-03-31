import esbuild from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

mkdirSync('dist', { recursive: true });

await esbuild.build({
  entryPoints: ['src/widget/widget.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'GlideChart',
  outfile: 'dist/glide-chart.umd.js',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: true,
  logLevel: 'info',
  footer: { js: 'GlideChart = GlideChart.default;' },
});

// Bundle size check — UMD is core-only (no React), so 30KB budget per NFR7
const bundle = readFileSync('dist/glide-chart.umd.js');
const gzipped = gzipSync(bundle);
const gzipKB = (gzipped.length / 1024).toFixed(1);
console.log(`UMD bundle: ${(bundle.length / 1024).toFixed(1)}KB raw, ${gzipKB}KB gzipped`);

const UMD_BUDGET_KB = 30;
if (gzipped.length > UMD_BUDGET_KB * 1024) {
  console.error(`ERROR: UMD bundle exceeds ${UMD_BUDGET_KB}KB gzipped budget (${gzipKB}KB)`);
  process.exit(1);
}
