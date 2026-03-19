import { useQuestionBankStore } from "@/store/questionBankStore";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  ALL_CATEGORIES,
  ALL_RESULTS,
  ALL_INTERVIEW_TYPES,
  type Category,
  type InterviewResult,
  type InterviewType,
} from "@/types/interview";
import { X, Search } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function QuestionFilters() {
  const { filters, setFilter, clearFilters } = useQuestionBankStore();
  const [localSearch, setLocalSearch] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilter("search", value);
    }, 300);
  };

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.results.length > 0 ||
    filters.interview_types.length > 0 ||
    filters.include_unknown_interview_type ||
    filters.company ||
    filters.search;

  const toggleCategory = (cat: Category) => {
    const next = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    setFilter("categories", next);
  };

  const toggleResult = (result: InterviewResult) => {
    const next = filters.results.includes(result)
      ? filters.results.filter((r) => r !== result)
      : [...filters.results, result];
    setFilter("results", next);
  };

  const toggleInterviewType = (type: InterviewType) => {
    const next = filters.interview_types.includes(type)
      ? filters.interview_types.filter((t) => t !== type)
      : [...filters.interview_types, type];
    setFilter("interview_types", next);
  };

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索标题、公司..."
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-8 border-transparent bg-zinc-100 pl-9 text-sm focus:bg-background focus:ring-2 focus:ring-accent/20 dark:bg-white/5"
        />
        {localSearch && (
          <button
            onClick={() => {
              setLocalSearch("");
              setFilter("search", "");
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* All filters in one row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ALL_CATEGORIES.map((cat) => (
          <Badge
            key={cat}
            variant={filters.categories.includes(cat) ? "default" : "outline"}
            className={cn(
              "cursor-pointer text-xs transition-colors",
              filters.categories.includes(cat) && "bg-primary"
            )}
            onClick={() => toggleCategory(cat)}
          >
            {cat}
          </Badge>
        ))}
        <span className="mx-0.5 text-border">|</span>
        {ALL_RESULTS.map((result) => (
          <Badge
            key={result}
            variant={filters.results.includes(result) ? "default" : "outline"}
            className={cn(
              "cursor-pointer text-xs transition-colors",
              filters.results.includes(result) && "bg-primary"
            )}
            onClick={() => toggleResult(result)}
          >
            {result === "null" ? "pending" : result}
          </Badge>
        ))}
        <span className="mx-0.5 text-border">|</span>
        {ALL_INTERVIEW_TYPES.map((type) => (
          <Badge
            key={type}
            variant={filters.interview_types.includes(type) ? "default" : "outline"}
            className={cn(
              "cursor-pointer text-xs transition-colors",
              filters.interview_types.includes(type) && "bg-primary"
            )}
            onClick={() => toggleInterviewType(type)}
          >
            {type}
          </Badge>
        ))}
        <Badge
          variant={filters.include_unknown_interview_type ? "default" : "outline"}
          className={cn(
            "cursor-pointer text-xs transition-colors",
            filters.include_unknown_interview_type && "bg-primary"
          )}
          onClick={() =>
            setFilter(
              "include_unknown_interview_type",
              !filters.include_unknown_interview_type
            )
          }
        >
          未知
        </Badge>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="ml-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            清除
          </button>
        )}
      </div>
    </div>
  );
}
