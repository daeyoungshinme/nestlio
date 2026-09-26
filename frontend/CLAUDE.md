# Frontend CLAUDE.md

React + TypeScript + Vite + Tailwind CSS SPA. growlio(`d:\project\growlio\frontend`)의 디자인 시스템/컴포넌트 컨벤션·인증 방식을 그대로 이식했다 — 새 UI를 추가할 때는 먼저 growlio에 유사한 화면/컴포넌트가 있는지 확인하고 패턴을 맞춘다. Capacitor(네이티브 앱 패키징), Sentry는 의도적으로 도입하지 않았다 (반응형 웹만 지원). PWA는 growlio처럼 `vite-plugin-pwa`/Workbox 기반 서비스워커·오프라인 캐싱까지는 아직 도입하지 않았지만, `public/manifest.webmanifest` + `public/icons/`만 추가해 홈 화면 설치(installability)는 지원한다 — `index.html`의 `<link rel="manifest">`/`apple-touch-icon`으로 연결. 오프라인에서는 여전히 동작하지 않는다.

**아이콘**: 소스는 `public/favicon.svg` 하나뿐(512x512 뷰박스, growlio와 통일감 있는 불투명 rounded-square 배경의 부부 알 일러스트 — 앱 내부 accent(`tailwind.config.ts`의 `primary`, emerald)와는 별개인 독립 브랜드 마크다). 여기서 필요한 모든 래스터를 `npm run generate:icons`(`scripts/generate-icons.mjs`, `sharp`+`png-to-ico` 사용)로 생성한다 — `public/icons/icon-{16,32,48,180,192,512}.png`와 `public/favicon.ico`. `favicon.svg`를 수정하면 반드시 이 스크립트를 다시 실행해 PNG/ICO를 재생성해야 한다(자동으로 반영되지 않음, 빌드 파이프라인에 포함되어 있지 않다).

## Commands

### 설치
```bash
cd frontend && npm install
```
Node 22 (`.nvmrc`, CI `ci.yml`도 Node 22).

### 실행
```bash
# 개발 서버 (5273 고정) — /api/* → 127.0.0.1:8899 자동 프록시
cd frontend && npm run dev
```
백엔드까지 한 번에 띄우려면 루트의 `dev.sh`(Windows: `dev.bat`)를 인자 없이 실행한다 — 백엔드(uvicorn `--reload`) + 이 dev 서버를 동시에 실행하며, 프론트/백엔드 코드 수정이 재빌드 없이 즉시 반영된다.

### 빌드 & 타입 체크
```bash
cd frontend && npm run build       # tsc -b && vite build → frontend/dist
cd frontend && npm run typecheck   # tsc --noEmit (빌드 산출물 없음)
cd frontend && npm run lint        # oxlint --deny-warnings (경고도 CI 실패로 취급)
```

타입체크는 `tsconfig.app.json`/`tsconfig.node.json`이 `strict: true`다. oxlint는
`.oxlintrc.json`에서 `correctness` 카테고리 전체 + `react/exhaustive-deps`(stale-closure
방지)·`import/no-cycle`을 error로 올렸고, `npm run lint`가 `--deny-warnings`라 경고 1건도
CI를 통과하지 못한다.

> **주의**: `frontend/.env`(`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`)는 빌드 시점에 번들에 그대로 굳어 들어간다(`src/lib/supabase.ts`). `.env`가 없거나 오래된 상태로 `npm run build`를 실행하면, 실행 시 `main.tsx` import 체인 최상단에서 `supabase.ts`가 즉시 `throw`해 React가 마운트되기도 전에 죽는다 — `ErrorBoundary`도 못 잡는 모듈 로드 단계 예외라 브라우저에는 아무 에러 표시 없이 **완전히 빈 화면**만 남는다. `.env`를 수정했다면 반드시 재빌드한다 (`npm run dev`는 매번 새로 읽으므로 영향 없음).

### API 타입 (드리프트 가드)

이 앱의 **정본 타입은 손으로 옮긴 `src/types/index.ts`** 다. `src/types/api.generated.ts` 는
그 옆에 두는 **추적되는 참조 산출물**로, 백엔드 스키마가 바뀌었는데 프론트에 반영하지 않은
드리프트를 CI(`ci.yml` 의 `api-types-drift` 잡)가 잡게 해준다.

```bash
# 백엔드를 띄우지 않고 오프라인 재생성 (app.openapi() 를 파이썬으로 덤프 → openapi-typescript).
# .venv 파이썬을 쓰려면 PYTHON=../.venv/Scripts/python 처럼 지정.
cd frontend && npm run generate:api-types
# npm run generate:api-types:live  # 8899에 백엔드가 떠 있을 때 HTTP로 받는 대체 경로
```

`app/schemas/*.py` 를 바꾼 PR은 `npm run generate:api-types` 를 돌려 갱신된
`api.generated.ts` 를 함께 커밋해야 한다 — 안 하면 `api-types-drift` 잡이
`git diff --exit-code` 로 실패한다. `types/index.ts` 는 그 diff를 보고 사람이 맞춘다.
사람이 맞추는 걸 잊으면 `src/types/apiDrift.check.ts`(타입 전용, 런타임 코드 없음)가 손 타입과
생성 타입의 **필드 이름**이 어긋날 때 `tsc`(=`npm run build`)를 실패시킨다. 손 타입을 새로
추가하면 그 파일 목록에도 한 줄 추가한다.

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

**인증**: 백엔드에 로그인 엔드포인트가 없다. `stores/authStore.ts`가 `supabase.auth.signInWithPassword`로 직접 로그인해 Supabase JWT를 받고, `api/client.ts`의 axios 인터셉터가 매 요청에 `Authorization: Bearer` 헤더를 붙인다. 401 응답 시 `supabase.auth.refreshSession()`으로 1회 재시도 후에도 실패하면 `nestlio:session-expired` 커스텀 이벤트를 dispatch해 `App.tsx`가 로그아웃 처리한다. nestlio에는 공개 가입 폼이 없다(`/register` 없음). 다만 가입 경로가 초대뿐인 것은 아니다 — 같은 Supabase 프로젝트의 기존 계정(예: growlio 계정)으로 로그인하면 가구 정원(2명)이 차기 전까지 첫 API 요청에서 백엔드 `get_current_user`가 로컬 `User` 행을 자동으로 만든다(루트 [CLAUDE.md](../CLAUDE.md) 아키텍처 절). Supabase 계정 자체가 없는 배우자를 위한 경로가 **배우자 초대**다: 로그인한 유저가 `/settings`에서 배우자 이메일로 초대를 보내면(`POST /api/v1/invites`, `api/invites.ts`) 초대 토큰이 담긴 링크가 이메일로 발송되고, 초대받은 사람은 `/invite/accept?token=...`(`pages/InviteAcceptPage.tsx`, `PrivateRoute` 밖 공개 라우트)에서 `supabase.auth.signUp`을 직접 호출해 계정을 만든다. Supabase 프로젝트가 이메일 확인을 요구하므로 growlio와 동일하게 `/auth/callback`(`pages/AuthCallbackPage.tsx`)이 확인 링크 클릭 후 세션을 마무리한다. 로컬 `User` 미러 행은 초대 수락 시 백엔드가 표시 이름과 함께 즉시 만든다(`app/services/invite_service.py::accept_invite`) — 이후 API 요청에서는 기존처럼 `get_current_user`가 미러링을 담당한다. growlio의 `/find-account`, `/forgot-password`, `/reset-password` 라우트는 여전히 없다.

**라우트** (`src/App.tsx` 참고, 공개 라우트 `/login`·`/invite/accept`·`/auth/callback` 제외 전부 `AppLayout` 하위 `PrivateRoute`):
- `/` — 홈 (`DashboardPage`, 섹션 컴포넌트는 `components/home/`). 항상 이번 달 기준(구 오늘/이번주/이번달 기간 탭 제거). 위에서부터 월초(1~7일)엔 지난달 회고(`MonthlyRetrospectiveCard`) → `HomeGoalHero`(대표 목표 진행·예상 달성월·연속 달성 배지·goal_pace 문구·배우자의 최근 응원·부부 사진 아바타·순자산 칩 → 자산 탭) → `InvestSurplusCard`(여유자금 저축 제안) → `MonthPlanProgressCard`(수입/고정/변동/비정기/저축·투자 계획 대비 미니 막대 → 계획 탭) → `CoachingInsights`(심각도 상위 2개, 나머지 접기) → `SpendingFocusCard` → `TodayScheduleCard`(오늘 일정 + 7일 내 반복 수입·지출, 한 번의 `/events` 범위 조회) → `CoupleContributionCard`(월초엔 회고가 대신함). 순자산 상세·결제수단·수입/지출 요약카드는 자산 탭·가계부·계획 탭과 겹쳐 제거했다(`DashboardOut.payment_method_breakdown`도 삭제).
- `/transactions` — 가계부. 부부의 **거래 기록과 일정을 한 캘린더에서** 공유한다. 월간 캘린더(모바일 셀은 순액 한 줄 + 일정 점만, `sm` 이상에서 수입/지출/배지 전체 — `LedgerDayCell`, 좌우 스와이프로 월 이동) 아래에 `[내역 | 일정]` 세그먼트(`?view=`, `LEDGER_VIEWS`)가 있고 목록만 바뀐다. **내역**: 검색 + "필터(적용 개수)" 버튼 → 바텀시트(`TransactionFilterBar` 4축 — 구 최대 4줄 칩 행을 접음) + 거래 목록(`LedgerResults`). **일정**: 담당자(나/배우자/공동) 필터 + 날짜별 접이식 목록(`LedgerScheduleList` → `ScheduleMonthList`), Google 연동 시 헤더에 "구글 캘린더" 가져오기. 날짜 클릭 시 `LedgerDayModal`에서 그날 **거래와 일정을 함께** 추가·수정·완료 체크한다. 일정 CRUD·완료·가져오기와 그 모달은 `hooks/useEventActions.tsx` 하나에 있다. FAB는 보기에 따라 거래/일정 추가. 헤더 "내역 추가" 버튼은 FAB와 중복이라 없앴다. `?date=YYYY-MM-DD`로 들어오면 그 날 모달을 연다. 구 `/calendar`·`/budgets`·`/recurring`은 `/transactions`로, 구 독립 일정 페이지 `/schedule`(`?date=` 포함)은 `LegacyScheduleRedirect`가 `/transactions?view=일정`으로 옮긴다(`ROUTES.schedule` 자체가 이 주소다). 반복 거래(`RecurringExpense`) 규칙 관리는 우상단 **"반복 거래" 버튼**(`RecurringManageSheet.tsx`).
- `/transactions/import` — 거래 데이터 페이지: CSV 내보내기(이번 달/올해) + CSV·구글 시트 가져오기. 진입점은 설정 "바로가기"의 "거래 데이터"뿐이다. (구 `/transactions/:id/edit` 전용 수정 페이지는 삭제됐고 `/transactions`로 리다이렉트된다 — 수정은 가계부 목록/날짜 모달의 인라인 `TransactionForm` 모달이 담당한다.)
- `/categories` — 카테고리 관리(생성/수정/비활성화). 사이드바·하단탭에는 노출하지 않고 설정(`/settings`) "바로가기"와 계획 화면의 "카테고리별 예산" 서브섹션에서만 진입한다(가계부에서는 제거).
- `/accounts` — 자산 (구 "자산현황". 계좌/저축·투자/부동산/대출 **4개 섹션을 단일 스크롤로** 쌓는다(구 pill 탭 제거) — `CollapsibleGroup` 4개, 접힌 섹션은 마운트되지 않아 해당 쿼리도 펼칠 때 처음 실행된다. `?section=`(구 `?tab=` 딥링크도 호환)으로 진입하면 그 섹션만 펼치고 스크롤. 미래 계획·목표치가 아니라 현재 잔액을 조회·기록하는 자산 스냅샷이라 대시보드 순자산 카드(`accounts_total`+`savings_total`-`loans_total`=`net_worth`, `GET /net-worth`)와 한 세트다. 비상금은 저축·투자 섹션의 `SavingsProduct`(`product_type: "emergency_fund"`)로 관리한다. 상단 `AccountsSnapshotCard`: 순자산 추이 차트·자산구성 도넛·**"전체 동기화"**(계좌/저축상품/부동산에 흩어진 growlio 연동을 한 번에, `sync_all_*` 패턴 — [app/services/CLAUDE.md](../app/services/CLAUDE.md)) + **"growlio 미연동 자산 확인"** 온디맨드 버튼(대시보드에서 이관 — growlio HTTP 2회라 자동 실행 안 함, `GET /net-worth/growlio-unlinked`). 잔액 동기화는 이 화면이 유일 진입점이며, `auto_sync_enabled` 연동이 오래되면 `GET /net-worth`·`GET /dashboard/bootstrap` 응답 후 백그라운드로도 갱신된다(`net_worth_service.refresh_stale_growlio_links`).)
- `/reports/yearly` — 구 연간 리포트. 계획 › 연간 하단 "실적 분석"(`components/plan/YearlyReportSection.tsx`)으로 흡수돼 `planAnalysisLink()`(`/plan?view=연간&section=분석`)로 리다이렉트만 남는다(`AnnualPlanPanel`이 `section=분석`을 보고 스크롤).
- `/plan` — 계획. `PlanPage.tsx`가 **하나의 세그먼트** `[이번 달] [연간]`만 갖는다(`Tabs` pill, `fullWidth`, 모바일에서 sticky). 재무목표는 독립 탭 `/goals`(`GoalsPage` → `GoalsTab`)로 분리됐고, 구 `/financial-plan`(`?view=목표|이번 달|연간`, 더 오래된 `?tab=`/`?view=이번 달 계획|연간계획` 포함)은 `LegacyFinancialPlanRedirect`가 `/goals`·`/plan?view=`로 옮긴다(구 기본 보기가 목표라 파라미터가 없으면 `/goals`). 예전의 페이지 탭 2개(현금흐름 계획/목표) × 뷰 서브탭 2개(이번 달 계획/연간계획)를 세그먼트로 합쳤다. 두 뷰는 같은 골격을 쓴다: `PlanBalanceSummary`(계획 수입 − 계획 지출 = 저축 가능액 + 그중 저축·투자 배정액 한 장, 구 요약카드 4개 대체) → `PlanSectionAccordion`(수입/고정/변동/비정기/저축·투자 섹션마다 헤더에 계획·실적·달성률 막대, 펼치면 그 자리에서 항목 편집 패널 — 구 5개 목적 칩 선택기 `GoalPurposeSummary` 대체, 여러 섹션 동시 펼침 가능). 섹션 패널(`CashflowPlanSectionPanel`/`AnnualPlanSectionPanel`)은 아코디언 본문이라 자체 제목·달성률 막대가 없다. 이번 달은 좌우 스와이프로 월 이동(`useSwipeMonth`), 연간은 chevron으로 연도 이동. 연간에 항목이 하나도 없으면 `PlanYearStartWizard`(작년 계획/반복 거래/최근 3개월 평균으로 초안 생성, `POST /annual-plan/seed`)가 뜨고, 맨 아래에 "실적 분석"(구 연간리포트)이 붙는다. 구 `PlanBreadcrumb`는 3중 중첩이 사라지면서 삭제됐다. 뷰 상태는 `useSearchParams`(`?view=이번 달|연간`)로 관리한다. `이번 달`/`연간`은 `CashflowPlanTab`이 `view` prop(`"monthly"|"annual"`)으로 받아 그리고, `연간`은 `AnnualPlanPanel`을 렌더한다. 카테고리별 월 예산 상한 입력(구 "예산" 탭, `BudgetTab.tsx`는 삭제됨)은 `이번 달` 뷰의 고정/변동/비정기 섹션 패널 안 "카테고리별 예산" 서브섹션으로 흡수됐다 — 여전히 대시보드의 `budget_overrun` 코칭 인사이트를 활성화한다. 예산 대비 실적 rows는 별도 `/budgets` 호출이 아니라 `GET /cashflow-plan`·`GET /annual-plan` 응답의 `category_budgets` 필드로 함께 내려온다(구 `/budgets` 라우터·`/annual-plan/category-budgets` 엔드포인트는 삭제됨. `budget_service` 자체는 코칭엔진·알림이 계속 쓴다). 부진 감지(계획 대비 실적이 `warn`/`critical`)는 카테고리별 예산(`CategoryBudgetProgress`)·수입 섹션(`CashflowPlanSectionPanel`)·저축상품(`SavingsInvestmentPlanPanel`)마다 최근 3개월 평균 실적을 "제안값"으로 보여주고 "다음 달에 반영" 버튼으로 즉시 적용할 수 있다(백엔드 `trailing_average_by_category`/`trailing_average_by_section`/`trailing_average_actuals`, `app/services/CLAUDE.md` 컨벤션대로 서비스 계층에 있음). 계획 원본은 연간계획 하나다 — `이번 달` 뷰는 연간계획 항목의 한 달 단면이라(`CashflowPlanItemOut.id` = 연간 항목 id, 항상 존재) 여기서 금액을 바꾸면 연간계획의 그 달 값이 바뀌고, 삭제는 "이번 달 금액만" 지운다(`deleteCashflowPlanItem({id, yearMonth})`). 다른 달에도 금액이 있는 항목은 `spans_multiple_months`로 "연간계획" 배지를 띄운다. 저장 후엔 `cashflowPlanAll`/`annualPlanAll`을 함께 무효화한다(백엔드 모델은 [app/services/CLAUDE.md](../app/services/CLAUDE.md)의 "계획 원본은 연간계획 하나" 참고).
- `/goals` — 목표. 재무목표·챌린지 카드 목록(`GoalsTab`). 하단탭 4번째로, "우리가 어디까지 왔는지"를 탭 한 번에 보게 계획에서 분리했다. 카드는 진행·예상 달성·월 계획만 보여주고 "자세히 보기 · 서로 응원하기 →"로 `/goals/:id`(`GoalDetailPage`, `goalDetailLink()`)에 간다 — 상세에는 진행 요약, "매달 조금 더 모으면?" 시나리오 슬라이더(`monthsToGoalWithExtra`, 수익률 없는 선형), **응원 보내기**(`POST /financial-goals/{id}/cheer` → 알림함 `goal_cheer`, 보낸 사람 이모지는 리액션으로 붙음)와 이 목표의 마일스톤·응원 기록, 월별 달성 기록, 연동 자금원·growlio 링크, 그리고 growlio가 연결된 경우 "투자 수익을 반영하면?"(`GET /financial-goals/{id}/growlio-insight` — 필요 연수익률 vs 실제 XIRR, 가정 수익률별 매달 필요 금액, 에러면 카드 숨김)이 있다. 목표에 기대 연수익률(`expected_annual_return_pct`, 폼 3단계·growlio 프리필)을 넣으면 월 복리 예상 달성월(`eta_with_return_year_month`)도 보인다. 자산 탭의 growlio 연동 섹션(`GrowlioLinkSection`)에는 자동 동기화 on/off 토글이 있다. 목표 폼(`GoalFormModal`)은 장기 목표일 때 3단계(무엇을·언제·얼마 → 연동할 자금원 → 저축 계획)로 나뉜다(새 목표는 순서대로, 수정은 단계 탭으로 바로 이동). 챌린지는 한 화면 폼.

  재무목표(장기목표/챌린지, `GoalsTab.tsx`)는 한동안 "저축·투자" 섹션 하위 서브섹션으로 흡수돼 "현금흐름 계획" 한 화면 안에 있었지만("수입/고정지출/변동지출/비정기지출/저축투자 5개 목적축으로 설정→가계부 실적 비교→조정"이라는 목표탭 본연의 루프와 겹치면서도 별도 탭으로 단절돼 있었기 때문), 장기목표에도 전체 목표금액·목표일을 정하면 월별 계획이 균등분배로 자동 산출되고 월별로 달성 여부를 확인하는 자체 루프가 생기면서 다시 독립된 "목표" 탭으로 분리했다 — 개별 목표는 각자 다른 기간(목표일)을 기준으로 계획-실적을 비교하는 반면 "현금흐름 계획"은 가계 전체의 달력월 기준이라 스코프가 근본적으로 다르기 때문이다. 다음에 또 흡수/분리를 고민할 때는 "같은 달력월 기준으로 계획 대비 실적을 비교하는가"를 판단 기준으로 삼는다. "저축·투자" 섹션에는 `SavingsInvestmentPlanPanel`(상품별 월 계획 대비 실적)만 남는다 — 저축상품과 목표는 `linked_goal_id`로만 느슨하게 연결되는 별개 개념이다. 상품별 계획액은 기본적으로 `SavingsProduct.monthly_saving_amount`(단일 값) 이지만, `ProductRow`의 "월별 계획 편집"으로 연도별 적용 시작월~종료월 + 월별 금액(`SavingsProductAnnualPlan`, 수입/지출의 `AnnualPlanItem`과 동일 패턴)을 지정하면 그 값이 우선한다 — 그리드를 설정하지 않은 달/상품은 계속 `monthly_saving_amount`로 폴백한다(백엔드 `savings_product_plan_service._effective_monthly_target` 계열 함수 참고). 목표에 연동된 상품도 여기서 똑같이 편집한다 — 연동 목표의 월 저축액은 연동 상품들의 이번 달 계획 합계라(목표 폼은 이 합계를 읽기 전용으로 보여주고 계획 탭으로 안내) 목표 쪽에서 상품 값을 덮어쓰지 않는다. `monthly_saving_amount`는 상품 신규 등록 폼에만 입력란이 있고 수정 폼(`SavingsProductsSection.tsx`)에는 없다 — 연간계획에서 항목별 월별 목표를 관리하게 되면서 등록 이후 이 단일값을 손으로 고칠 일이 없어졌기 때문이다(연간 목표 편집은 위 "월별 계획 편집"이 담당). growlio 잔액 동기화 버튼도 `SavingsInvestmentPlanPanel`에는 없다 — 계획 화면과 잔액 동기화 화면을 분리해 동기화 진입점을 자산현황(`/accounts`, 건별 버튼 + `AccountsSnapshotCard`의 "전체 동기화") 하나로 모은 것이다.

  목표 연동(저축상품/계좌/대출)이 있는 장기목표는 "이번 달 달성액"이 거래내역 기반으로 자동 계산되고(`GoalMonthlyTargetOut.is_auto_computed`, 백엔드 `goal_progress_service.compute_linked_monthly_achieved`), 미연동 목표는 카드에서 매달 직접 입력한다. 월별 계획은 `GoalMonthlyTargetEditor`가 담당한다 — 필요금액·목표일을 먼저 정하면 "균등분배로 다시 계산" 버튼(`utils/monthRange.ts`의 `distributeAmountEvenly`)으로 남은 달에 고르게 나누는 하향식이다(프론트 계산, 백엔드 변경 없음). 옛 `tab=` 딥링크(`tab=예산/챌린지/재무목표/현금흐름 계획/목표`)와 옛 `view=이번 달 계획/연간계획`은 `LegacyFinancialPlanRedirect`가 `/goals` 또는 `/plan?view=이번 달|연간`으로 옮긴다(위 `/plan` 설명 참고) — 현재 유효한 딥링크는 `/goals`와 `/plan?view=` 형태뿐이다. 챌린지는 더 이상 "챌린지 추가" 전용 버튼이 없다 — "목표 추가" 모달 안에 장기 목표/챌린지를 고르는 유형 토글(`GoalFormModal`)이 있고, 이 토글은 **신규 생성 시에만** 뜬다(백엔드 `FinancialGoalUpdateIn`에 `kind` 필드가 없어 생성 후 유형 변경이 불가능하기 때문) — 수정 모드에서는 토글 없이 기존 kind별 폼만 보인다. 장기 목표(goal)와 챌린지(challenge)는 카드 렌더링(`GoalProgressCard`)을 공유하되, 챌린지는 연동·월별계획 필드 자체가 없어(`toPayload`가 항상 `monthly_targets: null`로 저장) 그 부분 블록이 데이터 기반으로 자연히 비고 배지·진행 갱신 위젯 노출 조건에서만 명시적으로 갈린다.)
- `/settings` — 설정
- 미매칭 경로(`*`)는 `/`로 리다이렉트

새 페이지 추가 시 `App.tsx`의 `<Route>`뿐 아니라 `constants/nav.ts`도 갱신한다. `PRIMARY_NAV_ITEMS`(홈/가계부/계획/목표/자산 5개)가 모바일 `BottomNav`와 데스크톱 사이드바의 유일한 메뉴다(일정은 가계부 "일정" 보기, 연간리포트는 계획 › 연간 › 실적 분석으로 흡수됨). "더보기" 시트는 없다. 설정은 탭이 아니라 `Header.tsx`의 톱니 아이콘으로 들어가며, 다크 모드·로그아웃도 설정 화면 한 곳에만 있다(사이드바 중복 제거). 헤더 페이지 타이틀은 `pageTitleFor()`(`PAGE_TITLES` — 주 메뉴 + 설정·카테고리·거래 데이터)가 가장 긴 경로 prefix로 고른다.

**컴포넌트 디렉토리** (`src/components/`): 페이지별 디렉토리(`home/`, `dashboard/`, `transactions/`, `schedule/`, `plan/`, `financialPlan/`, `accounts/`, `categories/`, `settings/`)는 대체로 해당 페이지 1:1 전용 컴포넌트라 개별 나열 대신 디렉토리 단위로만 적는다 — 여러 페이지가 공유하거나 구조가 특이해 미리 알아둘 필요가 있는 것만 아래에 개별로 짚는다. 새 컴포넌트를 추가할 때 이 목록 전체를 갱신하지 않아도 된다(추가/삭제 때마다 드리프트가 나므로).
- `layout/` — `AppLayout.tsx`(사이드바+헤더+본문+하단탭 셸), `Sidebar.tsx`(`hidden lg:flex`), `Header.tsx`(데스크톱/모바일 공통 상단바 — 알림 벨 + 설정 아이콘), `BottomNav.tsx`(`lg:hidden fixed bottom-0`, 주 메뉴 5개)
- `common/` — growlio에서 옮긴 범용 컴포넌트(`Button`/`Modal`/`ConfirmModal`/`Tabs`/`FormInput`/`EmptyState`/`SkeletonCard`/`PageLoader`)와 nestlio 전용(`SummaryCard`, `Badge`, `StatusBadge` — 색상/상태 표시는 항상 `utils/colors.ts` 경유), 그리고 여러 페이지가 공유하는 것들: `CategoryPicker`(카테고리 `<select>`, `kind` prop으로 수입/지출 필터링), `GrowlioImportModal`(growlio 미연동 항목을 골라 가져오는 제네릭 모달 — 계좌/저축상품/부동산 탭이 타입 파라미터로 재사용), `QuickAddFab`(홈·가계부 하단 우측 빠른 추가 버튼), `MonthPicker`, `CollapsibleGroup`, `RowActionButtons`/`AccountActionsMenu`
- `transactions/TransactionForm.tsx` — 가계부 캘린더 페이지의 거래 추가/수정 인라인 모달(목록·날짜 모달 양쪽)이 공유하는 폼. 구 `/transactions/:id/edit` 전용 페이지는 삭제됐다
- `transactions/EventForm.tsx` — 같은 페이지의 일정 추가/수정 모달이 쓰는 폼 (제목/종일/시작·종료일시/장소/설명/반복/리마인더)
- `transactions/MonthCalendarGrid.tsx` — 월간 캘린더 그리드 셸(요일 헤더 + 7열 그리드, `buildGrid`/`todayIso`). 셀 렌더링은 `renderCell` render prop으로 위임하는 제네릭 컴포넌트
- `transactions/LedgerDayCell.tsx` — `MonthCalendarGrid`의 날짜 셀. 거래 수입/지출 금액 + 일정 제목 칩 + 반복 거래 예정 배지를 함께 표시
- `transactions/LedgerDayModal.tsx` — 캘린더에서 날짜 칸을 탭했을 때 뜨는 모달. 그날 거래(추가/수정/삭제)와 일정·예정 반복거래(`ScheduleEventList` — 추가/수정/삭제/완료)를 한 곳에서 다룬다.
- `transactions/TransactionFilterBar.tsx` — 가계부 필터(구분/사용자/지출유형/카테고리 pill). `LedgerListControls`의 "필터" 버튼이 여는 바텀시트 안에 들어간다. `EXPENSE_TYPE_FILTER_OPTIONS`는 `TransactionForm`도 재사용한다.
- `transactions/TransactionListItem.tsx` — 거래 한 건의 행 UI(카테고리 배지 + 설명 + 금액 + 수정/삭제 버튼). `LedgerDayModal`과 `TransactionsPage`의 캘린더 아래 월간 목록(`DailyTransactionGroups`/`ExpenseCategoryGroups`)이 공유한다. `showDate` prop으로 날짜 표시 여부를 정한다.
- `accounts/AccountsSnapshotCard.tsx` — `/accounts` 상단 공통 요약(순자산 추이 차트, 자산구성 도넛, "전체 동기화" + "growlio 미연동 자산 확인" 버튼) — 위 `/accounts` 라우트 설명 참고
- `dashboard/InvestSurplusCard.tsx` — 이번 달 여유자금(비상금 보충분/투자 가능분). growlio 연동 투자상품마다 "포트폴리오 열기"(외부 링크) + "저축 기록" 버튼 — 후자는 `onRecordInvestment` 콜백으로 `DashboardPage`가 빠른 추가 모달을 그 상품·금액으로 미리 채워 연다(저장 시 저축 거래 생성 + growlio DEPOSIT 반영)
- `ErrorBoundary.tsx`, `Toaster.tsx` — 최상위 (App.tsx가 감쌈), `nestlio:toast` 커스텀 이벤트 구독

**상태/데이터 흐름**:
```
api/client.ts (axios + Supabase JWT 인터셉터 + 401 자동 refresh)
  └── api/<리소스>.ts (dashboard, transactions, events, goals, accounts, savingsProducts, … — 백엔드 라우터와 대체로 1:1)
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
- 앱 accent 는 `tailwind.config.ts` 의 `primary` 토큰(emerald 계열)이다. 인터랙티브 크롬(버튼·링크·hover·아이콘·배지)에 raw `emerald-*`/`indigo-*` 클래스를 쓰지 않는다 — `primary-*` 토큰이나 `utils/colors.ts` 헬퍼를 쓴다. CI `frontend` 잡의 grep 가드가 `colors.ts` 밖의 raw `emerald-`/`indigo-` 를 실패시킨다.
- 금액은 항상 `Decimal` 문자열(백엔드 응답 그대로)로 다루고, 표시 시점에만 `utils/format.ts`의 `formatKrw`/`formatKrwCompact`를 거친다. 중간에 `parseFloat` 등으로 임의 반올림하지 않는다.
- 터치 타겟: 단독 액션 버튼(수정/삭제 아이콘 버튼 등)은 `constants/uiSizes.ts`의 `TOUCH_TARGET_MIN`(44px), 배지/탭처럼 조밀하게 나열되는 요소는 `TOUCH_TARGET_COMPACT_MOBILE_ONLY`(36px)를 사용한다. `Button`에 `!min-h-0 !py-1` 같은 override로 44px를 깎지 않는다(모바일에서 못 누른다). 글자는 11px(`text-[11px]`) 미만을 쓰지 않는다 — 캘린더 셀처럼 좁은 곳은 금액을 `formatKrwCompact`로 줄인다.
- 페이지 제목은 `Header.tsx`가 모바일·데스크톱 모두 `<h1>`로 보여준다(`pageTitleFor`). 페이지 컴포넌트 안에 제목 `h1`을 따로 두지 않는다.
- 입력 필드 스타일은 `constants/inputStyles.ts`의 `INPUT_SM`/`INPUT_MD`/`LABEL_SM`/`LABEL_MD`를 재사용한다 (직접 border/rounded 조합을 새로 쓰지 않는다).
- 다크모드는 growlio와 동일하게 `<html>`의 `.dark` 클래스 기반(`darkMode: "class"`)이다. `stores/themeStore.ts`가 최초 진입 시 `localStorage` 저장값이 없으면 `prefers-color-scheme`을 따르고, 이후에는 토글 값을 우선한다.
- React Query 쿼리 키는 `constants/queryKeys.ts`(`QUERY_KEYS`)에 모아두고 각 페이지에서 직접 배열 리터럴을 만들지 않는다 — mutation 성공 후 무효화할 때 실수로 다른 문자열을 써서 캐시가 안 갱신되는 것을 방지.

**테스트**: growlio와 동일하게 Vitest + Testing Library, `src/test/setup.ts`(jsdom `matchMedia` 폴리필 포함)를 사용한다. 현재는 `utils/`, 공용 컴포넌트, store 위주의 가벼운 커버리지이며 growlio처럼 커버리지 임계값(`vite.config.ts`의 `coverage.thresholds`)은 아직 설정하지 않았다 — 페이지 테스트가 쌓인 뒤 실측값 기반으로 도입한다 (growlio의 `docs/`에 실측 후 임계값을 정한 선례가 있다).
