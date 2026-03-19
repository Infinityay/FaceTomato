import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AnalysisPhase from "../AnalysisPhase";
import { useOptimizationStore, type ResumeOverview, type ResumeSuggestions } from "@/store/optimizationStore";

const overview: ResumeOverview = {
  resume_summary: {
    headline: "简历与岗位方向基本匹配",
    highlights: ["亮点 1"],
    risks: ["风险 1"],
  },
  role_personas: [
    {
      role: "后端开发",
      fit_reason: "有相关项目经验",
      best_scene: "中后台业务",
      gap_tip: "补强量化成果",
    },
  ],
};

const suggestions: ResumeSuggestions = {
  sections: [
    {
      section: "workExperience",
      suggestions: [
        {
          id: "SUG-WORK-001",
          priority: 1,
          issue_type: "wording_issue",
          location: {
            section: "workExperience",
            item_index: 0,
          },
          problem: "描述偏弱",
          original: "负责接口开发",
          suggestion: "主导核心接口开发与优化",
        },
      ],
    },
  ],
};

describe("AnalysisPhase", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useOptimizationStore.persist.clearStorage();
    useOptimizationStore.getState().reset();
  });

  it("does not show handled progress badge in the suggestions tab", () => {
    useOptimizationStore.setState({
      status: "analysis",
      activeTab: "suggestions",
      overview,
      suggestions,
      suggestionsStatus: "ready",
    });

    render(<AnalysisPhase />);

    expect(screen.getByRole("button", { name: /修改建议/ })).toBeInTheDocument();
    expect(screen.queryByText("1/1")).not.toBeInTheDocument();
    expect(screen.queryByText("已处理")).not.toBeInTheDocument();
    expect(screen.getByText("描述偏弱")).toBeInTheDocument();
  });

  it("shows loading state for suggestions", () => {
    useOptimizationStore.setState({
      status: "analysis",
      activeTab: "suggestions",
      overview,
      suggestions: null,
      suggestionsStatus: "loading",
      suggestionsError: null,
    });

    render(<AnalysisPhase />);

    expect(screen.getByText("正在生成修改建议...")).toBeInTheDocument();
  });

  it("shows error state for suggestions", () => {
    useOptimizationStore.setState({
      status: "analysis",
      activeTab: "suggestions",
      overview,
      suggestions: null,
      suggestionsStatus: "error",
      suggestionsError: "建议生成失败",
    });

    render(<AnalysisPhase />);

    expect(screen.getByText("建议生成失败")).toBeInTheDocument();
  });

  it("shows empty state when there are no suggestions", () => {
    useOptimizationStore.setState({
      status: "analysis",
      activeTab: "suggestions",
      overview,
      suggestions: { sections: [] },
      suggestionsStatus: "ready",
      suggestionsError: null,
    });

    render(<AnalysisPhase />);

    expect(screen.getByText("简历状态良好")).toBeInTheDocument();
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
  });
});
