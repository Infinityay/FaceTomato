import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { useOptimizationStore } from "../../store/optimizationStore";
import SuggestionCard from "./SuggestionCard";

const SuggestionsTab = () => {
  const { suggestions } = useOptimizationStore();

  if (!suggestions) return null;

  // Flatten all suggestions and sort by priority
  const allSuggestions = suggestions.sections
    .flatMap((section) => section.suggestions)
    .sort((a, b) => a.priority - b.priority);

  const totalCount = allSuggestions.length;

  if (totalCount === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">
          简历状态良好
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          我们没有发现需要改进的地方，您的简历结构清晰、信息完整
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
      className="space-y-3"
    >
      {/* Suggestion cards */}
      {allSuggestions.map((suggestion, index) => (
        <motion.div
          key={suggestion.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <SuggestionCard suggestion={suggestion} />
        </motion.div>
      ))}
    </motion.div>
  );
};

export default SuggestionsTab;
