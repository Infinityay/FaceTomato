import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

import { useOptimizationStore } from "../../store/optimizationStore";
import MatchScoreOverview from "./MatchScoreOverview";
import JdRequirementsAnalysis from "./JdRequirementsAnalysis";

const MatchReportTab = () => {
  const matchReport = useOptimizationStore((state) => state.matchReport);

  if (!matchReport) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-3" />
        <p className="text-sm">匹配度分析报告不存在</p>
        <p className="text-xs mt-1">请先输入 JD 并进行分析</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full"
    >
      {/* Left column - Score Overview (fixed) */}
      <div className="lg:col-span-1 lg:self-start">
        <MatchScoreOverview report={matchReport} />
      </div>

      {/* Right column - Requirements Analysis (scrollable) */}
      <div className="lg:col-span-2 lg:overflow-y-auto lg:max-h-full">
        <JdRequirementsAnalysis requirements={matchReport.requirements} />
      </div>
    </motion.div>
  );
};

export default MatchReportTab;
