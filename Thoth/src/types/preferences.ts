export enum ExpertiseLevel {
    BEGINNER = "BEGINNER",
    INTERMEDIATE = "INTERMEDIATE",
    ADVANCED = "ADVANCED",
    EXPERT = "EXPERT"
  }
  
  export enum Category {
    LEARNING_PATH = "Learning Path",
    TECHNOLOGY = "Technology",
    SKILL = "Skill"
  }
  
  export interface Interest {
    name: string;
    category: Category;
    marketDemand: "High" | "Medium" | "Low";
    trendingTopics: string[];
    description: string;
  }
  
  export interface MarketInsights {
    trends: string[];
    opportunities: string[];
  }
  
  export interface LearningPath {
    fundamentals: string[];
    intermediate: string[];
    advanced: string[];
    estimatedTimeMonths: number;
  }
  
  export interface PreferencesAnalysis {
    interests: Interest[];
    expertiseLevel: ExpertiseLevel;
    suggestedWeeklyHours: number;
    marketInsights: MarketInsights;
    learningPath: LearningPath;
  }
  
  export interface SavePreferencesPayload {
    userId: string;
    preferences: string;
    analysis: {
      analysis: PreferencesAnalysis;
    };
  }