import type { MockInterviewSessionSnapshot } from "@/types/mockInterview";

export function buildMockInterviewTranscriptMarkdown(snapshot: MockInterviewSessionSnapshot): string {
  const exportedAt = new Date().toISOString();
  const jdText = snapshot.jdText.trim();
  const transcript = snapshot.messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => {
      const speaker = message.role === "assistant" ? "面试官问" : "候选者答";
      return `${speaker}\n${message.content.trim()}`;
    })
    .join("\n\n");

  return [
    `# 本轮面试基础信息`,
    ``,
    `- 面试岗位：${snapshot.category}`,
    `- 面试类型：${snapshot.interviewType}`,
    `- 导出时间：${exportedAt}`,
    ``,
    `## 面试 JD`,
    ``,
    jdText || "未提供 JD 信息",
    ``,
    `## 面试对话`,
    ``,
    "```text",
    transcript,
    "```",
  ].join("\n\n").trimEnd() + "\n";
}
