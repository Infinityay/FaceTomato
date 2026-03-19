import type { InterviewResult } from "@/types/interview";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";

const resultStyles: Record<InterviewResult, string> = {
  offer: "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30",
  fail: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
  null: "",
};

const resultLabels: Record<InterviewResult, string> = {
  offer: "Offer",
  fail: "未通过",
  null: "",
};

interface StatusBadgeProps {
  result: InterviewResult;
  className?: string;
}

export function StatusBadge({ result, className }: StatusBadgeProps) {
  if (result === "null") return null;
  return (
    <Badge className={cn(resultStyles[result], className)}>
      {resultLabels[result]}
    </Badge>
  );
}
