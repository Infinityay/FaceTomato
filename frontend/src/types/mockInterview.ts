export type MockInterviewStatus = "idle" | "creating" | "streaming" | "ready" | "completed" | "error";
export type MockInterviewRole = "assistant" | "user";
export type MockInterviewStreamMode = "start" | "reply";
export type MockInterviewCreatingStep = "idle" | "retrieving_evidence" | "generating_plan" | "starting_interview";
export type PendingAssistantPhase = "idle" | "analyzing_answer";

import type { Category, InterviewType } from "./interview";
import type { ResumeData } from "./resume";
import type { JDData, RuntimeConfig } from "@/lib/api";

export interface MockInterviewMessage {
  id: string;
  role: MockInterviewRole;
  content: string;
}

export interface MockInterviewLimits {
  durationMinutes: number;
  softInputChars: number;
  maxInputChars: number;
  contextWindowMessages: number;
  sessionTtlMinutes: number;
}

export interface MockInterviewRetrievalFilters {
  category: Category | null;
  interviewType: InterviewType | null;
  company: string | null;
}

export interface MockInterviewRetrievalItem {
  interviewId: number;
  title: string;
  company: string | null;
  category: Category;
  interviewType: InterviewType | null;
  stage: string | null;
  publishTime: string;
  snippet: string;
  score: number;
  reason: string;
}

export interface MockInterviewRetrievalResult {
  queryText: string;
  appliedFilters: MockInterviewRetrievalFilters;
  items: MockInterviewRetrievalItem[];
}

export interface ReflectionResult {
  depth_score: number;
  authenticity_score: number;
  completeness_score: number;
  logic_score: number;
  overall_assessment: string;
  should_continue: boolean;
  suggested_follow_up: string;
  reason: string;
}

export interface MockInterviewRound {
  round: number;
  topic: string;
  description: string;
}

export interface MockInterviewPlan {
  plan: MockInterviewRound[];
  total_rounds: number;
  estimated_duration: string;
  leetcode_problem: string;
}

export interface MockInterviewState {
  currentRound: number;
  questionsPerRound: Record<string, number>;
  assistantQuestionCount: number;
  turnCount: number;
  reflectionHistory: ReflectionResult[];
  closed: boolean;
}

export interface RoundTransition {
  from_round: number;
  to_round: number;
  topic: string;
}

export interface MockInterviewDeveloperContext {
  sessionMode: "frontend_local_only";
  privacyMode: "frontend_local_export_only";
  ragEnabled: boolean;
  transcriptPersistence: "frontend_local_only";
  tracePersistence: "frontend_local_only";
}

export interface MockInterviewRetrievalTracePayload {
  queryText: string;
  filterChain: MockInterviewRetrievalFilters[];
  appliedFilters: MockInterviewRetrievalFilters;
  candidateTopk: number | null;
  topk: number | null;
  denseWeight: number | null;
  sparseWeight: number | null;
  ragEnabled: boolean;
  resultItems: MockInterviewRetrievalItem[];
  elapsedMs: number;
}

export interface MockInterviewPlanTracePayload {
  promptKey: "plan";
  jdDataIncluded: boolean;
  resumeProjectCount: number;
  retrievalItemCount: number;
  retrievalQueryText: string;
  outputPlan: MockInterviewPlan;
  fallbackUsed: boolean;
  elapsedMs: number;
}

export interface MockInterviewReflectionTracePayload {
  promptKey: "reflection";
  candidateAnswer: string;
  currentRoundHistory: string;
  questionCount: number;
  output: ReflectionResult;
  fallbackUsed: boolean;
  elapsedMs: number;
}

export interface MockInterviewInterviewerTracePayload {
  promptKey: "interviewer";
  round: number;
  topic: string;
  suggestedFollowUp: string;
  closeInterview: boolean;
  recentConversation: Array<{ id: string; role: MockInterviewRole; content: string }>;
  finalMessage: string;
  elapsedMs: number;
}

export type MockInterviewDeveloperTraceEvent =
  | {
      type: "retrieval";
      createdAt: string;
      payload: MockInterviewRetrievalTracePayload;
    }
  | {
      type: "plan_generation";
      createdAt: string;
      payload: MockInterviewPlanTracePayload;
    }
  | {
      type: "reflection";
      createdAt: string;
      payload: MockInterviewReflectionTracePayload;
    }
  | {
      type: "interviewer_generation";
      createdAt: string;
      payload: MockInterviewInterviewerTracePayload;
    };

export interface MockInterviewSessionResponse {
  sessionId: string;
  interviewType: InterviewType;
  category: Category;
  status: "ready";
  limits: MockInterviewLimits;
  interviewPlan: MockInterviewPlan;
  interviewState: MockInterviewState;
  jdData: JDData | null;
  retrieval: MockInterviewRetrievalResult;
  resumeFingerprint: string;
  expiresAt: string;
  developerContext?: MockInterviewDeveloperContext | null;
}

export interface RuntimeAwarePayload {
  runtimeConfig?: RuntimeConfig | null;
}

export interface MockInterviewSessionSnapshot {
  sessionId: string;
  interviewType: InterviewType;
  category: Category;
  status: "ready" | "streaming" | "completed" | "expired";
  limits: MockInterviewLimits;
  jdText: string;
  jdData: JDData | null;
  resumeSnapshot: ResumeData;
  retrieval: MockInterviewRetrievalResult;
  interviewPlan: MockInterviewPlan;
  interviewState: MockInterviewState;
  messages: MockInterviewMessage[];
  developerContext: MockInterviewDeveloperContext | null;
  developerTrace: MockInterviewDeveloperTraceEvent[];
  pendingAssistantPhase?: PendingAssistantPhase;
  streamingMessageId?: string | null;
  runtimeConfig?: RuntimeConfig | null;
  resumeFingerprint: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

export interface MockInterviewPendingSession {
  pendingId: string;
  sessionId?: string | null;
  interviewType: InterviewType;
  category: Category;
  creatingStep: MockInterviewCreatingStep;
  startedAt: string;
  lastActiveAt: string;
}

export interface MockInterviewDeveloperReport {
  reportVersion: 1;
  exportedAt: string;
  privacy: {
    backendPersistence: "none";
    frontendPersistence: "local_storage_only";
  };
  session: {
    sessionId: string;
    status: MockInterviewSessionSnapshot["status"];
    interviewType: InterviewType;
    category: Category;
    createdAt: string;
    lastActiveAt: string;
    expiresAt: string;
    resumeFingerprint: string;
  };
  context: {
    developerContext: MockInterviewDeveloperContext | null;
    jdText: string;
    jdData: JDData | null;
    retrieval: MockInterviewRetrievalResult;
    interviewPlan: MockInterviewPlan;
    interviewState: MockInterviewState;
  };
  transcript: MockInterviewMessage[];
  developerTrace: MockInterviewDeveloperTraceEvent[];
  summary: {
    totalMessages: number;
    totalTraceEvents: number;
    currentRound: number;
    completed: boolean;
  };
}

export interface MockInterviewSessionCreateInput extends RuntimeAwarePayload {
  interviewType: InterviewType;
  category: Category;
  jdText: string;
  jdData?: JDData | null;
  resumeData: ResumeData;
}

export interface StreamCreateMockInterviewSessionInput {
  input: MockInterviewSessionCreateInput;
  signal?: AbortSignal;
  onProgress?: (payload: {
    stage: Exclude<MockInterviewCreatingStep, "idle" | "starting_interview">;
    message: string;
  }) => void | Promise<void>;
  onDeveloperTrace?: (payload: MockInterviewDeveloperTraceEvent) => void | Promise<void>;
  onSessionCreated?: (payload: MockInterviewSessionResponse) => void | Promise<void>;
  onDone?: (payload: { sessionId: string; status: "ready" }) => void | Promise<void>;
}

export interface StreamMockInterviewReplyInput extends RuntimeAwarePayload {
  sessionId: string;
  mode: MockInterviewStreamMode;
  interviewType: InterviewType;
  category: Category;
  jdText: string;
  jdData: JDData | null;
  resumeSnapshot: ResumeData;
  retrieval: MockInterviewRetrievalResult;
  interviewPlan: MockInterviewPlan;
  interviewState: MockInterviewState;
  messages: MockInterviewMessage[];
  message?: string;
  signal?: AbortSignal;
  onUserMessage?: (message: MockInterviewMessage) => void;
  onAnswerAnalysisStarted?: (payload: { stage: "analyzing_answer"; message: string }) => void;
  onMessageStart?: (payload: { messageId: string; role: MockInterviewRole }) => void;
  onMessageDelta?: (payload: { messageId: string; delta: string }) => void;
  onMessageEnd?: (payload: {
    messageId: string;
    content: string;
    interviewState: MockInterviewState;
    elapsedMs: number;
  }) => void;
  onDone?: (payload: {
    sessionId: string;
    status: "ready" | "completed";
    interviewState: MockInterviewState;
  }) => void;
  onReflection?: (reflection: ReflectionResult) => void;
  onDeveloperTrace?: (trace: MockInterviewDeveloperTraceEvent) => void;
  onRoundTransition?: (transition: RoundTransition) => void;
}
