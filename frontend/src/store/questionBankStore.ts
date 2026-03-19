import { create } from "zustand";
import { fetchInterviews, fetchStats, fetchNeighbors } from "@/lib/interviewApi";
import type {
  InterviewData,
  StatsData,
  FilterState,
  NeighborsResponse,
} from "@/types/interview";

interface QuestionBankState {
  interviews: InterviewData[];
  stats: StatsData | null;
  selectedId: number | null;
  filters: FilterState;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    total: number;
  };
  loading: boolean;
  hasFetched: boolean;
  error: string | null;
  neighbors: NeighborsResponse | null;
  detailLoading: boolean;
}

interface QuestionBankActions {
  fetchInterviews: () => Promise<void>;
  fetchStats: () => Promise<void>;
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  setSelectedId: (id: number | null) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
  fetchNeighbors: (id: number) => Promise<void>;
  navigateToDetail: (id: number) => void;
}

const initialFilters: FilterState = {
  categories: [],
  results: [],
  interview_types: [],
  include_unknown_interview_type: false,
  company: "",
  search: "",
};

export const useQuestionBankStore = create<QuestionBankState & QuestionBankActions>()(
  (set, get) => ({
    interviews: [],
    stats: null,
    selectedId: null,
    filters: initialFilters,
    pagination: { page: 1, pageSize: 20, totalPages: 1, total: 0 },
    loading: false,
    hasFetched: false,
    error: null,
    neighbors: null,
    detailLoading: false,

    fetchInterviews: async () => {
      const { filters, pagination } = get();
      set({ loading: true, error: null });
      try {
        const { items, totalPages, total } = await fetchInterviews(
          filters,
          pagination.page,
          pagination.pageSize
        );
        set({
          interviews: items,
          pagination: { ...pagination, totalPages, total },
          loading: false,
          hasFetched: true,
        });
      } catch (e) {
        set({
          error: e instanceof Error ? e.message : "An unknown error occurred",
          loading: false,
          hasFetched: true,
        });
      }
    },

    fetchStats: async () => {
      try {
        const stats = await fetchStats();
        set({ stats });
      } catch {
        // Stats fetch failure is non-critical
      }
    },

    setFilter: (key, value) => {
      set((state) => ({
        filters: { ...state.filters, [key]: value },
        pagination: { ...state.pagination, page: 1 },
      }));
    },

    setSelectedId: (id) => set({ selectedId: id, neighbors: null }),

    clearFilters: () => {
      set({
        filters: initialFilters,
        pagination: { ...get().pagination, page: 1 },
      });
    },

    setPage: (page) => {
      set((state) => ({
        pagination: { ...state.pagination, page },
      }));
    },

    fetchNeighbors: async (id) => {
      const { filters } = get();
      try {
        const neighbors = await fetchNeighbors(id, filters);
        set({ neighbors });
      } catch {
        // Neighbors fetch failure is non-critical
      }
    },

    navigateToDetail: (id) => {
      set({ selectedId: id, neighbors: null, detailLoading: true });
      get()
        .fetchNeighbors(id)
        .finally(() => set({ detailLoading: false }));
    },
  })
);
