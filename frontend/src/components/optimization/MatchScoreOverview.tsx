import { motion } from "framer-motion";
import { Target } from "lucide-react";

import { Card, CardContent, CardHeader } from "../ui/card";
import { CircularProgress } from "../ui/circular-progress";
import { Progress } from "../ui/progress";
import type { MatchReport } from "../../store/optimizationStore";

// Category labels for display
const categoryLabels: Record<string, string> = {
  mustHave: "硬性要求",
  niceToHave: "加分项",
  degree: "学历要求",
  experience: "经验要求",
  techStack: "技术栈",
  jobDuties: "岗位职责",
};

interface MatchScoreOverviewProps {
  report: MatchReport;
}

const MatchScoreOverview = ({ report }: MatchScoreOverviewProps) => {
  const percentValue = Math.round(report.percent * 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          匹配度
        </h3>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Circular Progress - compact */}
        <div className="flex flex-col items-center gap-2">
          <CircularProgress
            value={percentValue}
            size={100}
            strokeWidth={10}
            color="hsl(var(--fo-accent))"
          />
          <p className="text-xs text-muted-foreground text-center">
            {report.headline}
          </p>
        </div>

        {/* Score Breakdown - compact */}
        {report.scoreBreakdown && report.scoreBreakdown.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              分项得分
            </h4>
            {report.scoreBreakdown
              .sort((a, b) => b.weight - a.weight)  // 按权重排序，高权重在前
              .map((item, index) => {
              // score 已经是 0-1 的比例
              const percent = item.score * 100;
              // 0% 时显示最小进度以保持视觉存在感
              const displayPercent = percent === 0 ? 3 : percent;

              return (
                <motion.div
                  key={item.category}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="space-y-0.5"
                >
                  <div className="text-xs">
                    <span className="text-muted-foreground">
                      {item.label || categoryLabels[item.category] || item.category}
                    </span>
                  </div>
                  <Progress
                    value={displayPercent}
                    className="h-1.5"
                    indicatorClassName="bg-primary"
                  />
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MatchScoreOverview;
