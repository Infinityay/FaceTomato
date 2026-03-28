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

function buildSnapshot(overrides: Partial<typeof baseSnapshot> = {}) {
  return {
    ...baseSnapshot,
    ...overrides,
    interviewState: {
      ...baseSnapshot.interviewState,
      ...overrides.interviewState,
    },
    interviewPlan: overrides.interviewPlan
      ? {
          ...baseSnapshot.interviewPlan,
          ...overrides.interviewPlan,
        }
      : baseSnapshot.interviewPlan,
    runtimeConfig: overrides.runtimeConfig === undefined ? baseSnapshot.runtimeConfig : overrides.runtimeConfig,
  };
}

const baseSnapshot = {
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

const snapshot = buildSnapshot();

const generatedTopic = {
  id: "topic-session-1-1",
  name: "项目经历",
  domain: "structured_thinking",
  score: 91,
  coreQuestion: "介绍一个项目",
  evaluation: "回答完整。",
  problems: ["量化结果仍可补强"],
};

const generatedTopicDetail = {
  ...generatedTopic,
  assessmentFocus: [
    "考察候选人是否能结构化拆解项目背景、动作和结果",
    "考察是否能用量化结果证明项目效果",
  ],
  answerHighlights: ["我负责模型训练和评估"],
  highlightedPoints: ["structured_thinking", "communication"],
  matchedAnswers: [
    { point: "考察候选人是否能结构化拆解项目背景、动作和结果", answerHighlightIndex: 0, status: "covered" },
    { point: "考察是否能用量化结果证明项目效果", answerHighlightIndex: null, status: "missing" },
  ],
  strengths: ["主线明确"],
  weaknesses: ["数据指标稍少"],
  suggestions: ["补充量化结果"],
  followUps: ["如果追问指标怎么回答？"],
  optimizedAnswer: "先讲背景，再讲动作和结果。",
};

function buildGeneratedDetail(sessionId = "session-1") {
  return {
    id: sessionId,
    title: "算法实习生模拟面试复盘",
    role: "算法实习生",
    round: "模拟面试",
    interviewAt: "2026-03-19 18:00",
    reportStatus: "ready",
    defaultSelectedTopicId: generatedTopic.id,
    overallScore: 91,
    summary: "后端已基于 snapshot 生成复盘报告。",
    strengths: ["结构清晰", "回答较完整"],
    risks: ["量化结果仍可补强"],
    priority: "优先补量化结果。",
    topics: [generatedTopic],
    topicDetails: {
      [generatedTopic.id]: generatedTopicDetail,
    },
  };
}

const generatedDetail = buildGeneratedDetail();

function createGenerateStreamResponse(sessionId = "session-1") {
  const detail = buildGeneratedDetail(sessionId);
  const events = [
    { type: "start", sessionId, totalTopics: detail.topics.length },
    {
      type: "topic_complete",
      sessionId,
      currentTopic: 1,
      totalTopics: detail.topics.length,
      topicName: generatedTopic.name,
      preview: generatedTopic,
    },
    { type: "done", sessionId, reportStatus: "ready", detail },
  ];
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

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

  it("does not show unfinished sessions in the review list", async () => {
    localStorage.setItem(
      "face-tomato-mock-interview-recoverable-sessions",
      JSON.stringify([
        { snapshot: buildSnapshot({ sessionId: "session-ready" }) },
        {
          snapshot: buildSnapshot({
            sessionId: "session-unfinished",
            status: "ready",
            interviewState: { closed: false },
          }),
        },
      ])
    );
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    renderPage();

    expect(await screen.findByText("算法实习生")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("session-unfinished")).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /查看复盘/i })).toHaveLength(1);
    });
  });

  it("does not list unfinished sessions for review", async () => {
    localStorage.setItem(
      "face-tomato-mock-interview-recoverable-sessions",
      JSON.stringify([
        {
          snapshot: buildSnapshot({
            sessionId: "session-unfinished",
            status: "ready",
            interviewState: { closed: false },
          }),
        },
      ])
    );

    renderPage();

    expect(await screen.findByText("选择面试记录")).toBeInTheDocument();
    expect(screen.getByText('请先在"模拟面试"页面完成模拟面试，完成后此处即可显示面试记录。')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /查看复盘/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats mixed finished snapshots as reviewable when interviewState.closed is true", async () => {
    localStorage.setItem(
      "face-tomato-mock-interview-recoverable-sessions",
      JSON.stringify([
        {
          snapshot: buildSnapshot({
            sessionId: "session-mixed",
            status: "ready",
            interviewState: { closed: true },
          }),
        },
      ])
    );
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/interview-reviews/session-mixed/generate/stream")) {
        return createGenerateStreamResponse("session-mixed");
      }

      if (url.endsWith(`/api/interview-reviews/session-mixed/topics/${generatedTopic.id}/generate-detail`)) {
        return new Response(
          JSON.stringify({
            sessionId: "session-mixed",
            topicId: generatedTopic.id,
            topic: generatedTopicDetail,
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

    await userEvent.click(await screen.findByRole("button", { name: /查看复盘/i }));
    await userEvent.click(await screen.findByRole("button", { name: "生成报告" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/interview-reviews/session-mixed/generate/stream",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("starts generating the AI report after clicking generate report", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/interview-reviews/session-1/generate/stream")) {
        return createGenerateStreamResponse("session-1");
      }

      if (url.endsWith(`/api/interview-reviews/session-1/topics/${generatedTopic.id}/generate-detail`)) {
        return new Response(
          JSON.stringify({
            sessionId: "session-1",
            topicId: generatedTopic.id,
            topic: generatedTopicDetail,
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

    await userEvent.click(await screen.findByRole("button", { name: /查看复盘/i }));
    await userEvent.click(await screen.findByRole("button", { name: "生成报告" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/interview-reviews/session-1/generate/stream",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const generateCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/interview-reviews/session-1/generate/stream")
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
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/interview-reviews/session-1/generate/stream")) {
        return createGenerateStreamResponse("session-1");
      }

      if (url.endsWith(`/api/interview-reviews/session-1/topics/${generatedTopic.id}/generate-detail`)) {
        return new Response(
          JSON.stringify({
            sessionId: "session-1",
            topicId: generatedTopic.id,
            topic: generatedTopicDetail,
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

    await userEvent.click(await screen.findByRole("button", { name: /查看复盘/i }));
    await userEvent.click(await screen.findByRole("button", { name: "生成报告" }));
    await screen.findByText("后端已基于 snapshot 生成复盘报告。");
    expect(screen.queryByRole("button", { name: /导出报告/i })).not.toBeInTheDocument();
  });

  it("renders one answer card per assessment focus", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/interview-reviews/session-1/generate/stream")) {
        return createGenerateStreamResponse("session-1");
      }

      if (url.endsWith(`/api/interview-reviews/session-1/topics/${generatedTopic.id}/generate-detail`)) {
        return new Response(
          JSON.stringify({
            sessionId: "session-1",
            topicId: generatedTopic.id,
            topic: generatedTopicDetail,
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

    await userEvent.click(await screen.findByRole("button", { name: /查看复盘/i }));
    await userEvent.click(await screen.findByRole("button", { name: "生成报告" }));
    await screen.findByText("后端已基于 snapshot 生成复盘报告。");

    await waitFor(() => {
      expect(screen.getByText("我负责模型训练和评估")).toBeInTheDocument();
      expect(screen.getByText("该维度未明确覆盖，建议补充对应回答。")).toBeInTheDocument();
    });
  });
});

