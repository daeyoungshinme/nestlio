/** window.dispatchEvent/addEventListener로 오가는 커스텀 이벤트 이름. dispatch 쪽과 listen 쪽이
 * 서로 다른 파일이라(문자열 오타 시 조용히 안 붙음) 여기 한 곳에서 관리한다.
 * per-viewer localStorage 키는 각자 자기 파일에 이미 단일 상수로 있으므로 여기 넣지 않는다. */
export const APP_EVENTS = {
  /** 401 재시도까지 실패 → App.tsx가 로그아웃 처리 (api/client.ts에서 dispatch). */
  sessionExpired: "nestlio:session-expired",
  /** 토스트 표시 요청 (utils/toast.ts dispatch → components/Toaster.tsx listen). */
  toast: "nestlio:toast",
} as const;
