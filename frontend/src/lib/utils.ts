import { clsx, type ClassValue } from "clsx";
import * as React from "react";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * 高亮文本中的关键词
 * @param text 原始文本
 * @param keywords 要高亮的关键词数组
 * @returns React节点数组
 */
export function highlightKeywords(
  text: string,
  keywords: string[]
): React.ReactNode[] {
  if (!text || keywords.length === 0) {
    return [text];
  }

  // 过滤掉太短的关键词（避免误匹配）
  const validKeywords = keywords.filter((kw) => kw.length > 1);
  if (validKeywords.length === 0) {
    return [text];
  }

  // 转义正则特殊字符
  const escapeRegex = (str: string) =>
    str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // 创建大小写不敏感的正则表达式
  const regex = new RegExp(
    `(${validKeywords.map(escapeRegex).join("|")})`,
    "gi"
  );

  const parts = text.split(regex);

  return parts.map((part, index) => {
    const isMatch = validKeywords.some(
      (kw) => part.toLowerCase() === kw.toLowerCase()
    );
    if (isMatch) {
      return React.createElement(
        "mark",
        {
          key: index,
          className: "bg-yellow-200 dark:bg-yellow-800/50 px-0.5 rounded",
        },
        part
      );
    }
    return part;
  });
}

/**
 * 从requirement文本中提取关键词
 * @param text JD要求文本
 * @returns 关键词数组
 */
export function extractKeywords(text: string): string[] {
  // 常见停用词
  const stopWords = new Set([
    "的", "是", "和", "与", "或", "等", "有", "能", "会", "了",
    "在", "对", "要", "能够", "具备", "熟悉", "熟练", "掌握",
    "使用", "开发", "相关", "经验", "基础", "能力", "良好",
    "a", "an", "the", "and", "or", "of", "to", "in", "for", "with",
  ]);

  // 按空格、逗号、分号等分割
  const words = text
    .split(/[\s,，;；、/／]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()));

  return [...new Set(words)]; // 去重
}

/**
 * section名称的中文映射
 */
export const sectionNameMap: Record<string, string> = {
  basicInfo: "基本信息",
  workExperience: "工作经历",
  education: "教育背景",
  projects: "项目经历",
  academicAchievements: "学术成就",
};

/**
 * 字段名称的中文映射
 */
export const fieldNameMap: Record<string, string> = {
  jobDescription: "工作描述",
  description: "描述",
  highlights: "亮点",
  major: "专业",
  degree: "学位",
  gpa: "GPA",
  name: "名称",
  title: "标题",
  company: "公司",
  companyName: "公司名称",
  position: "职位",
  school: "学校",
  role: "角色",
};
