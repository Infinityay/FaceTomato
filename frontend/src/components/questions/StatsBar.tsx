import { useQuestionBankStore } from "@/store/questionBankStore";

export function StatsBar() {
  const stats = useQuestionBankStore((s) => s.stats);

  if (!stats) return null;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground">{stats.total}</span> 条面经
      </span>
      <span className="text-border">|</span>
      <span>
        <span className="font-semibold text-green-600 dark:text-green-400">{stats.offer_count}</span> Offer
      </span>
      <span className="text-border">|</span>
      <span>
        <span className="font-semibold text-foreground">{stats.companies_count}</span> 家公司
      </span>
    </div>
  );
}
