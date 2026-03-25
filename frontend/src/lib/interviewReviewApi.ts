import {
  getRecoverableSessionById,
  getRecoverableSessions,
  type RecoverableSessionRecord,
} from "./mockInterviewRecovery";
import { sanitizeRuntimeConfig, type RuntimeConfig } from "./api";
import type { MockInterviewSessionSnapshot } from "../types/mockInterview";
import type {
  ReviewConversationMessage,
  ReviewExportReportResponse,
  ReviewGenerateReportResponse,
  ReviewOptimizationRequest,
  ReviewOptimizationResponse,
  ReviewSessionDetail,
  ReviewSessionListItem,
  ReviewTopic,
} from "../types/interviewReview";

const REPORT_STORAGE_KEY = "face-tomato-interview-review-reports-v2";
const CONVERSATION_STORAGE_KEY = "face-tomato-interview-review-conversations-v2";
const GENERATING_STORAGE_KEY = "face-tomato-interview-review-generating-v1";
const GENERATING_PROGRESS_STORAGE_KEY = "face-tomato-interview-review-generating-progress-v1";

type StoredReports = Record<string, ReviewSessionDetail>;
type StoredConversations = Record<string, ReviewConversationMessage[]>;
type StoredGeneratingSessions = string[];
export type InterviewReviewGenerationProgress = {
  sessionId: string;
  totalTopics: number;
  currentTopic: number;
  topicName: string;
  status: "starting" | "running";
};
type StoredGeneratingProgress = Record<string, InterviewReviewGenerationProgress>;

const inFlightReviewGenerations = new Map<string, Promise<ReviewGenerateReportResponse>>();

const assessmentFocusFallbackMap: Record<string, string> = {
  structured_thinking: "考察候选人是否有结构化拆解复杂问题的能力",
  communication: "考察候选人是否能清晰、准确地表达自己的思路和结论",
  domain_judgment: "考察候选人是否能说明关键技术或业务取舍及其原因",
  evidence_and_metrics: "考察是否能用量化结果或验证证据证明项目效果",
  authenticity: "考察回答是否基于真实经历，并且细节是否可信",
};

function buildAssessmentFocusFallback(topic: ReviewTopic): string[] {
  const rubricFocus = topic.highlightedPoints
    .map((point) => assessmentFocusFallbackMap[point])
    .filter((focus): focus is string => Boolean(focus));

  if (rubricFocus.length > 0) {
    return rubricFocus;
  }

  if (topic.coreQuestion.trim()) {
    return [
      `考察候选人是否能围绕“${topic.coreQuestion.trim()}”给出结构化回答`,
      "考察候选人是否能结合真实案例说明分析过程、动作和结果",
    ];
  }

  return ["考察候选人是否能给出结构化、可信且可验证的回答"];
}

function normalizeReviewDetail(detail: ReviewSessionDetail): ReviewSessionDetail {
  return {
    ...detail,
    topics: detail.topics.map((topic) => ({
      ...topic,
      assessmentFocus: Array.isArray((topic as ReviewTopic & { assessmentFocus?: string[] }).assessmentFocus)
        ? ((topic as ReviewTopic & { assessmentFocus?: string[] }).assessmentFocus?.filter(Boolean).length
            ? (topic as ReviewTopic & { assessmentFocus?: string[] }).assessmentFocus ?? []
            : buildAssessmentFocusFallback(topic))
        : buildAssessmentFocusFallback(topic),
    })),
  };
}

function safeParse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readStoredReports(): StoredReports {
  return safeParse<StoredReports>(REPORT_STORAGE_KEY, {});
}

function writeStoredReports(reports: StoredReports) {
  localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(reports));
}

function readStoredConversations(): StoredConversations {
  return safeParse<StoredConversations>(CONVERSATION_STORAGE_KEY, {});
}

function writeStoredConversations(conversations: StoredConversations) {
  localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(conversations));
}

function readGeneratingProgress(): StoredGeneratingProgress {
  return safeParse<StoredGeneratingProgress>(GENERATING_PROGRESS_STORAGE_KEY, {});
}

function writeGeneratingProgress(progress: StoredGeneratingProgress) {
  localStorage.setItem(GENERATING_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

function readGeneratingSessions(): StoredGeneratingSessions {
  return safeParse<StoredGeneratingSessions>(GENERATING_STORAGE_KEY, []);
}

function writeGeneratingSessions(sessionIds: StoredGeneratingSessions) {
  localStorage.setItem(GENERATING_STORAGE_KEY, JSON.stringify([...new Set(sessionIds)]));
}

function markGeneratingSession(sessionId: string) {
  writeGeneratingSessions([...readGeneratingSessions(), sessionId]);
}

function unmarkGeneratingSession(sessionId: string) {
  writeGeneratingSessions(readGeneratingSessions().filter((id) => id !== sessionId));
  const progress = readGeneratingProgress();
  if (progress[sessionId]) {
    delete progress[sessionId];
    writeGeneratingProgress(progress);
  }
}

export function isInterviewReviewReportGenerating(sessionId: string): boolean {
  return inFlightReviewGenerations.has(sessionId) || readGeneratingSessions().includes(sessionId);
}

export function getInterviewReviewGenerationPromise(
  sessionId: string
): Promise<ReviewGenerateReportResponse> | null {
  return inFlightReviewGenerations.get(sessionId) ?? null;
}

export function getInterviewReviewGenerationProgress(
  sessionId: string
): InterviewReviewGenerationProgress | null {
  return readGeneratingProgress()[sessionId] ?? null;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?: string | { error?: { message?: string } };
      error?: { message?: string };
    };
    if (payload.error?.message) {
      return payload.error.message;
    }
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
    if (payload.detail && typeof payload.detail === "object" && payload.detail.error?.message) {
      return payload.detail.error.message;
    }
  } catch {
    // ignore invalid json
  }
  return `请求失败，状态码 ${response.status}`;
}

function formatSnapshotInterviewAt(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSnapshotRole(snapshot: MockInterviewSessionSnapshot): string {
  return (
    snapshot.jdData?.basicInfo.jobTitle ||
    snapshot.resumeSnapshot.basicInfo.desiredPosition ||
    snapshot.category ||
    "模拟面试"
  );
}

function buildPendingListItem(record: RecoverableSessionRecord, stored?: ReviewSessionDetail): ReviewSessionListItem {
  if (stored) {
    const topicCount =
      stored.reportStatus === "ready"
        ? stored.topics.length
        : record.snapshot.interviewPlan.plan.length;
    return {
      id: stored.id,
      title: stored.title,
      role: stored.role,
      round: stored.round,
      interviewAt: stored.interviewAt,
      reportStatus: stored.reportStatus,
      overallScore: stored.reportStatus === "ready" ? stored.overallScore : null,
      topicCount,
    };
  }

  const snapshot = record.snapshot;
  const role = getSnapshotRole(snapshot);

  return {
    id: snapshot.sessionId,
    title: `${role}模拟面试复盘`,
    role,
    round: "模拟面试",
    interviewAt: formatSnapshotInterviewAt(snapshot.createdAt),
    reportStatus: "pending",
    overallScore: null,
    topicCount: snapshot.interviewPlan.plan.length,
  };
}

function buildPendingDetail(snapshot: MockInterviewSessionSnapshot): ReviewSessionDetail {
  const role = getSnapshotRole(snapshot);
  return {
    id: snapshot.sessionId,
    title: `${role}模拟面试复盘`,
    role,
    round: "模拟面试",
    interviewAt: formatSnapshotInterviewAt(snapshot.createdAt),
    reportStatus: "pending",
    defaultSelectedTopicId: null,
    overallScore: 0,
    summary: "尚未生成 LLM 复盘评价，请点击“生成报告”后查看结构化分析结果。",
    strengths: [],
    risks: [],
    priority: "先生成复盘报告，再查看按 Topic 拆解的评价与建议。",
    topics: [],
  };
}

function isReviewEligibleSnapshot(snapshot: MockInterviewSessionSnapshot): boolean {
  return snapshot.status === "completed" || snapshot.interviewState.closed === true;
}

function getReviewEligibleSessionRecords(): RecoverableSessionRecord[] {
  return getRecoverableSessions().filter((record) => isReviewEligibleSnapshot(record.snapshot));
}

function getSnapshotBySessionId(sessionId: string): MockInterviewSessionSnapshot | null {
  const snapshot = getRecoverableSessionById(sessionId)?.snapshot ?? null;
  return snapshot && isReviewEligibleSnapshot(snapshot) ? snapshot : null;
}

export function clearStaleInterviewReviewGeneration(sessionId: string): boolean {
  if (inFlightReviewGenerations.has(sessionId)) {
    return false;
  }
  const generatingSessions = readGeneratingSessions();
  if (!generatingSessions.includes(sessionId)) {
    return false;
  }
  unmarkGeneratingSession(sessionId);
  return true;
}

function updateInterviewReviewGenerationProgress(progress: InterviewReviewGenerationProgress) {
  const current = readGeneratingProgress();
  current[progress.sessionId] = progress;
  writeGeneratingProgress(current);
}

function parseNdjsonLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  return {
    lines: parts.slice(0, -1).filter(Boolean),
    rest: parts.length > 0 ? parts[parts.length - 1] ?? "" : "",
  };
}

export function getInterviewReviewTopicCount(
  sessionId: string,
  detail?: ReviewSessionDetail | null
): number {
  if (detail?.reportStatus === "ready") {
    return detail.topics.length;
  }
  const snapshot = getSnapshotBySessionId(sessionId);
  return snapshot?.interviewPlan.plan.length ?? detail?.topics.length ?? 0;
}

export function getInterviewReviewSessionsSnapshot(): ReviewSessionListItem[] {
  const reports = readStoredReports();
  return getReviewEligibleSessionRecords().map((record) =>
    buildPendingListItem(record, reports[record.snapshot.sessionId])
  );
}

export function getInterviewReviewSessionDetailSnapshot(sessionId: string): ReviewSessionDetail | null {
  const reports = readStoredReports();
  if (reports[sessionId]) {
    return normalizeReviewDetail(reports[sessionId]);
  }

  const snapshot = getSnapshotBySessionId(sessionId);
  return snapshot ? buildPendingDetail(snapshot) : null;
}

export async function fetchInterviewReviewSessions(): Promise<ReviewSessionListItem[]> {
  return getInterviewReviewSessionsSnapshot();
}

export async function fetchInterviewReviewSessionById(sessionId: string): Promise<ReviewSessionDetail | null> {
  return getInterviewReviewSessionDetailSnapshot(sessionId);
}

export async function generateInterviewReviewReport(
  sessionId: string,
  runtimeConfig?: RuntimeConfig | null,
  options?: {
    onProgress?: (progress: InterviewReviewGenerationProgress) => void;
  }
): Promise<ReviewGenerateReportResponse> {
  const existing = inFlightReviewGenerations.get(sessionId);
  if (existing) {
    return existing;
  }

  const snapshot = getSnapshotBySessionId(sessionId);
  const sanitizedRuntimeConfig = sanitizeRuntimeConfig(runtimeConfig);
  console.info("[interview-review] snapshot lookup", {
    sessionId,
    snapshotFound: Boolean(snapshot),
  });

  const effectiveRuntimeConfig = snapshot
    ? sanitizedRuntimeConfig ?? sanitizeRuntimeConfig(snapshot.runtimeConfig)
    : null;
  const requestSnapshot = snapshot
    ? effectiveRuntimeConfig
      ? {
          ...snapshot,
          runtimeConfig: effectiveRuntimeConfig,
        }
      : snapshot
    : null;

  console.info("[interview-review] POST /generate", {
    sessionId,
    hasSnapshot: Boolean(requestSnapshot),
    hasRuntimeConfig: Boolean(effectiveRuntimeConfig),
    messageCount: requestSnapshot?.messages.length ?? 0,
    topicCount: requestSnapshot?.interviewPlan.plan.length ?? 0,
  });

  const task = (async () => {
    markGeneratingSession(sessionId);
    try {
      const response = await fetch(`/api/interview-reviews/${encodeURIComponent(sessionId)}/generate/stream`, {
        method: "POST",
        ...(requestSnapshot
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestSnapshot),
            }
          : {}),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        console.error("[interview-review] POST /generate failed", {
          sessionId,
          status: response.status,
          message,
        });
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("生成复盘时未收到流式响应。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseNdjsonLines(buffer);
        buffer = parsed.rest;

        for (const line of parsed.lines) {
          const event = JSON.parse(line) as
            | { type: "start"; sessionId: string; totalTopics: number }
            | { type: "topic_complete"; sessionId: string; currentTopic: number; totalTopics: number; topicName: string }
            | { type: "done"; sessionId: string; reportStatus: "ready"; detail: ReviewSessionDetail }
            | { type: "error"; sessionId: string; message: string }
            | { type: "not_found"; sessionId: string };

          if (event.type === "start") {
            const progress: InterviewReviewGenerationProgress = {
              sessionId,
              totalTopics: event.totalTopics,
              currentTopic: 0,
              topicName: "",
              status: "starting",
            };
            updateInterviewReviewGenerationProgress(progress);
            options?.onProgress?.(progress);
            continue;
          }

          if (event.type === "topic_complete") {
            const progress: InterviewReviewGenerationProgress = {
              sessionId,
              totalTopics: event.totalTopics,
              currentTopic: event.currentTopic,
              topicName: event.topicName,
              status: "running",
            };
            updateInterviewReviewGenerationProgress(progress);
            options?.onProgress?.(progress);
            continue;
          }

          if (event.type === "done") {
            console.info("[interview-review] POST /generate succeeded", {
              sessionId,
              reportStatus: event.reportStatus,
            });
            const detail = normalizeReviewDetail(event.detail);
            const reports = readStoredReports();
            reports[sessionId] = detail;
            writeStoredReports(reports);
            return {
              sessionId: event.sessionId,
              reportStatus: event.reportStatus,
              detail,
            };
          }

          if (event.type === "error") {
            throw new Error(event.message || "生成复盘失败");
          }

          if (event.type === "not_found") {
            throw new Error("Mock interview session not found");
          }
        }
      }

      const tail = buffer.trim();
      if (tail) {
        const event = JSON.parse(tail) as
          | { type: "done"; sessionId: string; reportStatus: "ready"; detail: ReviewSessionDetail }
          | { type: "error"; sessionId: string; message: string }
          | { type: "not_found"; sessionId: string };

        if (event.type === "done") {
          console.info("[interview-review] POST /generate succeeded", {
            sessionId,
            reportStatus: event.reportStatus,
          });
          const detail = normalizeReviewDetail(event.detail);
          const reports = readStoredReports();
          reports[sessionId] = detail;
          writeStoredReports(reports);
          return {
            sessionId: event.sessionId,
            reportStatus: event.reportStatus,
            detail,
          };
        }

        if (event.type === "error") {
          throw new Error(event.message || "生成复盘失败");
        }

        if (event.type === "not_found") {
          throw new Error("Mock interview session not found");
        }
      }

      throw new Error("生成复盘时流式响应提前结束。");
    } finally {
      inFlightReviewGenerations.delete(sessionId);
      unmarkGeneratingSession(sessionId);
    }
  })();

  inFlightReviewGenerations.set(sessionId, task);
  return task;
}

export async function exportInterviewReviewReport(sessionId: string): Promise<ReviewExportReportResponse> {
  const response = await fetch(`/api/interview-reviews/${encodeURIComponent(sessionId)}/export`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as ReviewExportReportResponse;
}

export async function optimizeInterviewReviewTopic(
  input: ReviewOptimizationRequest
): Promise<ReviewOptimizationResponse> {
  const sanitizedRuntimeConfig = sanitizeRuntimeConfig(input.runtimeConfig);
  const response = await fetch(
    `/api/interview-reviews/${encodeURIComponent(input.sessionId)}/topics/${encodeURIComponent(input.topicId)}/optimize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        conversation: input.conversation ?? [],
        ...(sanitizedRuntimeConfig ? { runtimeConfig: sanitizedRuntimeConfig } : {}),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const result = (await response.json()) as ReviewOptimizationResponse;
  const storedConversations = readStoredConversations();
  storedConversations[`${input.sessionId}:${input.topicId}`] = result.conversation;
  writeStoredConversations(storedConversations);
  return result;
}
