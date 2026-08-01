import "@testing-library/jest-dom/vitest";

// jsdom은 matchMedia를 구현하지 않는다 - themeStore의 시스템 다크모드 감지가 참조하므로 최소 스텁을 채운다.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
