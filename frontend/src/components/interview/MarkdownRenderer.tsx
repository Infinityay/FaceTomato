import { memo } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

function MarkdownRendererComponent({ content, isStreaming = false, className }: MarkdownRendererProps) {
  if (!content.trim().length) {
    return null;
  }

  return (
    <Streamdown
      className={cn("interview-markdown", className)}
      mode={isStreaming ? "streaming" : "static"}
      isAnimating={isStreaming}
      parseIncompleteMarkdown={isStreaming}
      controls={false}
      animated={isStreaming ? { animation: "fadeIn", duration: 120, sep: "word" } : false}
    >
      {content}
    </Streamdown>
  );
}

export const MarkdownRenderer = memo(
  MarkdownRendererComponent,
  (prev, next) =>
    prev.className === next.className &&
    prev.isStreaming === next.isStreaming &&
    (prev.isStreaming ? prev.content.length === next.content.length : prev.content === next.content)
);
