// FastAPI OpenAPI 스키마 → src/types/api.generated.ts (openapi-typescript).
//
// 백엔드(127.0.0.1:8899)를 띄우지 않고 오프라인으로 생성한다 — app.openapi()를 파이썬
// 프로세스로 덤프한 뒤 openapi-typescript에 파일로 넘긴다. CI(ci.yml 의 api-types-drift
// 잡)가 이 스크립트를 돌린 뒤 `git diff --exit-code`로 백엔드 스키마 ↔ 생성 타입 드리프트를 막는다.
//
// 손으로 옮긴 src/types/index.ts 는 계속 이 앱의 정본 타입이고, api.generated.ts 는
// 드리프트 감지용 참조 산출물이다 (frontend/CLAUDE.md 참고).

import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(frontendDir);
const tmpJson = join(frontendDir, "openapi.tmp.json");
const outFile = join("src", "types", "api.generated.ts");
const python = process.env.PYTHON ?? "python";

const schema = execFileSync(
  python,
  ["-c", "import json, sys; from app.main import app; sys.stdout.write(json.dumps(app.openapi()))"],
  { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const cli = join(frontendDir, "node_modules", "openapi-typescript", "bin", "cli.js");

writeFileSync(tmpJson, schema);
try {
  execFileSync(process.execPath, [cli, tmpJson, "-o", outFile], { cwd: frontendDir, stdio: "inherit" });
} finally {
  rmSync(tmpJson, { force: true });
}
