import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, analyzeResume } from "@/lib/api";
import { useResumeStore } from "../resumeStore";
import { useRuntimeSettingsStore } from "../runtimeSettingsStore";

vi.mock("@/lib/api", () => ({
  ApiError: class extends Error {
    details?: Record<string, unknown>;
    status: number;
    code?: string;

    constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
  analyzeResume: vi.fn(),
}));

const mockedAnalyzeResume = vi.mocked(analyzeResume);

describe("resumeStore", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    useResumeStore.persist.clearStorage();
    useRuntimeSettingsStore.persist.clearStorage();
    useRuntimeSettingsStore.getState().clearRuntimeConfig();
    useResumeStore.setState({
      parsedResume: null,
      parseMeta: null,
      parseStatus: "idle",
      parseError: null,
    });
    mockedAnalyzeResume.mockReset();
  });

  it("stores parseMeta from error details so guidance can be shown", async () => {
    mockedAnalyzeResume.mockRejectedValueOnce(
      new ApiError("当前模型不支持 PDF 文件直抽。", 400, "LLM_FILE_PARSING_UNAVAILABLE", {
        parseMeta: {
          filename: "resume.pdf",
          extension: "pdf",
          elapsed: { ocr_seconds: 0, llm_seconds: 0 },
          guidance: "请切换支持视觉的模型或上传文本版简历。",
        },
      })
    );

    await useResumeStore.getState().parseResumeFile(
      new File(["resume"], "resume.pdf", { type: "application/pdf" })
    );

    expect(useResumeStore.getState()).toMatchObject({
      parseStatus: "error",
      parseError: "当前模型不支持 PDF 文件直抽。",
      parseMeta: {
        filename: "resume.pdf",
        extension: "pdf",
        elapsed: { ocr_seconds: 0, llm_seconds: 0 },
        guidance: "请切换支持视觉的模型或上传文本版简历。",
      },
    });
  });
});
