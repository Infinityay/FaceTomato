import { memo } from "react";
import type { InterviewData } from "@/types/interview";
import { motion as m } from "framer-motion";
import { Badge } from "../ui/badge";
import { StatusBadge } from "./StatusBadge";
import { useQuestionBankStore } from "@/store/questionBankStore";
import { cn } from "@/lib/utils";
import { Building, Calendar } from "lucide-react";

interface InterviewCardProps {
  item: InterviewData;
}

function InterviewCardInner({ item }: InterviewCardProps) {
  const navigateToDetail = useQuestionBankStore((s) => s.navigateToDetail);

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={() => navigateToDetail(item.id)}
      className="cursor-pointer"
    >
      <div
        className={cn(
          "flex h-full flex-col rounded-xl border bg-background p-4 transition-colors",
          "hover:bg-muted/50 hover:border-primary/20"
        )}
      >
        {/* Top: badges */}
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

        {/* Title */}
        <h3 className="mb-1.5 flex-1 text-sm font-medium leading-snug line-clamp-2">
          {item.title}
        </h3>

        {/* Bottom: meta */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.company && (
            <span className="flex items-center gap-1">
              <Building className="h-3 w-3" />
              {item.company}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {item.publish_time.slice(0, 10)}
          </span>
        </div>
      </div>
    </m.div>
  );
}

export const InterviewCard = memo(InterviewCardInner);
