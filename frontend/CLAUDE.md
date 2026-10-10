# Frontend CLAUDE.md

React + TypeScript + Vite + Tailwind SPA. growlio(`d:\project\growlio\frontend`)의 디자인 시스템·컴포넌트 컨벤션·인증 방식을 이식했다 — **새 UI를 만들 때는 먼저 growlio에 유사한 화면/컴포넌트가 있는지 확인하고 패턴을 맞춘다.** Capacitor·Sentry·서비스워커(오프라인)는 의도적으로 없다. `public/manifest.webmanifest`로 홈 화면 설치만 지원한다.

## Commands

Node 22(`.nvmrc`). 모두 `frontend/`에서 실행.

```bash
npm install
npm run dev                 # Vite 5273(VITE_DEV_PORT로 변경), /api/* → 8899 프록시(VITE_BACKEND_PORT)
npm run build               # tsc -b && vite build → dist/
npm run typecheck           # tsc -b --noEmit — 루트 tsconfig.json은 references만 있어 -b 없이 돌리면 0개 파일을 검사하고 통과한다
npm run lint                # oxlint --deny-warnings — 경고 1건도 CI 실패
npm run test                # vitest run (test:watch = 워치)
npm run generate:api-types  # 백엔드 스키마 → src/types/api.generated.ts (아래)
npm run generate:icons      # public/favicon.svg → PNG/ICO
```

백엔드까지 함께 띄우려면 루트 `dev.sh`/`dev.bat`.

- 타입체크는 `strict: true`. oxlint(`.oxlintrc.json`)는 `correctness` 전체 + `react/exhaustive-deps` + `import/no-cycle`이 error.
- **아이콘**: 소스는 `public/favicon.svg` 하나다(앱 accent와 별개인 브랜드 마크). 수정하면 `npm run generate:icons`를 직접 돌려 `public/icons/*.png`·`favicon.ico`를 재생성한다 — 빌드에 포함되어 있지 않다.

## 환경 변수 (`frontend/.env`, `.env.example` 참고)

- `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — growlio와 같은 Supabase 프로젝트. 배포 시 `render.yaml`이 주입.
- `VITE_GROWLIO_APP_URL` — 비면 growlio 딥링크 CTA를 숨긴다(`src/constants/growlio.ts`).

> **빈 화면 주의**: `.env` 값은 빌드 시 번들에 굳는다. `.env`가 없거나 오래된 채로 `npm run build`하면 `src/lib/supabase.ts`가 모듈 로드 단계에서 throw해 React 마운트 전에 죽는다 — `ErrorBoundary`도 못 잡아 **에러 표시 없는 완전한 빈 화면**이 된다. `.env`를 바꿨으면 재빌드한다(`npm run dev`는 매번 새로 읽는다).

## API 타입과 드리프트 가드

- **정본 타입은 손으로 쓴 `src/types/index.ts`** 다. `src/types/api.generated.ts`는 백엔드 OpenAPI에서 생성한 추적용 참조 산출물이다.
- `app/schemas/*.py`를 바꾼 PR은 `npm run generate:api-types`(백엔드를 띄우지 않고 `app.openapi()` 덤프; `.venv`를 쓰려면 `PYTHON=../.venv/Scripts/python`)로 갱신해 함께 커밋한다 — 안 하면 CI `api-types-drift`가 `git diff --exit-code`로 실패한다. 백엔드가 떠 있으면 `generate:api-types:live`도 된다.
- 그다음 `types/index.ts`를 diff에 맞춰 사람이 고친다. 잊으면 `src/types/apiDrift.check.ts`가 손 타입과 생성 타입의 **필드 이름**과 **문자열 리터럴 유니온 값 집합**이 어긋날 때 `tsc`를 실패시킨다 — 백엔드 `Literal`에 값을 추가하면 손 타입 alias와 그 라벨 맵(`Record<X, string>`)까지 맞춰야 한다. 손 타입을 새로 추가하면 이 파일 목록에도 한 줄 추가한다.
- 백엔드가 `str`로 열어 둔 필드를 손 타입에서만 좁히면 가드가 못 잡는다 — 좁히려면 백엔드 출력 스키마도 `Literal`로 맞춘다.

## Absolute Rules

- **색상/상태**: 상태(`ok`/`warn`/`critical`, `info`/`warning`/`critical`), 카테고리 fixed/variable, 수입/지출 색은 항상 `utils/colors.ts` 함수로 가져온다. 컴포넌트에 `status === "critical" ? "text-red-600" : ...`를 직접 쓰지 않는다. 금액 부호 색 `amountToneClass`, 단독 에러 문구 `errorMessageTextClass`, amber 주의/제안 `cautionTextClass`/`cautionCalloutClass`/`cautionCalloutTextClass`.
- **accent**: `tailwind.config.ts`의 `primary` 토큰(emerald 계열). 버튼·링크·hover·아이콘·배지에 raw `emerald-*`/`indigo-*`를 쓰지 않는다 — CI grep 가드가 `colors.ts` 밖의 사용을 실패시킨다.
- **금액**: 백엔드 응답의 `Decimal` 문자열 그대로 다루고, 표시 시점에만 `utils/format.ts`의 `formatKrw`/`formatKrwCompact`. 중간에 `parseFloat` 등으로 반올림하지 않는다.
- **터치 타깃**: 단독 액션 버튼은 `constants/uiSizes.ts`의 `TOUCH_TARGET_MIN`(44px), 조밀한 배지/탭은 `TOUCH_TARGET_COMPACT_MOBILE_ONLY`(36px). `Button`에 `!min-h-0 !py-1` 같은 override로 깎지 않는다. 글자는 `text-[11px]` 미만 금지 — 좁은 곳은 `formatKrwCompact`로 줄인다.
- **페이지 제목**: `Header.tsx`가 `<h1>`로 보여준다(`pageTitleFor`). 페이지 컴포넌트에 제목 `h1`을 두지 않는다.
- **label 연결**: `FormInput`은 알아서 한다. 직접 쓰는 `<label>` + `<select>`/`<textarea>`는 `useId()`로 `htmlFor`/`id`를 건다(정적 id 금지). 칩 묶음은 `role="group"` + `aria-labelledby`.
- **입력 스타일**: `constants/inputStyles.ts`의 `INPUT_SM`/`INPUT_MD`/`LABEL_SM`/`LABEL_MD`를 재사용한다.
- **쿼리 키**: `constants/queryKeys.ts`의 `QUERY_KEYS`만 쓴다(배열 리터럴 금지 — 무효화 누락 방지).
- **참조 데이터**: 계좌·카테고리·저축상품·유저는 `hooks/useReferenceData.ts`의 `useAccounts`/`useCategories`/`useSavingsProducts`/`useUsers`/`useMe`로만 조회한다.
- **영속 쿼리 캐시**: `main.tsx`의 `PersistQueryClientProvider`가 `PERSIST_QUERY_KEYS`(`constants/queryConfig.ts`) 응답을 localStorage에 24시간 보관해 재방문 시 즉시 그린다. 이 키들의 **응답 형태를 호환되지 않게 바꾸면**(필드 이름·타입 변경, 필수 필드 추가) `main.tsx`의 `buster`를 올린다 — 안 올리면 구 캐시가 최대 24시간 렌더돼 깨진다(필드 삭제만이면 보통 불필요). `DEFAULT_GC_TIME`은 `PERSIST_MAX_AGE` 이상으로 둔다.
- **다크모드**: `<html>`의 `.dark` 클래스(`darkMode: "class"`), `stores/themeStore.ts` — 저장값이 없으면 `prefers-color-scheme`.

## 구조 (`src/`)

- Import는 `@/` alias(`@/* → src/*`).
- 데이터 흐름: `api/client.ts`(axios + JWT 인터셉터) → `api/<리소스>.ts`(백엔드 라우터와 대체로 1:1) → 컴포넌트의 `useQuery`/`useMutation`. 여러 화면이 공유하는 것만 `hooks/`로 감싼다(`useCrudMutations`, `useRecurringMutations`, `useInvalidateTransactionRelated`, `useEventActions` 등). Zustand(`stores/authStore`, `themeStore`)는 서버 캐시와 무관한 클라이언트 상태만.
- 컴포넌트: 페이지별 디렉토리(`home/`, `dashboard/`, `transactions/`, `plan/`, `financialPlan/`, `accounts/`, `categories/`, `settings/`, `schedule/`)는 대체로 그 페이지 전용이다. 공용은 `common/`(growlio에서 옮긴 `Button`/`Modal`/`ConfirmModal`/`Tabs`/`FormInput`/`EmptyState` 등 + `CategoryPicker`, `GrowlioImportModal`, `QuickAddFab`, `MonthPicker`, `CollapsibleGroup`, `StatusBadge`), 셸은 `layout/`(`AppLayout`/`Sidebar`/`Header`/`BottomNav`). 최상위 `ErrorBoundary`·`Toaster`(`nestlio:toast` 이벤트).

### 인증

- `stores/authStore.ts`가 `supabase.auth.signInWithPassword`로 로그인하고 `api/client.ts`가 `Authorization: Bearer`를 붙인다. 401이면 `refreshSession()`으로 1회 재시도, 그래도 실패하면 `nestlio:session-expired` 이벤트 → `App.tsx`가 로그아웃.
- 403 + `REMOVED_USER_DETAIL`(가구에서 제외된 계정)도 자동 로그아웃 — 문자열이 백엔드 `user_service.REMOVED_USER_DETAIL`과 정확히 같아야 한다.
- 공개 가입 폼은 없다. 같은 Supabase 프로젝트 계정으로 로그인하면 정원(2명)까지 백엔드가 자동 등록하고, 계정이 없는 배우자는 초대 링크 `/invite/accept?token=...`(`InviteAcceptPage`, `supabase.auth.signUp`) → 이메일 확인 `/auth/callback`(`AuthCallbackPage`)으로 가입한다. growlio의 `/find-account`·`/forgot-password`·`/reset-password`는 없다.

### 라우트 (`App.tsx`)

공개: `/login`, `/invite/accept`, `/auth/callback`. 나머지는 `AppLayout` 하위 `PrivateRoute`. 미매칭은 `/`로.

| 경로 | 페이지 | 메모 |
|---|---|---|
| `/` | `DashboardPage` | 항상 이번 달 기준. 섹션은 `components/home/`·`components/dashboard/`. 월초(1~7일)엔 지난달 회고 카드 |
| `/transactions` | 가계부 | 월간 캘린더 + `[내역 \| 일정]` 세그먼트(`?view=`). 날짜 클릭 → `LedgerDayModal`(거래·일정 함께). 일정 CRUD는 `hooks/useEventActions.tsx`. 반복 거래 관리는 `RecurringManageSheet`. `?date=YYYY-MM-DD`로 모달 열기 |
| `/transactions/import` | 거래 데이터 | CSV 내보내기·CSV/시트 가져오기. 진입은 설정 바로가기뿐 |
| `/categories` | 카테고리 관리 | 메뉴에 없음 — 설정 바로가기·계획의 "카테고리별 예산"에서만 진입 |
| `/accounts` | 자산 | 계좌/저축·투자/부동산/대출 4개 `CollapsibleGroup`(접힌 섹션은 마운트·쿼리 안 함). `?section=`. 상단 `AccountsSnapshotCard`의 "전체 동기화"가 **growlio 잔액 동기화의 유일한 수동 진입점** |
| `/plan` | `PlanPage` | `[이번 달 \| 연간]`(`?view=`). 아래 "계획 화면" 참고 |
| `/goals`, `/goals/:id` | `GoalsTab`, `GoalDetailPage` | 재무목표·챌린지. 상세에 응원·시나리오·growlio 인사이트 |
| `/settings` | 설정 | 헤더 톱니 아이콘으로 진입. 다크모드·로그아웃은 여기에만 |

레거시 리다이렉트(지우지 않는다 — 외부 링크·메일 딥링크): `/calendar`·`/budgets`·`/recurring` → `/transactions`, `/schedule` → `/transactions?view=일정`(`LegacyScheduleRedirect`), `/financial-plan`(구 `?tab=`/`?view=` 포함) → `/goals` 또는 `/plan?view=`(`LegacyFinancialPlanRedirect`), `/reports/yearly` → `/plan?view=연간&section=분석`, `/transactions/:id/edit` → `/transactions`.

**새 페이지를 추가하면** `App.tsx`의 `<Route>`와 `constants/nav.ts`를 함께 갱신한다. `PRIMARY_NAV_ITEMS`(홈/가계부/계획/목표/자산)가 `BottomNav`·사이드바의 유일한 메뉴이고("더보기" 없음), 헤더 타이틀은 `PAGE_TITLES`에서 가장 긴 경로 prefix로 고른다.

### 계획 화면 (`/plan`)과 목표

- 두 뷰 모두 `PlanBalanceSummary` → `PlanSectionAccordion`(수입/고정/변동/비정기/저축·투자 섹션, 펼치면 편집 패널) 골격. `CashflowPlanTab`이 `view: "monthly" | "annual"`로 그리고, 연간은 `AnnualPlanPanel`(항목이 없으면 `PlanYearStartWizard`, 맨 아래 `YearlyReportSection` "실적 분석").
- **이번 달 뷰는 연간계획의 한 달 단면이다** — `CashflowPlanItemOut.id`가 연간 항목 id이고, 금액 수정은 연간계획의 그 달 값을, 삭제는 그 달 금액만 바꾼다(`deleteCashflowPlanItem({id, yearMonth})`). 저장 후 `cashflowPlanAll`·`annualPlanAll`을 **함께** 무효화한다. 백엔드 모델은 [app/services/CLAUDE.md](../app/services/CLAUDE.md)의 "계획 원본은 연간계획 하나".
- 카테고리별 예산은 이번 달 뷰의 고정/변동/비정기 패널 안에 있고, 예산 대비 실적은 `GET /cashflow-plan`·`GET /annual-plan` 응답의 `category_budgets`로 온다(`/budgets` 라우터는 없다).
- 저축·투자 섹션은 `SavingsInvestmentPlanPanel`(상품별 월 계획 대비 실적). 상품 계획액은 `SavingsProductAnnualPlan` 그리드가 있으면 그것, 없으면 `monthly_saving_amount`. 목표에 연동된 상품의 계획도 여기서 편집한다 — 연동 목표의 월 저축액은 상품 계획 합이라 목표 폼은 읽기 전용으로 보여준다. 계획 화면에는 growlio 동기화 버튼을 두지 않는다(자산 탭으로 일원화).
- 목표 vs 계획 분리 기준: 계획은 가구 전체의 **달력월** 기준, 목표는 각자의 목표일 기준이다. 또 흡수/분리를 고민할 때는 "같은 달력월 기준으로 계획 대비 실적을 비교하는가"로 판단한다.
- 목표 폼(`GoalFormModal`): 장기 목표는 3단계, 챌린지는 한 화면. 장기목표/챌린지 토글은 **신규 생성 시에만** 뜬다(백엔드 `FinancialGoalUpdateIn`에 `kind`가 없다). 연동 목표의 월 달성액은 자동 계산(`is_auto_computed`), 미연동은 직접 입력. 균등분배는 프론트의 `utils/monthRange.ts::distributeAmountEvenly`.

## 테스트

Vitest + Testing Library, `src/test/setup.ts`(jsdom `matchMedia` 폴리필). `utils/`·공용 컴포넌트·store 위주이며 커버리지 임계값은 아직 없다.
