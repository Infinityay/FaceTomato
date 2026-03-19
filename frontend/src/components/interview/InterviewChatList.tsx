import { memo, useEffect, useRef } from "react";
import { InterviewMessageItem } from "./InterviewMessageItem";
import type { MockInterviewMessage, PendingAssistantPhase } from "@/types/mockInterview";

interface InterviewChatListProps {
  messages: MockInterviewMessage[];
  streamingMessageId: string | null;
  pendingAssistantPhase: PendingAssistantPhase;
}

function InterviewChatListComponent({ messages, streamingMessageId, pendingAssistantPhase }: InterviewChatListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom < 120) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

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
        {pendingAssistantPhase === "analyzing_answer" && !streamingMessageId ? (
          <InterviewMessageItem
            message={{ id: "pending-assistant-phase", role: "assistant", content: "正在分析你的回答" }}
          />
        ) : null}
      </div>
    </div>
  );
}

export const InterviewChatList = memo(InterviewChatListComponent);
