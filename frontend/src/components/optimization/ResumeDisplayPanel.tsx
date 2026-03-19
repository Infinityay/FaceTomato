import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Briefcase,
  GraduationCap,
  FolderKanban,
  Award,
  Trophy,
  Mail,
  Phone,
  MapPin,
  Calendar,
  X,
  Trash2,
  Edit,
} from "lucide-react";
import { produce } from "immer";
import { cn } from "../../lib/utils";
import { Card, CardContent, CardHeader } from "../ui/card";
import type {
  ResumeData,
  BasicInfo,
  WorkExperienceItem,
  EducationItem,
  ProjectItem,
  AcademicAchievementItem,
} from "../../types/resume";
import {
  useOptimizationStore,
  getActiveSuggestionLocation,
} from "../../store/optimizationStore";
import { useResumeStore } from "../../store/resumeStore";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

// --- Reusable Editor Components (from ResumeExtractPanel) ---

const EditableField = ({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) => (
  <div className={cn("space-y-1.5", className)}>
    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">
      {label}
    </label>
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);

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
    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">
      {label}
    </label>
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
    />
  </div>
);

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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm dark:bg-black/60"
        onClick={onClose}
      />
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
          <Button onClick={onClose} className="px-6">
            完成
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Section-specific Editors ---

const BasicInfoEditor = ({
  data,
  onUpdate,
}: {
  data: BasicInfo;
  onUpdate: (updates: Partial<BasicInfo>) => void;
}) => (
  <div className="grid grid-cols-2 gap-4">
    <EditableField
      label="姓名"
      value={data.name}
      onChange={(v) => onUpdate({ name: v })}
    />
    <EditableField
      label="性别"
      value={data.gender}
      onChange={(v) => onUpdate({ gender: v })}
    />
    <EditableField
      label="手机号"
      value={data.phoneNumber}
      onChange={(v) => onUpdate({ phoneNumber: v })}
    />
    <EditableField
      label="邮箱"
      value={data.personalEmail}
      onChange={(v) => onUpdate({ personalEmail: v })}
    />
    <div className="col-span-2 grid grid-cols-3 gap-4">
      <EditableField
        label="年龄"
        value={data.age}
        onChange={(v) => onUpdate({ age: v })}
      />
      <EditableField
        label="出生年月"
        value={data.born}
        onChange={(v) => onUpdate({ born: v })}
      />
      <EditableField
        label="籍贯"
        value={data.placeOfOrigin}
        onChange={(v) => onUpdate({ placeOfOrigin: v })}
      />
    </div>
    <div className="col-span-2 grid grid-cols-3 gap-4">
      <EditableField
        label="现居地"
        value={data.currentLocation}
        onChange={(v) => onUpdate({ currentLocation: v })}
      />
      <EditableField
        label="期望岗位"
        value={data.desiredPosition || ""}
        onChange={(v) => onUpdate({ desiredPosition: v })}
      />
      <EditableField
        label="期望地点"
        value={data.desiredLocation?.join("、") || ""}
        onChange={(v) =>
          onUpdate({ desiredLocation: v.split(/[,，、\s]+/).filter(Boolean) })
        }
      />
    </div>
  </div>
);

const WorkExperienceEditor = ({
  data,
  onUpdate,
}: {
  data: WorkExperienceItem;
  onUpdate: (updates: Partial<WorkExperienceItem>) => void;
}) => (
    <div className="grid grid-cols-2 gap-4">
      <EditableField
        label="公司名称"
        value={data.companyName}
        onChange={(v) => onUpdate({ companyName: v })}
      />
      <EditableField
        label="主题标题"
        value={data.title}
        onChange={(v) => onUpdate({ title: v })}
      />
      <EditableField
        label="职位"
        value={data.position}
        onChange={(v) => onUpdate({ position: v })}
      />
      <EditableField
        label="开始时间"
        value={data.employmentPeriod.startDate}
        onChange={(v) => onUpdate({ employmentPeriod: { ...data.employmentPeriod, startDate: v }})}
      />
      <EditableField
        label="结束时间"
        value={data.employmentPeriod.endDate}
        onChange={(v) => onUpdate({ employmentPeriod: { ...data.employmentPeriod, endDate: v }})}
      />
      <div className="space-y-1.5 col-span-2">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">类型</label>
        <select
          value={data.internship}
          onChange={(e) => onUpdate({ internship: parseInt(e.target.value) })}
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
      <div className="col-span-2">
        <TextareaField
          label="工作描述"
          value={data.jobDescription}
          onChange={(v) => onUpdate({ jobDescription: v })}
        />
      </div>
    </div>
);

const EducationEditor = ({
  data,
  onUpdate,
}: {
  data: EducationItem;
  onUpdate: (updates: Partial<EducationItem>) => void;
}) => (
    <div className="grid grid-cols-2 gap-4">
      <EditableField label="学校" value={data.school} onChange={(v) => onUpdate({ school: v })} />
      <EditableField label="学历" value={data.degreeLevel} onChange={(v) => onUpdate({ degreeLevel: v })} />
      <EditableField label="院系" value={data.department} onChange={(v) => onUpdate({ department: v })} />
      <EditableField label="专业" value={data.major} onChange={(v) => onUpdate({ major: v })} />
      <EditableField label="开始时间" value={data.period.startDate} onChange={(v) => onUpdate({ period: { ...data.period, startDate: v } })} />
      <EditableField label="结束时间" value={data.period.endDate} onChange={(v) => onUpdate({ period: { ...data.period, endDate: v } })} />
      <EditableField label="GPA" value={data.gpa || ""} onChange={(v) => onUpdate({ gpa: v })} />
      <EditableField label="排名" value={data.ranking || ""} onChange={(v) => onUpdate({ ranking: v })} />
      <div className="col-span-2">
        <TextareaField
          label="描述"
          value={data.educationDescription}
          onChange={(v) => onUpdate({ educationDescription: v })}
        />
      </div>
    </div>
);

const ProjectEditor = ({ data, onUpdate }: { data: ProjectItem; onUpdate: (updates: Partial<ProjectItem>) => void; }) => (
    <div className="grid grid-cols-2 gap-4">
        <EditableField label="项目名称" value={data.projectName} onChange={v => onUpdate({ projectName: v })} />
        <EditableField label="角色" value={data.role} onChange={v => onUpdate({ role: v })} />
        <EditableField label="开始时间" value={data.projectPeriod.startDate} onChange={v => onUpdate({ projectPeriod: { ...data.projectPeriod, startDate: v } })} />
        <EditableField label="结束时间" value={data.projectPeriod.endDate} onChange={v => onUpdate({ projectPeriod: { ...data.projectPeriod, endDate: v } })} />
        <EditableField className="col-span-2" label="所属组织" value={data.companyOrOrganization} onChange={v => onUpdate({ companyOrOrganization: v })} />
        <div className="col-span-2">
            <TextareaField label="项目描述" value={data.projectDescription} onChange={v => onUpdate({ projectDescription: v })} />
        </div>
    </div>
);

const AcademicEditor = ({ data, onUpdate }: { data: AcademicAchievementItem; onUpdate: (updates: Partial<AcademicAchievementItem>) => void; }) => (
    <div className="grid grid-cols-2 gap-4">
        <EditableField className="col-span-2" label="成果标题" value={data.title} onChange={v => onUpdate({ title: v })} />
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">类型</label>
          <select value={data.type} onChange={e => onUpdate({ type: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <option value="">选择类型</option>
            <option value="paper">论文</option>
            <option value="patent">专利</option>
            <option value="award">学术奖项</option>
            <option value="thesis">毕业论文</option>
            <option value="grant">科研基金</option>
            <option value="research">科研项目</option>
          </select>
        </div>
        <EditableField label="日期" value={data.date} onChange={v => onUpdate({ date: v })} />
        {(data.type === "paper" || data.type === "thesis") && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">状态</label>
              <select value={data.status || ""} onChange={e => onUpdate({ status: e.target.value || undefined })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <option value="">无状态</option>
                <option value="under_review">Under Review</option>
                <option value="major_revision">Major Revision</option>
                <option value="minor_revision">Minor Revision</option>
                <option value="accepted">Accepted</option>
                <option value="published">Published</option>
              </select>
            </div>
        )}
        <EditableField className="col-span-2" label="发表刊物/会议/资助来源" value={data.venue} onChange={v => onUpdate({ venue: v })} />
        <div className="col-span-2">
            <TextareaField label="描述" value={data.description} onChange={v => onUpdate({ description: v })} />
        </div>
    </div>
);

const RewardEditor = ({ value, onUpdate }: { value: string; onUpdate: (value: string) => void; }) => (
    <EditableField label="荣誉名称" value={value} onChange={onUpdate} />
);


interface ResumeDisplayPanelProps {
  data: ResumeData;
}

// Section wrapper with highlight and edit support
const Section = ({
  title,
  icon: Icon,
  isHighlighted,
  sectionId,
  onEdit,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isHighlighted: boolean;
  sectionId: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) => (
  <motion.div
    data-section={sectionId}
    animate={{
      transition: { type: "spring", stiffness: 300, damping: 30 },
    }}
  >
    <Card
      className={cn(
        "transition-all duration-300 group",
        isHighlighted && "ring-2 ring-primary ring-inset shadow-lg bg-primary/5"
      )}
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onEdit}
          >
            <Edit className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  </motion.div>
);

// Basic info display
const BasicInfoSection = ({
  data,
  isHighlighted,
  onEdit,
}: {
  data: ResumeData["basicInfo"];
  isHighlighted: boolean;
  onEdit: () => void;
}) => (
  <Section
    title="基本信息"
    icon={User}
    isHighlighted={isHighlighted}
    sectionId="basicInfo"
    onEdit={onEdit}
  >
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-lg">
          {data.name ? data.name.charAt(0) : "?"}
        </div>
        <div>
          <h4 className="font-semibold text-foreground">
            {data.name || "未填写姓名"}
          </h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {data.gender && <span>{data.gender}</span>}
            {data.age && <span>{data.age}岁</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        {data.personalEmail && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            <span className="truncate">{data.personalEmail}</span>
          </div>
        )}
        {data.phoneNumber && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            <span>{data.phoneNumber}</span>
          </div>
        )}
        {data.currentLocation && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{data.currentLocation}</span>
          </div>
        )}
        {data.placeOfOrigin && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>籍贯: {data.placeOfOrigin}</span>
          </div>
        )}
        {data.born && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{data.born}</span>
          </div>
        )}
        {data.desiredPosition && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" />
            <span className="truncate">{data.desiredPosition}</span>
          </div>
        )}
        {data.desiredLocation && data.desiredLocation.length > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
            <MapPin className="h-3.5 w-3.5" />
            <span>期望: {data.desiredLocation.join("、")}</span>
          </div>
        )}
      </div>
    </div>
  </Section>
);

// Work experience display with item-level highlighting and editing
const WorkExperienceSection = ({
  data,
  isHighlighted,
  highlightedItemIndex,
  onEdit,
}: {
  data: ResumeData["workExperience"];
  isHighlighted: boolean;
  highlightedItemIndex: number | null;
  onEdit: (index: number) => void;
}) => {
  if (data.length === 0) return null;

  return (
    <Section
      title="工作经历"
      icon={Briefcase}
      isHighlighted={isHighlighted && highlightedItemIndex === null}
      sectionId="workExperience"
    >
      <div className="space-y-4">
        {data.map((item, index) => (
          <div
            key={index}
            onClick={() => onEdit(index)}
            data-item-index={index}
            className={cn(
              "relative pl-4 border-l-2 transition-all duration-300 cursor-pointer group",
              highlightedItemIndex === index
                ? "border-primary bg-primary/5 -ml-2 pl-6 py-2 rounded-r-lg"
                : index === 0
                ? "border-primary"
                : "border-muted",
              "hover:bg-primary/5 hover:border-primary"
            )}
          >
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-foreground">
                  {item.title || item.position || "未填写工作标题"}
                </h4>
                {item.internship === 1 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    实习
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 ml-2">
                <Calendar className="h-3 w-3" />
                <span>
                  {item.employmentPeriod.startDate} -{" "}
                  {item.employmentPeriod.endDate}
                </span>
              </div>
            </div>
            {(item.companyName || item.position) && (
              <p className="text-sm text-muted-foreground mb-2">
                {[item.companyName, item.position].filter(Boolean).join(" · ")}
              </p>
            )}
            {item.jobDescription && (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {item.jobDescription}
              </p>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
};

// Education display with item-level highlighting and editing
const EducationSection = ({
  data,
  isHighlighted,
  highlightedItemIndex,
  onEdit,
}: {
  data: ResumeData["education"];
  isHighlighted: boolean;
  highlightedItemIndex: number | null;
  onEdit: (index: number) => void;
}) => {
  if (data.length === 0) return null;

  return (
    <Section
      title="教育背景"
      icon={GraduationCap}
      isHighlighted={isHighlighted && highlightedItemIndex === null}
      sectionId="education"
    >
      <div className="space-y-3">
        {data.map((item, index) => (
          <div
            key={index}
            onClick={() => onEdit(index)}
            data-item-index={index}
            className={cn(
              "flex items-start gap-3 transition-all duration-300 cursor-pointer group",
              highlightedItemIndex === index &&
                "bg-primary/5 -mx-2 px-2 py-2 rounded-lg ring-2 ring-primary/30",
              "hover:bg-primary/5 -mx-2 px-2 py-2 rounded-lg"
            )}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground">
              <GraduationCap className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <h4 className="font-medium text-foreground">{item.school}</h4>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 ml-2">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {item.period.startDate} - {item.period.endDate}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {item.major} · {item.degreeLevel}
              </p>
              {item.department && (
                <p className="text-xs text-muted-foreground/80">{item.department}</p>
              )}
              {(item.gpa || item.ranking) && (
                <p className="text-xs text-muted-foreground">
                  {[
                    item.gpa && `GPA: ${item.gpa}`,
                    item.ranking && `排名: ${item.ranking}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {item.educationDescription && (
                <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                  {item.educationDescription}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
};

// Projects display with item-level highlighting and editing
const ProjectsSection = ({
  data,
  isHighlighted,
  highlightedItemIndex,
  onEdit,
}: {
  data: ResumeData["projects"];
  isHighlighted: boolean;
  highlightedItemIndex: number | null;
  onEdit: (index: number) => void;
}) => {
  if (data.length === 0) return null;

  return (
    <Section
      title="项目经历"
      icon={FolderKanban}
      isHighlighted={isHighlighted && highlightedItemIndex === null}
      sectionId="projects"
    >
      <div className="space-y-3">
        {data.map((item, index) => (
          <div
            key={index}
            onClick={() => onEdit(index)}
            data-item-index={index}
            className={cn(
              "p-2.5 rounded-lg bg-muted/50 transition-all duration-300 cursor-pointer group",
              highlightedItemIndex === index &&
                "ring-2 ring-primary/50 bg-primary/5",
              "hover:bg-primary/5"
            )}
          >
            <div className="flex items-start justify-between mb-1">
              <h4 className="font-medium text-foreground text-sm">
                {item.projectName}
              </h4>
              {item.role && (
                <span className="text-xs text-muted-foreground">{item.role}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-1.5">
              {item.projectPeriod.startDate} - {item.projectPeriod.endDate}
            </p>
            {item.projectDescription && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {item.projectDescription}
              </p>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
};

// Academic achievements display with item-level highlighting and editing
const AcademicSection = ({
  data,
  isHighlighted,
  highlightedItemIndex,
  onEdit,
}: {
  data: ResumeData["academicAchievements"];
  isHighlighted: boolean;
  highlightedItemIndex: number | null;
  onEdit: (index: number) => void;
}) => {
  if (data.length === 0) return null;

  const typeMap: Record<string, string> = {
    paper: "论文",
    patent: "专利",
    award: "学术奖项",
    thesis: "毕业论文",
    grant: "科研基金",
    research: "科研项目",
  };

  const statusMap: Record<string, { label: string; color: string }> = {
    under_review: { label: "Under Review", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
    accepted: { label: "Accepted", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
    published: { label: "Published", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    major_revision: { label: "Major Revision", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
    minor_revision: { label: "Minor Revision", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  };

  return (
    <Section
      title="学术成果"
      icon={Award}
      isHighlighted={isHighlighted && highlightedItemIndex === null}
      sectionId="academicAchievements"
    >
      <div className="space-y-3">
        {data.map((item, index) => {
          const showStatus =
            item.status && (item.type === "paper" || item.type === "thesis");
          const statusInfo = item.status ? statusMap[item.status] : null;

          return (
            <div
              key={index}
              onClick={() => onEdit(index)}
              data-item-index={index}
              className={cn(
                "p-2.5 rounded-lg bg-muted/50 transition-all duration-300 cursor-pointer group",
                highlightedItemIndex === index &&
                  "ring-2 ring-primary/50 bg-primary/5",
                "hover:bg-primary/5"
              )}
            >
              <div className="flex items-start justify-between mb-1">
                <p className="text-sm text-foreground font-medium line-clamp-1">
                  {item.title}
                </p>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {showStatus && statusInfo && (
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        statusInfo.color
                      )}
                    >
                      {statusInfo.label}
                    </span>
                  )}
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {typeMap[item.type] || item.type}
                  </span>
                </div>
              </div>
              <div className="space-y-0.5">
                {(item.venue || item.date) && (
                  <p className="text-xs text-muted-foreground">
                    {[item.venue, item.date].filter(Boolean).join(" · ")}
                  </p>
                )}
                {item.description && (
                  <p className="text-xs text-muted-foreground/80 line-clamp-2">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
};

// Rewards/Honours display and editing
const RewardsSection = ({
  data,
  isHighlighted,
  onEdit,
}: {
  data: string[];
  isHighlighted: boolean;
  onEdit: (index: number) => void;
}) => {
  if (!data || data.length === 0) return null;

  return (
    <Section
      title="个人荣誉"
      icon={Trophy}
      isHighlighted={isHighlighted}
      sectionId="rewards"
    >
      <ul className="space-y-2">
        {data.map((reward, index) => (
          <li
            key={index}
            onClick={() => onEdit(index)}
            className="flex items-start gap-2 text-sm text-foreground cursor-pointer group hover:bg-primary/5 p-1 -m-1 rounded"
          >
            <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
            <span>{reward}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
};

const ResumeDisplayPanel = ({ data }: ResumeDisplayPanelProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    setParsedResume,
    updateBasicInfo,
    updateWorkExperience,
    updateEducation,
    updateProject,
    updateAcademicAchievement,
  } = useResumeStore();

  const [editing, setEditing] = useState<{
    section: string;
    index?: number;
  } | null>(null);

  // Get the active suggestion's precise location from store
  const location = useOptimizationStore((state) =>
    getActiveSuggestionLocation(state)
  );

  const highlightedSection = location?.section || null;
  const highlightedItemIndex = location?.itemIndex ?? null;

  // Auto-scroll to highlighted section/item
  useEffect(() => {
    if (highlightedSection && containerRef.current) {
      let targetElement: Element | null = null;
      if (highlightedItemIndex !== null) {
        const sectionElement = containerRef.current.querySelector(
          `[data-section="${highlightedSection}"]`
        );
        if (sectionElement) {
          targetElement = sectionElement.querySelector(
            `[data-item-index="${highlightedItemIndex}"]`
          );
        }
      }
      if (!targetElement) {
        targetElement = containerRef.current.querySelector(
          `[data-section="${highlightedSection}"]`
        );
      }
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightedSection, highlightedItemIndex]);

  const handleCloseDialog = () => setEditing(null);

  const renderEditor = () => {
    if (!editing) return null;

    const { section, index } = editing;

    switch (section) {
      case "basicInfo":
        return (
          <BasicInfoEditor data={data.basicInfo} onUpdate={updateBasicInfo} />
        );
      case "workExperience":
        if (index !== undefined && data.workExperience[index]) {
          return (
            <WorkExperienceEditor
              data={data.workExperience[index]}
              onUpdate={(updates) => updateWorkExperience(index, updates)}
            />
          );
        }
        return null;
      case "education":
        if (index !== undefined && data.education[index]) {
            return <EducationEditor data={data.education[index]} onUpdate={updates => updateEducation(index, updates)} />
        }
        return null;
      case "projects":
        if (index !== undefined && data.projects[index]) {
            return <ProjectEditor data={data.projects[index]} onUpdate={updates => updateProject(index, updates)} />
        }
        return null;
      case "academicAchievements":
        if (index !== undefined && data.academicAchievements[index]) {
            return <AcademicEditor data={data.academicAchievements[index]} onUpdate={updates => updateAcademicAchievement(index, updates)} />
        }
        return null;
      case "rewards":
        if (index !== undefined && data.basicInfo.rewards[index] !== undefined) {
            return <RewardEditor 
              value={data.basicInfo.rewards[index]}
              onUpdate={value => {
                const newRewards = [...data.basicInfo.rewards];
                newRewards[index] = value;
                updateBasicInfo({ rewards: newRewards });
              }}
            />
        }
        return null;
      default:
        return null;
    }
  };

  const handleDelete = () => {
    if (!editing) return;
    const { section, index } = editing;

    const newResume = produce(data, (draft) => {
        if (index === undefined) return;
        if (section === 'workExperience') draft.workExperience.splice(index, 1);
        if (section === 'education') draft.education.splice(index, 1);
        if (section === 'projects') draft.projects.splice(index, 1);
        if (section === 'academicAchievements') draft.academicAchievements.splice(index, 1);
        if (section === 'rewards') draft.basicInfo.rewards.splice(index, 1);
    });

    setParsedResume(newResume);
    handleCloseDialog();
  }

  const getDialogTitle = () => {
    if (!editing) return "";
    switch (editing.section) {
      case "basicInfo": return "编辑基本信息";
      case "workExperience": return "编辑工作经历";
      case "education": return "编辑教育背景";
      case "projects": return "编辑项目经历";
      case "academicAchievements": return "编辑学术成果";
      case "rewards": return "编辑个人荣誉";
      default: return "编辑";
    }
  };

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto scrollbar-hide space-y-4 pr-2"
    >
      <BasicInfoSection
        data={data.basicInfo}
        isHighlighted={highlightedSection === "basicInfo"}
        onEdit={() => setEditing({ section: "basicInfo" })}
      />
      <EducationSection
        data={data.education}
        isHighlighted={highlightedSection === "education"}
        highlightedItemIndex={
          highlightedSection === "education" ? highlightedItemIndex : null
        }
        onEdit={(index) => setEditing({ section: "education", index })}
      />
      <WorkExperienceSection
        data={data.workExperience}
        isHighlighted={highlightedSection === "workExperience"}
        highlightedItemIndex={
          highlightedSection === "workExperience" ? highlightedItemIndex : null
        }
        onEdit={(index) => setEditing({ section: "workExperience", index })}
      />
      <ProjectsSection
        data={data.projects}
        isHighlighted={highlightedSection === "projects"}
        highlightedItemIndex={
          highlightedSection === "projects" ? highlightedItemIndex : null
        }
        onEdit={(index) => setEditing({ section: "projects", index })}
      />
      <AcademicSection
        data={data.academicAchievements}
        isHighlighted={highlightedSection === "academicAchievements"}
        highlightedItemIndex={
          highlightedSection === "academicAchievements"
            ? highlightedItemIndex
            : null
        }
        onEdit={(index) => setEditing({ section: "academicAchievements", index })}
      />
      <RewardsSection
        data={data.basicInfo.rewards}
        isHighlighted={highlightedSection === "rewards"}
        onEdit={(index) => setEditing({ section: "rewards", index })}
      />

      <AnimatePresence>
        {editing && (
          <EditDialog
            title={getDialogTitle()}
            isOpen={!!editing}
            onClose={handleCloseDialog}
            onDelete={editing.index !== undefined ? handleDelete : undefined}
          >
            {renderEditor()}
          </EditDialog>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ResumeDisplayPanel;
