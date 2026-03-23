import { beforeEach, describe, expect, it } from "vitest";

import { useSessionStore, useThemeStore } from "../sessionStore";
import { useResumeStore } from "../resumeStore";
import { useOptimizationStore } from "../optimizationStore";
import { useMockInterviewStore } from "../mockInterviewStore";

const createPersistedValue = (state: unknown) => JSON.stringify({ state, version: 0 });

const sampleResumeFile = {
  name: "resume.pdf",
  type: "application/pdf",
  size: 1024,
  content: "resume-content",
};

const sampleParsedResume = {
  basicInfo: { name: "测试用户" },
  workExperience: [],
  education: [],
  projects: [],
  academicAchievements: [],
};

const sampleResumeParseMeta = {
  filename: "resume.pdf",
  extension: "pdf",
  elapsed: { ocr_seconds: 0.2, llm_seconds: 0.3 },
};

const sampleOptimizationState = {
  status: "analysis",
  jdText: "负责 React 项目开发",
  jdData: { jobTitle: "前端开发" },
  overview: null,
  suggestions: null,
  suggestionsStatus: "idle",
  suggestionsError: null,
  activeTab: "jdAnalysis",
  error: null,
  matchReport: null,
};

const sampleMockInterviewState = {
  sessionId: "session-1",
  resumeFingerprint: "fp-1",
  expiresAt: "2099-03-16T12:00:00.000Z",
  lastActiveAt: "2026-03-16T10:15:00.000Z",
  selectedInterviewType: "校招",
  selectedCategory: "前端开发",
  limits: {
    durationMinutes: 60,
    softInputChars: 800,
    maxInputChars: 2000,
    contextWindowMessages: 12,
    sessionTtlMinutes: 180,
  },
  interviewPlan: {
    plan: [{ round: 1, topic: "项目介绍", description: "介绍最近的项目" }],
    total_rounds: 1,
    estimated_duration: "20min",
    leetcode_problem: "两数之和",
  },
  interviewState: {
    currentRound: 1,
    questionsPerRound: { "1": 1 },
    assistantQuestionCount: 0,
    turnCount: 0,
    reflectionHistory: [],
    closed: false,
  },
  retrieval: {
    queryText: "前端开发 校招",
    appliedFilters: { category: "前端开发", interviewType: "校招", company: null },
    items: [],
  },
  draftMessage: "还没发送的草稿",
  startedAtMs: 1710573600000,
  status: "ready",
  creatingStep: "idle",
  pendingAssistantPhase: "idle",
  developerContext: {
    sessionMode: "frontend_local_only",
    privacyMode: "frontend_local_export_only",
    ragEnabled: true,
    transcriptPersistence: "frontend_local_only",
    tracePersistence: "frontend_local_only",
  },
  developerTrace: [],
};

type CutoffCase = {
  name: string;
  storage: Storage;
  currentKey: string;
  previousKey: string;
  legacyKey: string;
  persistedState: unknown;
  rehydrate: () => Promise<void>;
  clearStorage: () => void;
  readState: () => Record<string, unknown>;
  expectedState: Record<string, unknown>;
  resetState: () => void;
};

const cases: CutoffCase[] = [
  {
    name: "sessionStore",
    storage: sessionStorage,
    currentKey: "face-tomato-session",
    previousKey: "face-tamato-session",
    legacyKey: "career-copilot-session",
    persistedState: {
      resumeFile: sampleResumeFile,
      resumeText: "候选人简历文本",
      jdText: "岗位 JD 文本",
    },
    rehydrate: async () => {
      await useSessionStore.persist.rehydrate();
    },
    clearStorage: () => {
      useSessionStore.persist.clearStorage();
    },
    readState: () => {
      const state = useSessionStore.getState();
      return {
        resumeFile: state.resumeFile,
        resumeText: state.resumeText,
        jdText: state.jdText,
      };
    },
    expectedState: {
      resumeFile: sampleResumeFile,
      resumeText: "候选人简历文本",
      jdText: "岗位 JD 文本",
    },
    resetState: () => {
      useSessionStore.setState({
        resumeFile: null,
        resumeText: "",
        jdText: "",
        theme: "system",
      });
    },
  },
  {
    name: "themeStore",
    storage: localStorage,
    currentKey: "face-tomato-theme",
    previousKey: "face-tamato-theme",
    legacyKey: "career-copilot-theme",
    persistedState: { theme: "dark" },
    rehydrate: async () => {
      await useThemeStore.persist.rehydrate();
    },
    clearStorage: () => {
      useThemeStore.persist.clearStorage();
    },
    readState: () => ({ theme: useThemeStore.getState().theme }),
    expectedState: { theme: "dark" },
    resetState: () => {
      useThemeStore.setState({ theme: "system" });
    },
  },
  {
    name: "resumeStore",
    storage: sessionStorage,
    currentKey: "face-tomato-resume",
    previousKey: "face-tamato-resume",
    legacyKey: "career-copilot-resume",
    persistedState: {
      parsedResume: sampleParsedResume,
      parseMeta: sampleResumeParseMeta,
    },
    rehydrate: async () => {
      await useResumeStore.persist.rehydrate();
    },
    clearStorage: () => {
      useResumeStore.persist.clearStorage();
    },
    readState: () => {
      const state = useResumeStore.getState();
      return {
        parsedResume: state.parsedResume,
        parseMeta: state.parseMeta,
      };
    },
    expectedState: {
      parsedResume: sampleParsedResume,
      parseMeta: sampleResumeParseMeta,
    },
    resetState: () => {
      useResumeStore.setState({
        parsedResume: null,
        parseMeta: null,
        parseStatus: "idle",
        parseError: null,
      });
    },
  },
  {
    name: "optimizationStore",
    storage: sessionStorage,
    currentKey: "face-tomato-optimization",
    previousKey: "face-tamato-optimization",
    legacyKey: "career-copilot-optimization",
    persistedState: sampleOptimizationState,
    rehydrate: async () => {
      await useOptimizationStore.persist.rehydrate();
    },
    clearStorage: () => {
      useOptimizationStore.persist.clearStorage();
    },
    readState: () => {
      const state = useOptimizationStore.getState();
      return {
        status: state.status,
        jdText: state.jdText,
        jdData: state.jdData,
        activeTab: state.activeTab,
      };
    },
    expectedState: {
      status: "analysis",
      jdText: "负责 React 项目开发",
      jdData: { jobTitle: "前端开发" },
      activeTab: "jdAnalysis",
    },
    resetState: () => {
      useOptimizationStore.getState().reset();
    },
  },
  {
    name: "mockInterviewStore",
    storage: localStorage,
    currentKey: "face-tomato-mock-interview",
    previousKey: "face-tamato-mock-interview",
    legacyKey: "career-copilot-mock-interview",
    persistedState: sampleMockInterviewState,
    rehydrate: async () => {
      await useMockInterviewStore.persist.rehydrate();
    },
    clearStorage: () => {
      useMockInterviewStore.persist.clearStorage();
    },
    readState: () => {
      const state = useMockInterviewStore.getState();
      return {
        sessionId: state.sessionId,
        selectedInterviewType: state.selectedInterviewType,
        selectedCategory: state.selectedCategory,
        draftMessage: state.draftMessage,
        status: state.status,
        resumeFingerprint: state.resumeFingerprint,
      };
    },
    expectedState: {
      sessionId: "session-1",
      selectedInterviewType: "校招",
      selectedCategory: "前端开发",
      draftMessage: "还没发送的草稿",
      status: "ready",
      resumeFingerprint: "fp-1",
    },
    resetState: () => {
      useMockInterviewStore.getState().resetSession();
    },
  },
];

describe("persist storage cutoff across stores", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useSessionStore.persist.clearStorage();
    useThemeStore.persist.clearStorage();
    useResumeStore.persist.clearStorage();
    useOptimizationStore.persist.clearStorage();
    useMockInterviewStore.persist.clearStorage();

    useSessionStore.setState({
      resumeFile: null,
      resumeText: "",
      jdText: "",
      theme: "system",
    });
    useThemeStore.setState({ theme: "system" });
    useResumeStore.setState({
      parsedResume: null,
      parseMeta: null,
      parseStatus: "idle",
      parseError: null,
    });
    useOptimizationStore.getState().reset();
    useMockInterviewStore.getState().resetSession();
  });

  for (const testCase of cases) {
    it(`rehydrates ${testCase.name} from the canonical storage key`, async () => {
      testCase.resetState();
      testCase.storage.setItem(testCase.currentKey, createPersistedValue(testCase.persistedState));

      await testCase.rehydrate();

      expect(testCase.readState()).toMatchObject(testCase.expectedState);
      expect(testCase.storage.getItem(testCase.currentKey)).toBeTruthy();
    });

    it(`ignores ${testCase.name} data stored under the previous brand key`, async () => {
      testCase.resetState();
      const defaultState = testCase.readState();
      testCase.storage.removeItem(testCase.currentKey);
      testCase.storage.setItem(testCase.previousKey, createPersistedValue(testCase.persistedState));

      await testCase.rehydrate();

      expect(testCase.readState()).toMatchObject(defaultState);
      expect(testCase.storage.getItem(testCase.currentKey)).toBeNull();
      expect(testCase.storage.getItem(testCase.previousKey)).toBeTruthy();
    });

    it(`ignores ${testCase.name} data stored under the career-copilot key`, async () => {
      testCase.resetState();
      const defaultState = testCase.readState();
      testCase.storage.removeItem(testCase.currentKey);
      testCase.storage.setItem(testCase.legacyKey, createPersistedValue(testCase.persistedState));

      await testCase.rehydrate();

      expect(testCase.readState()).toMatchObject(defaultState);
      expect(testCase.storage.getItem(testCase.currentKey)).toBeNull();
      expect(testCase.storage.getItem(testCase.legacyKey)).toBeTruthy();
    });

    it(`clearStorage removes only the canonical key for ${testCase.name}`, () => {
      testCase.storage.setItem(testCase.currentKey, createPersistedValue(testCase.persistedState));
      testCase.storage.setItem(testCase.previousKey, createPersistedValue(testCase.persistedState));
      testCase.storage.setItem(testCase.legacyKey, createPersistedValue(testCase.persistedState));

      testCase.clearStorage();

      expect(testCase.storage.getItem(testCase.currentKey)).toBeNull();
      expect(testCase.storage.getItem(testCase.previousKey)).toBeTruthy();
      expect(testCase.storage.getItem(testCase.legacyKey)).toBeTruthy();
    });
  }
});
