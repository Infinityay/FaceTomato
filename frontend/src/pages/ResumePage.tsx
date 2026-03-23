import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from "react";
import {
  FileText,
  RefreshCw,
  Save,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker?url";

import { Button } from "../components/ui/button";
import { ResumeExtractPanel } from "../components/resume/ResumeExtractPanel";
import { cn } from "../lib/utils";
import { clearOptimizationStore } from "../store/optimizationStore";
import { useResumeStore } from "../store/resumeStore";
import { useSessionStore, ResumeFile } from "../store/sessionStore";
import type { ResumeData } from "../types/resume";

GlobalWorkerOptions.workerSrc = workerSrc;

const PDFJS_CMAP_URL = "https://unpkg.com/pdfjs-dist@5.4.530/cmaps/";
const PDFJS_STANDARD_FONT_URL = "https://unpkg.com/pdfjs-dist@5.4.530/standard_fonts/";

const ACCEPT_TYPES = ".txt,.md,.pdf,.docx,.jpg,.jpeg,.png";
const SUPPORTED_LABELS = ["PDF", "DOCX", "JPG", "PNG", "TXT", "Markdown"];
const ResumePage = () => {
  const { resumeFile, resumeText, setResumeFile, setResumeText, clearResume } = useSessionStore();
  const {
    parsedResume,
    parseMeta,
    setParsedResume,
    clearParsedResume,
    parseStatus,
    parseError,
    parseResumeFile,
    clearParseError,
  } = useResumeStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isPdfRendering, setIsPdfRendering] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfRenderKey, setPdfRenderKey] = useState(0);
  const [extractedData, setExtractedData] = useState<ResumeData | null>(parsedResume);
  const [hasChanges, setHasChanges] = useState(false);

  const isExtracting = parseStatus === "parsing";
  const extractError = parseError;

  useEffect(() => {
    if (parsedResume) {
      setExtractedData(parsedResume);
    }
  }, [parsedResume]);

  const handleDataChange = useCallback(
    (newData: ResumeData) => {
      setExtractedData(newData);
      setParsedResume(newData);
      setHasChanges(true);
    },
    [setParsedResume]
  );

  const handleSave = useCallback(() => {
    if (extractedData) {
      console.log("保存简历数据:", extractedData);
      setHasChanges(false);
    }
  }, [extractedData]);

  const previewText = useMemo(() => {
    const trimmed = resumeText.trim();
    if (!trimmed) return "";
    const limit = 2000;
    if (trimmed.length <= limit) return trimmed;
    return `${trimmed.slice(0, limit)}\n...`;
  }, [resumeText]);

  const hasResume = resumeText.trim().length > 0 || resumeFile !== null;
  const normalizedExtension = resumeFile?.name.split(".").pop()?.toLowerCase();
  const isImage = resumeFile
    ? resumeFile.type.startsWith("image/") ||
      ["png", "jpg", "jpeg", "gif", "webp"].includes(normalizedExtension ?? "")
    : false;
  const isPdf = resumeFile
    ? resumeFile.type === "application/pdf" || normalizedExtension === "pdf"
    : false;
  const isTextFile = resumeFile
    ? resumeFile.type.startsWith("text/") || normalizedExtension === "txt" || normalizedExtension === "md"
    : false;
  const fileExtension = normalizedExtension?.toUpperCase();
  const missingPreviewSource = Boolean(
    resumeFile &&
      !resumeFile.previewUrl &&
      (isPdf || isImage)
  );

  useEffect(() => {
    if (!isPdf || !resumeFile?.previewUrl) {
      return;
    }

    const retryRender = () => {
      if (document.visibilityState === "visible") {
        setPdfRenderKey((value) => value + 1);
      }
    };

    window.addEventListener("focus", retryRender);
    document.addEventListener("visibilitychange", retryRender);

    return () => {
      window.removeEventListener("focus", retryRender);
      document.removeEventListener("visibilitychange", retryRender);
    };
  }, [isPdf, resumeFile?.previewUrl]);

  useEffect(() => {
    if (!pdfContainerRef.current) return;
    if (!isPdf || !resumeFile?.previewUrl) {
      pdfContainerRef.current.innerHTML = "";
      setIsPdfRendering(false);
      setPdfError(null);
      return;
    }

    let cancelled = false;
    const container = pdfContainerRef.current;
    container.innerHTML = "";
    setIsPdfRendering(true);
    setPdfError(null);

    const loadingTask = getDocument({
      url: resumeFile.previewUrl,
      cMapUrl: PDFJS_CMAP_URL,
      cMapPacked: true,
      standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
      useSystemFonts: true,
    });
    loadingTask.promise
      .then(async (pdf) => {
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
          if (cancelled) break;
          const page = await pdf.getPage(pageNum);
          const baseViewport = page.getViewport({ scale: 1 });
          const containerWidth = container.clientWidth || 600;
          const availableWidth = Math.max(containerWidth - 16, 320);
          const baseScale = availableWidth / baseViewport.width;
          const devicePixelRatio = window.devicePixelRatio || 1;
          const qualityScale = Math.min(devicePixelRatio * 2, 3);
          const renderScale = baseScale * qualityScale;

          const displayViewport = page.getViewport({ scale: baseScale });
          const renderViewport = page.getViewport({ scale: renderScale });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;

          canvas.width = renderViewport.width;
          canvas.height = renderViewport.height;
          canvas.style.width = `${displayViewport.width}px`;
          canvas.style.height = `${displayViewport.height}px`;
          canvas.className = "bg-white shadow-sm mb-4 rounded-sm mx-auto";

          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";

          const wrapper = document.createElement("div");
          wrapper.className = "flex justify-center";
          wrapper.appendChild(canvas);
          container.appendChild(wrapper);

          const renderTask = page.render({
            canvas: null,
            canvasContext: context,
            viewport: renderViewport,
          } as Parameters<typeof page.render>[0]);
          await renderTask.promise;
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message =
            error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          const isAbortLike =
            message.includes("Abort") ||
            message.includes("aborted") ||
            message.includes("Worker was terminated");
          if (isAbortLike) {
            return;
          }
          console.error("PDF preview render failed", error);
          setPdfError("PDF 预览加载失败，请尝试重新上传。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPdfRendering(false);
        }
      });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [isPdf, resumeFile?.previewUrl, pdfRenderKey]);

  const handleFileSelect = useCallback(
    async (file: File) => {
      setIsParsing(true);
      setPdfError(null);

      if (resumeFile?.previewUrl) {
        URL.revokeObjectURL(resumeFile.previewUrl);
      }

      try {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const isImageFile = file.type.startsWith("image/");
        const isPdfFile = file.type === "application/pdf" || extension === "pdf";
        const isWordFile =
          file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          extension === "docx";
        const isTextLike =
          file.type.startsWith("text/") || extension === "txt" || extension === "md";
        let content = "";
        let previewUrl: string | undefined;

        if (isImageFile || isPdfFile) {
          previewUrl = URL.createObjectURL(file);
        }

        if (isImageFile) {
          content = "[图片简历 - 将尝试 OCR 或模型直抽]";
        } else if (isPdfFile || isWordFile) {
          content = `[${file.name} - 将由后端自动选择解析策略]`;
        } else if (isTextLike) {
          content = await file.text();
        } else {
          content = await file.text();
        }

        const fileData: ResumeFile = {
          name: file.name,
          type: file.type,
          size: file.size,
          content,
          previewUrl,
        };

        setResumeFile(fileData);
        setResumeText(content);
        setExtractedData(null);
        clearParseError();
        clearOptimizationStore();
        void parseResumeFile(file);
      } finally {
        setIsParsing(false);
      }
    },
    [resumeFile, setResumeFile, setResumeText, parseResumeFile, clearParseError]
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
      event.target.value = "";
    },
    [handleFileSelect]
  );

  const handleClear = useCallback(
    (event?: MouseEvent) => {
      event?.stopPropagation();
      if (resumeFile?.previewUrl) {
        URL.revokeObjectURL(resumeFile.previewUrl);
      }
      clearResume();
      clearParsedResume();
      clearOptimizationStore();
      setIsParsing(false);
      setIsPdfRendering(false);
      setPdfError(null);
      setExtractedData(null);
      setHasChanges(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [clearResume, clearParsedResume, resumeFile]
  );

  const openPicker = useCallback(() => {
    if (isParsing) return;

    if (parseStatus === "error") {
      handleClear();
      requestAnimationFrame(() => {
        fileInputRef.current?.click();
      });
      return;
    }

    fileInputRef.current?.click();
  }, [handleClear, isParsing, parseStatus]);

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!isParsing) {
        setIsDragging(true);
      }
    },
    [isParsing]
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (isParsing) return;
      const droppedFile = event.dataTransfer.files?.[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect, isParsing]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex h-[calc(100vh-96px)] flex-col gap-6"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_TYPES}
        className="hidden"
        onChange={handleInputChange}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-theme-background shadow-sm lg:w-1/2">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-sidebar/50 px-4 backdrop-blur-sm">
            <span className="text-sm font-semibold text-foreground/80">原始简历</span>
            <div className="flex items-center gap-2">
              {resumeFile && (
                <>
                  <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    {fileExtension}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={openPicker}
                    disabled={isParsing || isExtracting}
                    title="重新上传"
                    className="h-8 w-8"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClear}
                    disabled={isParsing || isExtracting}
                    title="移除"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <div
            className={cn(
              "relative flex-1 overflow-hidden transition-colors duration-200",
              isDragging ? "bg-accent/5 ring-2 ring-inset ring-accent/20" : "bg-theme-background"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {!resumeFile && !hasResume ? (
              <div
                onClick={openPicker}
                className="flex h-full cursor-pointer flex-col items-center justify-center p-8 transition-all hover:bg-accent/5"
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent shadow-sm ring-1 ring-accent/20">
                    <UploadCloud className="h-8 w-8" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">点击或拖拽上传简历</h3>
                  <p className="mb-6 max-w-xs text-sm text-muted-foreground">
                    支持 PDF、DOCX、JPG、JPEG、PNG、TXT、Markdown 格式
                  </p>
                  <div className="flex gap-2">
                    {SUPPORTED_LABELS.map((label) => (
                      <span
                        key={label}
                        className="rounded-md border border-border bg-sidebar px-2 py-1 text-xs font-medium text-muted-foreground"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </motion.div>
              </div>
            ) : (
              <div className="h-full overflow-y-auto bg-sidebar/30 p-6 scrollbar-thin">
                {isImage && resumeFile?.previewUrl ? (
                  <img
                    src={resumeFile.previewUrl}
                    alt={resumeFile.name}
                    className="mx-auto max-w-full rounded-lg border border-border shadow-sm"
                  />
                ) : isPdf ? (
                  <div className="relative min-h-[300px]">
                    {missingPreviewSource ? (
                      <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-muted-foreground">
                        刷新后无法恢复 PDF 预览，请重新上传文件。
                      </div>
                    ) : isPdfRendering && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                          <span className="text-sm font-medium text-accent">渲染中...</span>
                        </div>
                      </div>
                    )}
                    {pdfError ? (
                      <div className="flex h-full items-center justify-center text-sm text-destructive">
                        {pdfError}
                      </div>
                    ) : (
                      <div ref={pdfContainerRef} />
                    )}
                  </div>
                ) : isTextFile && previewText ? (
                  <div className="rounded-lg border border-border bg-background p-4">
                    <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-foreground">
                      {previewText}
                    </pre>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                    <FileText className="mb-4 h-12 w-12 opacity-50" />
                    <p className="text-sm font-medium">预览不可用 ({fileExtension})</p>
                    <p className="mt-1 text-xs opacity-70">请参考右侧解析结果</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-theme-background shadow-sm lg:w-1/2">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-sidebar/50 px-4 backdrop-blur-sm">
            <span className="text-sm font-semibold text-foreground/80">结构化数据</span>
            <AnimatePresence>
              {hasChanges && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                  <Button size="sm" onClick={handleSave} className="h-7 px-3 text-xs">
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    保存更改
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 overflow-y-auto p-0 scrollbar-thin">
            <ResumeExtractPanel
              data={extractedData}
              onChange={handleDataChange}
              isLoading={isParsing || isExtracting}
              error={extractError}
              parseMeta={parseMeta}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ResumePage;
