import { ApiError, sanitizeRuntimeConfig } from "./api";
import type {
  MockInterviewMessage,
  MockInterviewSessionCreateInput,
  MockInterviewSessionResponse,
  StreamCreateMockInterviewSessionInput,
  StreamMockInterviewReplyInput,
} from "@/types/mockInterview";

interface SseEvent {
  event: string;
  data: string;
}

const inFlightMockInterviewReplies = new Set<string>();

export function isMockInterviewReplyStreaming(sessionId: string): boolean {
  return inFlightMockInterviewReplies.has(sessionId);
}

const CREATE_PROGRESS_STAGE_MIN_MS = 250;

const handleApiError = async (response: Response): Promise<never> => {
  let message = `服务器错误，状态码: ${response.status}`;

  try {
    const payload = await response.json();
    if (payload?.error?.message) {
      message = payload.error.message;
    } else if (typeof payload?.detail === "string") {
      message = payload.detail;
    }
  } catch {
    // ignore invalid json
  }

  throw new ApiError(message, response.status);
};

export async function streamCreateMockInterviewSession({
  input,
  signal,
  onProgress,
  onDeveloperTrace,
  onSessionCreated,
  onDone,
}: StreamCreateMockInterviewSessionInput & { input: MockInterviewSessionCreateInput }): Promise<void> {
  const runtimeConfig = sanitizeRuntimeConfig(input.runtimeConfig);
  const response = await fetch("/api/mock-interview/session/stream-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      ...(runtimeConfig ? { runtimeConfig } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  if (!response.body) {
    throw new ApiError("流式响应不可用", 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let lastProgressAt = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    textBuffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseEvents(textBuffer);
    textBuffer = rest;

    for (const item of events) {
      const payload = JSON.parse(item.data);
      if (item.event === "progress") {
        await onProgress?.(payload);
        lastProgressAt = Date.now();
      } else if (item.event === "developer_trace") {
        await onDeveloperTrace?.(payload);
      } else if (item.event === "session_created") {
        if (lastProgressAt > 0) {
          const elapsed = Date.now() - lastProgressAt;
          if (elapsed < CREATE_PROGRESS_STAGE_MIN_MS) {
            await new Promise((resolve) => window.setTimeout(resolve, CREATE_PROGRESS_STAGE_MIN_MS - elapsed));
          }
        }
        await onSessionCreated?.(payload as MockInterviewSessionResponse);
      } else if (item.event === "done") {
        await onDone?.(payload);
      } else if (item.event === "error") {
        throw new ApiError(payload.message ?? "创建模拟面试失败", payload.status ?? 500);
      }
    }
  }
}

function createFrameScheduler(callback: (messageId: string, chunk: string) => void) {
  const buffer = new Map<string, string>();
  let timer: number | null = null;

  const flush = () => {
    timer = null;
    for (const [messageId, chunk] of buffer.entries()) {
      callback(messageId, chunk);
    }
    buffer.clear();
  };

  return {
    push(messageId: string, chunk: string) {
      buffer.set(messageId, `${buffer.get(messageId) ?? ""}${chunk}`);
      if (timer !== null) return;
      timer = window.setTimeout(flush, 33);
    },
    flushNow() {
      if (timer !== null) {
        window.clearTimeout(timer);
        flush();
      }
    },
  };
}

function parseSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events = frames
    .map((frame) => {
      const lines = frame.split("\n");
      const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      return { event, data };
    })
    .filter((item) => item.data.length > 0);

  return { events, rest };
}

export async function streamMockInterviewReply({
  sessionId,
  mode,
  interviewType,
  category,
  jdText,
  jdData,
  resumeSnapshot,
  retrieval,
  interviewPlan,
  interviewState,
  messages,
  message,
  signal,
  onUserMessage,
  onAnswerAnalysisStarted,
  onMessageStart,
  onMessageDelta,
  onMessageEnd,
  onDone,
  onReflection,
  onDeveloperTrace,
  onRoundTransition,
  runtimeConfig,
}: StreamMockInterviewReplyInput): Promise<void> {
  inFlightMockInterviewReplies.add(sessionId);
  try {
  const sanitizedRuntimeConfig = sanitizeRuntimeConfig(runtimeConfig);
  const response = await fetch(`/api/mock-interview/session/${sessionId}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      message,
      interviewType,
      category,
      jdText,
      jdData,
      resumeSnapshot,
      retrieval,
      interviewPlan,
      interviewState,
      messages,
      ...(sanitizedRuntimeConfig ? { runtimeConfig: sanitizedRuntimeConfig } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  if (!response.body) {
    throw new ApiError("流式响应不可用", 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  const scheduler = createFrameScheduler((messageId, chunk) => {
    onMessageDelta?.({ messageId, delta: chunk });
  });

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    textBuffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseEvents(textBuffer);
    textBuffer = rest;

    for (const item of events) {
      const payload = JSON.parse(item.data);
      if (item.event === "user_message") {
        onUserMessage?.(payload as MockInterviewMessage);
      } else if (item.event === "answer_analysis_started") {
        onAnswerAnalysisStarted?.(payload);
      } else if (item.event === "reflection_result") {
        onReflection?.(payload);
      } else if (item.event === "developer_trace") {
        onDeveloperTrace?.(payload);
      } else if (item.event === "round_transition") {
        onRoundTransition?.(payload);
      } else if (item.event === "message_start") {
        onMessageStart?.(payload);
      } else if (item.event === "message_delta") {
        scheduler.push(payload.messageId, payload.delta);
      } else if (item.event === "message_end") {
        scheduler.flushNow();
        onMessageEnd?.(payload);
      } else if (item.event === "done") {
        onDone?.(payload);
      } else if (item.event === "error") {
        throw new ApiError(payload.message ?? "流式请求失败", payload.status ?? 500);
      }
    }
  }

  scheduler.flushNow();
  } finally {
    inFlightMockInterviewReplies.delete(sessionId);
  }
}
