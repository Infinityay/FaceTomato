import { useQuestionBankStore } from "@/store/questionBankStore";
import { motion as m } from "framer-motion";
import {
  ArrowLeft,
  Building,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Tag,
} from "lucide-react";
import { Button } from "../ui/button";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Badge } from "../ui/badge";
import { StatusBadge } from "./StatusBadge";
import type { InterviewData } from "@/types/interview";
import { useState, useEffect, useCallback } from "react";
import { fetchInterviewById } from "@/lib/interviewApi";

export function QuestionDetailView() {
  const selectedId = useQuestionBankStore((s) => s.selectedId);
  const neighbors = useQuestionBankStore((s) => s.neighbors);
  const setSelectedId = useQuestionBankStore((s) => s.setSelectedId);
  const navigateToDetail = useQuestionBankStore((s) => s.navigateToDetail);
  const isMobile = useMediaQuery("(max-width: 1023px)");

  const [interview, setInterview] = useState<InterviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedId) return;

    setLoading(true);
    fetchInterviewById(selectedId)
      .then((data) => setInterview(data))
      .catch(() => setInterview(null))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const handleClose = useCallback(() => setSelectedId(null), [setSelectedId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const item = interview;

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Content panel */}
      <m.div
        initial={isMobile ? { x: "100%" } : { scale: 0.95, opacity: 0 }}
        animate={isMobile ? { x: 0 } : { scale: 1, opacity: 1 }}
        exit={isMobile ? { x: "100%" } : { scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={
          isMobile
            ? "relative flex flex-col h-full w-full bg-background"
            : "relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-background shadow-lg"
        }
      >
        {/* Loading state */}
        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {/* Error state */}
        {!loading && !item && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
            <p className="text-muted-foreground">面经未找到</p>
            <Button variant="outline" onClick={handleClose}>
              返回列表
            </Button>
          </div>
        )}

        {/* Content */}
        {!loading && item && (
          <>
            {/* Sticky header */}
            <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
              <button
                onClick={handleClose}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                返回列表
              </button>

              {neighbors && (
                <span className="text-xs text-muted-foreground">
                  {neighbors.current_index} / {neighbors.total}
                </span>
              )}

              <div className="flex items-center gap-1">
                <m.button
                  whileTap={{ scale: 0.95 }}
                  disabled={!neighbors?.prev}
                  onClick={() =>
                    neighbors?.prev && navigateToDetail(neighbors.prev.id)
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </m.button>
                <m.button
                  whileTap={{ scale: 0.95 }}
                  disabled={!neighbors?.next}
                  onClick={() =>
                    neighbors?.next && navigateToDetail(neighbors.next.id)
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </m.button>
              </div>
            </header>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-6 p-4 sm:p-6">
                {/* Title section */}
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {item.category}
                    </Badge>
                    <StatusBadge result={item.result} />
                    {item.interview_type && (
                      <Badge variant="secondary" className="text-xs">
                        {item.interview_type}
                      </Badge>
                    )}
                  </div>
                  <h1 className="text-xl font-semibold">{item.title}</h1>
                </div>

                {/* Meta info */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  {item.company && (
                    <div className="flex items-center gap-1.5">
                      <Building className="h-4 w-4" />
                      {item.company}
                    </div>
                  )}
                  {item.department && (
                    <div className="flex items-center gap-1.5">
                      <Tag className="h-4 w-4" />
                      {item.department}
                    </div>
                  )}
                  {item.stage && (
                    <div className="flex items-center gap-1.5">
                      <span>{item.stage}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {item.publish_time}
                  </div>
                </div>

                {/* Content */}
                {item.content && (
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {item.content.split("\n").map((line, i) =>
                        line.trim() ? (
                          <p key={i} className="mb-2 text-sm text-foreground">
                            {line}
                          </p>
                        ) : (
                          <br key={i} />
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Footer navigation */}
                <div className="grid grid-cols-2 gap-3 border-t pt-4">
                  {neighbors?.prev ? (
                    <m.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => navigateToDetail(neighbors.prev!.id)}
                      className="flex flex-col items-start rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="text-xs text-muted-foreground">
                        上一篇
                      </span>
                      <span className="text-sm font-medium line-clamp-1">
                        {neighbors.prev.title}
                      </span>
                    </m.button>
                  ) : (
                    <div />
                  )}
                  {neighbors?.next ? (
                    <m.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => navigateToDetail(neighbors.next!.id)}
                      className="flex flex-col items-end rounded-lg border p-3 text-right transition-colors hover:bg-muted/50"
                    >
                      <span className="text-xs text-muted-foreground">
                        下一篇
                      </span>
                      <span className="text-sm font-medium line-clamp-1">
                        {neighbors.next.title}
                      </span>
                    </m.button>
                  ) : (
                    <div />
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </m.div>
    </m.div>
  );
}
