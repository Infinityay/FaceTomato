import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import ResumeDisplayPanel from "../ResumeDisplayPanel";
import type { ResumeData } from "@/types/resume";
import { useResumeStore } from "@/store/resumeStore";
import { useOptimizationStore } from "@/store/optimizationStore";

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

afterEach(() => {
  useResumeStore.getState().clearParsedResume();
  useOptimizationStore.getState().reset();
});

describe("ResumeDisplayPanel", () => {
  it("does not render skills input or badges in basic info", () => {
    render(<ResumeDisplayPanel data={resumeData} />);

    expect(screen.queryByText("技能（逗号分隔）")).not.toBeInTheDocument();
    expect(screen.queryByText("技能")).not.toBeInTheDocument();
    expect(screen.getByText("测试用户")).toBeInTheDocument();
  });
});
