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

type StoredReports = Record<string, ReviewSessionDetail>;
type StoredConversations = Record<string, ReviewConversationMessage[]>;
type ReviewSessionListResponse = { items: ReviewSessionListItem[] };

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
    return {
      id: stored.id,
      title: stored.title,
      role: stored.role,
      round: stored.round,
      interviewAt: stored.interviewAt,
      reportStatus: stored.reportStatus,
      overallScore: stored.reportStatus === "ready" ? stored.overallScore : null,
      topicCount: stored.topics.length,
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

function mergeSessionLists(
  localItems: ReviewSessionListItem[],
  remoteItems: ReviewSessionListItem[]
): ReviewSessionListItem[] {
  const merged = new Map<string, ReviewSessionListItem>();
  for (const item of localItems) {
    merged.set(item.id, item);
  }
  for (const item of remoteItems) {
    merged.set(item.id, item);
  }
  return [...merged.values()].sort((a, b) => b.interviewAt.localeCompare(a.interviewAt));
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
  const localItems = getInterviewReviewSessionsSnapshot();

  try {
    const response = await fetch("/api/interview-reviews");
    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }
    const data = (await response.json()) as ReviewSessionListResponse;
    return mergeSessionLists(localItems, data.items ?? []);
  } catch {
    return localItems;
  }
}

export async function fetchInterviewReviewSessionById(sessionId: string): Promise<ReviewSessionDetail | null> {
  const local = getInterviewReviewSessionDetailSnapshot(sessionId);

  try {
    const response = await fetch(`/api/interview-reviews/${encodeURIComponent(sessionId)}`);
    if (response.status === 404 || response.status === 409) {
      return local;
    }
    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    const detail = normalizeReviewDetail((await response.json()) as ReviewSessionDetail);
    const reports = readStoredReports();
    reports[sessionId] = detail;
    writeStoredReports(reports);
    return detail;
  } catch {
    return local;
  }
}

export async function generateInterviewReviewReport(
  sessionId: string,
  runtimeConfig?: RuntimeConfig | null
): Promise<ReviewGenerateReportResponse> {
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

  const response = await fetch(`/api/interview-reviews/${encodeURIComponent(sessionId)}/generate`, {
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

  const result = (await response.json()) as ReviewGenerateReportResponse;
  console.info("[interview-review] POST /generate succeeded", {
    sessionId,
    reportStatus: result.reportStatus,
  });
  const detail = await fetchInterviewReviewSessionById(sessionId);
  if (detail) {
    const reports = readStoredReports();
    reports[sessionId] = detail;
    writeStoredReports(reports);
  }
  return result;
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
