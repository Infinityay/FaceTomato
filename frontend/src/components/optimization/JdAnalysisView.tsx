import { motion } from "framer-motion";
import { useOptimizationStore } from "../../store/optimizationStore";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Briefcase, GraduationCap, MapPin, Building, Tag, Check, Star, ClipboardList } from "lucide-react";

// Helper component for displaying a field in the info cards
const InfoField = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | undefined }) => {
  if (!value) return null;
  return (
    <div className="flex items-start text-sm">
      <div className="flex items-center gap-2 w-24 text-muted-foreground shrink-0">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-medium">{value}</span>
    </div>
  );
};

// Helper component for displaying a list of items as badges
const InfoList = ({ icon, label, items }: { icon: React.ReactNode; label: string; items: string[] | undefined }) => {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex items-start text-sm">
      <div className="flex items-center gap-2 w-24 text-muted-foreground shrink-0 mt-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <Badge key={index} variant="secondary" className="font-normal">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
};


const JdAnalysisView = () => {
  const { jdData } = useOptimizationStore();

  if (!jdData) {
    // Show a loading/placeholder state while data is being fetched
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>正在解析 JD...</p>
      </div>
    );
  }

  const { basicInfo, requirements } = jdData;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoField icon={<Briefcase className="h-4 w-4" />} label="职位名称" value={basicInfo.jobTitle} />
          <InfoField icon={<Building className="h-4 w-4" />} label="公司" value={basicInfo.company} />
          <InfoField icon={<MapPin className="h-4 w-4" />} label="地点" value={basicInfo.location} />
          <InfoField icon={<Tag className="h-4 w-4" />} label="工作类型" value={basicInfo.jobType} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">任职要求</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoField icon={<GraduationCap className="h-4 w-4" />} label="学历要求" value={requirements.degree} />
          <InfoField icon={<Briefcase className="h-4 w-4" />} label="经验要求" value={requirements.experience} />
          <InfoList icon={<Tag className="h-4 w-4" />} label="技术栈" items={requirements.techStack} />
          <InfoList icon={<Check className="h-4 w-4" />} label="必备条件" items={requirements.mustHave} />
          <InfoList icon={<Star className="h-4 w-4" />} label="加分项" items={requirements.niceToHave} />
          <InfoList icon={<ClipboardList className="h-4 w-4" />} label="岗位职责" items={requirements.jobDuties} />
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default JdAnalysisView;
