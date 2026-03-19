import { motion } from "framer-motion";
import { Briefcase, MapPin, GraduationCap, Clock, Code, CheckCircle, Star, ListTodo } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { useOptimizationStore } from "../../store/optimizationStore";

const JdParsedTab = () => {
  const jdData = useOptimizationStore((state) => state.jdData);

  if (!jdData) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Code className="h-8 w-8 mb-3" />
        <p className="text-sm">JD 解析数据不存在</p>
      </div>
    );
  }

  const { basicInfo, requirements } = jdData;

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* Basic Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            基本信息
          </h3>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {basicInfo.jobTitle && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">职位名称</p>
              <p className="text-sm font-medium">{basicInfo.jobTitle}</p>
            </div>
          )}
          {basicInfo.company && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">公司</p>
              <p className="text-sm font-medium">{basicInfo.company}</p>
            </div>
          )}
          {basicInfo.location && (
            <div className="flex items-start gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">工作地点</p>
                <p className="text-sm">{basicInfo.location}</p>
              </div>
            </div>
          )}
          {basicInfo.jobType && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">工作类型</p>
              <p className="text-sm">{basicInfo.jobType}</p>
            </div>
          )}
          {basicInfo.department && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">部门</p>
              <p className="text-sm">{basicInfo.department}</p>
            </div>
          )}
          {basicInfo.updateTime && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">更新时间</p>
              <p className="text-sm">{basicInfo.updateTime}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Requirements Card */}
      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            任职要求
          </h3>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {requirements.degree && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">学历要求</p>
              <p className="text-sm font-medium">{requirements.degree}</p>
            </div>
          )}
          {requirements.experience && (
            <div className="flex items-start gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">经验要求</p>
                <p className="text-sm">{requirements.experience}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tech Stack */}
      {requirements.techStack && requirements.techStack.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Code className="h-4 w-4 text-primary" />
              技术栈
            </h3>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {requirements.techStack.map((tech, index) => (
                <span
                  key={index}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-primary/10 text-primary"
                >
                  {tech}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Must Have */}
      {requirements.mustHave && requirements.mustHave.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              必备条件
            </h3>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {requirements.mustHave.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Nice to Have */}
      {requirements.niceToHave && requirements.niceToHave.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              加分项
            </h3>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {requirements.niceToHave.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Job Duties */}
      {requirements.jobDuties && requirements.jobDuties.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-primary" />
              岗位职责
            </h3>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {requirements.jobDuties.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground">{index + 1}.</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
};

export default JdParsedTab;
