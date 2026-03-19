import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeResume, getSpeechStatus, sanitizeRuntimeConfig } from "../api";
import type { RuntimeConfig } from "../api";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("sanitizeRuntimeConfig", () => {
  it("returns undefined when all runtime fields are blank", () => {
    expect(
      sanitizeRuntimeConfig({
        modelProvider: "" as RuntimeConfig["modelProvider"],
        apiKey: "   ",
        baseURL: "",
        model: "\n",
        ocrApiKey: "",
        speechAppKey: "",
        speechAccessKey: "",
      })
    ).toBeUndefined();
  });

  it("keeps provider-only runtime overrides", () => {
    expect(
      sanitizeRuntimeConfig({
        modelProvider: "anthropic",
      })
    ).toEqual({
      modelProvider: "anthropic",
    });
  });

  it("keeps only normalized runtime overrides", () => {
    expect(
      sanitizeRuntimeConfig({
        modelProvider: "openai",
        apiKey: " sk-test ",
        baseURL: " https://custom.example/v1 ",
        model: " gpt-4o ",
        ocrApiKey: " zhipu-key ",
        speechAppKey: " speech-app ",
        speechAccessKey: " speech-access ",
      })
    ).toEqual({
      modelProvider: "openai",
      apiKey: "sk-test",
      baseURL: "https://custom.example/v1",
      model: "gpt-4o",
      ocrApiKey: "zhipu-key",
      speechAppKey: "speech-app",
      speechAccessKey: "speech-access",
    });
  });
});

describe("analyzeResume", () => {
  it("attaches runtime overrides to multipart requests", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        data: {
          basicInfo: {
            name: "",
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
          workExperience: [],
          education: [],
          projects: [],
          academicAchievements: [],
        },
        meta: {
          filename: "resume.pdf",
          extension: "pdf",
          elapsed: { ocr_seconds: 0, llm_seconds: 1.2 },
          guidance: "",
        },
      })
    );

    const file = new File(["resume"], "resume.pdf", { type: "application/pdf" });
    await analyzeResume(file, {
      modelProvider: "anthropic",
      apiKey: "sk-test",
      baseURL: "https://custom.example/v1",
      model: "gpt-4o",
      ocrApiKey: "zhipu-key",
    });

    const formData = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(formData.get("runtime_model_provider")).toBe("anthropic");
    expect(formData.get("runtime_api_key")).toBe("sk-test");
    expect(formData.get("runtime_base_url")).toBe("https://custom.example/v1");
    expect(formData.get("runtime_model")).toBe("gpt-4o");
    expect(formData.get("runtime_ocr_api_key")).toBe("zhipu-key");
  });

  it("throws ApiError with guidance details when backend returns guidance", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          detail: {
            error: {
              code: "LLM_FILE_PARSING_UNAVAILABLE",
              message: "当前模型不支持 PDF 文件直抽。",
              details: {
                parseMeta: {
                  filename: "resume.pdf",
                  extension: "pdf",
                  elapsed: { ocr_seconds: 0, llm_seconds: 0 },
                  guidance: "请切换支持视觉的模型或上传文本版简历。",
                },
              },
            },
          },
        },
        { status: 400 }
      )
    );

    const file = new File(["resume"], "resume.pdf", { type: "application/pdf" });

    await expect(analyzeResume(file)).rejects.toMatchObject({
      message: "当前模型不支持 PDF 文件直抽。",
      status: 400,
      code: "LLM_FILE_PARSING_UNAVAILABLE",
      details: {
        parseMeta: {
          filename: "resume.pdf",
          extension: "pdf",
          elapsed: { ocr_seconds: 0, llm_seconds: 0 },
          guidance: "请切换支持视觉的模型或上传文本版简历。",
        },
      },
    });
  });
});

describe("getSpeechStatus", () => {
  it("passes runtime speech keys as query params", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ available: true }));

    await getSpeechStatus({
      speechAppKey: "speech-app",
      speechAccessKey: "speech-access",
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain("runtime_speech_app_key=speech-app");
    expect(String(fetchMock.mock.calls[0][0])).toContain("runtime_speech_access_key=speech-access");
  });
});
