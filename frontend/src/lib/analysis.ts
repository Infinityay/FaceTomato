import { allSkills, skillGroups } from "./skills";

const sectionTitles = [
  "个人简介",
  "工作经历",
  "项目经历",
  "教育经历",
  "技能",
  "证书",
  "Summary",
  "Experience",
  "Projects",
  "Education",
  "Skills",
];

const sectionPattern = new RegExp(
  `^(${sectionTitles.map((title) => title.replace(/\./g, "\\.")).join("|")})([:：]?)+$`,
  "i"
);

// 清除示例数据，准备开发后端解析功能
export const sampleResume = "";

export const sampleJD = "";

const normalize = (text: string) => text.toLowerCase();

const splitLines = (text: string) => text.split(/\r?\n/).map((line) => line.trim());

export const extractSkillMatches = (text: string) => {
  const normalized = normalize(text);
  return allSkills.filter((skill) =>
    normalized.includes(normalize(skill))
  );
};

export const extractSections = (text: string) => {
  const lines = splitLines(text).filter((line) => line.length > 0);
  const sections: { title: string; content: string[] }[] = [];
  let current = { title: "概览", content: [] as string[] };

  lines.forEach((line) => {
    if (sectionPattern.test(line)) {
      if (current.content.length > 0) {
        sections.push({
          title: current.title,
          content: current.content,
        });
      }
      current = { title: line.replace(/[:：]+$/, ""), content: [] };
      return;
    }
    current.content.push(line);
  });

  if (current.content.length > 0) {
    sections.push({ title: current.title, content: current.content });
  }

  return sections;
};

export const analyzeResume = (text: string) => {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const characters = trimmed.length;
  const sections = trimmed ? extractSections(text) : [];
  const skills = trimmed ? extractSkillMatches(text) : [];

  const groupCoverage = skillGroups.map((group) => {
    const matched = group.skills.filter((skill) => skills.includes(skill));
    return {
      ...group,
      matched,
      matchedCount: matched.length,
    };
  });

  return {
    wordCount: words,
    characterCount: characters,
    sectionCount: sections.length,
    sections,
    skills,
    groupCoverage,
  };
};

export const analyzeMatch = (resumeText: string, jdText: string) => {
  const resumeSkills = new Set(extractSkillMatches(resumeText));
  const jdSkills = new Set(extractSkillMatches(jdText));
  const matchedSkills = Array.from(jdSkills).filter((skill) =>
    resumeSkills.has(skill)
  );
  const missingSkills = Array.from(jdSkills).filter(
    (skill) => !resumeSkills.has(skill)
  );
  const score = jdSkills.size
    ? Math.round((matchedSkills.length / jdSkills.size) * 100)
    : 0;

  const groupMatches = skillGroups.map((group) => {
    const required = group.skills.filter((skill) => jdSkills.has(skill));
    const matched = required.filter((skill) => resumeSkills.has(skill));
    return {
      ...group,
      required,
      matched,
      ratio: required.length ? matched.length / required.length : 0,
    };
  });

  return {
    score,
    matchedSkills,
    missingSkills,
    groupMatches,
  };
};