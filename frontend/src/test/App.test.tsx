import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import App from "../App";
import { useRuntimeSettingsStore } from "../store/runtimeSettingsStore";
import { useQuestionBankStore } from "../store/questionBankStore";
import { useResumeStore } from "../store/resumeStore";
import { useOptimizationStore } from "../store/optimizationStore";
import { useMockInterviewStore } from "../store/mockInterviewStore";
import { useSessionStore, useThemeStore } from "../store/sessionStore";

vi.mock("../pages/ResumePage", () => ({
  default: () => <div>Resume Page</div>,
}));
vi.mock("../pages/DiagnosisPage", () => ({
  default: () => <div>Diagnosis Page</div>,
}));
vi.mock("../pages/QuestionBankPage", () => ({
  default: () => <div>Question Bank Page</div>,
}));
vi.mock("../pages/MockInterviewPage", () => ({
  default: () => <div>Mock Interview Page</div>,
}));

const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: query === "(max-width: 767px)" ? false : false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

vi.stubGlobal("matchMedia", mockMatchMedia);
vi.stubGlobal(
  "fetch",
  vi.fn(async () =>
    new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  )
);

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={["/resume"]}>
      <App />
    </MemoryRouter>
  );

describe("App runtime settings", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    useRuntimeSettingsStore.setState({
      modelProvider: "",
      apiKey: "",
      baseURL: "",
      model: "",
      ocrApiKey: "",
      speechAppKey: "",
      speechAccessKey: "",
    });
    useQuestionBankStore.setState({ selectedId: null, neighbors: null });
    useResumeStore.setState({
      parsedResume: null,
      parseMeta: null,
      parseStatus: "idle",
      parseError: null,
    });
    useOptimizationStore.setState({
      status: "input",
      jdText: "",
      jdData: null,
      overview: null,
      suggestions: null,
      suggestionsStatus: "idle",
      suggestionsError: null,
      activeSuggestionId: null,
      activeTab: "overview",
      error: null,
      matchReport: null,
    });
    useMockInterviewStore.setState({
      sessionId: null,
      resumeFingerprint: null,
      expiresAt: null,
      lastActiveAt: null,
      status: "idle",
      messages: [],
      streamingMessageId: null,
      pendingAssistantPhase: "idle",
      selectedInterviewType: "",
      selectedCategory: "",
      limits: null,
      interviewPlan: null,
      interviewState: null,
      retrieval: null,
      draftMessage: "",
      startedAtMs: null,
      error: null,
      creatingStep: "idle",
      developerContext: null,
      developerTrace: [],
    });
    useSessionStore.setState({
      resumeFile: null,
      resumeText: "",
      jdText: "",
      theme: "system",
    });
    useThemeStore.setState({ theme: "system" });
  });

  it("opens and closes the runtime settings overlay with grouped fields", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Resume Page");
    await user.click(screen.getAllByRole("button", { name: /运行时设置/i })[0]);

    expect(await screen.findByRole("dialog", { name: "运行时设置" })).toBeInTheDocument();
    expect(screen.getByText("能力与状态")).toBeInTheDocument();
    expect(screen.getAllByText("自定义 LLM API").length).toBeGreaterThan(0);
    expect(screen.getAllByText("高精度简历 OCR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("模拟面试语音输入").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Provider")).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toBeInTheDocument();
    expect(screen.getByLabelText("GLM OCR API Key")).toBeInTheDocument();
    expect(screen.getByLabelText("Doubao App Key")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "运行时设置" })).not.toBeInTheDocument();
    });
  });

  it("updates trigger summary and status badges as runtime config changes", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Resume Page");
    expect(screen.getAllByRole("button", { name: /运行时设置/i })[0]).toHaveTextContent("默认");

    await user.click(screen.getAllByRole("button", { name: /运行时设置/i })[0]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Provider" }), "anthropic");

    expect(screen.getAllByText("1 项已启用").length).toBeGreaterThan(0);
    expect(screen.getAllByText("自定义 LLM API").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已启用").length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("GLM OCR API Key"), "glm-key");
    expect(screen.getAllByText("2 项已启用").length).toBeGreaterThan(0);
  });

  it("clears all runtime settings from the overlay", async () => {
    const user = userEvent.setup();
    useRuntimeSettingsStore.setState({
      modelProvider: "openai",
      apiKey: "sk-test",
      baseURL: "https://example.com/v1",
      model: "gpt-test",
      ocrApiKey: "ocr-key",
      speechAppKey: "app-key",
      speechAccessKey: "access-key",
    });

    renderApp();

    await screen.findByText("Resume Page");
    await user.click(screen.getAllByRole("button", { name: /运行时设置/i })[0]);
    expect(await screen.findByRole("dialog", { name: "运行时设置" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清空全部配置" }));

    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveValue("openai");
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(screen.getByLabelText("GLM OCR API Key")).toHaveValue("");
    expect(screen.getByLabelText("Doubao App Key")).toHaveValue("");
    expect(screen.getAllByText("默认").length).toBeGreaterThan(0);
  });
});
