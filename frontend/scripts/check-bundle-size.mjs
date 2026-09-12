import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const assetsDir = join(rootDir, "dist", "assets");

// gzip 크기(KB) 상한 — vite.config.ts의 manualChunks가 만드는 벤더 청크가 눈치채지 못한 새
// 의존성으로 조용히 커지는 걸 잡기 위한 회귀 감지용이다. 정밀한 예산 강제가 아니라서
// 실측치(2026-09 recharts/axios lazy-load 적용 후) 대비 넉넉한 버퍼를 둔다 — 사소한
// 의존성 버전업마다 CI가 실패하면 안 되기 때문. 값을 늘려야 하면 그냥 늘리면 된다.
const LIMITS_KB = {
  "react-vendor": 70,
  "query-vendor": 13,
  "supabase-vendor": 65,
  "chart-vendor": 145,
  "icons-vendor": 8,
  "http-vendor": 25,
};

function findChunk(files, prefix) {
  return files.find((f) => f.startsWith(`${prefix}-`) && f.endsWith(".js"));
}

function main() {
  const files = readdirSync(assetsDir);
  let failed = false;

  for (const [prefix, limitKb] of Object.entries(LIMITS_KB)) {
    const file = findChunk(files, prefix);
    if (!file) {
      console.error(`[bundle-size] ${prefix} 청크를 찾지 못했습니다 (manualChunks 설정이 바뀌었나요?)`);
      failed = true;
      continue;
    }
    const raw = readFileSync(join(assetsDir, file));
    const gzipKb = gzipSync(raw).length / 1024;
    const status = gzipKb > limitKb ? "FAIL" : "ok";
    console.log(`[bundle-size] ${prefix}: ${gzipKb.toFixed(1)}KB gzip (limit ${limitKb}KB) — ${status}`);
    if (gzipKb > limitKb) failed = true;
  }

  if (failed) {
    console.error("\n번들 크기가 임계값을 초과했습니다. 새 의존성이 의도한 것이라면 scripts/check-bundle-size.mjs의 LIMITS_KB를 조정하세요.");
    process.exitCode = 1;
  }
}

main();
