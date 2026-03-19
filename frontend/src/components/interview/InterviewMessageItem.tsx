import { memo } from "react";
import type { MockInterviewMessage } from "@/types/mockInterview";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface InterviewMessageItemProps {
  message: MockInterviewMessage;
  isStreaming?: boolean;
}

function InterviewMessageItemComponent({ message, isStreaming = false }: InterviewMessageItemProps) {
  const isUser = message.role === "user";
  const hasContent = message.content.trim().length > 0;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-zinc-700 px-4 py-3 text-sm leading-6 text-white dark:bg-zinc-600">
          {hasContent ? (
            <MarkdownRenderer
              content={message.content}
              isStreaming={isStreaming}
              className="interview-markdown-user"
            />
          ) : (
            isStreaming && <span className="text-white/70">正在生成...</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent mt-0.5">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
      </div>
      <div className="min-w-0 flex-1 text-sm leading-6">
        {hasContent ? (
          <MarkdownRenderer
            content={message.content}
            isStreaming={isStreaming}
            className="interview-markdown-assistant"
          />
        ) : (
          isStreaming && <span className="text-muted-foreground">正在输入</span>
        )}
      </div>
    </div>
  );
}

export const InterviewMessageItem = memo(
  InterviewMessageItemComponent,
  (prev, next) =>
    prev.isStreaming === next.isStreaming &&
    prev.message.id === next.message.id &&
    prev.message.role === next.message.role &&
    (prev.isStreaming
      ? prev.message.content.length === next.message.content.length
      : prev.message.content === next.message.content)
);
