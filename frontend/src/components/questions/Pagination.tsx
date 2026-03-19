import { useQuestionBankStore } from "@/store/questionBankStore";
import { motion as m } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination() {
  const { pagination, setPage } = useQuestionBankStore();
  const { page, totalPages, total } = pagination;

  if (totalPages <= 1) return null;

  // Generate page numbers: show max 7 buttons with ellipsis
  const getPageNumbers = (): (number | "ellipsis")[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | "ellipsis")[] = [1];

    if (page > 3) {
      pages.push("ellipsis");
    }

    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (page < totalPages - 2) {
      pages.push("ellipsis");
    }

    pages.push(totalPages);
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex items-center justify-between border-t pt-3">
      <span className="text-xs text-muted-foreground">
        共 {total} 条
      </span>
      <div className="flex items-center gap-1">
        <m.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors",
            page <= 1
              ? "cursor-not-allowed text-muted-foreground/40"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </m.button>

        {pageNumbers.map((p, idx) =>
          p === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="flex h-8 w-8 items-center justify-center text-xs text-muted-foreground"
            >
              ...
            </span>
          ) : (
            <m.button
              key={p}
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage(p)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors",
                p === page
                  ? "bg-primary font-medium text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {p}
            </m.button>
          )
        )}

        <m.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors",
            page >= totalPages
              ? "cursor-not-allowed text-muted-foreground/40"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </m.button>
      </div>
    </div>
  );
}
