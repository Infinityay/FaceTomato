import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import DiagnosisPage from "../DiagnosisPage";
import { useResumeStore } from "@/store/resumeStore";
import { useOptimizationStore } from "@/store/optimizationStore";

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/diagnosis"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <LocationDisplay />
              <Routes>
                <Route path="/diagnosis" element={<DiagnosisPage />} />
                <Route path="/resume" element={<div>Resume Page</div>} />
              </Routes>
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("DiagnosisPage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useResumeStore.persist.clearStorage();
    useOptimizationStore.persist.clearStorage();
    useResumeStore.setState({ parsedResume: null, parseStatus: "idle", parseError: null, parseMeta: null });
    useOptimizationStore.getState().reset();
  });

  it("shows shared resume parsing state when resume parsing is in progress", () => {
    useResumeStore.setState({ parsedResume: null, parseStatus: "parsing", parseError: null });
    useOptimizationStore.setState({ status: "input" });

    renderPage();

    expect(screen.getByText("正在解析简历")).toBeInTheDocument();
    expect(screen.getByText("请稍候，系统正在提取并结构化您的简历内容")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看解析进度" })).toBeInTheDocument();
  });

  it("navigates to resume page from parsing state action", async () => {
    const user = userEvent.setup();
    useResumeStore.setState({ parsedResume: null, parseStatus: "parsing", parseError: null });
    useOptimizationStore.setState({ status: "input" });

    renderPage();

    await user.click(screen.getByRole("button", { name: "查看解析进度" }));

    expect(screen.getByTestId("location-display")).toHaveTextContent("/resume");
    expect(screen.getByText("Resume Page")).toBeInTheDocument();
  });

  it("shows suggestions in read-only mode during analysis", () => {
    useResumeStore.setState({
      parsedResume: {
        basicInfo: {
          name: "张三",
          personalEmail: "",
          phoneNumber: "",
          age: "",
          born: "",
          gender: "",
          desiredPosition: "",
          desiredLocation: [],
          currentLocation: "",
          placeOfOrigin: "",
          rewards: [],
        },
        workExperience: [
          {
            companyName: "示例公司",
            employmentPeriod: { startDate: "2023-01", endDate: "至今" },
            title: "后端开发",
            position: "工程师",
            internship: 0,
            jobDescription: "负责接口开发",
          },
        ],
        education: [],
        projects: [],
        academicAchievements: [],
      },
      parseStatus: "success",
      parseError: null,
    });
    useOptimizationStore.setState({
      status: "analysis",
      activeTab: "suggestions",
      overview: {
        resume_summary: {
          headline: "简历方向明确",
          highlights: ["亮点"],
          risks: ["风险"],
        },
        role_personas: [
          {
            role: "后端开发",
            fit_reason: "匹配岗位方向",
            best_scene: "业务系统",
            gap_tip: "补强成果表达",
          },
        ],
      },
      suggestionsStatus: "ready",
      suggestions: {
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
                suggestion: "主导核心接口开发与性能优化",
              },
            ],
          },
        ],
      },
    });

    renderPage();

    expect(screen.getByText("描述偏弱")).toBeInTheDocument();
    expect(screen.getAllByText("负责接口开发")).toHaveLength(2);
    expect(screen.getByText("主导核心接口开发与性能优化")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制建议" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "应用建议" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑并应用" })).not.toBeInTheDocument();
    expect(screen.queryByText("已处理")).not.toBeInTheDocument();
    expect(screen.queryByText("1/1")).not.toBeInTheDocument();
  });
});
