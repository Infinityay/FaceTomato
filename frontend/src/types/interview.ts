export const ALL_CATEGORIES = [
  "大模型应用开发",
  "大模型算法",
  "后端开发",
  "前端开发",
  "游戏开发",
  "搜广推算法",
  "风控算法",
] as const;

export type Category = (typeof ALL_CATEGORIES)[number];

export const ALL_INTERVIEW_TYPES = ["校招", "实习", "社招"] as const;
export type InterviewType = (typeof ALL_INTERVIEW_TYPES)[number];

export const ALL_RESULTS = ["offer", "fail", "null"] as const;
export type InterviewResult = (typeof ALL_RESULTS)[number];

export interface InterviewData {
  id: number;
  title: string;
  content: string;
  publish_time: string;
  category: Category;
  company: string | null;
  department: string | null;
  stage: string | null;
  result: InterviewResult;
  interview_type: InterviewType | null;
  // source is not exposed to frontend
}

export interface FilterState {
  categories: Category[];
  results: InterviewResult[];
  interview_types: InterviewType[];
  include_unknown_interview_type: boolean;
  company: string;
  search: string;
}

export interface StatsData {
  total: number;
  offer_count: number;
  companies_count: number;
  categories: Record<string, number>;
}

export interface InterviewListResponse {
  items: InterviewData[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface NeighborItem {
  id: number;
  title: string;
}

export interface NeighborsResponse {
  prev: NeighborItem | null;
  next: NeighborItem | null;
  current_index: number;
  total: number;
}
