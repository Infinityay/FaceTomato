import type {
  MockInterviewPendingSession,
  MockInterviewSessionSnapshot,
} from "@/types/mockInterview";

const STORAGE_KEY = "face-tomato-mock-interview-recoverable-sessions";
const PENDING_STORAGE_KEY = "face-tomato-mock-interview-pending-sessions";
export const MOCK_INTERVIEW_RECOVERY_EVENT = "face-tomato:mock-interview-recovery-changed";

export interface RecoverableSessionRecord {
  snapshot: MockInterviewSessionSnapshot;
}

export interface PendingSessionRecord {
  pending: MockInterviewPendingSession;
}

function isRecoverableSnapshot(snapshot: unknown): snapshot is MockInterviewSessionSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  const candidate = snapshot as Partial<MockInterviewSessionSnapshot>;

  return (
    typeof candidate.sessionId === "string" &&
    typeof candidate.interviewType === "string" &&
    typeof candidate.category === "string" &&
    typeof candidate.status === "string" &&
    candidate.limits != null &&
    typeof candidate.jdText === "string" &&
    candidate.resumeSnapshot != null &&
    candidate.retrieval != null &&
    candidate.interviewPlan != null &&
    candidate.interviewState != null &&
    Array.isArray(candidate.messages) &&
    Array.isArray(candidate.developerTrace) &&
    (candidate.pendingAssistantPhase == null || typeof candidate.pendingAssistantPhase === "string") &&
    (candidate.streamingMessageId == null || typeof candidate.streamingMessageId === "string") &&
    typeof candidate.resumeFingerprint === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.lastActiveAt === "string" &&
    typeof candidate.expiresAt === "string"
  );
}

function readRecords(): RecoverableSessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => item && isRecoverableSnapshot(item.snapshot));
  } catch {
    return [];
  }
}

function writeRecords(records: RecoverableSessionRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MOCK_INTERVIEW_RECOVERY_EVENT));
  }
}

function readPendingRecords(): PendingSessionRecord[] {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => {
      const pending = item?.pending;
      return (
        pending &&
        typeof pending.pendingId === "string" &&
        (pending.sessionId == null || typeof pending.sessionId === "string") &&
        typeof pending.interviewType === "string" &&
        typeof pending.category === "string" &&
        typeof pending.creatingStep === "string" &&
        typeof pending.startedAt === "string" &&
        typeof pending.lastActiveAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function writePendingRecords(records: PendingSessionRecord[]) {
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(records));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MOCK_INTERVIEW_RECOVERY_EVENT));
  }
}

export function upsertRecoverableSession(record: RecoverableSessionRecord) {
  const records = readRecords().filter((item) => item.snapshot.sessionId !== record.snapshot.sessionId);
  records.unshift(record);
  writeRecords(records.slice(0, 10));
}

export function updateRecoverableSessionSnapshot(
  sessionId: string,
  updater: (snapshot: MockInterviewSessionSnapshot) => MockInterviewSessionSnapshot
) {
  const records = readRecords();
  const updated = records.map((item) =>
    item.snapshot.sessionId === sessionId ? { snapshot: updater(item.snapshot) } : item
  );
  writeRecords(updated);
}

export function removeRecoverableSession(sessionId: string) {
  const records = readRecords().filter((item) => item.snapshot.sessionId !== sessionId);
  writeRecords(records);
}

export function upsertPendingSession(pending: MockInterviewPendingSession) {
  const records = readPendingRecords().filter((item) => item.pending.pendingId !== pending.pendingId);
  records.unshift({ pending });
  writePendingRecords(records.slice(0, 10));
}

export function updatePendingSession(
  pendingId: string,
  updates: Partial<Pick<MockInterviewPendingSession, "sessionId" | "creatingStep" | "lastActiveAt">>
) {
  const records = readPendingRecords();
  writePendingRecords(
    records.map((item) =>
      item.pending.pendingId === pendingId ? { pending: { ...item.pending, ...updates } } : item
    )
  );
}

export function removePendingSession(pendingId: string) {
  const records = readPendingRecords().filter((item) => item.pending.pendingId !== pendingId);
  writePendingRecords(records);
}

export function clearRecoverableSessions() {
  writeRecords([]);
  writePendingRecords([]);
}

export function getRecoverableSessions(): RecoverableSessionRecord[] {
  const allRecords = readRecords();
  const nowMs = Date.now();
  const records = allRecords.filter((item) => {
    const expiresMs = new Date(item.snapshot.expiresAt).getTime();
    return Number.isFinite(expiresMs) && expiresMs > nowMs;
  });
  if (records.length !== allRecords.length) {
    writeRecords(records);
  }
  return records;
}

export function getRecoverableSessionById(sessionId: string): RecoverableSessionRecord | null {
  const records = getRecoverableSessions();
  return records.find((item) => item.snapshot.sessionId === sessionId) ?? null;
}

export function getPendingSessions(): PendingSessionRecord[] {
  return readPendingRecords().sort(
    (a, b) => +new Date(b.pending.lastActiveAt) - +new Date(a.pending.lastActiveAt)
  );
}

export function getPendingSessionById(pendingId: string): PendingSessionRecord | null {
  return readPendingRecords().find((item) => item.pending.pendingId === pendingId) ?? null;
}
