import type { UseQueryResult } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QueryBoundary from "@/components/common/QueryBoundary";

/** `UseQueryResult` 전체를 흉내 내지 않고 QueryBoundary가 읽는 필드만 채운 최소 목. */
function mockQuery<T>(overrides: Partial<UseQueryResult<T>>): UseQueryResult<T> {
  return {
    data: undefined,
    error: null,
    isError: false,
    isLoading: false,
    isPending: false,
    refetch: vi.fn(),
    ...overrides,
  } as UseQueryResult<T>;
}

describe("QueryBoundary", () => {
  it("renders the loading fallback while a single query has no data", () => {
    render(
      <QueryBoundary query={mockQuery({ isLoading: true })} loadingFallback={<p>로딩중</p>}>
        {() => <p>본문</p>}
      </QueryBoundary>,
    );

    expect(screen.getByText("로딩중")).toBeInTheDocument();
    expect(screen.queryByText("본문")).not.toBeInTheDocument();
  });

  it("passes the resolved data to the render-prop children", () => {
    render(
      <QueryBoundary query={mockQuery({ data: { name: "부부" } })}>
        {(data) => <p>{data.name}</p>}
      </QueryBoundary>,
    );

    expect(screen.getByText("부부")).toBeInTheDocument();
  });

  it("shows ErrorState and refetches every query on retry", () => {
    const refetchA = vi.fn();
    const refetchB = vi.fn();
    render(
      <QueryBoundary
        queries={[
          mockQuery({ data: [], refetch: refetchA }),
          mockQuery({ isError: true, error: new Error(""), refetch: refetchB }),
        ]}
        errorMessage="목록을 불러오지 못했습니다."
      >
        <p>본문</p>
      </QueryBoundary>,
    );

    expect(screen.queryByText("본문")).not.toBeInTheDocument();
    expect(screen.getByText("목록을 불러오지 못했습니다.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refetchA).toHaveBeenCalledOnce();
    expect(refetchB).toHaveBeenCalledOnce();
  });

  it("renders children once every query in the array has loaded", () => {
    render(
      <QueryBoundary queries={[mockQuery({ data: 1 }), mockQuery({ data: 2 })]}>
        <p>본문</p>
      </QueryBoundary>,
    );

    expect(screen.getByText("본문")).toBeInTheDocument();
  });

  it("calls multi-query render-prop children only after every query has data", () => {
    const children = vi.fn(() => <p>본문</p>);

    const { rerender } = render(
      <QueryBoundary queries={[mockQuery({ data: 1 }), mockQuery({ isLoading: true })]} loadingFallback={<p>로딩중</p>}>
        {children}
      </QueryBoundary>,
    );
    expect(screen.getByText("로딩중")).toBeInTheDocument();
    expect(children).not.toHaveBeenCalled();

    rerender(
      <QueryBoundary queries={[mockQuery({ data: 1 }), mockQuery({ data: 2 })]} loadingFallback={<p>로딩중</p>}>
        {children}
      </QueryBoundary>,
    );
    expect(screen.getByText("본문")).toBeInTheDocument();
  });

  it("does not call multi-query render-prop children when a query failed", () => {
    const children = vi.fn(() => <p>본문</p>);

    render(
      <QueryBoundary queries={[mockQuery({ isError: true, error: new Error("") })]} errorMessage="실패">
        {children}
      </QueryBoundary>,
    );

    expect(screen.getByText("실패")).toBeInTheDocument();
    expect(children).not.toHaveBeenCalled();
  });

  it("shows the fallback for a paused query that is not loading but has no data", () => {
    render(
      <QueryBoundary queries={[mockQuery({ isLoading: false })]} loadingFallback={<p>로딩중</p>}>
        <p>본문</p>
      </QueryBoundary>,
    );

    expect(screen.getByText("로딩중")).toBeInTheDocument();
    expect(screen.queryByText("본문")).not.toBeInTheDocument();
  });
});
