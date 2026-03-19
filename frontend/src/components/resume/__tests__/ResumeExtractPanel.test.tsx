import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ResumeExtractPanel } from "../ResumeExtractPanel";
import type { ResumeData } from "@/types/resume";

const resumeData: ResumeData = {
  basicInfo: {
    name: "测试用户",
    personalEmail: "test@example.com",
    phoneNumber: "13800138000",
    age: "22",
    born: "2004-01",
    gender: "男",
    desiredPosition: "前端开发",
    desiredLocation: ["上海"],
    currentLocation: "上海",
    placeOfOrigin: "江苏",
    rewards: ["校级优秀毕业生"],
  },
  workExperience: [],
  education: [],
  projects: [],
  academicAchievements: [],
};

describe("ResumeExtractPanel", () => {
  it("reuses shared parsing state while loading", () => {
    render(<ResumeExtractPanel data={null} onChange={() => {}} isLoading />);

    expect(screen.getByText("正在解析简历")).toBeInTheDocument();
    expect(screen.queryByText("未配置 OCR 时，系统会优先尝试使用当前模型直接解析文件；如模型不支持文件理解，会给出明确引导。")).not.toBeInTheDocument();
  });

  it("shows explicit guidance when parsing fails", () => {
    render(
      <ResumeExtractPanel
        data={null}
        onChange={() => {}}
        error="当前模型不支持 PDF 文件直抽。"
        parseMeta={{
          filename: "resume.pdf",
          extension: "pdf",
          elapsed: { ocr_seconds: 0, llm_seconds: 0 },
          guidance: "请切换支持视觉的模型或上传文本版简历。",
        }}
      />
    );

    expect(screen.getByText("解析失败")).toBeInTheDocument();
    expect(screen.getByText("请切换支持视觉的模型或上传文本版简历。")).toBeInTheDocument();
  });

  it("does not render skills badges in basic info", () => {
    render(<ResumeExtractPanel data={resumeData} onChange={() => {}} />);

    expect(screen.queryByText("技能标签")).not.toBeInTheDocument();
    expect(screen.queryByText("React")).not.toBeInTheDocument();
  });
});
