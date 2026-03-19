import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Briefcase, Target, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { useOptimizationStore } from "../../store/optimizationStore";

const OverviewTab = () => {
  const { overview, matchReport } = useOptimizationStore();

  if (!overview) return null;

  const { resume_summary, role_personas } = overview;

  // JD mode: hide role personas (user already specified target position)
  const hasJd = matchReport !== null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* Resume Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            简历概览
          </h3>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Headline */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-lg font-medium text-foreground">
              {resume_summary.headline}
            </p>
          </div>

          {/* Highlights */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              核心亮点
            </h4>
            <ul className="space-y-1.5">
              {resume_summary.highlights.map((highlight, index) => (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="text-green-500 mt-0.5">+</span>
                  <span>{highlight}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          {/* Risks */}
          {resume_summary.risks.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                待改进
              </h4>
              <ul className="space-y-1.5">
                {resume_summary.risks.map((risk, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span className="text-amber-500 mt-0.5">!</span>
                    <span>{risk}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Personas Card - only show when no JD (general mode) */}
      {!hasJd && role_personas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              适合的岗位画像
            </h3>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {role_personas.map((persona, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className="p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-foreground">{persona.role}</h4>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      #{index + 1}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {persona.fit_reason}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 text-green-600 dark:text-green-400">
                      <TrendingUp className="h-3 w-3" />
                      {persona.best_scene}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      {persona.gap_tip}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
};

export default OverviewTab;
