import { memo, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Code2, FileSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MockInterviewRetrievalItem } from "@/types/mockInterview";
import type { MockInterviewPlan, MockInterviewStatus } from "@/types/mockInterview";

const statusLabels: Record<MockInterviewStatus, string> = {
  idle: "未开始",
  creating: "创建中",
  streaming: "进行中",
  ready: "待回答",
  completed: "已结束",
  error: "异常",
};

interface InterviewSessionHeaderProps {
  status: MockInterviewStatus;
  interviewPlan: MockInterviewPlan | null;
  currentRound: number;
  retrievalItems?: MockInterviewRetrievalItem[];
  retrievalPreviews?: Record<string, string>;
  previewSessionId?: string | null;
  onOpenRetrievalDetail?: (interviewId: number) => void;
  onExportTranscript?: () => void;
}

function InterviewSessionHeaderComponent({
  status,
  interviewPlan,
  currentRound,
  retrievalItems = [],
  retrievalPreviews = {},
  previewSessionId,
  onOpenRetrievalDetail,
  onExportTranscript,
}: InterviewSessionHeaderProps) {
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isRetrievalOpen, setIsRetrievalOpen] = useState(false);

  const currentRoundItem = useMemo(
    () => interviewPlan?.plan.find((item) => item.round === currentRound) ?? interviewPlan?.plan[0] ?? null,
    [currentRound, interviewPlan]
  );
  const visibleRetrievalItems = retrievalItems.slice(0, 5);

  const estimatedDuration = interviewPlan?.estimated_duration ?? "-";
  const totalRounds = interviewPlan?.total_rounds ?? 0;
  const showBackdrop = isPlanOpen || isRetrievalOpen;

  return (
    <div className="relative mx-auto w-full max-w-4xl px-5 pt-0 pb-0 md:px-5">
      {/* Main header card */}
      <div className="rounded-xl border border-border/60 bg-card px-5 py-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">模拟面试对话</h2>
              <Badge>{statusLabels[status]}</Badge>
              {interviewPlan && <Badge className="bg-secondary text-secondary-foreground">第 {currentRound} / {totalRounds} 轮</Badge>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>当前主题 {currentRoundItem?.topic ?? "-"}</span>
              <span>预计时长 {estimatedDuration}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {retrievalItems.length > 0 && (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/50"
                aria-expanded={isRetrievalOpen}
                aria-controls="mock-interview-retrieval-panel"
                onClick={() => {
                  setIsPlanOpen(false);
                  setIsRetrievalOpen((current) => !current);
                }}
              >
                <FileSearch className="h-3.5 w-3.5" />
                参考面经 {retrievalItems.length}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isRetrievalOpen && "rotate-180")} />
              </button>
            )}
            {status === "completed" && onExportTranscript && (
              <Button type="button" variant="outline" size="sm" onClick={onExportTranscript}>
                导出面试问答（Markdown）
              </Button>
            )}
          </div>
        </div>
        {currentRoundItem?.description && <p className="mt-1 text-sm text-muted-foreground/80">{currentRoundItem.description}</p>}

        {/* 面试轮次 — Stepper-style, floats over content */}
        {interviewPlan && interviewPlan.plan.length > 0 && (
          <div className="relative mt-2 border-t border-border/40 pt-2">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/40"
              aria-expanded={isPlanOpen}
              aria-controls="mock-interview-plan-outline"
              onClick={() => {
                setIsRetrievalOpen(false);
                setIsPlanOpen((current) => !current);
              }}
            >
              <span className="text-sm font-medium">面试轮次</span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isPlanOpen && "rotate-180")} />
            </button>
            <AnimatePresence>
              {showBackdrop && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-20"
                    onClick={() => {
                      setIsPlanOpen(false);
                      setIsRetrievalOpen(false);
                    }}
                  />
                </>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {isPlanOpen && (
                <>
                  <motion.div
                    id="mock-interview-plan-outline"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                    className="absolute left-0 right-0 z-30 mt-2 max-h-[28rem] overflow-y-auto rounded-xl border bg-card p-4 shadow-xl"
                  >
                    <div className="space-y-0">
                      {interviewPlan.plan.map((item, index) => {
                        const isCurrent = item.round === currentRound;
                        const isPast = item.round < currentRound;
                        const isCoding = item.round === interviewPlan.total_rounds;
                        const isLast = index === interviewPlan.plan.length - 1;

                        return (
                          <div key={item.round} className="flex gap-3">
                            {/* Stepper indicator */}
                            <div className="flex flex-col items-center">
                              <div
                                className={cn(
                                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                                  isCurrent && "border-accent bg-accent text-white shadow-sm shadow-accent/30",
                                  isPast && "border-accent/40 bg-accent/10 text-accent",
                                  !isCurrent && !isPast && "border-border bg-muted/50 text-muted-foreground"
                                )}
                              >
                                {isPast ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : isCoding ? (
                                  <Code2 className="h-3.5 w-3.5" />
                                ) : (
                                  item.round
                                )}
                              </div>
                              {!isLast && (
                                <div className={cn(
                                  "w-0.5 flex-1 min-h-[1.5rem]",
                                  isPast ? "bg-accent/30" : "bg-border"
                                )} />
                              )}
                            </div>

                            {/* Content */}
                            <div className={cn("pb-4 pt-0.5 flex-1 min-w-0", isLast && "pb-1")}>
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "text-sm font-medium",
                                  isCurrent && "text-accent",
                                  isPast && "text-muted-foreground"
                                )}>
                                  {item.topic}
                                </span>
                                {isCurrent && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">当前</Badge>}
                                {isCoding && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">代码题</Badge>}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {isRetrievalOpen && (
                <motion.div
                  id="mock-interview-retrieval-panel"
                  role="dialog"
                  aria-label="参考面经列表"
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                  className="absolute left-0 right-0 z-30 mt-2 max-h-[28rem] overflow-y-auto rounded-xl border bg-card p-3 shadow-xl"
                >
                  <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">最多展示 5 条命中面经</div>
                  <div className="space-y-2">
                    {visibleRetrievalItems.map((item) => (
                      <button
                        key={`${item.interviewId}-${item.title}`}
                        type="button"
                        className="w-full rounded-lg border bg-background/70 p-3 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`查看面经：${item.title}`}
                        onClick={() => {
                          onOpenRetrievalDetail?.(item.interviewId);
                          setIsRetrievalOpen(false);
                        }}
                      >
                        <div className="text-sm font-medium">{item.title}</div>
                        {(() => {
                          const previewKey = previewSessionId ? `${previewSessionId}:${item.interviewId}` : String(item.interviewId);
                          const preview = retrievalPreviews[previewKey];
                          if (!preview) {
                            return null;
                          }
                          return <p className="mt-1 text-xs text-muted-foreground">{preview}</p>;
                        })()}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

export const InterviewSessionHeader = memo(InterviewSessionHeaderComponent);
