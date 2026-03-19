import { motion, AnimatePresence } from "framer-motion";
import { LayoutGrid, ListChecks, RotateCcw, Target, FileJson, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { useOptimizationStore } from "../../store/optimizationStore";
import OverviewTab from "./OverviewTab";
import SuggestionsTab from "./SuggestionsTab";
import MatchReportTab from "./MatchReportTab";
import JdParsedTab from "./JdParsedTab";

// Loading placeholder component
const LoadingPlaceholder = ({ message }: { message: string }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="flex flex-col items-center justify-center py-16 text-muted-foreground"
  >
    <Loader2 className="h-8 w-8 mb-3 animate-spin" />
    <p className="text-sm">{message}</p>
  </motion.div>
);

const AnalysisPhase = () => {
  const {
    activeTab,
    setActiveTab,
    reset,
    suggestions,
    suggestionsStatus,
    suggestionsError,
    overview,
    jdData,
    matchReport,
  } = useOptimizationStore();

  const suggestionCount = suggestions?.sections.flatMap((section) => section.suggestions).length ?? 0;

  // Check if JD mode (has jdData)
  const hasJdData = jdData !== null;
  const hasMatchReport = matchReport !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col"
    >
      {/* Tab navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 p-1 rounded-lg bg-muted">
          {/* JD Analysis Tab - first when JD is provided */}
          {hasJdData && (
            <button
              onClick={() => setActiveTab("jdAnalysis")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === "jdAnalysis"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileJson className="h-4 w-4" />
              JD解析
            </button>
          )}
          <button
            onClick={() => setActiveTab("overview")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === "overview"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            概览
          </button>
          <button
            onClick={() => setActiveTab("suggestions")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === "suggestions"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ListChecks className="h-4 w-4" />
            修改建议
            {suggestionCount > 0 && (
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-muted-foreground/20 text-muted-foreground">
                {suggestionCount}
              </span>
            )}
          </button>
          {/* Match Report Tab - only show when JD is provided */}
          {hasJdData && (
            <button
              onClick={() => setActiveTab("matchReport")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === "matchReport"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Target className="h-4 w-4" />
              匹配度
              {hasMatchReport && (
                <span className={cn(
                  "ml-1 text-xs px-1.5 py-0.5 rounded-full",
                  "bg-accent/20 text-accent"
                )}>
                  {Math.round(matchReport.percent * 100)}%
                </span>
              )}
            </button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="gap-1.5 text-muted-foreground"
        >
          <RotateCcw className="h-4 w-4" />
          重新分析
        </Button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <AnimatePresence mode="wait">
          {activeTab === "jdAnalysis" && hasJdData && <JdParsedTab key="jdAnalysis" />}
          {activeTab === "overview" && (
            overview ? <OverviewTab key="overview" /> : <LoadingPlaceholder key="overview-loading" message="正在生成概览分析..." />
          )}
          {activeTab === "suggestions" && (
            suggestions ? (
              <SuggestionsTab key="suggestions" />
            ) : suggestionsStatus === "error" ? (
              <div key="suggestions-error" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {suggestionsError ?? "修改建议生成失败，请稍后重试。"}
              </div>
            ) : (
              <LoadingPlaceholder key="suggestions-loading" message="正在生成修改建议..." />
            )
          )}
          {activeTab === "matchReport" && hasJdData && (
            hasMatchReport ? <MatchReportTab key="matchReport" /> : <LoadingPlaceholder key="match-loading" message="正在分析匹配度..." />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default AnalysisPhase;
