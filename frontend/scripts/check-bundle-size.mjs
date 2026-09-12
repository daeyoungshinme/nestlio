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
// recharts는 여기 없다 — vite.config.ts 주석 참고. 하나의 이름 있는 청크로 안 묶고 자동
// 분할에 맡기므로 산출물 청크 이름이 recharts 버전에 따라 바뀔 수 있어, 대신
// checkDashboardHasNoRecharts()로 "대시보드가 recharts를 안 받아온다"는 실제 불변조건만 지킨다.
const LIMITS_KB = {
  "react-vendor": 70,
  "query-vendor": 13,
  "supabase-vendor": 65,
  "icons-vendor": 10,
  "http-vendor": 25,
};

function findChunk(files, prefix) {
  return files.find((f) => f.startsWith(`${prefix}-`) && f.endsWith(".js"));
}

function checkVendorSizes(files) {
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
  return failed;
}

// 로그인 후 기본 랜딩 라우트인 대시보드는 recharts를 전혀 쓰지 않는다(차트는 SVG로 직접
// 그린 미니 스파크라인뿐). 예전에 recharts 전체를 "chart-vendor" 청크 하나로 묶었더니
// Rolldown이 대시보드 청크에서 그 청크로 쓰이지 않는 cross-chunk import를 만들어내는 바람에,
// 대시보드가 매번 recharts(gzip 121KB)를 불필요하게 받아오는 회귀가 있었다(2026-09).
// recharts는 css 클래스 접두사("recharts-wrapper" 등)로 인해 미니파이 후에도 문자열이
// 살아남으므로, 산출물 청크 이름이 recharts 버전에 따라 바뀌어도 이 검사는 흔들리지 않는다.
function checkDashboardHasNoRecharts(files) {
  const entry = findChunk(files, "DashboardPage");
  if (!entry) {
    console.error("[bundle-size] DashboardPage 청크를 찾지 못했습니다.");
    return true;
  }

  const visited = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const content = readFileSync(join(assetsDir, file), "utf8");
    for (const match of content.matchAll(/from\s*["']\.\/([^"']+\.js)["']/g)) {
      if (!visited.has(match[1])) queue.push(match[1]);
    }
  }

  let failed = false;
  for (const file of visited) {
    const content = readFileSync(join(assetsDir, file), "utf8");
    if (/recharts/i.test(content)) {
      console.error(`[bundle-size] FAIL: 대시보드 청크(${entry})가 recharts를 포함한 ${file}을(를) 불러옵니다.`);
      failed = true;
    }
  }
  if (!failed) console.log(`[bundle-size] dashboard-no-recharts: ok (${visited.size}개 청크 확인)`);
  return failed;
}

function main() {
  const files = readdirSync(assetsDir);
  const sizeFailed = checkVendorSizes(files);
  const rechartsLeaked = checkDashboardHasNoRecharts(files);

  if (sizeFailed || rechartsLeaked) {
    console.error("\n번들 크기/구성이 임계값을 벗어났습니다. 새 의존성이 의도한 것이라면 scripts/check-bundle-size.mjs를 조정하세요.");
    process.exitCode = 1;
  }
}

main();
