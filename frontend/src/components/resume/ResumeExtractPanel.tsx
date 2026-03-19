import { useState, useCallback } from "react";
import {
  User,
  GraduationCap,
  Briefcase,
  FolderKanban,
  Plus,
  X,
  Trash2,
  ChevronRight,
  AlertTriangle,
  BookOpen,
  Award,
} from "lucide-react";
import type {
  ResumeData,
  ResumeParseMeta,
  BasicInfo,
  WorkExperienceItem,
  EducationItem,
  ProjectItem,
  AcademicAchievementItem,
} from "../../types/resume";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import ResumeParsingState from "./ResumeParsingState";
import { Textarea } from "../../components/ui/textarea";

interface ResumeExtractPanelProps {
  data: ResumeData | null;
  onChange: (data: ResumeData) => void;
  isLoading?: boolean;
  error?: string | null;
  parseMeta?: ResumeParseMeta | null;
}

// 可编辑输入框包装
const EditableField = ({
  label,
  value,
  onChange,
  placeholder,
  className
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) => (
  <div className={cn("space-y-1.5", className)}>
    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">{label}</label>
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);

// 多行编辑框包装
const TextareaField = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) => (
  <div className="space-y-1.5">
    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">{label}</label>
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
    />
  </div>
);

// 编辑对话框 - Folo Modal Style
const EditDialog = ({
  title,
  isOpen,
  onClose,
  onDelete,
  children,
}: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm dark:bg-black/60"
        onClick={onClose}
      />
      {/* 对话框 */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-theme-background shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between border-b border-border bg-sidebar/50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <div className="flex items-center gap-2">
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="删除"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4 scrollbar-thin">
          {children}
        </div>
        <div className="border-t border-border bg-sidebar/30 px-6 py-3 flex justify-end dark:border-zinc-800 dark:bg-zinc-900/50">
          <Button onClick={onClose} className="px-6">完成</Button>
        </div>
      </motion.div>
    </div>
  );
};

// 基本信息编辑
const BasicInfoEditor = ({
  data,
  onChange,
}: {
  data: BasicInfo;
  onChange: (data: BasicInfo) => void;
}) => {
  const updateField = <K extends keyof BasicInfo>(
    field: K,
    value: BasicInfo[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="grid grid-cols-2 gap-4">
        <EditableField
          label="姓名"
          value={data.name}
          onChange={(v) => updateField("name", v)}
          placeholder="请输入姓名"
        />
        <EditableField
          label="性别"
          value={data.gender}
          onChange={(v) => updateField("gender", v)}
          placeholder="男/女"
        />
        <EditableField
          label="手机号"
          value={data.phoneNumber}
          onChange={(v) => updateField("phoneNumber", v)}
          placeholder="请输入手机号"
        />
        <EditableField
          label="邮箱"
          value={data.personalEmail}
          onChange={(v) => updateField("personalEmail", v)}
          placeholder="请输入邮箱"
        />
        <div className="col-span-2 grid grid-cols-3 gap-4">
          <EditableField
            label="年龄"
            value={data.age}
            onChange={(v) => updateField("age", v)}
            placeholder="请输入年龄"
          />
          <EditableField
            label="出生年月"
            value={data.born}
            onChange={(v) => updateField("born", v)}
            placeholder="如 1998-05"
          />
          <EditableField
            label="籍贯"
            value={data.placeOfOrigin}
            onChange={(v) => updateField("placeOfOrigin", v)}
            placeholder="省份城市"
          />
        </div>
        <div className="col-span-2 grid grid-cols-3 gap-4">
          <EditableField
            label="现居地"
            value={data.currentLocation}
            onChange={(v) => updateField("currentLocation", v)}
            placeholder="当前所在城市"
          />
          <EditableField
            label="期望岗位"
            value={data.desiredPosition || ""}
            onChange={(v) => updateField("desiredPosition", v)}
            placeholder="如：算法工程师"
          />
          <EditableField
            label="期望地点"
            value={data.desiredLocation?.join("、") || ""}
            onChange={(v) => updateField("desiredLocation", v.split(/[,，、\s]+/).filter(Boolean))}
            placeholder="多个用逗号分隔"
          />
        </div>
    </div>
  );
};

// 教育经历卡片
const EducationCard = ({
  item,
  onClick,
}: {
  item: EducationItem;
  onClick: () => void;
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 5 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.005 }}
    whileTap={{ scale: 0.995 }}
    className={cn(
      "group relative cursor-pointer rounded-lg border p-4 transition-all duration-200",
      "border-border bg-theme-background hover:border-accent/30 hover:shadow-sm",
      "dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-800 dark:hover:border-accent/40"
    )}
    onClick={onClick}
  >
    {/* 头部：学校 + 时间 */}
    <div className="flex items-start justify-between mb-2">
      <h4 className="font-semibold text-sm text-foreground group-hover:text-accent transition-colors">
        {item.school || "未填写学校"}
      </h4>
      <div className="text-xs text-muted-foreground font-mono bg-sidebar/50 px-2 py-1 rounded dark:bg-zinc-800 dark:text-zinc-400 shrink-0 ml-2">
        {item.period.startDate || "?"} ~ {item.period.endDate || "?"}
      </div>
    </div>
    {/* 详细信息 */}
    <div className="space-y-1">
      {(item.degreeLevel || item.major) && (
        <p className="text-xs text-muted-foreground">
          {[item.degreeLevel, item.major].filter(Boolean).join(" · ")}
        </p>
      )}
      {item.department && (
        <p className="text-xs text-muted-foreground/80">
          {item.department}
        </p>
      )}
      {(item.gpa || item.ranking) && (
        <p className="text-xs text-muted-foreground">
          {[item.gpa && `GPA: ${item.gpa}`, item.ranking && `排名: ${item.ranking}`].filter(Boolean).join(" · ")}
        </p>
      )}
      {item.educationDescription && (
        <p className="text-xs text-foreground/70 mt-2 leading-relaxed line-clamp-3">
          {item.educationDescription}
        </p>
      )}
    </div>
    <ChevronRight className="absolute right-3 top-4 h-4 w-4 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
  </motion.div>
);

// 工作经历卡片
const WorkCard = ({
  item,
  onClick,
}: {
  item: WorkExperienceItem;
  onClick: () => void;
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 5 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.005 }}
    whileTap={{ scale: 0.995 }}
    className={cn(
      "group relative cursor-pointer rounded-lg border p-4 transition-all duration-200",
      "border-border bg-theme-background hover:border-accent/30 hover:shadow-sm",
      "dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-800 dark:hover:border-accent/40"
    )}
    onClick={onClick}
  >
    {/* 头部：标题 + 时间 */}
    <div className="flex items-start justify-between mb-2">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold text-sm text-foreground group-hover:text-accent transition-colors">
          {item.title || item.position || "未填写工作标题"}
        </h4>
        {item.internship === 1 && (
          <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
            实习
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground font-mono bg-sidebar/50 px-2 py-1 rounded dark:bg-zinc-800 dark:text-zinc-400 shrink-0 ml-2">
        {item.employmentPeriod.startDate || "?"} ~ {item.employmentPeriod.endDate || "?"}
      </div>
    </div>
    {/* 详细信息 */}
    <div className="space-y-1">
      {(item.companyName || item.position) && (
        <p className="text-xs text-muted-foreground font-medium">
          {[item.companyName, item.position].filter(Boolean).join(" · ")}
        </p>
      )}
      {item.jobDescription && (
        <p className="text-xs text-foreground/70 mt-2 leading-relaxed line-clamp-3">
          {item.jobDescription}
        </p>
      )}
    </div>
    <ChevronRight className="absolute right-3 top-4 h-4 w-4 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
  </motion.div>
);

// 项目经历卡片
const ProjectCard = ({
  item,
  onClick,
}: {
  item: ProjectItem;
  onClick: () => void;
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 5 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.005 }}
    whileTap={{ scale: 0.995 }}
    className={cn(
      "group relative cursor-pointer rounded-lg border p-4 transition-all duration-200",
      "border-border bg-theme-background hover:border-accent/30 hover:shadow-sm",
      "dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-800 dark:hover:border-accent/40"
    )}
    onClick={onClick}
  >
    {/* 头部：项目名 + 时间 */}
    <div className="flex items-start justify-between mb-2">
      <h4 className="font-semibold text-sm text-foreground group-hover:text-accent transition-colors">
        {item.projectName || "未填写项目"}
      </h4>
      <div className="text-xs text-muted-foreground font-mono bg-sidebar/50 px-2 py-1 rounded dark:bg-zinc-800 dark:text-zinc-400 shrink-0 ml-2">
        {item.projectPeriod.startDate || "?"} ~ {item.projectPeriod.endDate || "?"}
      </div>
    </div>
    {/* 详细信息 */}
    <div className="space-y-1">
      {(item.role || item.companyOrOrganization) && (
        <p className="text-xs text-muted-foreground">
          {[item.role, item.companyOrOrganization].filter(Boolean).join(" · ")}
        </p>
      )}
      {item.projectDescription && (
        <p className="text-xs text-foreground/70 mt-2 leading-relaxed line-clamp-3">
          {item.projectDescription}
        </p>
      )}
    </div>
    <ChevronRight className="absolute right-3 top-4 h-4 w-4 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
  </motion.div>
);

// 学术成果卡片
const AcademicCard = ({
  item,
  onClick,
}: {
  item: AcademicAchievementItem;
  onClick: () => void;
}) => {
  const typeMap: Record<string, string> = {
    paper: "论文",
    patent: "专利",
    award: "学术奖项",
    thesis: "毕业论文",
    grant: "科研基金",
    research: "科研项目",
  };

  const statusMap: Record<string, { label: string; color: string }> = {
    under_review: { label: "Under Review", color: "bg-yellow-500/10 text-yellow-600 ring-yellow-500/20" },
    accepted: { label: "Accepted", color: "bg-green-500/10 text-green-600 ring-green-500/20" },
    published: { label: "Published", color: "bg-blue-500/10 text-blue-600 ring-blue-500/20" },
    major_revision: { label: "Major Revision", color: "bg-orange-500/10 text-orange-600 ring-orange-500/20" },
    minor_revision: { label: "Minor Revision", color: "bg-amber-500/10 text-amber-600 ring-amber-500/20" },
  };

  // 只有论文和毕业论文类型才显示状态
  const showStatus = item.status && (item.type === "paper" || item.type === "thesis");
  const statusInfo = item.status ? statusMap[item.status] : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      className={cn(
        "group relative cursor-pointer rounded-lg border p-3 transition-all duration-200",
        "border-border bg-theme-background hover:border-accent/30 hover:shadow-sm",
        "dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-800 dark:hover:border-accent/40"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-1.5">
        <h4 className="font-semibold text-sm text-foreground group-hover:text-accent transition-colors line-clamp-1">
          {item.title || "未填写标题"}
        </h4>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {showStatus && statusInfo && (
            <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1", statusInfo.color)}>
              {statusInfo.label}
            </span>
          )}
          {item.type && (
            <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent ring-1 ring-accent/20">
              {typeMap[item.type] || item.type}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-0.5">
        {(item.venue || item.date) && (
          <p className="text-xs text-muted-foreground">
            {[item.venue, item.date].filter(Boolean).join(" · ")}
          </p>
        )}
        {item.description && (
          <p className="text-xs text-foreground/70 line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
      <ChevronRight className="absolute right-2 top-3 h-4 w-4 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
    </motion.div>
  );
};

// 荣誉奖项卡片
const RewardCard = ({
  reward,
  onClick,
}: {
  reward: string;
  onClick: () => void;
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 5 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.005 }}
    whileTap={{ scale: 0.995 }}
    className={cn(
      "group relative cursor-pointer rounded-lg border p-3 transition-all duration-200",
      "border-border bg-theme-background hover:border-accent/30 hover:shadow-sm",
      "dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-800 dark:hover:border-accent/40"
    )}
    onClick={onClick}
  >
    <div className="flex items-start gap-2">
      <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
      <span className="text-sm text-foreground">{reward || "未填写荣誉"}</span>
    </div>
    <ChevronRight className="absolute right-2 top-3 h-4 w-4 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
  </motion.div>
);

// 荣誉奖项区域
const RewardsSection = ({
  rewards,
  onAdd,
  onEdit,
}: {
  rewards: string[];
  onAdd?: () => void;
  onEdit?: (index: number) => void;
}) => {
  return (
    <section>
      <SectionHeader title="个人荣誉" icon={Award} onAdd={onAdd} />
      <div className="space-y-2">
        <AnimatePresence>
          {(!rewards || rewards.length === 0) ? (
            <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              暂无个人荣誉
            </div>
          ) : (
            rewards.map((reward, index) => (
              <RewardCard
                key={index}
                reward={reward}
                onClick={() => onEdit?.(index)}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

// Section 标题
const SectionHeader = ({
  title,
  icon: Icon,
  onAdd,
}: {
  title: string;
  icon: React.ElementType;
  onAdd?: () => void;
}) => (
  <div className="flex items-center justify-between py-2 mb-2">
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/20">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-semibold text-foreground tracking-tight">{title}</span>
    </div>
    {onAdd && (
      <Button
        variant="ghost"
        size="icon"
        onClick={onAdd}
        className="h-7 w-7 text-muted-foreground hover:text-accent hover:bg-accent/10"
        title="添加"
      >
        <Plus className="h-4 w-4" />
      </Button>
    )}
  </div>
);

// 主组件
export const ResumeExtractPanel = ({
  data,
  onChange,
  isLoading = false,
  error = null,
  parseMeta = null,
}: ResumeExtractPanelProps) => {
  const [editingEducation, setEditingEducation] = useState<number | null>(null);
  const [editingWork, setEditingWork] = useState<number | null>(null);
  const [editingProject, setEditingProject] = useState<number | null>(null);
  const [editingAcademic, setEditingAcademic] = useState<number | null>(null);
  const [editingReward, setEditingReward] = useState<number | null>(null);

  const handleChange = useCallback(
    (newData: ResumeData) => {
      onChange(newData);
    },
    [onChange]
  );

  // 添加新项 logic same as before
  const addEducation = () => {
    if (!data) return;
    const newEducation = [
      ...data.education,
      {
        degreeLevel: "",
        period: { startDate: "", endDate: "" },
        school: "",
        department: "",
        major: "",
        gpa: "",
        ranking: "",
        educationDescription: "",
      },
    ];
    handleChange({ ...data, education: newEducation });
    setEditingEducation(newEducation.length - 1);
  };

  const addWork = () => {
    if (!data) return;
    const newWork = [
      ...data.workExperience,
      {
        companyName: "",
        employmentPeriod: { startDate: "", endDate: "" },
        title: "",
        position: "",
        internship: 0,
        jobDescription: "",
      },
    ];
    handleChange({ ...data, workExperience: newWork });
    setEditingWork(newWork.length - 1);
  };

  const addProject = () => {
    if (!data) return;
    const newProjects = [
      ...data.projects,
      {
        projectName: "",
        projectPeriod: { startDate: "", endDate: "" },
        role: "",
        companyOrOrganization: "",
        projectDescription: "",
      },
    ];
    handleChange({ ...data, projects: newProjects });
    setEditingProject(newProjects.length - 1);
  };

  const addAcademicAchievement = () => {
    if (!data) return;
    const newAcademic = [
      ...data.academicAchievements,
      {
        type: "",
        title: "",
        date: "",
        venue: "",
        description: "",
      },
    ];
    handleChange({ ...data, academicAchievements: newAcademic });
    setEditingAcademic(newAcademic.length - 1);
  };

  const addReward = () => {
    if (!data) return;
    const newRewards = [...(data.basicInfo.rewards || []), ""];
    handleChange({
      ...data,
      basicInfo: { ...data.basicInfo, rewards: newRewards },
    });
    setEditingReward(newRewards.length - 1);
  };

  // 加载状态 - 优先显示
  if (isLoading) {
    return <ResumeParsingState compact />;
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h3 className="mb-2 text-base font-semibold text-foreground">解析失败</h3>
        <p className="max-w-xs text-sm text-muted-foreground">{error}</p>
        {parseMeta?.guidance ? (
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {parseMeta.guidance}
          </p>
        ) : (
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
            可尝试切换支持文件解析的模型、上传文本版简历，或在模型设置中补充兼容 OpenAI 的配置。
          </p>
        )}
      </div>
    );
  }

  // 空状态
  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center p-8">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sidebar text-muted-foreground/50">
          <User className="h-8 w-8" />
        </div>
        <h3 className="mb-1 text-base font-semibold text-foreground">暂无数据</h3>
        <p className="text-sm text-muted-foreground max-w-[200px]">
          请在左侧上传简历，系统将自动提取结构化信息
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 pb-8 space-y-4">
      <section>
        <SectionHeader title="基本信息" icon={User} />
        <div className="rounded-xl border border-border bg-theme-background p-4 shadow-sm dark:bg-zinc-900/30 dark:border-zinc-800">
          <BasicInfoEditor
            data={data.basicInfo}
            onChange={(basicInfo) => handleChange({ ...data, basicInfo })}
          />
        </div>
      </section>

      {/* 教育经历 */}
      <section>
        <SectionHeader
          title="教育经历"
          icon={GraduationCap}
          onAdd={addEducation}
        />
        <div className="space-y-2">
          <AnimatePresence>
            {data.education.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                暂无教育经历
              </div>
            ) : (
              data.education.map((item, index) => (
                <EducationCard
                  key={index}
                  item={item}
                  onClick={() => setEditingEducation(index)}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* 工作经历 */}
      <section>
        <SectionHeader
          title="工作经历"
          icon={Briefcase}
          onAdd={addWork}
        />
        <div className="space-y-2">
          <AnimatePresence>
             {data.workExperience.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                暂无工作经历
              </div>
            ) : (
              data.workExperience.map((item, index) => (
                <WorkCard
                  key={index}
                  item={item}
                  onClick={() => setEditingWork(index)}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* 项目经历 */}
      <section>
        <SectionHeader
          title="项目经历"
          icon={FolderKanban}
          onAdd={addProject}
        />
        <div className="space-y-2">
           <AnimatePresence>
             {data.projects.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                暂无项目经历
              </div>
            ) : (
              data.projects.map((item, index) => (
                <ProjectCard
                  key={index}
                  item={item}
                  onClick={() => setEditingProject(index)}
                />
              ))
            )}
           </AnimatePresence>
        </div>
      </section>

      {/* 学术成果 */}
      <section>
        <SectionHeader
          title="学术成果"
          icon={BookOpen}
          onAdd={addAcademicAchievement}
        />
        <div className="space-y-2">
          <AnimatePresence>
            {data.academicAchievements.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                暂无学术成果
              </div>
            ) : (
              data.academicAchievements.map((item, index) => (
                <AcademicCard
                  key={index}
                  item={item}
                  onClick={() => setEditingAcademic(index)}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* 个人荣誉（最底部） */}
      <RewardsSection
        rewards={data.basicInfo.rewards}
        onAdd={addReward}
        onEdit={(index) => setEditingReward(index)}
      />

      {/* 编辑对话框组件逻辑保持不变，但内部 Input/Textarea 已更新 */}
      <AnimatePresence>
      {editingEducation !== null && data.education[editingEducation] && (
        <EditDialog
          title="编辑教育经历"
          isOpen={true}
          onClose={() => setEditingEducation(null)}
          onDelete={() => {
            handleChange({
              ...data,
              education: data.education.filter((_, i) => i !== editingEducation),
            });
            setEditingEducation(null);
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <EditableField
              label="学校"
              value={data.education[editingEducation].school}
              onChange={(v) => {
                const newEdu = [...data.education];
                newEdu[editingEducation] = { ...newEdu[editingEducation], school: v };
                handleChange({ ...data, education: newEdu });
              }}
              placeholder="学校名称"
            />
            <EditableField
              label="学历"
              value={data.education[editingEducation].degreeLevel}
              onChange={(v) => {
                const newEdu = [...data.education];
                newEdu[editingEducation] = { ...newEdu[editingEducation], degreeLevel: v };
                handleChange({ ...data, education: newEdu });
              }}
              placeholder="本科/硕士/博士"
            />
            <EditableField
              label="院系"
              value={data.education[editingEducation].department}
              onChange={(v) => {
                const newEdu = [...data.education];
                newEdu[editingEducation] = { ...newEdu[editingEducation], department: v };
                handleChange({ ...data, education: newEdu });
              }}
              placeholder="学院/系"
            />
            <EditableField
              label="专业"
              value={data.education[editingEducation].major}
              onChange={(v) => {
                const newEdu = [...data.education];
                newEdu[editingEducation] = { ...newEdu[editingEducation], major: v };
                handleChange({ ...data, education: newEdu });
              }}
              placeholder="专业名称"
            />
            <EditableField
              label="开始时间"
              value={data.education[editingEducation].period.startDate}
              onChange={(v) => {
                const newEdu = [...data.education];
                newEdu[editingEducation] = {
                  ...newEdu[editingEducation],
                  period: { ...newEdu[editingEducation].period, startDate: v },
                };
                handleChange({ ...data, education: newEdu });
              }}
              placeholder="2016-09"
            />
            <EditableField
              label="结束时间"
              value={data.education[editingEducation].period.endDate}
              onChange={(v) => {
                const newEdu = [...data.education];
                newEdu[editingEducation] = {
                  ...newEdu[editingEducation],
                  period: { ...newEdu[editingEducation].period, endDate: v },
                };
                handleChange({ ...data, education: newEdu });
              }}
              placeholder="2020-06"
            />
            <EditableField
              label="GPA"
              value={data.education[editingEducation].gpa || ""}
              onChange={(v) => {
                const newEdu = [...data.education];
                newEdu[editingEducation] = { ...newEdu[editingEducation], gpa: v };
                handleChange({ ...data, education: newEdu });
              }}
              placeholder="3.8/4.0 或 90/100"
            />
            <EditableField
              label="排名"
              value={data.education[editingEducation].ranking || ""}
              onChange={(v) => {
                const newEdu = [...data.education];
                newEdu[editingEducation] = { ...newEdu[editingEducation], ranking: v };
                handleChange({ ...data, education: newEdu });
              }}
              placeholder="前5% 或 3/120"
            />
          </div>
          <TextareaField
            label="描述"
            value={data.education[editingEducation].educationDescription}
            onChange={(v) => {
              const newEdu = [...data.education];
              newEdu[editingEducation] = { ...newEdu[editingEducation], educationDescription: v };
              handleChange({ ...data, education: newEdu });
            }}
            placeholder="研究方向、荣誉等"
          />
        </EditDialog>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {editingWork !== null && data.workExperience[editingWork] && (
        <EditDialog
          title="编辑工作经历"
          isOpen={true}
          onClose={() => setEditingWork(null)}
          onDelete={() => {
            handleChange({
              ...data,
              workExperience: data.workExperience.filter((_, i) => i !== editingWork),
            });
            setEditingWork(null);
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <EditableField
              label="公司名称"
              value={data.workExperience[editingWork].companyName}
              onChange={(v) => {
                const newWork = [...data.workExperience];
                newWork[editingWork] = { ...newWork[editingWork], companyName: v };
                handleChange({ ...data, workExperience: newWork });
              }}
              placeholder="公司名称"
            />
            <EditableField
              label="主题标题"
              value={data.workExperience[editingWork].title}
              onChange={(v) => {
                const newWork = [...data.workExperience];
                newWork[editingWork] = { ...newWork[editingWork], title: v };
                handleChange({ ...data, workExperience: newWork });
              }}
              placeholder="如：基于 Qwen3-14B 的垂直领域订票 Agent"
            />
            <EditableField
              label="职位"
              value={data.workExperience[editingWork].position}
              onChange={(v) => {
                const newWork = [...data.workExperience];
                newWork[editingWork] = { ...newWork[editingWork], position: v };
                handleChange({ ...data, workExperience: newWork });
              }}
              placeholder="职位名称"
            />
            <EditableField
              label="开始时间"
              value={data.workExperience[editingWork].employmentPeriod.startDate}
              onChange={(v) => {
                const newWork = [...data.workExperience];
                newWork[editingWork] = {
                  ...newWork[editingWork],
                  employmentPeriod: { ...newWork[editingWork].employmentPeriod, startDate: v },
                };
                handleChange({ ...data, workExperience: newWork });
              }}
              placeholder="2022-07"
            />
            <EditableField
              label="结束时间"
              value={data.workExperience[editingWork].employmentPeriod.endDate}
              onChange={(v) => {
                const newWork = [...data.workExperience];
                newWork[editingWork] = {
                  ...newWork[editingWork],
                  employmentPeriod: { ...newWork[editingWork].employmentPeriod, endDate: v },
                };
                handleChange({ ...data, workExperience: newWork });
              }}
              placeholder="至今"
            />
            <div className="space-y-1.5 col-span-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">类型</label>
              <select
                value={data.workExperience[editingWork].internship}
                onChange={(e) => {
                  const newWork = [...data.workExperience];
                  newWork[editingWork] = {
                    ...newWork[editingWork],
                    internship: parseInt(e.target.value),
                  };
                  handleChange({ ...data, workExperience: newWork });
                }}
                className={cn(
                  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-all duration-200",
                  "focus:border-accent focus:bg-background focus:outline-none focus:ring-4 focus:ring-accent/10",
                  "dark:bg-zinc-800/40 dark:border-zinc-700 dark:hover:bg-zinc-800/60 dark:focus:bg-black/40"
                )}
              >
                <option value={0}>正式</option>
                <option value={1}>实习</option>
              </select>
            </div>
          </div>
          <TextareaField
            label="工作描述"
            value={data.workExperience[editingWork].jobDescription}
            onChange={(v) => {
              const newWork = [...data.workExperience];
              newWork[editingWork] = { ...newWork[editingWork], jobDescription: v };
              handleChange({ ...data, workExperience: newWork });
            }}
            placeholder="工作职责和成果"
          />
        </EditDialog>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {editingProject !== null && data.projects[editingProject] && (
        <EditDialog
          title="编辑项目经历"
          isOpen={true}
          onClose={() => setEditingProject(null)}
          onDelete={() => {
            handleChange({
              ...data,
              projects: data.projects.filter((_, i) => i !== editingProject),
            });
            setEditingProject(null);
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <EditableField
              label="项目名称"
              value={data.projects[editingProject].projectName}
              onChange={(v) => {
                const newProj = [...data.projects];
                newProj[editingProject] = { ...newProj[editingProject], projectName: v };
                handleChange({ ...data, projects: newProj });
              }}
              placeholder="项目名称"
            />
            <EditableField
              label="角色"
              value={data.projects[editingProject].role}
              onChange={(v) => {
                const newProj = [...data.projects];
                newProj[editingProject] = { ...newProj[editingProject], role: v };
                handleChange({ ...data, projects: newProj });
              }}
              placeholder="技术负责人/核心开发"
            />
            <EditableField
              label="开始时间"
              value={data.projects[editingProject].projectPeriod.startDate}
              onChange={(v) => {
                const newProj = [...data.projects];
                newProj[editingProject] = {
                  ...newProj[editingProject],
                  projectPeriod: { ...newProj[editingProject].projectPeriod, startDate: v },
                };
                handleChange({ ...data, projects: newProj });
              }}
              placeholder="2023-06"
            />
            <EditableField
              label="结束时间"
              value={data.projects[editingProject].projectPeriod.endDate}
              onChange={(v) => {
                const newProj = [...data.projects];
                newProj[editingProject] = {
                  ...newProj[editingProject],
                  projectPeriod: { ...newProj[editingProject].projectPeriod, endDate: v },
                };
                handleChange({ ...data, projects: newProj });
              }}
              placeholder="2023-12"
            />
            <EditableField
              className="col-span-2"
              label="所属组织"
              value={data.projects[editingProject].companyOrOrganization}
              onChange={(v) => {
                const newProj = [...data.projects];
                newProj[editingProject] = { ...newProj[editingProject], companyOrOrganization: v };
                handleChange({ ...data, projects: newProj });
              }}
              placeholder="公司/组织"
            />
          </div>
          <TextareaField
            label="项目描述"
            value={data.projects[editingProject].projectDescription}
            onChange={(v) => {
              const newProj = [...data.projects];
              newProj[editingProject] = { ...newProj[editingProject], projectDescription: v };
              handleChange({ ...data, projects: newProj });
            }}
            placeholder="项目背景、技术栈、职责、成果"
          />
        </EditDialog>
      )}
      {/* 学术成果编辑对话框 */}
      {editingAcademic !== null && data.academicAchievements[editingAcademic] && (
        <EditDialog
          title="编辑学术成果"
          isOpen={true}
          onClose={() => setEditingAcademic(null)}
          onDelete={() => {
            const newAcademic = data.academicAchievements.filter((_, i) => i !== editingAcademic);
            handleChange({ ...data, academicAchievements: newAcademic });
            setEditingAcademic(null);
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <EditableField
              className="col-span-2"
              label="成果标题"
              value={data.academicAchievements[editingAcademic].title}
              onChange={(v) => {
                const newAcademic = [...data.academicAchievements];
                newAcademic[editingAcademic] = { ...newAcademic[editingAcademic], title: v };
                handleChange({ ...data, academicAchievements: newAcademic });
              }}
              placeholder="论文/专利/项目名称"
            />
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">类型</label>
              <select
                value={data.academicAchievements[editingAcademic].type}
                onChange={(e) => {
                  const newAcademic = [...data.academicAchievements];
                  newAcademic[editingAcademic] = { ...newAcademic[editingAcademic], type: e.target.value };
                  handleChange({ ...data, academicAchievements: newAcademic });
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">选择类型</option>
                <option value="paper">论文</option>
                <option value="patent">专利</option>
                <option value="award">学术奖项</option>
                <option value="thesis">毕业论文</option>
                <option value="grant">科研基金</option>
                <option value="research">科研项目</option>
              </select>
            </div>
            <EditableField
              label="日期"
              value={data.academicAchievements[editingAcademic].date}
              onChange={(v) => {
                const newAcademic = [...data.academicAchievements];
                newAcademic[editingAcademic] = { ...newAcademic[editingAcademic], date: v };
                handleChange({ ...data, academicAchievements: newAcademic });
              }}
              placeholder="2023.06"
            />
            {/* 论文状态选择 - 仅对论文和毕业论文显示 */}
            {(data.academicAchievements[editingAcademic].type === "paper" ||
              data.academicAchievements[editingAcademic].type === "thesis") && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">状态</label>
                <select
                  value={data.academicAchievements[editingAcademic].status || ""}
                  onChange={(e) => {
                    const newAcademic = [...data.academicAchievements];
                    newAcademic[editingAcademic] = { ...newAcademic[editingAcademic], status: e.target.value || undefined };
                    handleChange({ ...data, academicAchievements: newAcademic });
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">无状态</option>
                  <option value="under_review">Under Review</option>
                  <option value="major_revision">Major Revision</option>
                  <option value="minor_revision">Minor Revision</option>
                  <option value="accepted">Accepted</option>
                  <option value="published">Published</option>
                </select>
              </div>
            )}
            <EditableField
              className="col-span-2"
              label="发表刊物/会议/资助来源"
              value={data.academicAchievements[editingAcademic].venue}
              onChange={(v) => {
                const newAcademic = [...data.academicAchievements];
                newAcademic[editingAcademic] = { ...newAcademic[editingAcademic], venue: v };
                handleChange({ ...data, academicAchievements: newAcademic });
              }}
              placeholder="期刊/会议名称"
            />
          </div>
          <TextareaField
            label="描述"
            value={data.academicAchievements[editingAcademic].description}
            onChange={(v) => {
              const newAcademic = [...data.academicAchievements];
              newAcademic[editingAcademic] = { ...newAcademic[editingAcademic], description: v };
              handleChange({ ...data, academicAchievements: newAcademic });
            }}
            placeholder="作者排名、影响因子、项目规模等"
          />
        </EditDialog>
      )}
      {/* 个人荣誉编辑对话框 */}
      {editingReward !== null && data.basicInfo.rewards && data.basicInfo.rewards[editingReward] !== undefined && (
        <EditDialog
          title="编辑个人荣誉"
          isOpen={true}
          onClose={() => setEditingReward(null)}
          onDelete={() => {
            const newRewards = data.basicInfo.rewards.filter((_, i) => i !== editingReward);
            handleChange({
              ...data,
              basicInfo: { ...data.basicInfo, rewards: newRewards },
            });
            setEditingReward(null);
          }}
        >
          <EditableField
            label="荣誉名称"
            value={data.basicInfo.rewards[editingReward]}
            onChange={(v) => {
              const newRewards = [...data.basicInfo.rewards];
              newRewards[editingReward] = v;
              handleChange({
                ...data,
                basicInfo: { ...data.basicInfo, rewards: newRewards },
              });
            }}
            placeholder="请输入荣誉名称，如：国家奖学金、优秀毕业生等"
          />
        </EditDialog>
      )}
      </AnimatePresence>
    </div>
  );
};

export default ResumeExtractPanel;