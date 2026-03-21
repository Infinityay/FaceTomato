import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchInterviewById } from "@/lib/interviewApi";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { LoadingState } from "@/components/optimization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { InterviewChatList } from "@/components/interview/InterviewChatList";
import { InterviewComposer } from "@/components/interview/InterviewComposer";
import { InterviewSessionHeader } from "@/components/interview/InterviewSessionHeader";
import { QuestionDetailView } from "@/components/questions/QuestionDetailView";
import ResumeParsingState from "@/components/resume/ResumeParsingState";
import { ResumeRequiredPrompt } from "@/components/resume/ResumeRequiredPrompt";
import { extractJdData, getSpeechStatus, type RuntimeConfig } from "@/lib/api";
import { useRuntimeSettingsStore } from "@/store/runtimeSettingsStore";
import { streamCreateMockInterviewSession, streamMockInterviewReply } from "@/lib/mockInterviewApi";
import { buildMockInterviewTranscriptMarkdown } from "@/lib/mockInterviewDeveloperReport";
import { downloadTextFile } from "@/lib/download";
import {
  clearLegacyRecoverableSessions,
  MOCK_INTERVIEW_RECOVERY_EVENT,
  getPendingSessionById,
  getPendingSessions,
  getRecoverableSessionById,
  getRecoverableSessions,
  removePendingSession,
  removeRecoverableSession,
  updatePendingSession,
  upsertPendingSession,
  upsertRecoverableSession,
} from "@/lib/mockInterviewRecovery";
import { useOptimizationStore } from "@/store/optimizationStore";
import { useMockInterviewStore } from "@/store/mockInterviewStore";
import { useQuestionBankStore } from "@/store/questionBankStore";
import { useResumeStore } from "@/store/resumeStore";
import { useSpeechInput } from "@/store/useSpeechInput";
import { ALL_CATEGORIES, ALL_INTERVIEW_TYPES, type Category, type InterviewType } from "@/types/interview";
import type {
  MockInterviewDeveloperTraceEvent,
  MockInterviewSessionResponse,
  MockInterviewSessionSnapshot,
} from "@/types/mockInterview";

type RecoverableSessionInboxItem = {
  sessionId: string;
  interviewType: string;
  category: string;
  lastActiveAt: string;
  startedAt: string;
  status: "ready" | "streaming" | "completed" | "expired";
  turnCount: number;
  isUnavailable: boolean;
};

type PendingSessionInboxItem = {
  pendingId: string;
  sessionId: string | null;
  interviewType: string;
  category: string;
  creatingStep: "idle" | "retrieving_evidence" | "generating_plan" | "starting_interview";
};

const creatingStateMeta = {
  retrieving_evidence: {
    title: "正在检索相关面经",
    description: "正在根据岗位类型、岗位领域、简历与 JD 检索相关面经。",
  },
  generating_plan: {
    title: "正在生成面试计划",
    description: "正在结合命中的面经与候选人背景生成本场模拟面试计划。",
  },
  starting_interview: {
    title: "正在初始化面试官",
    description: "正在建立会话并准备首轮面试问题。",
  },
  idle: {
    title: "正在初始化面试官",
    description: "正在建立会话并准备首轮面试问题。",
  },
} as const;

const creatingSteps = ["正在检索相关面经", "正在生成面试计划", "正在初始化面试官"];
const creatingStepsWithoutRag = ["正在准备面试上下文", "正在生成面试计划", "正在初始化面试官"];

const defaultLimits = {
  durationMinutes: 60,
  softInputChars: 1200,
  maxInputChars: 1500,
  contextWindowMessages: 8,
  sessionTtlMinutes: 90,
};

const emptyRetrieval = {
  queryText: "",
  appliedFilters: { category: null, interviewType: null, company: null },
  items: [],
};

const getRuntimeConfig = (): RuntimeConfig => {
  const state = useRuntimeSettingsStore.getState();
  return {
    modelProvider: state.modelProvider,
    apiKey: state.apiKey,
    baseURL: state.baseURL,
    model: state.model,
    ocrApiKey: state.ocrApiKey,
    speechAppKey: state.speechAppKey,
    speechAccessKey: state.speechAccessKey,
  };
};

const MockInterviewPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { parsedResume, parseStatus, setParsedResume } = useResumeStore();
  const { jdText, jdData, setJdText, setJdData } = useOptimizationStore();
  const {
    sessionId,
    status,
    messages,
    streamingMessageId,
    pendingAssistantPhase,
    selectedInterviewType,
    selectedCategory,
    limits,
    interviewPlan,
    interviewState,
    retrieval,
    draftMessage,
    error,
    creatingStep,
    setSelectedInterviewType,
    setSelectedCategory,
    setDraftMessage,
    setStartedAt,
    setCreatingStep,
    initializeSession,
    restoreSessionFromSnapshot,
    appendUserMessage,
    startAnswerAnalysis,
    clearPendingAssistantPhase,
    startAssistantMessage,
    applyAssistantDelta,
    finishAssistantMessage,
    completeStream,
    setInterviewState,
    setError,
    resetSession,
    appendReflection,
    developerContext,
    setDeveloperContext,
    appendDeveloperTrace,
  } = useMockInterviewStore();

  const setSelectedQuestionId = useQuestionBankStore((state) => state.setSelectedId);
  const selectedQuestionId = useQuestionBankStore((state) => state.selectedId);

  const [showJdDialog, setShowJdDialog] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [pendingJdText, setPendingJdText] = useState("");
  const speechAppKey = useRuntimeSettingsStore((state) => state.speechAppKey);
  const speechAccessKey = useRuntimeSettingsStore((state) => state.speechAccessKey);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [retrievalPreviews, setRetrievalPreviews] = useState<Record<string, string>>({});
  const [recoverableSessions, setRecoverableSessions] = useState<RecoverableSessionInboxItem[]>([]);
  const [activePendingSession, setActivePendingSession] = useState<PendingSessionInboxItem | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const speechBaseDraftRef = useRef("");
  const speechTextRef = useRef("");

  const applySpeechDraft = useCallback(
    (text: string) => {
      const currentSpeech = speechTextRef.current;
      if (
        currentSpeech &&
        text &&
        !text.startsWith(currentSpeech) &&
        text.length <= Math.max(4, Math.floor(currentSpeech.length / 2))
      ) {
        speechBaseDraftRef.current = speechBaseDraftRef.current.endsWith(currentSpeech)
          ? speechBaseDraftRef.current
          : `${speechBaseDraftRef.current}${currentSpeech}`;
        speechTextRef.current = "";
      }

      const base = speechBaseDraftRef.current;
      speechTextRef.current = text;
      setDraftMessage(base ? `${base}${text}` : text);
    },
    [setDraftMessage]
  );

  const handlePartialText = useCallback(
    (text: string) => {
      applySpeechDraft(text);
    },
    [applySpeechDraft]
  );

  const handleFinalText = useCallback(
    (text: string) => {
      const base = speechBaseDraftRef.current;
      const nextDraft = text && base.endsWith(text) ? base : base ? `${base}${text}` : text;
      speechTextRef.current = "";
      speechBaseDraftRef.current = nextDraft;
      setDraftMessage(nextDraft);
    },
    [setDraftMessage]
  );

  const resumeAttemptedRef = useRef<string | null>(null);
  const justCreatedSessionRef = useRef<string | null>(null);

  const {
    supported: speechSupported,
    start: startListening,
    stop: stopListening,
    isListening,
    interimText,
    error: speechError,
  } = useSpeechInput({
    enabled: speechAvailable,
    speechAppKey,
    speechAccessKey,
    onPartialText: handlePartialText,
    onFinalText: handleFinalText,
  });

  const handleMicToggle = useCallback(() => {
    if (isListening) {
      void stopListening();
    } else {
      speechBaseDraftRef.current = useMockInterviewStore.getState().draftMessage;
      speechTextRef.current = "";
      void startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    clearLegacyRecoverableSessions();
  }, []);

  useEffect(() => {
    void getSpeechStatus({ speechAppKey, speechAccessKey })
      .then((payload) => setSpeechAvailable(Boolean(payload?.available)))
      .catch(() => setSpeechAvailable(false));
  }, [speechAppKey, speechAccessKey]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const canStart = Boolean(selectedInterviewType && selectedCategory);
  const hasPendingLoadingView = Boolean(activePendingSession) && status !== "creating";
  const interviewStarted = Boolean(sessionId) && !(status === "creating" && messages.length === 0);
  const isBusy = status === "creating" || status === "streaming";
  const isPlanningInterview = status === "creating";
  const retrievalItems = retrieval?.items ?? [];
  const visibleRetrievalItems = retrievalItems.slice(0, 5);
  const ragEnabled = developerContext?.ragEnabled ?? true;
  const currentCreatingMeta =
    ragEnabled
      ? creatingStateMeta[activePendingSession?.creatingStep ?? creatingStep]
      : (activePendingSession?.creatingStep ?? creatingStep) === "retrieving_evidence"
        ? {
            title: "正在准备面试上下文",
            description: "正在根据 JD 与简历准备本场模拟面试的基础上下文。",
          }
        : creatingStateMeta[activePendingSession?.creatingStep ?? creatingStep];
  const activeCreatingSteps = ragEnabled ? creatingSteps : creatingStepsWithoutRag;
  const currentRound = interviewState?.currentRound ?? 1;
  const turnCount = interviewState?.turnCount ?? 0;

  const buildLocalSnapshot = useCallback(
    (
      sourceState: ReturnType<typeof useMockInterviewStore.getState>,
      overrides: Partial<{
        sessionId: string;
        status: "ready" | "streaming" | "completed" | "expired";
        messages: typeof sourceState.messages;
        interviewState: NonNullable<typeof sourceState.interviewState>;
        interviewPlan: NonNullable<typeof sourceState.interviewPlan>;
        createdAt: string;
        lastActiveAt: string;
        expiresAt: string;
        interviewType: InterviewType;
        category: Category;
        retrieval: typeof sourceState.retrieval;
        jdText: string;
        developerContext: typeof sourceState.developerContext;
        developerTrace: typeof sourceState.developerTrace;
      }> = {}
    ): MockInterviewSessionSnapshot | null => {
      const interviewType = overrides.interviewType ?? sourceState.selectedInterviewType;
      const category = overrides.category ?? sourceState.selectedCategory;
      const resolvedPlan = overrides.interviewPlan ?? sourceState.interviewPlan;
      const resolvedState = overrides.interviewState ?? sourceState.interviewState;
      if (!parsedResume || !interviewType || !category || !resolvedPlan || !resolvedState) {
        return null;
      }

      const resolvedStatus =
        overrides.status ??
        (sourceState.status === "completed"
          ? "completed"
          : sourceState.status === "streaming" || sourceState.status === "creating"
            ? "streaming"
            : "ready");

      return {
        snapshotVersion: 3,
        sessionId: overrides.sessionId ?? sourceState.sessionId ?? "",
        interviewType,
        category,
        status: resolvedStatus,
        limits: sourceState.limits ?? defaultLimits,
        jdText: overrides.jdText ?? jdText,
        jdData: jdData ?? null,
        resumeSnapshot: parsedResume,
        retrieval: overrides.retrieval ?? sourceState.retrieval ?? emptyRetrieval,
        interviewPlan: resolvedPlan,
        interviewState: resolvedState,
        messages: overrides.messages ?? sourceState.messages,
        developerContext: overrides.developerContext ?? sourceState.developerContext ?? null,
        developerTrace: overrides.developerTrace ?? sourceState.developerTrace,
        resumeFingerprint: sourceState.resumeFingerprint ?? "frontend-only",
        createdAt: overrides.createdAt ?? new Date(sourceState.startedAtMs || Date.now()).toISOString(),
        lastActiveAt: overrides.lastActiveAt ?? new Date().toISOString(),
        expiresAt: overrides.expiresAt ?? sourceState.expiresAt ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      };
    },
    [jdData, jdText, parsedResume]
  );

  const persistSnapshot = useCallback(
    (overrides: Parameters<typeof buildLocalSnapshot>[1] = {}) => {
      const snapshot = buildLocalSnapshot(useMockInterviewStore.getState(), {
        lastActiveAt: new Date().toISOString(),
        ...overrides,
      });
      if (snapshot) {
        upsertRecoverableSession({ snapshot });
      }
      return snapshot;
    },
    [buildLocalSnapshot]
  );

  const handleDeveloperTrace = useCallback(
    (trace: MockInterviewDeveloperTraceEvent) => {
      appendDeveloperTrace(trace);
      persistSnapshot({ developerTrace: [...useMockInterviewStore.getState().developerTrace, trace] });
    },
    [appendDeveloperTrace, persistSnapshot]
  );

  const handleExportTranscript = useCallback(() => {
    const snapshot = buildLocalSnapshot(useMockInterviewStore.getState(), { status: "completed" });
    if (!snapshot) {
      return;
    }
    const markdown = buildMockInterviewTranscriptMarkdown(snapshot);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadTextFile(`mock-interview-transcript-${snapshot.sessionId}-${timestamp}.md`, markdown, "text/markdown;charset=utf-8");
  }, [buildLocalSnapshot]);

  const handleCloseJdDialog = useCallback(() => {
    if (isPlanningInterview) {
      return;
    }
    setShowJdDialog(false);
    setPendingJdText(jdText);
  }, [isPlanningInterview, jdText]);

  const refreshRecoverableInbox = useCallback(async () => {
    const localSessions = getRecoverableSessions();
    if (localSessions.length === 0) {
      setRecoverableSessions([]);
      setRecoveryChecked(true);
      return;
    }
    const merged = localSessions
      .map((item) => ({
        sessionId: item.snapshot.sessionId,
        interviewType: item.snapshot.interviewType,
        category: item.snapshot.category,
        lastActiveAt: item.snapshot.lastActiveAt,
        startedAt: item.snapshot.createdAt,
        status: item.snapshot.status,
        turnCount: item.snapshot.interviewState.turnCount,
        isUnavailable: item.snapshot.status === "expired" || item.snapshot.status === "completed",
      }))
      .sort((a, b) => +new Date(b.lastActiveAt) - +new Date(a.lastActiveAt));
    setRecoverableSessions(merged);
    setRecoveryChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionId || visibleRetrievalItems.length === 0) {
      return;
    }

    const previewKey = (interviewId: number) => `${sessionId}:${interviewId}`;

    const missingItems = visibleRetrievalItems.filter((item) => retrievalPreviews[previewKey(item.interviewId)] === undefined);
    if (missingItems.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      missingItems.map(async (item) => {
        try {
          const detail = await fetchInterviewById(item.interviewId);
          const preview = detail.content.slice(0, 20);
          return [previewKey(item.interviewId), preview ? `${preview}...` : ""] as const;
        } catch {
          return [previewKey(item.interviewId), ""] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      setRetrievalPreviews((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [retrievalPreviews, sessionId, visibleRetrievalItems]);

  useEffect(() => {
    if (!sessionId || messages.length > 0) {
      return;
    }
    if (justCreatedSessionRef.current === sessionId) {
      return;
    }
    if (resumeAttemptedRef.current === sessionId) {
      return;
    }
    resumeAttemptedRef.current = sessionId;

    const record = getRecoverableSessionById(sessionId);
    if (!record) {
      resetSession();
      return;
    }

    const resumed = record.snapshot;
    setParsedResume(resumed.resumeSnapshot);
    setDeveloperContext(resumed.developerContext);
    restoreSessionFromSnapshot({ snapshot: resumed });
    setStartedAt(Date.parse(resumed.createdAt));
    setJdText(resumed.jdText ?? "");
    if (resumed.jdData) {
      setJdData(resumed.jdData);
    }
  }, [
    messages.length,
    resetSession,
    restoreSessionFromSnapshot,
    sessionId,
    setParsedResume,
    setJdData,
    setJdText,
    setStartedAt,
    setDeveloperContext,
  ]);

  useEffect(() => {
    if (sessionId) {
      return;
    }
    void refreshRecoverableInbox();
  }, [refreshRecoverableInbox, sessionId]);

  const handleRecoverPreviousSession = async (item: RecoverableSessionInboxItem) => {
    if (item.isUnavailable) {
      return;
    }

    try {
      const record = getRecoverableSessionById(item.sessionId);
      if (!record) {
        throw new Error("历史会话不存在或已过期");
      }
      const resumed = record.snapshot;
      setParsedResume(resumed.resumeSnapshot);
      setDeveloperContext(resumed.developerContext);
      restoreSessionFromSnapshot({ snapshot: resumed });
      setStartedAt(Date.parse(resumed.createdAt));
      setJdText(resumed.jdText ?? "");
      if (resumed.jdData) {
        setJdData(resumed.jdData);
      }
      setRecoverableSessions([]);
    } catch (recoverError) {
      setError(recoverError instanceof Error ? recoverError.message : "恢复会话失败");
    }
  };

  useEffect(() => {
    const shouldCreateNew = searchParams.get("new") === "1";
    if (!shouldCreateNew) {
      return;
    }

    resetSession();
    setSelectedQuestionId(null);
    setSearchParams({}, { replace: true });
  }, [resetSession, searchParams, setSearchParams, setSelectedQuestionId]);

  useEffect(() => {
    const targetSessionId = searchParams.get("session");
    const targetPendingId = searchParams.get("pending");
    if (targetPendingId && !targetSessionId) {
      const pendingRecord = getPendingSessionById(targetPendingId);
      if (!pendingRecord) {
        if (
          activePendingSession?.pendingId === targetPendingId &&
          activePendingSession.sessionId &&
          getRecoverableSessionById(activePendingSession.sessionId)
        ) {
          setSearchParams({ session: activePendingSession.sessionId }, { replace: true });
        }
        return;
      }
      setActivePendingSession({
        pendingId: pendingRecord.pending.pendingId,
        sessionId: pendingRecord.pending.sessionId ?? null,
        interviewType: pendingRecord.pending.interviewType,
        category: pendingRecord.pending.category,
        creatingStep: pendingRecord.pending.creatingStep,
      });
      resetSession();
      setSelectedInterviewType(pendingRecord.pending.interviewType);
      setSelectedCategory(pendingRecord.pending.category);
      setCreatingStep(pendingRecord.pending.creatingStep);
      return;
    }

    setActivePendingSession(null);
    if (!targetSessionId) {
      return;
    }
    if (sessionId === targetSessionId) {
      return;
    }

    const record = getRecoverableSessionById(targetSessionId);
    if (!record) {
      if (activePendingSession?.sessionId === targetSessionId) {
        return;
      }
      setError("历史会话不存在或已过期");
      setSearchParams({}, { replace: true });
      return;
    }

    void handleRecoverPreviousSession({
      sessionId: record.snapshot.sessionId,
      interviewType: record.snapshot.interviewType,
      category: record.snapshot.category,
      lastActiveAt: record.snapshot.lastActiveAt,
      startedAt: record.snapshot.createdAt,
      status: record.snapshot.status,
      turnCount: record.snapshot.interviewState.turnCount,
      isUnavailable: false,
    });
  }, [
    resetSession,
    searchParams,
    sessionId,
    activePendingSession,
    setCreatingStep,
    setError,
    setSearchParams,
    setSelectedCategory,
    setSelectedInterviewType,
  ]);

  useEffect(() => {
    const pendingId = searchParams.get("pending");
    if (!pendingId) {
      return;
    }

    const syncPendingSession = () => {
      const pendingRecord = getPendingSessionById(pendingId);
      if (!pendingRecord) {
        if (
          activePendingSession?.pendingId === pendingId &&
          activePendingSession.sessionId &&
          getRecoverableSessionById(activePendingSession.sessionId)
        ) {
          setSearchParams({ session: activePendingSession.sessionId }, { replace: true });
        }
        return;
      }
      setActivePendingSession({
        pendingId: pendingRecord.pending.pendingId,
        sessionId: pendingRecord.pending.sessionId ?? null,
        interviewType: pendingRecord.pending.interviewType,
        category: pendingRecord.pending.category,
        creatingStep: pendingRecord.pending.creatingStep,
      });
      setCreatingStep(pendingRecord.pending.creatingStep);
    };

    window.addEventListener(MOCK_INTERVIEW_RECOVERY_EVENT, syncPendingSession);
    return () => {
      window.removeEventListener(MOCK_INTERVIEW_RECOVERY_EVENT, syncPendingSession);
    };
  }, [activePendingSession, searchParams, setCreatingStep, setSearchParams]);

  if (parseStatus === "parsing") {
    return <ResumeParsingState actionLabel="查看解析进度" onAction={() => navigate("/resume")} />;
  }

  if (!parsedResume && !sessionId && recoveryChecked && recoverableSessions.length === 0) {
    return <ResumeRequiredPrompt description={'请先在"简历解析"页面上传并解析您的简历，完成后再开始模拟面试。'} />;
  }

  const runStream = async (mode: "start" | "reply", message?: string, activeSessionId?: string) => {
    const currentState = useMockInterviewStore.getState();
    const nextSessionId = activeSessionId ?? currentState.sessionId;
    if (
      !nextSessionId ||
      !parsedResume ||
      !currentState.selectedInterviewType ||
      !currentState.selectedCategory ||
      !currentState.interviewPlan ||
      !currentState.interviewState
    ) {
      return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const isViewingTargetSession = () => useMockInterviewStore.getState().sessionId === nextSessionId;

    try {
      await streamMockInterviewReply({
        sessionId: nextSessionId,
        mode,
        interviewType: currentState.selectedInterviewType,
        category: currentState.selectedCategory,
        jdText,
        jdData: jdData ?? null,
        resumeSnapshot: parsedResume,
        retrieval: currentState.retrieval ?? emptyRetrieval,
        interviewPlan: currentState.interviewPlan,
        interviewState: currentState.interviewState,
        messages: currentState.messages,
        message,
        runtimeConfig: getRuntimeConfig(),
        signal: abortRef.current.signal,
        onUserMessage: (payload) => {
          if (isViewingTargetSession()) {
            appendUserMessage(payload);
          }
        },
        onAnswerAnalysisStarted: () => {
          if (isViewingTargetSession()) {
            startAnswerAnalysis();
          }
        },
        onMessageStart: ({ messageId }) => {
          if (isViewingTargetSession()) {
            clearPendingAssistantPhase();
            startAssistantMessage(messageId);
          }
        },
        onMessageDelta: ({ messageId, delta }) => {
          if (isViewingTargetSession()) {
            applyAssistantDelta(messageId, delta);
          }
        },
        onMessageEnd: ({ messageId, content, interviewState: nextInterviewState }) => {
          if (isViewingTargetSession()) {
            finishAssistantMessage({ messageId, content, interviewState: nextInterviewState });
          }
        },
        onReflection: (reflection) => {
          if (isViewingTargetSession()) {
            appendReflection(reflection);
          }
        },
        onDeveloperTrace: (trace) => {
          if (isViewingTargetSession()) {
            handleDeveloperTrace(trace);
          }
        },
        onRoundTransition: (transition) => {
          if (!isViewingTargetSession()) {
            return;
          }
          const state = useMockInterviewStore.getState().interviewState;
          if (!state) {
            return;
          }
          setInterviewState({
            ...state,
            currentRound: transition.to_round,
            questionsPerRound: {
              ...state.questionsPerRound,
              [String(transition.to_round)]: state.questionsPerRound[String(transition.to_round)] ?? 0,
            },
          });
        },
        onDone: ({ sessionId: doneSessionId, status: nextStatus, interviewState: nextInterviewState }) => {
          if (doneSessionId === justCreatedSessionRef.current) {
            justCreatedSessionRef.current = null;
          }
          if (isViewingTargetSession()) {
            completeStream({ status: nextStatus, interviewState: nextInterviewState });
            persistSnapshot({
              sessionId: doneSessionId,
              status: nextStatus,
              interviewState: nextInterviewState,
            });
          }
        },
      });
    } catch (streamError) {
      if (streamError instanceof DOMException && streamError.name === "AbortError") {
        clearPendingAssistantPhase();
        return;
      }
      clearPendingAssistantPhase();
      setError(streamError instanceof Error ? streamError.message : "模拟面试请求失败");
    }
  };

  const startInterview = async (nextJdText: string) => {
    if (!selectedInterviewType || !selectedCategory || !parsedResume) return;

    const normalizedJdText = nextJdText.trim();
    if (!normalizedJdText) {
      setError("请先填写并解析岗位 JD 后再开始模拟面试");
      setShowJdDialog(true);
      return;
    }

    let jdResolved = false;
    let currentStep: "jd" | "session" | "start" = "jd";
    const pendingId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `pending-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const startedAt = new Date().toISOString();
    let createdSessionId: string | null = null;
    let createdSession: MockInterviewSessionResponse | null = null;
    let initialAssistantMessage: { id: string; content: string } | null = null;
    let initialDeveloperTrace: MockInterviewDeveloperTraceEvent[] = [];

    try {
      setCreatingStep("retrieving_evidence");
      upsertPendingSession({
        pendingId,
        sessionId: null,
        interviewType: selectedInterviewType,
        category: selectedCategory,
        creatingStep: "retrieving_evidence",
        startedAt,
        lastActiveAt: startedAt,
      });
      setJdText(normalizedJdText);
      const runtimeConfig = getRuntimeConfig();
      const resolvedJdData =
        jdText.trim() === normalizedJdText && jdData
          ? jdData
          : await extractJdData(normalizedJdText, runtimeConfig);
      jdResolved = true;
      setJdData(resolvedJdData);

      currentStep = "session";
      await streamCreateMockInterviewSession({
        input: {
          interviewType: selectedInterviewType,
          category: selectedCategory,
          jdText: normalizedJdText,
          jdData: resolvedJdData,
          resumeData: parsedResume,
          runtimeConfig,
        },
        onProgress: ({ stage }) => {
          setCreatingStep(stage);
          updatePendingSession(pendingId, {
            creatingStep: stage,
            lastActiveAt: new Date().toISOString(),
          });
          setActivePendingSession((current) =>
            current?.pendingId === pendingId ? { ...current, creatingStep: stage } : current
          );
        },
        onDeveloperTrace: handleDeveloperTrace,
        onSessionCreated: (session) => {
          createdSession = session;
          if (session.jdData) {
            setJdData(session.jdData);
          }
          initializeSession({
            sessionId: session.sessionId,
            interviewType: session.interviewType,
            category: session.category,
            resumeFingerprint: session.resumeFingerprint,
            expiresAt: session.expiresAt,
            limits: session.limits,
            interviewPlan: session.interviewPlan,
            interviewState: session.interviewState,
            retrieval: session.retrieval,
            developerContext: session.developerContext ?? null,
          });
          setDeveloperContext(session.developerContext ?? null);
          justCreatedSessionRef.current = session.sessionId;
          resumeAttemptedRef.current = null;
          setStartedAt(Date.now());
          updatePendingSession(pendingId, {
            sessionId: session.sessionId,
            creatingStep: "starting_interview",
            lastActiveAt: new Date().toISOString(),
          });
          setActivePendingSession((current) =>
            current?.pendingId === pendingId
              ? { ...current, sessionId: session.sessionId, creatingStep: "starting_interview" }
              : current
          );
          createdSessionId = session.sessionId;
          currentStep = "start";
          setShowJdDialog(false);
        },
      });

      if (!createdSessionId) {
        throw new Error("创建模拟面试失败");
      }
      if (!createdSession) {
        throw new Error("模拟面试会话未正确初始化");
      }
      const createdSessionData: MockInterviewSessionResponse = createdSession;

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const isViewingCreatedSession = () => useMockInterviewStore.getState().sessionId === createdSessionId;
      await streamMockInterviewReply({
        sessionId: createdSessionId,
        mode: "start",
        interviewType: selectedInterviewType,
        category: selectedCategory,
        jdText: normalizedJdText,
        jdData: createdSessionData.jdData ?? resolvedJdData,
        resumeSnapshot: parsedResume,
        retrieval: createdSessionData.retrieval,
        interviewPlan: createdSessionData.interviewPlan,
        interviewState: createdSessionData.interviewState,
        messages: [],
        runtimeConfig,
        signal: abortRef.current.signal,
        onUserMessage: (payload) => {
          if (isViewingCreatedSession()) {
            appendUserMessage(payload);
          }
        },
        onAnswerAnalysisStarted: () => {
          if (isViewingCreatedSession()) {
            startAnswerAnalysis();
          }
        },
        onMessageStart: ({ messageId }) => {
          initialAssistantMessage = { id: messageId, content: "" };
          if (isViewingCreatedSession()) {
            clearPendingAssistantPhase();
            startAssistantMessage(messageId);
          }
        },
        onMessageDelta: ({ messageId, delta }) => {
          if (!initialAssistantMessage || initialAssistantMessage.id !== messageId) {
            initialAssistantMessage = { id: messageId, content: delta };
          } else {
            initialAssistantMessage.content += delta;
          }
          if (isViewingCreatedSession()) {
            applyAssistantDelta(messageId, delta);
          }
        },
        onMessageEnd: ({ messageId, content, interviewState: nextInterviewState }) => {
          initialAssistantMessage = { id: messageId, content };
          if (isViewingCreatedSession()) {
            finishAssistantMessage({ messageId, content, interviewState: nextInterviewState });
          }
        },
        onReflection: (reflection) => {
          if (isViewingCreatedSession()) {
            appendReflection(reflection);
          }
        },
        onDeveloperTrace: (trace) => {
          initialDeveloperTrace = [...initialDeveloperTrace, trace];
          if (isViewingCreatedSession()) {
            handleDeveloperTrace(trace);
          }
        },
        onRoundTransition: (transition) => {
          if (!isViewingCreatedSession()) {
            return;
          }
          const state = useMockInterviewStore.getState().interviewState;
          if (!state) {
            return;
          }
          setInterviewState({
            ...state,
            currentRound: transition.to_round,
            questionsPerRound: {
              ...state.questionsPerRound,
              [String(transition.to_round)]: state.questionsPerRound[String(transition.to_round)] ?? 0,
            },
          });
        },
        onDone: ({ sessionId: doneSessionId, status: nextStatus, interviewState: nextInterviewState }) => {
          if (doneSessionId === justCreatedSessionRef.current) {
            justCreatedSessionRef.current = null;
          }
          upsertRecoverableSession({
            snapshot: {
              snapshotVersion: 3,
              sessionId: createdSessionData.sessionId,
              interviewType: createdSessionData.interviewType,
              category: createdSessionData.category,
              status: nextStatus,
              limits: createdSessionData.limits,
              jdText: normalizedJdText,
              jdData: createdSessionData.jdData ?? resolvedJdData,
              resumeSnapshot: parsedResume,
              retrieval: createdSessionData.retrieval,
              interviewPlan: createdSessionData.interviewPlan,
              interviewState: nextInterviewState,
              messages: initialAssistantMessage
                ? [{ id: initialAssistantMessage.id, role: "assistant", content: initialAssistantMessage.content }]
                : [],
              developerContext: createdSessionData.developerContext ?? null,
              developerTrace: initialDeveloperTrace,
              resumeFingerprint: createdSessionData.resumeFingerprint,
              createdAt: startedAt,
              lastActiveAt: new Date().toISOString(),
              expiresAt: createdSessionData.expiresAt,
            },
          });
          if (isViewingCreatedSession()) {
            completeStream({ status: nextStatus, interviewState: nextInterviewState });
          }
        },
      });
      removePendingSession(pendingId);
      setActivePendingSession((current) => (current?.pendingId === pendingId ? null : current));
    } catch (createError) {
      if (createError instanceof DOMException && createError.name === "AbortError") {
        return;
      }
      removePendingSession(pendingId);
      setActivePendingSession((current) => (current?.pendingId === pendingId ? null : current));
      const message = createError instanceof Error ? createError.message : "创建模拟面试失败";
      if (!jdResolved || currentStep === "jd") {
        setError(`JD 解析失败，请检查内容后重试：${message}`);
        return;
      }
      if (currentStep === "session") {
        setError(`面试计划生成失败，请稍后重试：${message}`);
        return;
      }
      setError(message);
    }
  };

  const handleStartClick = () => {
    if (!canStart || isBusy) return;
    const cleaned = jdText.trim();
    setPendingJdText(jdText);
    if (cleaned) {
      void startInterview(cleaned);
      return;
    }
    setShowJdDialog(true);
  };

  const handleSaveJdAndStart = () => {
    const cleaned = pendingJdText.trim();
    if (!cleaned) return;
    setJdText(cleaned);
    void startInterview(cleaned);
  };

  const handleSendMessage = async () => {
    const content = draftMessage.trim();
    const hasAssistantMessage = messages.some((item) => item.role === "assistant" && item.content.trim().length > 0);
    const needsStart = Boolean(sessionId) && !hasAssistantMessage && (interviewState?.assistantQuestionCount ?? 0) === 0;
    if (isBusy || !limits) return;
    if (needsStart) {
      await runStream("start");
      return;
    }
    if (!content) return;
    setDraftMessage("");
    await runStream("reply", content);
  };

  const handleOpenRetrievalDetail = (interviewId: number) => {
    setSelectedQuestionId(interviewId);
  };

  const handleRestart = () => {
    abortRef.current?.abort();
    clearPendingAssistantPhase();
    resumeAttemptedRef.current = null;
    justCreatedSessionRef.current = null;
    getPendingSessions().forEach((item) => removePendingSession(item.pending.pendingId));
    if (sessionId) {
      removeRecoverableSession(sessionId);
    }
    resetSession();
    setSelectedQuestionId(null);
    setRetrievalPreviews({});
    setShowJdDialog(false);
    setPendingJdText("");
    setDeveloperContext(null);
  };

  return (
    <div className="relative h-full overflow-hidden bg-theme-background">
      <AnimatePresence mode="wait">
        {!interviewStarted ? (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -120 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="flex h-full items-center justify-center"
          >
            <Card className="w-full max-w-2xl bg-material-thick">
              <CardHeader>
                <CardTitle className="text-center text-xl">开始模拟面试</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {status === "creating" || hasPendingLoadingView ? (
                  <LoadingState
                    title={currentCreatingMeta.title}
                    description={currentCreatingMeta.description}
                    steps={activeCreatingSteps}
                    fullHeight={false}
                  />
                ) : (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="interview-type" className="text-sm font-medium">
                        面试岗位类型
                      </label>
                      <select
                        id="interview-type"
                        aria-label="面试岗位类型"
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-accent/25"
                        value={selectedInterviewType}
                        onChange={(e) => setSelectedInterviewType(e.target.value as InterviewType | "")}
                      >
                        <option value="">请选择</option>
                        {ALL_INTERVIEW_TYPES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="interview-domain" className="text-sm font-medium">
                        面试岗位领域
                      </label>
                      <select
                        id="interview-domain"
                        aria-label="面试岗位领域"
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-accent/25"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value as Category | "")}
                      >
                        <option value="">请选择</option>
                        {ALL_CATEGORIES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                      <label htmlFor="mock-interview-jd" className="text-sm font-medium">
                        岗位 JD
                      </label>
                      <Textarea
                        id="mock-interview-jd"
                        value={jdText}
                        onChange={(e) => setJdText(e.target.value)}
                        placeholder="粘贴目标岗位 JD，系统会先解析 JD 信息，再生成模拟面试计划..."
                        className="min-h-32"
                        disabled={isBusy}
                      />
                      <p className="text-xs text-muted-foreground">
                        模拟面试必须先提供并解析岗位 JD。默认轻量 Demo 模式下可不启用 RAG，系统会直接根据 JD 与简历生成面试计划。
                      </p>
                    </div>

                    <Button className="w-full" disabled={!canStart || isBusy} onClick={handleStartClick} isLoading={isBusy}>
                      开始模拟面试
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 140 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="flex h-full flex-col"
          >
            <div className="relative flex h-full flex-col overflow-hidden">
              <InterviewSessionHeader
                status={status}
                interviewPlan={interviewPlan}
                currentRound={currentRound}
                retrievalItems={retrievalItems}
                retrievalPreviews={retrievalPreviews}
                previewSessionId={sessionId}
                onOpenRetrievalDetail={handleOpenRetrievalDetail}
                onExportTranscript={handleExportTranscript}
              />

              {status === "creating" && messages.length === 0 ? (
                <div className="flex-1 p-4 md:p-6">
                  <LoadingState
                    title={currentCreatingMeta.title}
                    description={currentCreatingMeta.description}
                    steps={activeCreatingSteps}
                    fullHeight={false}
                    cardClassName="h-full"
                  />
                </div>
              ) : (
                <InterviewChatList
                  messages={messages}
                  streamingMessageId={streamingMessageId}
                  pendingAssistantPhase={pendingAssistantPhase}
                />
              )}

              {error && <p className="mx-auto w-full max-w-4xl px-4 pb-2 text-sm text-destructive md:px-5">{error}</p>}
              {status === "completed" && (
                <div className="mx-auto w-full max-w-4xl px-4 pb-2 text-sm text-muted-foreground md:px-5">本场模拟面试已结束，可重新开始新一场。</div>
              )}

              <InterviewComposer
                value={draftMessage}
                onChange={setDraftMessage}
                onSubmit={() => void handleSendMessage()}
                disabled={isBusy || status === "completed" || !limits}
                maxLength={limits?.maxInputChars ?? 1500}
                softLimit={limits?.softInputChars ?? 1200}
                isListening={isListening}
                interimText={interimText}
                speechError={speechError}
                onMicToggle={speechSupported ? handleMicToggle : undefined}
                footer={
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">已回答 {turnCount} 次</div>
                    <Button variant="ghost" size="sm" onClick={() => setShowRestartConfirm(true)} className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      重新开始
                    </Button>
                  </div>
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedQuestionId && <QuestionDetailView />}

      {showRestartConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
            <h3 className="text-base font-semibold">确认重新开始？</h3>
            <p className="mt-2 text-sm text-muted-foreground">当前面试进度将会丢失，确定要重新开始吗？</p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={() => setShowRestartConfirm(false)}>取消</Button>
              <Button variant="destructive" size="sm" onClick={() => { setShowRestartConfirm(false); handleRestart(); }}>确认重新开始</Button>
            </div>
          </div>
        </div>
      )}

      {showJdDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseJdDialog();
            }
          }}
        >
          <Card role="dialog" aria-modal="true" aria-labelledby="jd-dialog-title" className="relative w-full max-w-2xl bg-material-thick">
            <CardHeader>
              <CardTitle id="jd-dialog-title">请先填写岗位 JD</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">模拟面试必须先解析岗位 JD 信息，才能生成更贴近目标岗位的面试计划。</p>
              <div className="space-y-2">
                <label htmlFor="jd-textarea" className="text-sm font-medium">
                  岗位 JD 内容
                </label>
                <Textarea
                  id="jd-textarea"
                  value={pendingJdText}
                  onChange={(e) => setPendingJdText(e.target.value)}
                  placeholder="例如：负责前端工程化建设，熟悉 React、TypeScript、性能优化..."
                  className="min-h-32"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={handleCloseJdDialog} disabled={isPlanningInterview}>
                  取消
                </Button>
                <Button onClick={handleSaveJdAndStart} disabled={pendingJdText.trim().length === 0 || isPlanningInterview}>
                  保存 JD 并开始
                </Button>
              </div>
              {isPlanningInterview && (
                <LoadingState
                  title={currentCreatingMeta.title}
                  description={currentCreatingMeta.description}
                  steps={activeCreatingSteps}
                  fullHeight={false}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MockInterviewPage;
