// hooks/use-community-courses.ts
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDebounce } from "./use-debounce";

export type CommunityCoursesParams = {
  query?: string;
  page?: number;
  limit?: number;
  category?: string;
  sort?: "popular" | "recent" | "trending";
};

export const useCommunityCourses = (initialParams: CommunityCoursesParams = {}) => {
  const [params, setParams] = useState(initialParams);
  const debouncedQuery = useDebounce(params.query, 500);

  const queryParams = new URLSearchParams({
    ...(debouncedQuery && { query: debouncedQuery }),
    ...(params.page && { page: params.page.toString() }),
    ...(params.limit && { limit: params.limit.toString() }),
    ...(params.category && { category: params.category }),
    ...(params.sort && { sort: params.sort }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["communityCourses", debouncedQuery, params.page, params.limit, params.category, params.sort],
    queryFn: async () => {
      const response = await fetch(`/api/courses/published/search?${queryParams}`);
      if (!response.ok) throw new Error("Failed to fetch community courses");
      return response.json();
    },
  });

  return {
    courses: data?.courses ?? [],
    metadata: data?.metadata,
    isLoading,
    error,
    setParams,
  };
};