import type {
  FilterState,
  InterviewData,
  InterviewListResponse,
  NeighborsResponse,
  StatsData,
} from "@/types/interview";
import { ApiError } from "./api";

const API_BASE = "/api/interviews";
const SEARCH_REC_CATEGORY = "搜广推算法";

function normalizeCategory(category: string): string {
  return category === "搜广推推荐算法" ? SEARCH_REC_CATEGORY : category;
}

function normalizeCategories<T extends { category: string }>(items: T[]): T[] {
  return items.map((item) => ({ ...item, category: normalizeCategory(item.category) }));
}

export async function fetchInterviews(
  filters: FilterState,
  page: number,
  pageSize: number = 20
): Promise<{ items: InterviewData[]; totalPages: number; total: number }> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  if (filters.search) {
    params.set("search", filters.search);
  }
  if (filters.company) {
    params.set("company", filters.company);
  }
  filters.categories.forEach((cat) => {
    params.append("categories", cat);
  });
  filters.results.forEach((res) => params.append("results", res));
  filters.interview_types.forEach((t) => params.append("interview_types", t));
  if (filters.include_unknown_interview_type) {
    params.set("include_unknown_interview_type", "true");
  }

  const response = await fetch(`${API_BASE}?${params}`);
  if (!response.ok) {
    throw new ApiError("Failed to fetch interviews", response.status);
  }

  const data: InterviewListResponse = await response.json();
  return {
    items: normalizeCategories(data.items),
    totalPages: data.total_pages,
    total: data.total,
  };
}

export async function fetchInterviewById(id: number): Promise<InterviewData> {
  const response = await fetch(`${API_BASE}/${id}`);
  if (!response.ok) {
    throw new ApiError("Interview not found", response.status);
  }
  const data: InterviewData = await response.json();
  return { ...data, category: normalizeCategory(data.category) as InterviewData["category"] };
}

export async function fetchStats(): Promise<StatsData> {
  const response = await fetch(`${API_BASE}/stats`);
  if (!response.ok) {
    throw new ApiError("Failed to fetch stats", response.status);
  }
  const data: StatsData = await response.json();
  const categories = Object.fromEntries(
    Object.entries(data.categories).map(([category, count]) => [normalizeCategory(category), count])
  );
  return { ...data, categories };
}

export async function fetchCompanies(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/companies`);
  if (!response.ok) {
    throw new ApiError("Failed to fetch companies", response.status);
  }
  return response.json();
}

export async function fetchNeighbors(
  id: number,
  filters: FilterState
): Promise<NeighborsResponse> {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }
  if (filters.company) {
    params.set("company", filters.company);
  }
  filters.categories.forEach((cat) => {
    params.append("categories", cat);
  });
  filters.results.forEach((res) => params.append("results", res));
  filters.interview_types.forEach((t) => params.append("interview_types", t));
  if (filters.include_unknown_interview_type) {
    params.set("include_unknown_interview_type", "true");
  }

  const response = await fetch(`${API_BASE}/${id}/neighbors?${params}`);
  if (!response.ok) {
    throw new ApiError("Failed to fetch neighbors", response.status);
  }
  return response.json();
}
