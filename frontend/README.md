# nestlio frontend

React + TypeScript + Vite + Tailwind CSS SPA. growlio의 디자인 시스템·인증 방식을 이식했다.

실제 개발 컨벤션(디렉토리 구조, 라우트, 상태/데이터 흐름, 디자인 규칙)은 **[frontend/CLAUDE.md](CLAUDE.md)** 를 본다.

## 커맨드

```bash
npm install                # 의존성 설치 (Node 22, .nvmrc)
npm run dev                # Vite dev 서버 (5273 고정, /api → 127.0.0.1:8899 프록시)
npm run build              # tsc -b && vite build → dist/
npm run typecheck          # tsc --noEmit
npm run lint               # oxlint --deny-warnings (경고도 CI 실패)
npm run test               # vitest run
```

백엔드까지 한 번에 띄우려면 루트의 `dev.sh` / `dev.bat` 을 인자 없이 실행한다.

## 환경 변수

`frontend/.env` (`.env.example` 참고). `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 는
빌드 시점에 번들에 굳어 들어간다 — `.env` 수정 후에는 반드시 재빌드. 자세한 내용은 CLAUDE.md 참고.
