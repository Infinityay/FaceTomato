export type SkillGroup = {
  id: string;
  label: string;
  skills: string[];
};

export const skillGroups: SkillGroup[] = [
  {
    id: "frontend",
    label: "前端基础",
    skills: [
      "HTML",
      "CSS",
      "JavaScript",
      "TypeScript",
      "React",
      "Vue",
      "Next.js",
      "Vite",
      "Tailwind",
      "Zustand",
      "Redux",
      "Webpack",
    ],
  },
  {
    id: "engineering",
    label: "工程化与质量",
    skills: [
      "Vitest",
      "Jest",
      "Cypress",
      "Storybook",
      "ESLint",
      "Prettier",
      "Monorepo",
      "CI/CD",
      "性能优化",
      "可访问性",
    ],
  },
  {
    id: "backend",
    label: "协作式后端",
    skills: ["Node.js", "Express", "REST", "GraphQL", "BFF", "API 设计"],
  },
  {
    id: "data",
    label: "数据与洞察",
    skills: ["埋点", "数据分析", "指标定义", "SQL", "AB 测试"],
  },
  {
    id: "collaboration",
    label: "产品与协作",
    skills: ["需求分析", "跨团队协作", "技术方案", "导师辅导", "文档编写"],
  },
];

export const allSkills = skillGroups.flatMap((group) => group.skills);
