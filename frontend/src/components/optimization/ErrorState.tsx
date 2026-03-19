import { motion } from "framer-motion";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { useOptimizationStore } from "../../store/optimizationStore";

const ErrorState = () => {
  const { error, reset } = useOptimizationStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="h-full"
    >
      <Card className="h-full flex flex-col border-destructive/50">
        <CardContent className="flex-1 flex flex-col items-center justify-center text-center py-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 mb-4">
            <AlertCircle className="h-7 w-7 text-destructive" />
          </div>

          <h3 className="text-lg font-semibold text-foreground mb-2">
            分析失败
          </h3>

          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            {error || "分析过程中出现未知错误，请稍后重试"}
          </p>

          <Button onClick={reset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            重新开始
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ErrorState;
