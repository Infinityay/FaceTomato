import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchInterviews } from "../interviewApi";
import type { FilterState } from "@/types/interview";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const defaultFilters: FilterState = {
  categories: [],
  results: [],
  interview_types: [],
  include_unknown_interview_type: false,
  company: "",
  search: "",
};

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchInterviews", () => {
  it("passes new shared categories through query params", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
        total_pages: 0,
      })
    );

    await fetchInterviews(
      {
        ...defaultFilters,
        categories: ["移动端开发", "产品经理", "语音算法"],
      },
      1,
      20
    );

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("categories=%E7%A7%BB%E5%8A%A8%E7%AB%AF%E5%BC%80%E5%8F%91");
    expect(url).toContain("categories=%E4%BA%A7%E5%93%81%E7%BB%8F%E7%90%86");
    expect(url).toContain("categories=%E8%AF%AD%E9%9F%B3%E7%AE%97%E6%B3%95");
  });
});
