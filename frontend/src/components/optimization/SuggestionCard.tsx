import { useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Copy } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  useOptimizationStore,
  sectionLabels,
  issueTypeLabels,
  type SuggestionItem,
} from "../../store/optimizationStore";

interface SuggestionCardProps {
  suggestion: SuggestionItem;
}

const SuggestionCard = ({ suggestion }: SuggestionCardProps) => {
  const { activeSuggestionId, setActiveSuggestionId } = useOptimizationStore();
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActive = activeSuggestionId === suggestion.id;

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setActiveSuggestionId(suggestion.id);
    }, 50);
  }, [setActiveSuggestionId, suggestion.id]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setActiveSuggestionId(null);
    }, 50);
  }, [setActiveSuggestionId]);

  const handleCopySuggestion = async () => {
    try {
      await navigator.clipboard.writeText(suggestion.suggestion);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "p-4 rounded-lg border transition-all duration-200",
        isActive ? "border-primary/50 shadow-md bg-primary/5" : "border-border"
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-accent text-accent-foreground">
            {sectionLabels[suggestion.location.section] || suggestion.location.section}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {issueTypeLabels[suggestion.issue_type] || suggestion.issue_type}
        </span>
      </div>

      <h4 className="font-medium text-foreground mb-3">{suggestion.problem}</h4>

      <div className="space-y-2 p-3 rounded-lg bg-muted/30">
        {suggestion.original && (
          <div className="text-sm">
            <span className="text-muted-foreground font-medium">原文：</span>
            <p className="mt-1 text-red-500/80 line-through">{suggestion.original}</p>
          </div>
        )}
        <div className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground font-medium">
              {suggestion.original ? "建议修改为：" : "建议："}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopySuggestion}
              className="h-6 px-2 text-xs"
              aria-label="复制建议"
            >
              <Copy className="h-3 w-3 mr-1" aria-hidden="true" />
              复制
            </Button>
          </div>
          <p className="mt-1 text-green-600 dark:text-green-400">{suggestion.suggestion}</p>
        </div>
      </div>
    </motion.div>
  );
};

export default SuggestionCard;
