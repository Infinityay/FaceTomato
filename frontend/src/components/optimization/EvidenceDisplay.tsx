import * as React from "react";
import { FileText, AlertCircle } from "lucide-react";

import {
  highlightKeywords,
  extractKeywords,
  sectionNameMap,
  fieldNameMap,
} from "../../lib/utils";
import type { ResumeData } from "../../types/resume";

interface EvidenceDisplayProps {
  evidencePaths: string[];
  requirementText: string;
  resumeData: ResumeData | null;  // 使用快照数据而非从store获取
}

/**
 * 解析证据路径，提取section、index和field
 * 支持格式：
 * - "workExperience[0].jobDescription"
 * - "basicInfo.desiredPosition"
 * - "workExperience[0].jobDescription: 具体片段"
 */
function parseEvidencePath(path: string): {
  section: string;
  index: number | null;
  field: string;
  snippet: string | null;
} | null {
  // 检查是否包含冒号分隔的snippet
  let pathPart = path;
  let snippet: string | null = null;

  const colonIndex = path.indexOf(":");
  if (colonIndex !== -1) {
    pathPart = path.substring(0, colonIndex).trim();
    snippet = path.substring(colonIndex + 1).trim();
  }

  // 解析路径：section[index].field 或 section.field
  const arrayMatch = pathPart.match(/^(\w+)\[(\d+)\]\.?(\w*)$/);
  if (arrayMatch) {
    return {
      section: arrayMatch[1],
      index: parseInt(arrayMatch[2], 10),
      field: arrayMatch[3] || "",
      snippet,
    };
  }

  // 解析简单路径：section.field
  const simpleMatch = pathPart.match(/^(\w+)\.(\w+)$/);
  if (simpleMatch) {
    return {
      section: simpleMatch[1],
      index: null,
      field: simpleMatch[2],
      snippet,
    };
  }

  // 只有section名
  const sectionOnlyMatch = pathPart.match(/^(\w+)$/);
  if (sectionOnlyMatch) {
    return {
      section: sectionOnlyMatch[1],
      index: null,
      field: "",
      snippet,
    };
  }

  return null;
}

/**
 * 从resumeData中根据路径获取内容
 */
function getContentFromPath(
  resumeData: ResumeData,
  parsed: {
    section: string;
    index: number | null;
    field: string;
    snippet: string | null;
  }
): string | null {
  // 如果有snippet，直接返回
  if (parsed.snippet) {
    return parsed.snippet;
  }

  const sectionData = (resumeData as unknown as Record<string, unknown>)[parsed.section];
  if (!sectionData) return null;

  // 如果是数组类型的section
  if (Array.isArray(sectionData)) {
    if (parsed.index === null || parsed.index >= sectionData.length) {
      return null;
    }
    const item = sectionData[parsed.index] as Record<string, unknown>;
    if (!item) return null;

    // 如果有field，返回特定字段
    if (parsed.field) {
      const fieldValue = item[parsed.field];
      if (typeof fieldValue === "string") {
        return fieldValue;
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.join(", ");
      }
      return null;
    }

    // 没有field，返回整个item的描述性字段
    return (
      (item.jobDescription as string) ||
      (item.description as string) ||
      (item.highlights as string[])?.join(", ") ||
      null
    );
  }

  // 如果是对象类型的section（如basicInfo）
  if (typeof sectionData === "object" && sectionData !== null) {
    const sectionObj = sectionData as Record<string, unknown>;
    if (parsed.field) {
      const fieldValue = sectionObj[parsed.field];
      if (typeof fieldValue === "string") {
        return fieldValue;
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.join(", ");
      }
    }
    return null;
  }

  return null;
}

/**
 * 生成证据来源的可读标题
 */
function getEvidenceTitle(
  parsed: {
    section: string;
    index: number | null;
    field: string;
    snippet: string | null;
  },
  resumeData: ResumeData
): string {
  const sectionName = sectionNameMap[parsed.section] || parsed.section;

  // 如果有index，尝试获取具体的名称（公司名、项目名等）
  if (parsed.index !== null) {
    const sectionData = (resumeData as unknown as Record<string, unknown>)[parsed.section];
    if (Array.isArray(sectionData) && sectionData[parsed.index]) {
      const item = sectionData[parsed.index] as Record<string, unknown>;
      const itemName =
        (item.companyName as string) ||
        (item.company as string) ||
        (item.projectName as string) ||
        (item.name as string) ||
        (item.school as string) ||
        (item.title as string) ||
        (item.position as string);
      if (itemName) {
        const fieldName = parsed.field
          ? fieldNameMap[parsed.field] || parsed.field
          : "";
        return fieldName
          ? `${sectionName} > ${itemName} > ${fieldName}`
          : `${sectionName} > ${itemName}`;
      }
    }
  }

  // 简单格式
  if (parsed.field) {
    const fieldName = fieldNameMap[parsed.field] || parsed.field;
    return `${sectionName} > ${fieldName}`;
  }

  return sectionName;
}

const EvidenceDisplay: React.FC<EvidenceDisplayProps> = ({
  evidencePaths,
  requirementText,
  resumeData,
}) => {
  // 提取关键词用于高亮
  const keywords = React.useMemo(
    () => extractKeywords(requirementText),
    [requirementText]
  );

  // 没有简历数据或没有证据路径
  if (!resumeData || !evidencePaths || evidencePaths.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
        <AlertCircle className="h-4 w-4" />
        <span>未找到匹配证据</span>
      </div>
    );
  }

  // 解析并渲染每条证据
  const evidenceItems = evidencePaths
    .map((path, idx) => {
      const parsed = parseEvidencePath(path);
      if (!parsed) {
        return null;
      }

      const content = getContentFromPath(resumeData, parsed);
      if (!content) {
        return null;
      }

      const title = getEvidenceTitle(parsed, resumeData);

      return (
        <div
          key={idx}
          className="rounded-md border bg-muted/30 p-3 space-y-1.5"
        >
          {/* 来源标题 */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span>来源：{title}</span>
          </div>
          {/* 内容片段（带关键词高亮） */}
          <blockquote className="text-sm border-l-2 border-primary/30 pl-3 text-foreground/90">
            {highlightKeywords(content, keywords)}
          </blockquote>
        </div>
      );
    })
    .filter(Boolean);

  // 所有证据路径都无效
  if (evidenceItems.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
        <AlertCircle className="h-4 w-4" />
        <span>未找到匹配证据</span>
      </div>
    );
  }

  return <div className="space-y-2">{evidenceItems}</div>;
};

export default EvidenceDisplay;