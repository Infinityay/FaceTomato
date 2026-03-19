import { useQuestionBankStore } from "@/store/questionBankStore";
import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { StatsBar } from "@/components/questions/StatsBar";
import { QuestionFilters } from "@/components/questions/QuestionFilters";
import { InterviewCard } from "@/components/questions/InterviewCard";
import { SkeletonGrid } from "@/components/questions/SkeletonGrid";
import { Pagination } from "@/components/questions/Pagination";
import { QuestionDetailView } from "@/components/questions/QuestionDetailView";

const QuestionBankPage = () => {
  const interviews = useQuestionBankStore((s) => s.interviews);
  const hasFetched = useQuestionBankStore((s) => s.hasFetched);
  const error = useQuestionBankStore((s) => s.error);
  const selectedId = useQuestionBankStore((s) => s.selectedId);
  const filters = useQuestionBankStore((s) => s.filters);
  const page = useQuestionBankStore((s) => s.pagination.page);
  const total = useQuestionBankStore((s) => s.pagination.total);
  const fetchInterviews = useQuestionBankStore((s) => s.fetchInterviews);
  const fetchStats = useQuestionBankStore((s) => s.fetchStats);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews, page, filters]);

  return (
    <div className="flex h-full flex-col space-y-2">
      {/* Compact header: title + inline stats */}
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">面经题库</h1>
        <StatsBar />
      </header>

      {/* Search & filters */}
      <QuestionFilters />

      {/* Grid content area */}
      <div className="flex-1 overflow-y-auto pr-1">
        {!hasFetched ? (
          <SkeletonGrid />
        ) : error ? (
          <div className="py-16 text-center text-destructive">{error}</div>
        ) : interviews.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            {total === 0 ? (
              <>
                <h3 className="font-medium">暂无面经数据</h3>
                <p className="text-sm">后端题库为空，请先导入或生成数据</p>
              </>
            ) : (
              <>
                <h3 className="font-medium">未找到结果</h3>
                <p className="text-sm">尝试调整筛选条件</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {interviews.map((item) => (
              <InterviewCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      <Pagination />

      {/* Fullscreen detail overlay */}
      <AnimatePresence>
        {selectedId && <QuestionDetailView />}
      </AnimatePresence>
    </div>
  );
};

export default QuestionBankPage;
