# Frontend CLAUDE.md

React + TypeScript + Vite + Tailwind CSS SPA. growlio(`d:\project\growlio\frontend`)의 디자인 시스템/컴포넌트 컨벤션·인증 방식을 그대로 이식했다 — 새 UI를 추가할 때는 먼저 growlio에 유사한 화면/컴포넌트가 있는지 확인하고 패턴을 맞춘다. Capacitor(네이티브 앱 패키징), Sentry는 의도적으로 도입하지 않았다 (반응형 웹만 지원). PWA는 growlio처럼 `vite-plugin-pwa`/Workbox 기반 서비스워커·오프라인 캐싱까지는 아직 도입하지 않았지만, `public/manifest.webmanifest` + `public/icons/`(192/512px, `favicon.svg`에서 생성)만 추가해 홈 화면 설치(installability)는 지원한다 — `index.html`의 `<link rel="manifest">`/`apple-touch-icon`으로 연결. 오프라인에서는 여전히 동작하지 않는다.

## Commands

### 설치
```bash
cd frontend && npm install
```

### 실행
```bash
# 개발 서버 (5273 고정) — /api/* → 127.0.0.1:8899 자동 프록시
cd frontend && npm run dev
```
백엔드까지 한 번에 띄우려면 루트의 `dev.sh`(Windows: `dev.bat`)를 인자 없이 실행한다 — 백엔드(uvicorn `--reload`) + 이 dev 서버를 동시에 실행하며, 프론트/백엔드 코드 수정이 재빌드 없이 즉시 반영된다.

### 빌드 & 타입 체크
```bash
cd frontend && npm run build       # tsc -b && vite build → frontend/dist
cd frontend && npm run typecheck   # npx tsc --noEmit 과 동일 (빌드 산출물 없음)
```

> **주의**: `frontend/.env`(`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`)는 빌드 시점에 번들에 그대로 굳어 들어간다(`src/lib/supabase.ts`). `.env`가 없거나 오래된 상태로 `npm run build`를 실행하면, 실행 시 `main.tsx` import 체인 최상단에서 `supabase.ts`가 즉시 `throw`해 React가 마운트되기도 전에 죽는다 — `ErrorBoundary`도 못 잡는 모듈 로드 단계 예외라 브라우저에는 아무 에러 표시 없이 **완전히 빈 화면**만 남는다. `.env`를 수정했다면 반드시 재빌드한다 (`npm run dev`는 매번 새로 읽으므로 영향 없음).

### API 타입 자동 생성
```bash
# 백엔드(127.0.0.1:8899)가 떠 있는 상태에서 실행
cd frontend && npm run generate:api-types
# → src/types/api.generated.ts 생성 (.gitignore 대상, 자동 생성 안 됨 — 수동 실행 필요)
# 현재는 손으로 옮긴 src/types/index.ts를 사용 중 — 백엔드 스키마가 안정화되면
# api.generated.ts로 점진 대체를 검토한다.
```

### 테스트
```bash
cd frontend && npm run test        # vitest run
cd frontend && npm run test:watch  # 워치 모드
```

### 환경 변수
`frontend/.env` (`.env.example` 참고), `src/lib/supabase.ts`에서 import — 없으면 Supabase 클라이언트 초기화 자체가 실패한다:
- `VITE_SUPABASE_URL` — Supabase Project URL (growlio와 같은 프로젝트 공유)
- `VITE_SUPABASE_ANON_KEY` — Supabase Anon Key

---

## 아키텍처 (`frontend/src/`)

**Import 규칙**: `@/` alias 사용 (`vite.config.ts` / `tsconfig.app.json`의 `@/* → src/*`).

**인증**: 백엔드에 로그인 엔드포인트가 없다. `stores/authStore.ts`가 `supabase.auth.signInWithPassword`로 직접 로그인해 Supabase JWT를 받고, `api/client.ts`의 axios 인터셉터가 매 요청에 `Authorization: Bearer` 헤더를 붙인다. 401 응답 시 `supabase.auth.refreshSession()`으로 1회 재시도 후에도 실패하면 `nestlio:session-expired` 커스텀 이벤트를 dispatch해 `App.tsx`가 로그아웃 처리한다. nestlio는 여전히 자유 가입은 없다(`/register` 같은 공개 가입 폼은 없음) — 유일한 계정 생성 경로는 **배우자 초대**뿐이다: 로그인한 유저가 `/settings`에서 배우자 이메일로 초대를 보내면(`POST /api/v1/invites`, `api/invites.ts`) 초대 토큰이 담긴 링크가 이메일로 발송되고, 초대받은 사람은 `/invite/accept?token=...`(`pages/InviteAcceptPage.tsx`, `PrivateRoute` 밖 공개 라우트)에서 `supabase.auth.signUp`을 직접 호출해 계정을 만든다. Supabase 프로젝트가 이메일 확인을 요구하므로 growlio와 동일하게 `/auth/callback`(`pages/AuthCallbackPage.tsx`)이 확인 링크 클릭 후 세션을 마무리한다. 로컬 `User` 미러 행은 초대 수락 시 백엔드가 표시 이름과 함께 즉시 만든다(`app/services/invite_service.py::accept_invite`) — 이후 API 요청에서는 기존처럼 `get_current_user`가 미러링을 담당한다. growlio의 `/find-account`, `/forgot-password`, `/reset-password` 라우트는 여전히 없다.

**라우트** (`src/App.tsx` 참고, `/login` 제외 전부 `AppLayout` 하위 `PrivateRoute`):
- `/` — 대시보드 (DashboardPage)
- `/transactions` — 가계부. 예산(월별 카테고리 한도 설정) **관리 화면은 없다** — 월간 캘린더 뷰에 거래/일정/고정지출 예정을 함께 표시하고, 캘린더 아래에 3단계 필터 + 그 조건에 맞는 이번 달 거래를 나열하는 단일 목록(`TransactionListItem`)이 있다. 1단계는 `전체/수입/지출`, `지출`을 고르면 2단계로 `전체/고정지출/변동지출/비정기지출` pill이, 그 아래 3단계로 실제 그 달에 쓰인 카테고리별 필터(`전체` + 카테고리 pill)가 추가로 뜬다. 날짜 클릭 시 뜨는 "거래"/"일정" 탭 모달(`LedgerDayModal`)은 이 필터와 무관하게 항상 그날 전체 거래를 보여준다. 구 `/calendar`(일정 탭)는 이 페이지로 흡수됐고, 구 `/budgets`, `/recurring` 라우트도 `/transactions`로 리다이렉트된다. 고정지출(`RecurringExpense`)은 백엔드 스케줄러(`app/scheduler/jobs.py`)가 계속 자동으로 거래를 생성하며, 규칙 등록/수정/비활성화는 별도 nav 슬롯 없이 페이지 우상단 "더보기" 시트의 "고정지출 관리" 항목(`RecurringManageSheet.tsx`)에서 한다 — 예산 탭과 마찬가지로 기존 탭/시트에 흡수한 것으로, 별도 관리 화면을 두지 않는다는 설계 철학과 배치되지 않는다.
- `/transactions/import`, `/transactions/:id/edit` — CSV 가져오기, 거래 수정 딥링크
- `/categories` — 카테고리 관리(생성/수정/비활성화). 사이드바·하단탭에는 노출하지 않고(예산·고정지출처럼 별도 관리 화면을 최소화하는 설계 철학과 일관되게 nav 슬롯을 늘리지 않음) 가계부(`/transactions`) 더보기 메뉴와 설정(`/settings`) 페이지 링크로만 진입한다.
- `/accounts` — 자산현황 (구 "계좌", 계좌/저축·투자/대출 3탭 평탄 구성 — 저축·투자현황과 대출현황은 목표탭에서 이곳으로 이동했다: 미래 계획·목표치가 아니라 현재 잔액을 조회·기록하는 자산 스냅샷이라는 성격상 대시보드 순자산 카드(`accounts_total`+`savings_total`-`loans_total`=`net_worth`, `GET /net-worth`)와 개념적으로 한 세트이기 때문)
- `/reports/yearly` — 연간 리포트
- `/financial-plan` — 목표 (구 "재무설계", 현금흐름계획/재무목표 2탭 평탄 구성 — 카테고리별 월 예산 상한 입력(구 "예산" 탭, `BudgetTab.tsx`는 삭제됨)은 현금흐름계획 탭의 고정/변동/비정기 섹션 패널 안에 "카테고리별 예산" 서브섹션으로 흡수됐다. 계획(섹션별 금액)과 예산 상한(카테고리별 금액)이 개념적으로 겹쳐 별도 탭 두 개로 나뉘어 있던 것을 한 화면에서 같이 보고 입력하게 합친 것 — 예산 입력은 여전히 대시보드의 `budget_overrun` 코칭 인사이트를 활성화한다. 옛 `tab=예산` 딥링크는 탭 목록에 없는 값이라 기본 탭으로 안전하게 폴백된다)
- `/settings` — 설정
- 미매칭 경로(`*`)는 `/`로 리다이렉트

새 페이지 추가 시 `App.tsx`의 `<Route>`뿐 아니라 `constants/nav.ts`의 `SIDEBAR_NAV_GROUPS`(데스크톱 사이드바, "지출관리"/"자산·목표"/"리포트" 3개 그룹 + 그룹 헤더 없이 상단/하단에 단독 배치되는 대시보드·설정, 총 6개 항목)도 갱신한다. `SIDEBAR_NAV_ITEMS`는 `SIDEBAR_NAV_GROUPS`를 평탄화한 파생 목록이다. 모바일 `BottomNav`는 터치 타겟을 지키기 위해 `BOTTOM_NAV_PRIMARY_ITEMS`(4개: 대시보드/가계부/자산현황/목표)만 상시 노출하고 나머지(`BOTTOM_NAV_MORE_ITEMS`: 연간리포트/설정)는 "더보기" 바텀시트로 접는다 — 예산·고정지출은 관리 화면 자체가 없어지면서 별도 슬롯이 필요 없어졌고, 그 자리에 다음으로 자주 쓰는 자산현황을 승격했다. 일정/예산/고정지출은 독립 탭이 아니라 가계부(`/transactions`) 페이지의 필터·목록으로 흡수됐다 (위 라우트 설명 참고). 두 배열 다 경로(`to`)로 `SIDEBAR_NAV_ITEMS`에서 찾아 파생시키므로(배열 인덱스가 아니라 경로 문자열 목록), 항목을 늘릴 때 `nav.ts`의 그룹 정의와 두 파생 배열의 경로 목록만 고치면 된다.

**컴포넌트 디렉토리** (`src/components/`):
- `layout/` — `AppLayout.tsx`(사이드바+헤더+본문+하단탭 셸), `Sidebar.tsx`(`hidden lg:flex`), `Header.tsx`(데스크톱/모바일 공통 상단바, 현재는 알림 벨 아이콘 하나뿐), `BottomNav.tsx`(`lg:hidden fixed bottom-0`, "더보기" 바텀시트 포함)
- `common/` — growlio에서 그대로 옮긴 범용 컴포넌트: `Button`(variant/size, `active:scale-[0.97]` 탭 피드백), `Modal`(모바일 바텀시트/데스크톱 중앙 다이얼로그, `useModalBehavior` 훅), `ConfirmModal`, `Tabs`(underline/pill), `FormInput`, `EmptyState`, `SkeletonCard`, `PageLoader` — 그리고 nestlio 전용: `SummaryCard`/`SummaryCards`(기존 Jinja `summary_card`/`summary_cards` 매크로를 이식), `Badge`(기존 `badge` 매크로를 이식, 색상은 항상 `utils/colors.ts` 경유)
- `transactions/TransactionForm.tsx` — 가계부 캘린더 페이지의 거래 추가/수정 모달과 `/transactions/:id/edit` 수정 페이지가 공유하는 폼
- `transactions/EventForm.tsx` — 같은 페이지의 일정 추가/수정 모달이 쓰는 폼 (제목/종일/시작·종료일시/장소/설명/반복/리마인더)
- `transactions/MonthCalendarGrid.tsx` — 월간 캘린더 그리드 셸(요일 헤더 + 7열 그리드, `buildGrid`/`todayIso`). 셀 렌더링은 `renderCell` render prop으로 위임하는 제네릭 컴포넌트
- `transactions/LedgerDayCell.tsx` — `MonthCalendarGrid`의 날짜 셀. 거래 수입/지출 금액 + 일정 제목 칩 + 고정지출 예정 배지를 함께 표시
- `transactions/LedgerDayModal.tsx` — 캘린더에서 날짜 칸을 탭했을 때 뜨는 모달. "거래"/"일정" 탭(공용 `Tabs`)으로 나뉘며 각 탭에 해당 날짜의 목록 + 추가/수정/삭제 진입점이 있다 (일정 탭의 고정지출 예정 카드는 정보 표시용이며 더 이상 클릭 이동하지 않는다 — 관리 화면이 없어졌기 때문)
- `transactions/TransactionListItem.tsx` — 거래 한 건의 행 UI(카테고리 배지 + 설명 + 금액 + 수정/삭제 버튼). `LedgerDayModal`의 "거래" 탭과 `TransactionsPage`의 캘린더 아래 월간 목록이 공유한다. `showDate` prop으로 날짜 표시 여부를 정한다(월간 목록은 여러 날짜가 섞여 나오므로 `true`).
- `common/CategoryPicker.tsx` — 카테고리 `<select>` 공통 컴포넌트. `kind` prop으로 수입/지출 필터링. `TransactionForm`이 사용한다.
- `ErrorBoundary.tsx`, `Toaster.tsx` — 최상위 (App.tsx가 감쌈), `nestlio:toast` 커스텀 이벤트 구독

**상태/데이터 흐름**:
```
api/client.ts (axios + Supabase JWT 인터셉터 + 401 자동 refresh)
  └── api/{dashboard,transactions,events,accounts,reports,settings,categories,users}.ts
        └── React Query 훅(각 페이지 컴포넌트 내부, useQuery/useMutation 직접 사용 — growlio처럼
            전용 hooks/useXxx.ts로 감싸는 계층은 페이지 수가 적어 아직 두지 않았다.
            페이지가 늘거나 쿼리가 여러 곳에서 재사용되면 이 계층을 추가한다.)
stores/{authStore,themeStore}.ts — Zustand, React Query 캐시와 무관한 클라이언트 상태
```

**Absolute Rules** (성격이 다른 실수를 반복하지 않기 위해 고정):
- 색상/상태 로직(`ok`/`warn`/`critical`, `info`/`warning`/`critical`, 카테고리 fixed/variable, 수입/지출)은 항상 `utils/colors.ts`의 함수를 통해서만 가져온다. 컴포넌트에 `status === "critical" ? "text-red-600" : ...` 같은 조건부 색상 문자열을 직접 쓰지 않는다.
- 금액은 항상 `Decimal` 문자열(백엔드 응답 그대로)로 다루고, 표시 시점에만 `utils/format.ts`의 `formatKrw`/`formatNumber`를 거친다. 중간에 `parseFloat` 등으로 임의 반올림하지 않는다.
- 터치 타겟: 단독 액션 버튼(수정/삭제 아이콘 버튼 등)은 `constants/uiSizes.ts`의 `TOUCH_TARGET_MIN`(44px), 배지/탭처럼 조밀하게 나열되는 요소는 `TOUCH_TARGET_COMPACT_MOBILE_ONLY`(36px)를 사용한다.
- 입력 필드 스타일은 `constants/inputStyles.ts`의 `INPUT_SM`/`INPUT_MD`/`LABEL_SM`/`LABEL_MD`를 재사용한다 (직접 border/rounded 조합을 새로 쓰지 않는다).
- 다크모드는 growlio와 동일하게 `<html>`의 `.dark` 클래스 기반(`darkMode: "class"`)이다. `stores/themeStore.ts`가 최초 진입 시 `localStorage` 저장값이 없으면 `prefers-color-scheme`을 따르고, 이후에는 토글 값을 우선한다.
- React Query 쿼리 키는 `constants/queryKeys.ts`(`QUERY_KEYS`)에 모아두고 각 페이지에서 직접 배열 리터럴을 만들지 않는다 — mutation 성공 후 무효화할 때 실수로 다른 문자열을 써서 캐시가 안 갱신되는 것을 방지.

**테스트**: growlio와 동일하게 Vitest + Testing Library, `src/test/setup.ts`(jsdom `matchMedia` 폴리필 포함)를 사용한다. 현재는 `utils/`, 공용 컴포넌트, store 위주의 가벼운 커버리지이며 growlio처럼 커버리지 임계값(`vite.config.ts`의 `coverage.thresholds`)은 아직 설정하지 않았다 — 페이지 테스트가 쌓인 뒤 실측값 기반으로 도입한다 (growlio의 `docs/`에 실측 후 임계값을 정한 선례가 있다).
