import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "../ui/card";

interface LoadingStateProps {
  title?: string;
  description?: string;
  steps?: string[];
  fullHeight?: boolean;
  cardClassName?: string;
}

const defaultSteps = ["生成简历概览...", "分析各模块优化建议..."];

const LoadingState = ({
  title = "正在分析您的简历...",
  description = "AI 正在从多个维度评估您的简历，这可能需要几秒钟",
  steps = defaultSteps,
  fullHeight = true,
  cardClassName = "",
}: LoadingStateProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className={fullHeight ? "h-full" : ""}
    >
      <Card className={`flex flex-col ${fullHeight ? "h-full" : ""} ${cardClassName}`.trim()}>
        <CardContent className="flex flex-1 flex-col items-center justify-center px-6 pb-12 !pt-12 text-center sm:px-8 sm:pb-14 sm:!pt-14">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
          >
            <Loader2 className="h-8 w-8 text-primary" />
          </motion.div>

          <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>

          <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>

          {steps.length > 0 && (
            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
              {steps.map((step, index) => (
                <motion.div
                  key={`${step}-${index}`}
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1, repeat: Infinity, repeatType: "reverse", delay: index * 0.3 }}
                  className="flex items-center justify-center gap-2"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>{step}</span>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default LoadingState;
