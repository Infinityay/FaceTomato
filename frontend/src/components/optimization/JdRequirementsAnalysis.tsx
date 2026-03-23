
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, CheckCircle2, AlertTriangle, XCircle, FileText, Sparkles } from "lucide-react";

import { cn } from "../../lib/utils";
import { Card, CardContent, CardHeader } from "../ui/card";
import { type JdRequirement } from "../../store/optimizationStore";
import { useResumeStore } from "../../store/resumeStore";
import EvidenceDisplay from "./EvidenceDisplay";
import type { ResumeData } from "../../types/resume";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Status configuration
const statusConfig = {
  matched: {
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    label: "已匹配",
  },
  partial: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    label: "部分匹配",
  },
  missing: {
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    label: "缺失",
  },
};

// Category labels
const categoryLabels: Record<string, string> = {
  mustHave: "硬性要求",
  niceToHave: "加分项",
  degree: "学历要求",
  experience: "经验要求",
  techStack: "技术栈",
  jobDuties: "岗位职责",
};

interface RequirementItemProps {
  item: JdRequirement;
  index: number;
  resumeData: ResumeData | null;
}

const RequirementItem: React.FC<RequirementItemProps> = ({ item, index, resumeData }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const config = statusConfig[item.status] || statusConfig.missing;
  const Icon = config.icon;
  const hasCorrection = item.correction != null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="rounded-lg border bg-card/50 overflow-hidden"
    >
      {/* Header - accessible button */}
      <button
        type="button"
        aria-expanded={isOpen}
        className="w-full text-left flex items-start gap-3 p-3 hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={cn("mt-0.5 p-1 rounded", config.bgColor)}>
          <Icon className={cn("h-4 w-4", config.color)} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{item.text}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("text-xs px-1.5 py-0.5 rounded", config.bgColor, config.color)}>
              {config.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {categoryLabels[item.category] || item.category}
            </span>
            {/* Correction indicator */}
            {hasCorrection && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>已修正</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="start">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">二次校验修正</p>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">原始分数:</span>
                        <span className="line-through text-red-500">
                          {item.correction!.original_score}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-green-500 font-medium">{item.score}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.correction!.reason}
                      </p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0 mt-1",
            isOpen && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 border-t bg-muted/20">
              <div className="pt-3 space-y-3">
                {/* Rationale */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    AI 分析
                  </p>
                  <p className="text-sm text-foreground">
                    {item.rationale || "暂无分析"}
                  </p>
                </div>

                {/* Evidence Display */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    证据来源
                  </p>
                  <EvidenceDisplay
                    evidencePaths={item.evidence || []}
                    requirementText={item.text}
                    resumeData={resumeData}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface JdRequirementsAnalysisProps {
  requirements: JdRequirement[];
}

const JdRequirementsAnalysis: React.FC<JdRequirementsAnalysisProps> = ({
  requirements,
}) => {
  // Get parsed resume data from store
  const parsedResume = useResumeStore((state) => state.parsedResume);

  // Group requirements by status for summary
  const summary = React.useMemo(() => {
    const counts = { matched: 0, partial: 0, missing: 0 };
    requirements.forEach((r) => {
      if (r.status in counts) {
        counts[r.status as keyof typeof counts]++;
      }
    });
    return counts;
  }, [requirements]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            匹配分析
          </h3>
          <div className="flex items-center gap-3 text-xs" aria-label="匹配统计">
            <span className="flex items-center gap-1" title={`${summary.matched} 项已匹配`}>
              <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
              <span>{summary.matched}</span>
            </span>
            <span className="flex items-center gap-1" title={`${summary.partial} 项部分匹配`}>
              <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
              <span>{summary.partial}</span>
            </span>
            <span className="flex items-center gap-1" title={`${summary.missing} 项缺失`}>
              <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
              <span>{summary.missing}</span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {requirements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            暂无要求分析数据
          </p>
        ) : (
          requirements.map((item, index) => (
            <RequirementItem key={item.id} item={item} index={index} resumeData={parsedResume} />
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default JdRequirementsAnalysis;
