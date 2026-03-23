import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InterviewReviewPage from "../InterviewReviewPage";

const fetchMock = vi.fn();
const appendChildSpy = vi.spyOn(document.body, "appendChild");
const removeChildSpy = vi.spyOn(document.body, "removeChild");
vi.stubGlobal("fetch", fetchMock);
vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation(() => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
);

const snapshot = {
  sessionId: "session-1",
  interviewType: "实习",
  category: "大模型算法",
  status: "completed",
  limits: {
    durationMinutes: 60,
    softInputChars: 1200,
    maxInputChars: 1500,
    contextWindowMessages: 8,
    sessionTtlMinutes: 90,
  },
  jdText: "负责大模型算法研究",
  jdData: {
    basicInfo: {
      jobTitle: "算法实习生",
      jobType: "实习",
      location: "上海",
      company: "某公司",
      department: "算法",
      updateTime: "",
    },
    requirements: {
      degree: "",
      experience: "",
      techStack: ["PyTorch"],
      mustHave: ["机器学习基础"],
      niceToHave: [],
      jobDuties: ["参与模型训练"],
    },
  },
  resumeSnapshot: {
    basicInfo: {
      name: "测试用户",
      personalEmail: "test@example.com",
      phoneNumber: "13800138000",
      age: "",
      born: "",
      gender: "",
      desiredPosition: "算法实习生",
      desiredLocation: [],
      currentLocation: "",
      placeOfOrigin: "",
      rewards: [],
    },
    workExperience: [],
    education: [],
    projects: [],
    academicAchievements: [],
  },
  retrieval: {
    queryText: "",
    appliedFilters: {
      category: "大模型算法",
      interviewType: "实习",
      company: null,
    },
    items: [],
  },
  interviewPlan: {
    plan: [
      { round: 1, topic: "开场介绍", description: "自我介绍" },
      { round: 2, topic: "项目经历", description: "介绍项目" },
      { round: 3, topic: "LeetCode 编码", description: "编码题" },
    ],
    total_rounds: 3,
    estimated_duration: "30 分钟",
    leetcode_problem: "两数之和",
  },
  interviewState: {
    currentRound: 3,
    questionsPerRound: { "1": 1, "2": 1, "3": 1 },
    assistantQuestionCount: 3,
    turnCount: 3,
    reflectionHistory: [],
    closed: true,
  },
  messages: [
    { id: "assistant-1", role: "assistant", content: "请先自我介绍" },
    { id: "user-1", role: "user", content: "我做过大模型训练项目" },
  ],
  developerContext: null,
  developerTrace: [],
  runtimeConfig: {
    apiKey: "runtime-key",
    baseURL: "https://custom.example/v1",
    model: "custom-model",
  },
  resumeFingerprint: "fp-1",
  createdAt: "2026-03-19T10:00:00.000Z",
  lastActiveAt: "2026-03-19T10:10:00.000Z",
  expiresAt: "2099-03-20T10:00:00.000Z",
};

const generatedDetail = {
  id: "session-1",
  title: "算法实习生模拟面试复盘",
  role: "算法实习生",
  round: "模拟面试",
  interviewAt: "2026-03-19 18:00",
  reportStatus: "ready",
  defaultSelectedTopicId: "topic-session-1-1",
  overallScore: 91,
  summary: "后端已基于 snapshot 生成复盘报告。",
  strengths: ["结构清晰", "回答较完整"],
  risks: ["量化结果仍可补强"],
  priority: "优先补量化结果。",
  topics: [
    {
      id: "topic-session-1-1",
      name: "项目经历",
      domain: "structured_thinking",
      score: 91,
      coreQuestion: "介绍一个项目",
      assessmentFocus: [
        "考察候选人是否能结构化拆解项目背景、动作和结果",
        "考察是否能用量化结果证明项目效果",
      ],
      answerHighlights: ["我负责模型训练和评估"],
      highlightedPoints: ["structured_thinking", "communication"],
      matchedAnswers: [
        { point: "考察候选人是否能结构化拆解项目背景、动作和结果", answerHighlightIndex: 0 },
        { point: "考察是否能用量化结果证明项目效果", answerHighlightIndex: null },
      ],
      evaluation: "回答完整。",
      strengths: ["主线明确"],
      weaknesses: ["数据指标稍少"],
      suggestions: ["补充量化结果"],
      followUps: ["如果追问指标怎么回答？"],
      optimizedAnswer: "先讲背景，再讲动作和结果。",
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/interview-review"]}>
      <Routes>
        <Route path="/interview-review" element={<InterviewReviewPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("InterviewReviewPage", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    localStorage.setItem(
      "face-tomato-mock-interview-recoverable-sessions",
      JSON.stringify([{ snapshot }])
    );
  });

  afterEach(() => {
    localStorage.clear();
    appendChildSpy.mockClear();
    removeChildSpy.mockClear();
  });

  it("starts generating the AI report immediately after clicking view review", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/interview-reviews")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/interview-reviews/session-1")) {
        if (!init?.method || init.method === "GET") {
          return new Response(JSON.stringify(generatedDetail), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (url.endsWith("/api/interview-reviews/session-1/generate")) {
        return new Response(
          JSON.stringify({
            sessionId: "session-1",
            reportStatus: "ready",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      return new Response("not found", { status: 404 });
    });

    renderPage();

    await userEvent.click((await screen.findAllByRole("button"))[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/interview-reviews/session-1/generate",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const generateCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/interview-reviews/session-1/generate")
    );
    expect(generateCall).toBeTruthy();
    expect(JSON.parse(String(generateCall?.[1]?.body))).toMatchObject({
      sessionId: "session-1",
      status: "completed",
      interviewPlan: snapshot.interviewPlan,
      runtimeConfig: snapshot.runtimeConfig,
    });

    expect(await screen.findByText("后端已基于 snapshot 生成复盘报告。")).toBeInTheDocument();
    expect(await screen.findByText(/总体评分 91/)).toBeInTheDocument();
  });

  it("does not render the export report button in the top-right area", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/interview-reviews")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/interview-reviews/session-1")) {
        if (!init?.method || init.method === "GET") {
          return new Response(JSON.stringify(generatedDetail), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (url.endsWith("/api/interview-reviews/session-1/generate")) {
        return new Response(
          JSON.stringify({
            sessionId: "session-1",
            reportStatus: "ready",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      return new Response("not found", { status: 404 });
    });

    renderPage();

    await userEvent.click((await screen.findAllByRole("button"))[0]);
    await screen.findByText("后端已基于 snapshot 生成复盘报告。");
    expect(screen.queryByRole("button", { name: /导出报告/i })).not.toBeInTheDocument();
  });

  it("renders one answer card per assessment focus", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/interview-reviews")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/interview-reviews/session-1")) {
        if (!init?.method || init.method === "GET") {
          return new Response(JSON.stringify(generatedDetail), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (url.endsWith("/api/interview-reviews/session-1/generate")) {
        return new Response(
          JSON.stringify({
            sessionId: "session-1",
            reportStatus: "ready",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      return new Response("not found", { status: 404 });
    });

    renderPage();

    await userEvent.click((await screen.findAllByRole("button"))[0]);
    await screen.findByText("后端已基于 snapshot 生成复盘报告。");

    await waitFor(() => {
      expect(screen.getByText("我负责模型训练和评估")).toBeInTheDocument();
      expect(screen.getByText("该维度未明确覆盖，建议补充对应回答。")).toBeInTheDocument();
    });
  });
});

