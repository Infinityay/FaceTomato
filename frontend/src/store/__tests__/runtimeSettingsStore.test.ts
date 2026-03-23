import { beforeEach, describe, expect, it } from "vitest";

import { useRuntimeSettingsStore } from "../runtimeSettingsStore";

const STORAGE_KEY = "face-tomato-runtime-settings";
const PREVIOUS_BRAND_STORAGE_KEY = "face-tamato-runtime-settings";
const LEGACY_STORAGE_KEY = "career-copilot-runtime-settings";

beforeEach(() => {
  localStorage.clear();
  useRuntimeSettingsStore.persist.clearStorage();
  useRuntimeSettingsStore.getState().clearRuntimeConfig();
});

describe("runtimeSettingsStore", () => {
  it("persists runtime settings to localStorage", () => {
    useRuntimeSettingsStore.getState().setRuntimeConfig({
      modelProvider: "anthropic",
      apiKey: "sk-test",
      baseURL: "https://custom.example/v1",
      model: "gpt-4o",
      ocrApiKey: "zhipu-key",
      speechAppKey: "speech-app",
      speechAccessKey: "speech-access",
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(stored.state).toEqual({
      modelProvider: "anthropic",
      apiKey: "sk-test",
      baseURL: "https://custom.example/v1",
      model: "gpt-4o",
      ocrApiKey: "zhipu-key",
      speechAppKey: "speech-app",
      speechAccessKey: "speech-access",
    });
  });

  it("rehydrates runtime settings from the canonical storage key", async () => {
    useRuntimeSettingsStore.getState().clearRuntimeConfig();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          modelProvider: "google_genai",
          apiKey: "canonical-key",
          baseURL: "https://canonical.example/v1",
          model: "gemini-2.0-flash",
          ocrApiKey: "canonical-ocr",
          speechAppKey: "canonical-app",
          speechAccessKey: "canonical-access",
        },
        version: 0,
      })
    );

    await useRuntimeSettingsStore.persist.rehydrate();

    expect(useRuntimeSettingsStore.getState()).toMatchObject({
      modelProvider: "google_genai",
      apiKey: "canonical-key",
      baseURL: "https://canonical.example/v1",
      model: "gemini-2.0-flash",
      ocrApiKey: "canonical-ocr",
      speechAppKey: "canonical-app",
      speechAccessKey: "canonical-access",
    });
  });

  it("ignores runtime settings stored under the previous brand key", async () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(
      PREVIOUS_BRAND_STORAGE_KEY,
      JSON.stringify({
        state: {
          modelProvider: "google_genai",
          apiKey: "legacy-key",
          baseURL: "https://legacy.example/v1",
          model: "gemini-2.0-flash",
          ocrApiKey: "legacy-ocr",
          speechAppKey: "legacy-app",
          speechAccessKey: "legacy-access",
        },
        version: 0,
      })
    );

    await useRuntimeSettingsStore.persist.rehydrate();

    expect(useRuntimeSettingsStore.getState()).toMatchObject({
      modelProvider: "",
      apiKey: "",
      baseURL: "",
      model: "",
      ocrApiKey: "",
      speechAppKey: "",
      speechAccessKey: "",
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(PREVIOUS_BRAND_STORAGE_KEY)).toBeTruthy();
  });

  it("ignores runtime settings stored under the career-copilot key", async () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        state: {
          modelProvider: "anthropic",
          apiKey: "career-key",
          baseURL: "https://career.example/v1",
          model: "claude-sonnet",
          ocrApiKey: "career-ocr",
          speechAppKey: "career-app",
          speechAccessKey: "career-access",
        },
        version: 0,
      })
    );

    await useRuntimeSettingsStore.persist.rehydrate();

    expect(useRuntimeSettingsStore.getState()).toMatchObject({
      modelProvider: "",
      apiKey: "",
      baseURL: "",
      model: "",
      ocrApiKey: "",
      speechAppKey: "",
      speechAccessKey: "",
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeTruthy();
  });

  it("clears runtime settings back to defaults", () => {
    useRuntimeSettingsStore.getState().setRuntimeConfig({
      modelProvider: "google_genai",
      apiKey: "sk-test",
      baseURL: "https://custom.example/v1",
      model: "gpt-4o",
      ocrApiKey: "zhipu-key",
      speechAppKey: "speech-app",
      speechAccessKey: "speech-access",
    });

    useRuntimeSettingsStore.getState().clearRuntimeConfig();

    expect(useRuntimeSettingsStore.getState()).toMatchObject({
      modelProvider: "",
      apiKey: "",
      baseURL: "",
      model: "",
      ocrApiKey: "",
      speechAppKey: "",
      speechAccessKey: "",
    });
  });

  it("clearStorage removes only the canonical runtime key", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { model: "new" }, version: 0 }));
    localStorage.setItem(PREVIOUS_BRAND_STORAGE_KEY, JSON.stringify({ state: { model: "old-brand" }, version: 0 }));
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { model: "career" }, version: 0 }));

    useRuntimeSettingsStore.persist.clearStorage();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(PREVIOUS_BRAND_STORAGE_KEY)).toBeTruthy();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeTruthy();
  });
});
