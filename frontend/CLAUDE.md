# Frontend CLAUDE.md

React + TypeScript + Vite + Tailwind CSS SPA. growlio(`d:\project\growlio\frontend`)의 디자인 시스템/컴포넌트 컨벤션·인증 방식을 그대로 이식했다 — 새 UI를 추가할 때는 먼저 growlio에 유사한 화면/컴포넌트가 있는지 확인하고 패턴을 맞춘다. Capacitor(네이티브 앱 패키징), Sentry는 의도적으로 도입하지 않았다 (반응형 웹만 지원). PWA는 growlio처럼 `vite-plugin-pwa`/Workbox 기반 서비스워커·오프라인 캐싱까지는 아직 도입하지 않았지만, `public/manifest.webmanifest` + `public/icons/`만 추가해 홈 화면 설치(installability)는 지원한다 — `index.html`의 `<link rel="manifest">`/`apple-touch-icon`으로 연결. 오프라인에서는 여전히 동작하지 않는다.

**아이콘**: 소스는 `public/favicon.svg` 하나뿐(512x512 뷰박스, growlio와 통일감 있는 불투명 rounded-square 배경 + `primary` 팔레트 색상). 여기서 필요한 모든 래스터를 `npm run generate:icons`(`scripts/generate-icons.mjs`, `sharp`+`png-to-ico` 사용)로 생성한다 — `public/icons/icon-{16,32,48,180,192,512}.png`와 `public/favicon.ico`. `favicon.svg`를 수정하면 반드시 이 스크립트를 다시 실행해 PNG/ICO를 재생성해야 한다(자동으로 반영되지 않음, 빌드 파이프라인에 포함되어 있지 않다).

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
`frontend/.env` (`frontend/.env.example` 참고). 배포 시 `render.yaml`이 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`를 서비스 env로 주입한다.
- `VITE_SUPABASE_URL` — Supabase Project URL (growlio와 같은 프로젝트 공유). `src/lib/supabase.ts`에서 import — 없으면 Supabase 클라이언트 초기화 자체가 실패한다
- `VITE_SUPABASE_ANON_KEY` — Supabase Anon Key
- `VITE_GROWLIO_APP_URL` — growlio 프론트엔드 오리진. 비어 있으면 growlio 딥링크 CTA를 숨긴다 (`src/constants/growlio.ts`)

---

## 아키텍처 (`frontend/src/`)

**Import 규칙**: `@/` alias 사용 (`vite.config.ts` / `tsconfig.app.json`의 `@/* → src/*`).

**인증**: 백엔드에 로그인 엔드포인트가 없다. `stores/authStore.ts`가 `supabase.auth.signInWithPassword`로 직접 로그인해 Supabase JWT를 받고, `api/client.ts`의 axios 인터셉터가 매 요청에 `Authorization: Bearer` 헤더를 붙인다. 401 응답 시 `supabase.auth.refreshSession()`으로 1회 재시도 후에도 실패하면 `nestlio:session-expired` 커스텀 이벤트를 dispatch해 `App.tsx`가 로그아웃 처리한다. nestlio는 여전히 자유 가입은 없다(`/register` 같은 공개 가입 폼은 없음) — 유일한 계정 생성 경로는 **배우자 초대**뿐이다: 로그인한 유저가 `/settings`에서 배우자 이메일로 초대를 보내면(`POST /api/v1/invites`, `api/invites.ts`) 초대 토큰이 담긴 링크가 이메일로 발송되고, 초대받은 사람은 `/invite/accept?token=...`(`pages/InviteAcceptPage.tsx`, `PrivateRoute` 밖 공개 라우트)에서 `supabase.auth.signUp`을 직접 호출해 계정을 만든다. Supabase 프로젝트가 이메일 확인을 요구하므로 growlio와 동일하게 `/auth/callback`(`pages/AuthCallbackPage.tsx`)이 확인 링크 클릭 후 세션을 마무리한다. 로컬 `User` 미러 행은 초대 수락 시 백엔드가 표시 이름과 함께 즉시 만든다(`app/services/invite_service.py::accept_invite`) — 이후 API 요청에서는 기존처럼 `get_current_user`가 미러링을 담당한다. growlio의 `/find-account`, `/forgot-password`, `/reset-password` 라우트는 여전히 없다.

**라우트** (`src/App.tsx` 참고, `/login` 제외 전부 `AppLayout` 하위 `PrivateRoute`):
- `/` — 대시보드 (DashboardPage)
- `/transactions` — 가계부. **수입/지출 기록 전용**이다(예산·고정지출 관리 화면은 없다). 월간 캘린더(모바일 셀은 순액 한 줄 + 일정 점만, `sm` 이상에서 수입/지출/배지 전체 — `LedgerDayCell`) + 그 아래 **목록 위 sticky 인라인 필터 바**(`TransactionFilterBar`, 구 `TransactionFilterSheet` 바텀시트를 대체) + 조건에 맞는 이번 달 거래 목록. 필터 1행은 `전체/수입/지출/저축` + 필요 시 `나/배우자/공동`, 지출을 고르면 2행에 `전체/고정/변동/비정기`, 수입·지출이면 3행에 그 달 실제 사용 카테고리 칩. 날짜 클릭 시 뜨는 `LedgerDayModal`은 **거래 전용**이고(필터 무관, 그날 전체 거래), 하단에 "이 날 일정 N건 →" 한 줄 링크로 `/schedule?date=`로 넘긴다. 구 `/calendar`(일정 탭)·`/budgets`·`/recurring` 라우트는 `/transactions`로 리다이렉트된다. 반복 거래(`RecurringExpense`)는 스케줄러가 자동 생성하고, 규칙 등록/수정/비활성화는 페이지 우상단 **"반복 거래" 버튼**(`RecurringManageSheet.tsx`)에서 한다 — 구 "더보기" 그랩백 시트는 해체됐다(카테고리 관리·CSV·구글 가져오기는 설정으로, 새 일정·구글 캘린더 가져오기는 `/schedule`로 이동).
- `/schedule` — 일정. 담당자 배분(`assignee_id`, `null`=공동)과 완료 체크가 있는 부부 공동 캘린더/할 일 목록(`Event` 모델) 전용 화면 — 담당자 필터 탭 + 월간 캘린더 + 날짜별 접이식 목록(`ScheduleMonthList`) + 날짜 모달에서 CRUD. 헤더에 "새 일정" 버튼과, Google 연동 시 "구글 캘린더" 가져오기 버튼이 있다(구 가계부 "더보기"에서 이동). `?date=YYYY-MM-DD` 파라미터로 진입하면 그 날 모달을 연다(가계부 `LedgerDayModal`이 연결). 대시보드 `TodayScheduleCard`는 오늘 일정 훑어보기+완료+빠른 추가만 제공하고 "전체 일정 보기 →"로 이 페이지로 연결한다. `nav.ts`에서는 "기록" 그룹(가계부와 같은 그룹)이며, 모바일 하단탭에서는 "더보기" 시트에 있다.
- `/transactions/import` — 거래 데이터 페이지: CSV 내보내기(이번 달/올해) + CSV·구글 시트 가져오기. 진입점은 설정 "바로가기"의 "거래 데이터"뿐이다. (구 `/transactions/:id/edit` 전용 수정 페이지는 삭제됐고 `/transactions`로 리다이렉트된다 — 수정은 가계부 목록/날짜 모달의 인라인 `TransactionForm` 모달이 담당한다.)
- `/categories` — 카테고리 관리(생성/수정/비활성화). 사이드바·하단탭에는 노출하지 않고 설정(`/settings`) "바로가기"와 계획 화면의 "카테고리별 예산" 서브섹션에서만 진입한다(가계부에서는 제거).
- `/accounts` — 자산 (구 "자산현황". 계좌/저축·투자/부동산/대출 **4개 섹션을 단일 스크롤로** 쌓는다(구 pill 탭 제거) — `CollapsibleGroup` 4개, 접힌 섹션은 마운트되지 않아 해당 쿼리도 펼칠 때 처음 실행된다. `?section=`(구 `?tab=` 딥링크도 호환)으로 진입하면 그 섹션만 펼치고 스크롤. 미래 계획·목표치가 아니라 현재 잔액을 조회·기록하는 자산 스냅샷이라 대시보드 순자산 카드(`accounts_total`+`savings_total`-`loans_total`=`net_worth`, `GET /net-worth`)와 한 세트다. 비상금은 저축·투자 섹션의 `SavingsProduct`(`product_type: "emergency_fund"`)로 관리한다. 상단 `AccountsSnapshotCard`: 순자산 추이 차트·자산구성 도넛·**"전체 동기화"**(계좌/저축상품/부동산에 흩어진 growlio 연동을 한 번에, `sync_all_*` 패턴 — [app/services/CLAUDE.md](../app/services/CLAUDE.md)) + **"growlio 미연동 자산 확인"** 온디맨드 버튼(대시보드에서 이관 — growlio HTTP 2회라 자동 실행 안 함, `GET /net-worth/growlio-unlinked`). 잔액 동기화는 이 화면이 유일 진입점이며, `auto_sync_enabled` 연동이 오래되면 `GET /net-worth` 응답 후 백그라운드로도 갱신된다(`net_worth_service.refresh_stale_growlio_links`).)
- `/reports/yearly` — 연간 리포트
- `/financial-plan` — 계획·목표 (구 "재무설계"/"목표"). `FinancialPlanPage.tsx`가 **하나의 세그먼트** `[목표] [이번 달] [연간]`만 갖는다(`Tabs` pill, `fullWidth`, 모바일에서 sticky). 예전의 페이지 탭 2개(현금흐름 계획/목표) × 뷰 서브탭 2개(이번 달 계획/연간계획)를 이 한 세그먼트로 합쳤고, 각 뷰 안의 섹션 탭(수입/고정/변동/비정기/저축투자)도 없앴다 — 상단 `GoalPurposeSummary`의 5개 목적 칩이 곧 섹션 선택기다(칩 클릭 = 그 섹션 패널로 전환). 구 `PlanBreadcrumb`는 3중 중첩이 사라지면서 삭제됐다. 뷰 상태는 `useSearchParams`(`?view=목표|이번 달|연간`)로 관리하고, `FinancialPlanPage`가 구 딥링크(`?tab=현금흐름 계획`, `?tab=목표`, `?view=이번 달 계획|연간계획`)를 새 값으로 정규화한다. `이번 달`/`연간`은 `CashflowPlanTab`이 `view` prop(`"monthly"|"annual"`)으로 받아 그리고, `연간`은 `AnnualPlanPanel`을 렌더한다. 카테고리별 월 예산 상한 입력(구 "예산" 탭, `BudgetTab.tsx`는 삭제됨)은 `이번 달` 뷰의 고정/변동/비정기 섹션 패널 안 "카테고리별 예산" 서브섹션으로 흡수됐다 — 여전히 대시보드의 `budget_overrun` 코칭 인사이트를 활성화한다. 예산 대비 실적 rows는 별도 `/budgets` 호출이 아니라 `GET /cashflow-plan`·`GET /annual-plan` 응답의 `category_budgets` 필드로 함께 내려온다(구 `/budgets` 라우터·`/annual-plan/category-budgets` 엔드포인트는 삭제됨. `budget_service` 자체는 코칭엔진·알림이 계속 쓴다). 부진 감지(계획 대비 실적이 `warn`/`critical`)는 카테고리별 예산(`CategoryBudgetProgress`)·수입 섹션(`CashflowPlanSectionPanel`)·저축상품(`SavingsInvestmentPlanPanel`)마다 최근 3개월 평균 실적을 "제안값"으로 보여주고 "다음 달에 반영" 버튼으로 즉시 적용할 수 있다(백엔드 `trailing_average_by_category`/`trailing_average_by_section`/`trailing_average_actuals`, `app/services/CLAUDE.md` 컨벤션대로 서비스 계층에 있음). 연간계획(`AnnualPlanPanel`)에서 항목별 월별 금액을 미리 채워두면, 아직 그 달에 실제 "이번 달 계획" 항목이 없는 한 조회 시점에 자동으로 끼워 넣어져(`from_annual_plan: true`, "연간계획" 배지) 매달 따로 복사할 필요가 없다 — 이 가상 항목은 `id`가 없어 반복거래 연결·삭제 같은 실제 행 전용 동작은 비활성화되고, 사용자가 한 번 수정·저장하면 그 순간부터 실제 항목이 된다(백엔드 패턴은 [app/services/CLAUDE.md](../app/services/CLAUDE.md)의 "연간계획 → 이번 달 계획 폴백" 참고).

  재무목표(장기목표/챌린지, `GoalsTab.tsx`)는 한동안 "저축·투자" 섹션 하위 서브섹션으로 흡수돼 "현금흐름 계획" 한 화면 안에 있었지만("수입/고정지출/변동지출/비정기지출/저축투자 5개 목적축으로 설정→가계부 실적 비교→조정"이라는 목표탭 본연의 루프와 겹치면서도 별도 탭으로 단절돼 있었기 때문), 장기목표에도 전체 목표금액·목표일을 정하면 월별 계획이 균등분배로 자동 산출되고 월별로 달성 여부를 확인하는 자체 루프가 생기면서 다시 독립된 "목표" 탭으로 분리했다 — 개별 목표는 각자 다른 기간(목표일)을 기준으로 계획-실적을 비교하는 반면 "현금흐름 계획"은 가계 전체의 달력월 기준이라 스코프가 근본적으로 다르기 때문이다. 다음에 또 흡수/분리를 고민할 때는 "같은 달력월 기준으로 계획 대비 실적을 비교하는가"를 판단 기준으로 삼는다. "저축·투자" 섹션에는 `SavingsInvestmentPlanPanel`(상품별 월 계획 대비 실적)만 남는다 — 저축상품과 목표는 `linked_goal_id`로만 느슨하게 연결되는 별개 개념이다. 상품별 계획액은 기본적으로 `SavingsProduct.monthly_saving_amount`(단일 값) 이지만, `ProductRow`의 "월별 계획 편집"으로 연도별 적용 시작월~종료월 + 월별 금액(`SavingsProductAnnualPlan`, 수입/지출의 `AnnualPlanItem`과 동일 패턴)을 지정하면 그 값이 우선한다 — 그리드를 설정하지 않은 달/상품은 계속 `monthly_saving_amount`로 폴백한다(백엔드 `savings_product_service._effective_monthly_target` 계열 함수 참고). 목표 연동으로 월 계획액이 자동 동기화되는 상품(`monthly_saving_amount_synced`)은 이 편집이 비활성화된다. `monthly_saving_amount`는 상품 신규 등록 폼에만 입력란이 있고 수정 폼(`SavingsProductsSection.tsx`)에는 없다 — 연간계획에서 항목별 월별 목표를 관리하게 되면서 등록 이후 이 단일값을 손으로 고칠 일이 없어졌기 때문이다(연간 목표 편집은 위 "월별 계획 편집"이 담당). growlio 잔액 동기화 버튼도 `SavingsInvestmentPlanPanel`에는 없다 — 계획 화면과 잔액 동기화 화면을 분리해 동기화 진입점을 자산현황(`/accounts`, 건별 버튼 + `AccountsSnapshotCard`의 "전체 동기화") 하나로 모은 것이다.

  목표 연동(저축상품/계좌/대출)이 있는 장기목표는 "이번 달 달성액"이 거래내역 기반으로 자동 계산되고(`GoalMonthlyTargetOut.is_auto_computed`, 백엔드 `goal_service.compute_linked_monthly_achieved`), 미연동 목표는 카드에서 매달 직접 입력한다. 월별 계획은 `GoalMonthlyTargetEditor`가 담당한다 — 필요금액·목표일을 먼저 정하면 "균등분배로 다시 계산" 버튼(`utils/monthRange.ts`의 `distributeAmountEvenly`)으로 남은 달에 고르게 나누는 하향식이다(프론트 계산, 백엔드 변경 없음). 옛 `tab=` 딥링크(`tab=예산/챌린지/재무목표/현금흐름 계획/목표`)와 옛 `view=이번 달 계획/연간계획`은 `FinancialPlanPage`가 새 `?view=목표|이번 달|연간`으로 정규화한다 — 현재 유효한 크로스탭 딥링크는 `?view=` 형태뿐이다. 챌린지는 더 이상 "챌린지 추가" 전용 버튼이 없다 — "목표 추가" 모달 안에 장기 목표/챌린지를 고르는 유형 토글(`GoalFormModal`)이 있고, 이 토글은 **신규 생성 시에만** 뜬다(백엔드 `FinancialGoalUpdateIn`에 `kind` 필드가 없어 생성 후 유형 변경이 불가능하기 때문) — 수정 모드에서는 토글 없이 기존 kind별 폼만 보인다. 장기 목표(goal)와 챌린지(challenge)는 카드 렌더링(`GoalProgressCard`)을 공유하되, 챌린지는 연동·월별계획 필드 자체가 없어(`toPayload`가 항상 `monthly_targets: null`로 저장) 그 부분 블록이 데이터 기반으로 자연히 비고 배지·진행 갱신 위젯 노출 조건에서만 명시적으로 갈린다.)
- `/settings` — 설정
- 미매칭 경로(`*`)는 `/`로 리다이렉트

새 페이지 추가 시 `App.tsx`의 `<Route>`뿐 아니라 `constants/nav.ts`의 `SIDEBAR_NAV_GROUPS`(데스크톱 사이드바, "기록"/"계획·목표" 2개 헤더 그룹 + 그룹 헤더 없이 단독 배치되는 대시보드·연간리포트·설정, 총 7개 항목)도 갱신한다. `SIDEBAR_NAV_ITEMS`는 `SIDEBAR_NAV_GROUPS`를 평탄화한 파생 목록이다. 모바일 `BottomNav`는 터치 타겟을 지키기 위해 `BOTTOM_NAV_PRIMARY_ITEMS`(4개: 대시보드/가계부/계획·목표/자산)만 상시 노출하고 나머지(`BOTTOM_NAV_MORE_ITEMS`: 일정/연간리포트/설정)는 "더보기" 바텀시트로 접는다 — 목표 달성 루프의 중심축인 "계획·목표"를 자산보다 앞에 둔다. 예산·고정지출·거래수정은 독립 화면 없이 가계부(`/transactions`)의 필터·목록/모달로, 일정은 화면 자체는 `/schedule`로 독립하되 사이드바에서 가계부와 같은 "기록" 그룹에 묶인다. 두 배열 다 경로(`to`)로 `SIDEBAR_NAV_ITEMS`에서 찾아 파생시키므로(배열 인덱스가 아니라 경로 문자열 목록), 항목을 늘릴 때 `nav.ts`의 그룹 정의와 두 파생 배열의 경로 목록만 고치면 된다.

**컴포넌트 디렉토리** (`src/components/`): 페이지별 디렉토리(`financialPlan/`, `accounts/`, `dashboard/`, `categories/`, `settings/`, `transactions/`)는 대체로 해당 페이지 1:1 전용 컴포넌트라 개별 나열 대신 디렉토리 단위로만 적는다 — 여러 페이지가 공유하거나 구조가 특이해 미리 알아둘 필요가 있는 것만 아래에 개별로 짚는다. 새 컴포넌트를 추가할 때 이 목록 전체를 갱신하지 않아도 된다(추가/삭제 때마다 드리프트가 나므로).
- `layout/` — `AppLayout.tsx`(사이드바+헤더+본문+하단탭 셸), `Sidebar.tsx`(`hidden lg:flex`), `Header.tsx`(데스크톱/모바일 공통 상단바), `BottomNav.tsx`(`lg:hidden fixed bottom-0`, "더보기" 바텀시트 포함)
- `common/` — growlio에서 옮긴 범용 컴포넌트(`Button`/`Modal`/`ConfirmModal`/`Tabs`/`FormInput`/`EmptyState`/`SkeletonCard`/`PageLoader`)와 nestlio 전용(`SummaryCard`/`SummaryCards`, `Badge`, `StatusBadge` — 색상/상태 표시는 항상 `utils/colors.ts` 경유), 그리고 여러 페이지가 공유하는 것들: `CategoryPicker`(카테고리 `<select>`, `kind` prop으로 수입/지출 필터링), `GrowlioImportModal`(growlio 미연동 항목을 골라 가져오는 제네릭 모달 — 계좌/저축상품/부동산 탭이 타입 파라미터로 재사용), `QuickAddFab`(가계부 페이지 하단 우측 빠른 추가 버튼), `DayPicker`/`WeekPicker`/`MonthPicker`, `CollapsibleGroup`, `RowActionButtons`/`AccountActionsMenu`
- `transactions/TransactionForm.tsx` — 가계부 캘린더 페이지의 거래 추가/수정 모달과 `/transactions/:id/edit` 수정 페이지가 공유하는 폼
- `transactions/EventForm.tsx` — 같은 페이지의 일정 추가/수정 모달이 쓰는 폼 (제목/종일/시작·종료일시/장소/설명/반복/리마인더)
- `transactions/MonthCalendarGrid.tsx` — 월간 캘린더 그리드 셸(요일 헤더 + 7열 그리드, `buildGrid`/`todayIso`). 셀 렌더링은 `renderCell` render prop으로 위임하는 제네릭 컴포넌트
- `transactions/LedgerDayCell.tsx` — `MonthCalendarGrid`의 날짜 셀. 거래 수입/지출 금액 + 일정 제목 칩 + 반복 거래 예정 배지를 함께 표시
- `transactions/LedgerDayModal.tsx` — 캘린더에서 날짜 칸을 탭했을 때 뜨는 **거래 전용** 모달. 그날 거래 목록 + 추가/수정/삭제 + 하단에 "이 날 일정 N건 →" (`/schedule?date=`) 링크. 일정 CRUD는 하지 않는다.
- `transactions/TransactionFilterBar.tsx` — 가계부 목록 위 sticky 인라인 필터 바(구분/사용자/지출유형/카테고리 pill). 구 `TransactionFilterSheet` 바텀시트를 대체. `EXPENSE_TYPE_FILTER_OPTIONS`는 `TransactionForm`도 재사용한다.
- `transactions/TransactionListItem.tsx` — 거래 한 건의 행 UI(카테고리 배지 + 설명 + 금액 + 수정/삭제 버튼). `LedgerDayModal`과 `TransactionsPage`의 캘린더 아래 월간 목록(`DailyTransactionGroups`/`ExpenseCategoryGroups`)이 공유한다. `showDate` prop으로 날짜 표시 여부를 정한다.
- `accounts/AccountsSnapshotCard.tsx` — `/accounts` 상단 공통 요약(순자산 추이 차트, 자산구성 도넛, "전체 동기화" + "growlio 미연동 자산 확인" 버튼) — 위 `/accounts` 라우트 설명 참고
- `dashboard/InvestSurplusCard.tsx` — 이번 달 여유자금(비상금 보충분/투자 가능분). growlio 연동 투자상품마다 "포트폴리오 열기"(외부 링크) + "저축 기록" 버튼 — 후자는 `onRecordInvestment` 콜백으로 `DashboardPage`가 빠른 추가 모달을 그 상품·금액으로 미리 채워 연다(저장 시 저축 거래 생성 + growlio DEPOSIT 반영)
- `ErrorBoundary.tsx`, `Toaster.tsx` — 최상위 (App.tsx가 감쌈), `nestlio:toast` 커스텀 이벤트 구독

**상태/데이터 흐름**:
```
api/client.ts (axios + Supabase JWT 인터셉터 + 401 자동 refresh)
  └── api/{dashboard,transactions,events,accounts,reports,settings,categories,users}.ts
        └── React Query 훅(각 페이지 컴포넌트 내부, useQuery/useMutation 직접 사용). 단,
            여러 화면이 공유하는 것은 전용 hooks/useXxx.ts로 감싼다:
            - 느리게 변하는 참조 데이터(계좌·카테고리·저축상품·유저)는 hooks/useReferenceData.ts의
              useAccounts/useCategories/useSavingsProducts/useUsers/useMe로만 조회한다. 각 페이지에서
              raw useQuery + 제각각 staleTime으로 재선언하지 않는다(쿼리 키·기본 staleTime을 한 곳에서 관리).
            - 반복 mutation은 useCrudMutations/useRecurringMutations, 무효화는 useInvalidateTransactionRelated.
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
