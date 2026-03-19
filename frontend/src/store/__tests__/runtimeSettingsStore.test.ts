import { beforeEach, describe, expect, it } from "vitest";

import { useRuntimeSettingsStore } from "../runtimeSettingsStore";

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

    const stored = JSON.parse(localStorage.getItem("career-copilot-runtime-settings") ?? "null");
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
});
