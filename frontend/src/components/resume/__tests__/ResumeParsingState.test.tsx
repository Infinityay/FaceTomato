import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ResumeParsingState from "../ResumeParsingState";

describe("ResumeParsingState", () => {
  it("renders default parsing copy", () => {
    render(<ResumeParsingState />);

    expect(screen.getByText("正在解析简历")).toBeInTheDocument();
    expect(screen.getByText("请稍候，系统正在提取并结构化您的简历内容")).toBeInTheDocument();
  });

  it("renders optional action button and handles click", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(<ResumeParsingState actionLabel="查看解析进度" onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: "查看解析进度" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("does not render action button when not provided", () => {
    render(<ResumeParsingState />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
