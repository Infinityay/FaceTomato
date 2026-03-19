import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResumePage from "../ResumePage";
import { useResumeStore } from "@/store/resumeStore";
import { useSessionStore } from "@/store/sessionStore";
import { useOptimizationStore } from "@/store/optimizationStore";

vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 0 }),
    destroy: vi.fn(),
  })),
  GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("pdfjs-dist/build/pdf.worker?url", () => ({
  default: "pdf-worker-url",
}));

describe("ResumePage upload support matrix", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useResumeStore.persist.clearStorage();
    useSessionStore.persist.clearStorage();
    useOptimizationStore.persist.clearStorage();

    useResumeStore.setState({
      parsedResume: null,
      parseMeta: null,
      parseStatus: "idle",
      parseError: null,
    });
    useSessionStore.setState({
      resumeFile: null,
      resumeText: "",
      jdText: "",
      theme: "system",
    });
    useOptimizationStore.getState().reset();
  });

  it("shows DOCX but not DOC in upload copy and accept list", () => {
    render(<ResumePage />);

    expect(screen.getByText("支持 PDF、DOCX、JPG、JPEG、PNG、TXT、Markdown 格式")).toBeInTheDocument();
    expect(screen.queryByText(/支持 PDF、DOC、DOCX/i)).not.toBeInTheDocument();

    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("accept", ".txt,.md,.pdf,.docx,.jpg,.jpeg,.png");
    expect(input).not.toHaveAttribute("accept", expect.stringContaining(".doc,"));
    expect(screen.getByText("DOCX")).toBeInTheDocument();
    expect(screen.queryByText(/^DOC$/)).not.toBeInTheDocument();
  });

  it("treats DOCX as the supported Word upload path", async () => {
    const user = userEvent.setup();
    const parseResumeFile = vi.fn().mockResolvedValue(undefined);
    useResumeStore.setState({ parseResumeFile });

    render(<ResumePage />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const docxFile = new File(["docx-content"], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await user.upload(input, docxFile);

    await waitFor(() => {
      expect(parseResumeFile).toHaveBeenCalledWith(expect.objectContaining({ name: "resume.docx" }));
    });

    expect(useSessionStore.getState().resumeText).toBe("[resume.docx - 将由后端自动选择解析策略]");
    expect(useSessionStore.getState().resumeFile).toMatchObject({
      name: "resume.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });
});
