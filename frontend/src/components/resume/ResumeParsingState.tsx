import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ResumeParsingStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

const ResumeParsingState = ({
  title = "正在解析简历",
  description = "请稍候，系统正在提取并结构化您的简历内容",
  actionLabel,
  onAction,
  compact = false,
}: ResumeParsingStateProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex items-center justify-center", compact ? "h-full p-6" : "h-full")}
    >
      <Card className={cn("text-center", compact ? "w-full border-0 shadow-none bg-transparent" : "max-w-md")}>
        <CardContent className={cn(compact ? "py-6" : "!py-10")}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">{title}</h3>
          <p className="mb-3 text-sm text-muted-foreground">{description}</p>
          {actionLabel && onAction ? (
            <Button variant="outline" onClick={onAction} className="gap-2">
              {actionLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ResumeParsingState;
