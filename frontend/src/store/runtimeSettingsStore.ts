import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { RuntimeConfig } from "@/lib/api";

interface RuntimeSettingsState extends RuntimeConfig {
  setModelProvider: (modelProvider: RuntimeConfig['modelProvider']) => void;
  setApiKey: (apiKey: string) => void;
  setBaseURL: (baseURL: string) => void;
  setModel: (model: string) => void;
  setOcrApiKey: (ocrApiKey: string) => void;
  setSpeechAppKey: (speechAppKey: string) => void;
  setSpeechAccessKey: (speechAccessKey: string) => void;
  setRuntimeConfig: (config: RuntimeConfig) => void;
  clearRuntimeConfig: () => void;
}

const STORAGE_KEY = "face-tomato-runtime-settings";

const initialState: RuntimeConfig = {
  modelProvider: "",
  apiKey: "",
  baseURL: "",
  model: "",
  ocrApiKey: "",
  speechAppKey: "",
  speechAccessKey: "",
};

export const useRuntimeSettingsStore = create<RuntimeSettingsState>()(
  persist(
    (set) => ({
      ...initialState,
      setModelProvider: (modelProvider) => set({ modelProvider: modelProvider ?? "" }),
      setApiKey: (apiKey) => set({ apiKey }),
      setBaseURL: (baseURL) => set({ baseURL }),
      setModel: (model) => set({ model }),
      setOcrApiKey: (ocrApiKey) => set({ ocrApiKey }),
      setSpeechAppKey: (speechAppKey) => set({ speechAppKey }),
      setSpeechAccessKey: (speechAccessKey) => set({ speechAccessKey }),
      setRuntimeConfig: (config) =>
        set({
          modelProvider: config.modelProvider ?? "",
          apiKey: config.apiKey ?? "",
          baseURL: config.baseURL ?? "",
          model: config.model ?? "",
          ocrApiKey: config.ocrApiKey ?? "",
          speechAppKey: config.speechAppKey ?? "",
          speechAccessKey: config.speechAccessKey ?? "",
        }),
      clearRuntimeConfig: () => set(initialState),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
