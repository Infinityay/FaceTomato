import { motion } from "framer-motion";
import { Sparkles, FileText, Target } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "../ui/card";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { useOptimizationStore } from "../../store/optimizationStore";
import { useResumeStore } from "../../store/resumeStore";
import {
  extractJdData,
  getResumeOverview,
  getResumeSuggestions,
  getJdMatch,
  getJdOverview,
  getJdSuggestions,
} from "../../lib/api";
import { useRuntimeSettingsStore } from "../../store/runtimeSettingsStore";

const InputPhase = () => {
  const {
    jdText,
    jdData,
    setJdText,
    startAnalysis,
    setJdData,
    setOverview,
    setSuggestions,
    setSuggestionsError,
    setMatchReport,
    setError,
    setAnalysisComplete,
    setActiveTab,
  } = useOptimizationStore();
  const { parsedResume } = useResumeStore();
  const runtimeConfig = useRuntimeSettingsStore();

  const hasJd = jdText.trim().length > 0;

  const handleStartAnalysis = async () => {
    if (!parsedResume) return;

    startAnalysis();

    try {
      if (hasJd) {
        const normalizedJdText = jdText.trim();
        const resolvedJdData = jdData ?? (await extractJdData(normalizedJdText, runtimeConfig));
        if (!jdData) {
          setJdData(resolvedJdData);
        }
        setActiveTab("jdAnalysis");
        setAnalysisComplete();

        getJdOverview(parsedResume, normalizedJdText, resolvedJdData, runtimeConfig)
          .then(setOverview)
          .catch((err) => console.error("Overview failed:", err));

        getJdSuggestions(parsedResume, normalizedJdText, resolvedJdData, runtimeConfig)
          .then(setSuggestions)
          .catch((err) => {
            console.error("Suggestions failed:", err);
            setSuggestionsError(err instanceof Error ? err.message : "修改建议生成失败");
          });

        getJdMatch(parsedResume, normalizedJdText, resolvedJdData, runtimeConfig)
          .then(setMatchReport)
          .catch((err) => console.error("Match failed:", err));
      } else {
        // No-JD mode: fetch generic overview and suggestions in parallel
        getResumeOverview(parsedResume, runtimeConfig)
          .then((overview) => {
            setOverview(overview);
            setAnalysisComplete();
          })
          .catch((err) => console.error("Overview failed:", err));

        getResumeSuggestions(parsedResume, runtimeConfig)
          .then(setSuggestions)
          .catch((err) => {
            console.error("Suggestions failed:", err);
            setSuggestionsError(err instanceof Error ? err.message : "修改建议生成失败");
          });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "分析过程中出现错误";
      setError(message);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="h-full"
    >
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">输入岗位 JD（可选）</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            推荐填写 JD 以获得更精准的匹配分析，不填写则进行通用简历优化
          </p>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col">
          <Textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="粘贴目标岗位的职位描述 (JD)，包括岗位职责、任职要求等..."
            className="flex-1 min-h-[300px] resize-none"
          />
          {hasJd && (
            <div className="mt-3 flex items-center gap-2 text-sm text-primary">
              <Target className="h-4 w-4" />
              <span>将进行 JD 匹配分析，生成针对性优化建议</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="pt-4 border-t">
          <Button
            onClick={handleStartAnalysis}
            className="w-full gap-2"
            size="lg"
          >
            <Sparkles className="h-4 w-4" />
            {hasJd ? "开始匹配分析" : "开始通用分析"}
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
};

export default InputPhase;
