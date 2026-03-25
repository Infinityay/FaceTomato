import { memo, useEffect, useRef } from "react";
import { InterviewMessageItem } from "./InterviewMessageItem";
import type {
  MockInterviewMessage,
  MockInterviewStatus,
  PendingAssistantPhase,
} from "@/types/mockInterview";

interface InterviewChatListProps {
  messages: MockInterviewMessage[];
  streamingMessageId: string | null;
  pendingAssistantPhase: PendingAssistantPhase;
  status?: MockInterviewStatus;
}

function InterviewChatListComponent({
  messages,
  streamingMessageId,
  pendingAssistantPhase,
  status = "idle",
}: InterviewChatListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom < 120) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const hasStreamingMessage = Boolean(
    streamingMessageId && messages.some((message) => message.id === streamingMessageId)
  );
  const showAnalyzingPlaceholder =
    pendingAssistantPhase === "analyzing_answer" ||
    (status === "streaming" && !streamingMessageId && lastMessage?.role === "user");
  const showTypingPlaceholder =
    status === "streaming" &&
    Boolean(streamingMessageId) &&
    !hasStreamingMessage;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        {messages.map((message) => (
          <InterviewMessageItem
            key={message.id}
            message={message}
            isStreaming={streamingMessageId === message.id}
          />
        ))}
        {showAnalyzingPlaceholder ? (
          <InterviewMessageItem
            message={{ id: "pending-assistant-phase", role: "assistant", content: "正在分析你的回答" }}
          />
        ) : null}
        {showTypingPlaceholder ? (
          <InterviewMessageItem
            message={{ id: "pending-streaming-message", role: "assistant", content: "" }}
            isStreaming
          />
        ) : null}
      </div>
    </div>
  );
}

export const InterviewChatList = memo(InterviewChatListComponent);
