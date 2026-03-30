import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { QuestionFilters } from "../QuestionFilters";
import { useQuestionBankStore } from "@/store/questionBankStore";

beforeEach(() => {
  useQuestionBankStore.setState({
    filters: {
      categories: [],
      results: [],
      interview_types: [],
      include_unknown_interview_type: false,
      company: "",
      search: "",
    },
    pagination: { page: 1, pageSize: 20, totalPages: 1, total: 0 },
  });
});

describe("QuestionFilters", () => {
  it("renders new shared category badges", () => {
    render(<QuestionFilters />);

    expect(screen.getByText("移动端开发")).toBeInTheDocument();
    expect(screen.getByText("产品经理")).toBeInTheDocument();
    expect(screen.getByText("语音算法")).toBeInTheDocument();
  });
});
