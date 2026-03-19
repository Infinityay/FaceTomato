import { motion } from "framer-motion";
import { ArrowRight, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ResumeRequiredPromptProps {
  description: string;
}

export function ResumeRequiredPrompt({ description }: ResumeRequiredPromptProps) {
  const navigate = useNavigate();

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex h-full items-center justify-center">
      <Card className="max-w-md text-center">
        <CardContent className="!py-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <FileText className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">请先上传简历</h3>
          <p className="mb-6 text-sm text-muted-foreground">{description}</p>
          <Button onClick={() => navigate("/resume")} className="gap-2">
            前往简历解析
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
