import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import ResumeParsingState from "../components/resume/ResumeParsingState";
import { ResumeRequiredPrompt } from "../components/resume/ResumeRequiredPrompt";
import { useResumeStore } from "../store/resumeStore";
import { clearOptimizationStore, useOptimizationStore } from "../store/optimizationStore";
import {
  InputPhase,
  AnalysisPhase,
  LoadingState,
  ErrorState,
} from "../components/optimization";
import ResumeDisplayPanel from "../components/optimization/ResumeDisplayPanel";

const DiagnosisPage = () => {
  const navigate = useNavigate();
  const { parsedResume, parseStatus } = useResumeStore();
  const { status } = useOptimizationStore();

  // Clear optimization data when resume parsing starts
  useEffect(() => {
    if (parseStatus === "parsing") {
      clearOptimizationStore();
    }
  }, [parseStatus]);

  // Parsing in progress: show parsing prompt
  if (parseStatus === "parsing") {
    return <ResumeParsingState actionLabel="查看解析进度" onAction={() => navigate("/resume")} />;
  }

  // No resume: show prompt
  if (!parsedResume) {
    return <ResumeRequiredPrompt description={'请先在"简历解析"页面上传并解析您的简历'} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full gap-6"
    >
      {/* Left panel: Resume display */}
      <div className="w-1/2 h-full overflow-hidden">
        <ResumeDisplayPanel data={parsedResume} />
      </div>

      {/* Right panel: Input/Loading/Analysis/Error */}
      <div className="w-1/2 h-full overflow-hidden">
        <AnimatePresence mode="wait">
          {status === "input" && <InputPhase key="input" />}
          {status === "loading" && (
            <LoadingState
              key="loading"
              title="正在分析您的简历..."
              description="AI 正在从多个维度评估您的简历，这可能需要几秒钟"
              steps={["生成简历概览...", "分析各模块优化建议..."]}
            />
          )}
          {status === "analysis" && <AnalysisPhase key="analysis" />}
          {status === "error" && <ErrorState key="error" />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default DiagnosisPage;
