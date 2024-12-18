export interface Course {
  id: string;
  title: string;
  description: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  marketRelevance: number;
  trendAlignment: number;
  keyTakeaways: string[];
  prerequisites: string[];
  estimatedHours: number;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Module {
  id: string;
  title: string;
  content: string;
  order: number;
  duration: number;
  courseId: string;
  aiGenerated: boolean;
  aiPrompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseWithModules extends Course {
  modules: Module[];
}

export interface CourseCreationPayload {
  userId: string;
  preferenceId?: string;
  generateModules?: boolean;
}

export interface CourseGenerationResponse {
  course: CourseWithModules;
  error?: string;
}
