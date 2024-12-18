import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface UseUserPreferences {
  preferences: any;
  isLoading: boolean;
  error: Error | null;
  hasCompletedOnboarding: boolean;
}

export function useUserPreferences(): UseUserPreferences {
  const router = useRouter();
  const [preferences, setPreferences] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const response = await fetch('/api/user/preferences');
        
        if (response.status === 401) {
          router.push('/sign-in');
          return;
        }
        
        if (!response.ok) {
          throw new Error('Failed to fetch preferences');
        }
        
        const data = await response.json();
        setPreferences(data.preferences);
        setHasCompletedOnboarding(data.hasCompletedOnboarding);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        toast.error('Failed to load preferences');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, [router]);

  return { preferences, isLoading, error, hasCompletedOnboarding };
}

interface UseUserCourses {
  courses: any[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useUserCourses(): UseUserCourses {
  const router = useRouter();
  const [courses, setCourses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCourses = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/user/courses');
      
      if (response.status === 401) {
        router.push('/sign-in');
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch courses');
      }
      
      const data = await response.json();
      setCourses(data.courses);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      toast.error('Failed to load courses');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, [router]);

  return { courses, isLoading, error, refetch: fetchCourses };
}