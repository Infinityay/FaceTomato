// 简历数据类型定义 - 与后端 Pydantic 模型对应

export interface BasicInfo {
  name: string;
  personalEmail: string;
  phoneNumber: string;
  age: string;
  born: string;
  gender: string;
  desiredPosition: string;
  desiredLocation: string[];
  currentLocation: string;
  placeOfOrigin: string;
  rewards: string[];
}

export interface EmploymentPeriod {
  startDate: string;
  endDate: string;
}

export interface WorkExperienceItem {
  companyName: string;
  employmentPeriod: EmploymentPeriod;
  title: string;
  position: string;
  internship: number; // 1=实习 0=非实习
  jobDescription: string;
}

export interface EducationPeriod {
  startDate: string;
  endDate: string;
}

export interface EducationItem {
  degreeLevel: string;
  period: EducationPeriod;
  school: string;
  department: string;
  major: string;
  gpa: string;
  ranking: string;
  educationDescription: string;
}

export interface ProjectPeriod {
  startDate: string;
  endDate: string;
}

export interface ProjectItem {
  projectName: string;
  projectPeriod: ProjectPeriod;
  role: string;
  companyOrOrganization: string;
  projectDescription: string;
}

export interface AcademicAchievementItem {
  type: string; // paper/patent/award/thesis/grant/research
  title: string;
  date: string;
  venue: string;
  description: string;
  status?: string; // 论文状态：under_review/accepted/major_revision/minor_revision/published
}

export interface ResumeData {
  basicInfo: BasicInfo;
  workExperience: WorkExperienceItem[];
  education: EducationItem[];
  projects: ProjectItem[];
  academicAchievements: AcademicAchievementItem[];
}

export interface ResumeParseMeta {
  filename: string;
  extension: string;
  elapsed: {
    ocr_seconds: number;
    llm_seconds: number;
  };
  guidance: string;
}

// 空数据模板
export const emptyResumeData: ResumeData = {
  basicInfo: {
    name: "",
    personalEmail: "",
    phoneNumber: "",
    age: "",
    born: "",
    gender: "",
    desiredPosition: "",
    desiredLocation: [],
    currentLocation: "",
    placeOfOrigin: "",
    rewards: [],
  },
  workExperience: [],
  education: [],
  projects: [],
  academicAchievements: [],
};