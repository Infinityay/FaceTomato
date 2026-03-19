import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SuggestionCard from "../SuggestionCard";
import { useOptimizationStore, type SuggestionItem } from "@/store/optimizationStore";

const baseSuggestion = {
  id: "SUG-WORK-001",
  priority: 1,
  issue_type: "wording_issue",
  location: {
    section: "workExperience",
    item_index: 0,
  },
  problem: "使用被动动词，缺少结果说明",
  original: "负责后端系统开发",
  suggestion: "主导后端系统开发，推进接口性能优化",
} as SuggestionItem;

describe("SuggestionCard", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useOptimizationStore.persist.clearStorage();
    useOptimizationStore.getState().reset();
  });

  it("renders read-only suggestion content and exposes the copy action", () => {
    render(<SuggestionCard suggestion={baseSuggestion} />);

    expect(screen.getByText("使用被动动词，缺少结果说明")).toBeInTheDocument();
    expect(screen.getByText("负责后端系统开发")).toBeInTheDocument();
    expect(screen.getByText("主导后端系统开发，推进接口性能优化")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /复制建议/ })).toBeInTheDocument();
  });

  it("copies the suggestion text when the copy button is clicked", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });

    render(<SuggestionCard suggestion={baseSuggestion} />);

    fireEvent.click(screen.getByRole("button", { name: /复制建议/ }));

    expect(writeText).toHaveBeenCalledWith("主导后端系统开发，推进接口性能优化");
  });

  it.each([
    { label: "legacy direct_apply", suggestion_type: "direct_apply" },
    { label: "legacy manual_edit", suggestion_type: "manual_edit" },
    { label: "legacy applied state", suggestion_type: "manual_edit", applied: true },
  ])("does not show apply-related controls for $label", (legacyFields) => {
    const suggestion = {
      ...baseSuggestion,
      ...legacyFields,
    } as unknown as SuggestionItem;

    render(<SuggestionCard suggestion={suggestion} />);

    expect(screen.queryByRole("button", { name: "应用建议" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑并应用" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认应用" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消" })).not.toBeInTheDocument();
    expect(screen.queryByText("已处理")).not.toBeInTheDocument();
    expect(screen.queryByText("可直接应用")).not.toBeInTheDocument();
    expect(screen.queryByText("需补充信息")).not.toBeInTheDocument();
  });
});
