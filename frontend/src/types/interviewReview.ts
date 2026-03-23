import type { RuntimeConfig } from "../lib/api";

export type ReviewReportStatus = "pending" | "ready";

export type ReviewMatchedAnswer = {
  point: string;
  answerHighlightIndex: number | null;
  status?: "covered" | "missing" | "incomplete" | "logic_confused" | "knowledge_unclear";
  reason?: string;
};

export type ReviewTopic = {
  id: string;
  name: string;
  domain: string;
  score: number;
  coreQuestion: string;
  assessmentFocus: string[];
  answerHighlights: string[];
  highlightedPoints: string[];
  matchedAnswers: ReviewMatchedAnswer[];
  evaluation: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  followUps: string[];
  optimizedAnswer: string;
};

export type ReviewSessionListItem = {
  id: string;
  title: string;
  role: string;
  round: string;
  interviewAt: string;
  reportStatus: ReviewReportStatus;
  overallScore: number | null;
  topicCount: number;
};

export type ReviewSessionDetail = {
  id: string;
  title: string;
  role: string;
  round: string;
  interviewAt: string;
  reportStatus: ReviewReportStatus;
  defaultSelectedTopicId: string | null;
  overallScore: number;
  summary: string;
  strengths: string[];
  risks: string[];
  priority: string;
  topics: ReviewTopic[];
};

export type ReviewSession = ReviewSessionDetail;

export type ReviewMessageCitation = {
  id: string;
  label: string;
  snippet?: string;
};

export type ReviewMessageEvidence = {
  id: string;
  type: string;
  content: string;
};

export type ReviewMessageUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ReviewConversationMessage = {
  messageId: string;
  sessionId: string;
  topicId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  citations?: ReviewMessageCitation[];
  evidence?: ReviewMessageEvidence[];
  usage?: ReviewMessageUsage;
  suggestions?: string[];
};

export type ReviewChatMessage = ReviewConversationMessage;

export type ReviewOptimizationRequest = {
  sessionId: string;
  topicId: string;
  message: string;
  conversation?: ReviewConversationMessage[];
  runtimeConfig?: RuntimeConfig;
};

export type ReviewOptimizationResponse = {
  topicId: string;
  reply: string;
  optimizedAnswer?: string;
  suggestions?: string[];
  message: ReviewConversationMessage;
  conversation: ReviewConversationMessage[];
};

export type ReviewGenerateReportResponse = {
  sessionId: string;
  reportStatus: ReviewReportStatus;
};

export type ReviewExportReportResponse = {
  sessionId: string;
  exportStatus: "ready";
  downloadUrl?: string;
  fileName?: string;
};

export type ReviewApiErrorCode =
  | "NOT_FOUND"
  | "REPORT_NOT_READY"
  | "TOPIC_NOT_FOUND"
  | "OPTIMIZATION_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ReviewApiErrorPayload = {
  error: {
    code: ReviewApiErrorCode;
    message: string;
    retryable?: boolean;
  };
};
