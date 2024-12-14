"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  BookOpen,
  Clock,
  Target,
  Users,
  GitFork,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import FloatingEditor from "./EditableSection";
import Cookies from "js-cookie";
import CourseChat from "./CourseChat";
import CourseForksTree from "./CourseForkTree";
import React from "react";
import ModuleInteractiveElements from "./InteractiveElement";

// Comprehensive type definitions
interface MathContent {
  type: "equation" | "theorem" | "proof" | "example";
  latex: string;
  explanation: string;
  reference?: string;
}

interface InteractiveElement {
  id: string;
  type: "quiz" | "exercise" | "simulation" | "discussion";
  content: any;
  metadata: Record<string, any>;
}

interface Module {
  id: string;
  title: string;
  content: string;
  duration: number;
  order: number;
  mathContent?: MathContent[];
  interactiveElements?: InteractiveElement[];
  lastUpdated?: string;
  authorId: string;
  status: "DRAFT" | "PUBLISHED";
}

interface Author {
  id: string;
  name: string;
  image?: string;
  email: string;
  role: "INSTRUCTOR" | "ADMIN" | "STUDENT";
}

interface Course {
  id: string;
  title: string;
  description: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  marketRelevance: number;
  trendAlignment: number;
  keyTakeaways: string[];
  prerequisites: string[];
  estimatedHours: number;
  modules: Module[];
  progress?: number;
  author: Author;
  enrollments?: number;
  forks?: number;
  isCommunity?: boolean;
  ownerId?: string;
  createdAt: string;
  updatedAt: string;
  category?: string;
  tags?: string[];
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
}

// Types for ReactMarkdown components
interface CodeProps extends React.HTMLProps<HTMLElement> {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
}

interface MarkdownComponentProps {
  node?: any;
  children: React.ReactNode;
  [key: string]: any;
}

// Custom hook for course actions
const useCourseActions = (courseId: string, initialStatus: Course['status']) => {
  const [isForking, setIsForking] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const router = useRouter();

  const handleFork = async () => {
    try {
      setIsForking(true);
      const response = await fetch(`/api/user/courses/${courseId}/fork`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fork course");
      }

      const forkedCourse = await response.json();
      toast.success("Course forked successfully!");
      router.push(`/course/${forkedCourse.id}`);
    } catch (error: any) {
      console.error("Error forking course:", error);
      toast.error(error.message || "Failed to fork course");
    } finally {
      setIsForking(false);
    }
  };

  const handlePublishCourse = async () => {
    setIsPublishing(true);
    try {
      const response = await fetch(
        `/api/user/courses/${courseId}/publish`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: initialStatus === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update course status");
      }

      toast.success(
        initialStatus === "PUBLISHED"
          ? "Course unpublished successfully"
          : "Course published successfully"
      );

      router.refresh();
    } catch (error) {
      toast.error("Failed to update course status");
    } finally {
      setIsPublishing(false);
    }
  };

  return {
    isForking,
    isPublishing,
    handleFork,
    handlePublishCourse,
  };
};

// Markdown components factory
const createMarkdownComponents = (canEdit: boolean) => {
  const components: Record<string, React.FC<MarkdownComponentProps>> = {
    code: ({ inline, className, children, ...props }: CodeProps) => {
      const match = /language-(\w+)/.exec(className || "");
      return !inline && match ? (
        <div className="my-4">
          <SyntaxHighlighter
            style={dracula}
            language={match[1]}
            PreTag="div"
            {...props}
          >
            {String(children).replace(/\n$/, "")}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code
          className="bg-gray-800/50 px-1.5 py-0.5 rounded text-gray-200"
          {...props}
        >
          {children}
        </code>
      );
    },

    // Math components
    math: ({ children }) => (
      <div className="my-4 p-4 bg-gray-800/50 rounded overflow-x-auto">
        <div className="latex-container">{children}</div>
      </div>
    ),
    inlineMath: ({ children }) => (
      <span className="latex-inline">{children}</span>
    ),

    // Block elements
    p: ({ children, ...props }) => {
      const hasBlockElement = React.Children.toArray(children).some(
        (child: any) =>
          child?.props?.className?.includes("latex-container") ||
          child?.type === "div"
      );

      return hasBlockElement ? (
        <>{children}</>
      ) : (
        <p className="mb-4 text-gray-300 leading-relaxed" {...props}>
          {children}
        </p>
      );
    },

    // Headings
    h1: ({ children, ...props }) => (
      <h1 className="text-2xl font-bold mb-4 text-white mt-6" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="text-xl font-bold mb-3 text-white mt-5" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="text-lg font-bold mb-2 text-white mt-4" {...props}>
        {children}
      </h3>
    ),

    // Lists
    ul: ({ children, ...props }) => (
      <ul className="list-disc ml-6 mb-4 text-gray-300 space-y-2" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="list-decimal ml-6 mb-4 text-gray-300 space-y-2" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="text-gray-300 pl-1" {...props}>
        <span className="flex items-start">
          <span className="mt-0">{children}</span>
        </span>
      </li>
    ),

    // Interactive elements
    a: ({ children, href, ...props }) => (
      <a
        className="text-blue-400 hover:text-blue-300 underline"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        className="border-l-4 border-gray-700 pl-4 my-4 text-gray-400 italic"
        {...props}
      >
        {children}
      </blockquote>
    ),

    // Tables
    table: ({ children, ...props }) => (
      <div className="my-4 overflow-x-auto w-full">
        <table
          className="min-w-full divide-y divide-gray-700 border border-gray-700"
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }) => (
      <thead className="bg-gray-800/50" {...props}>
        {children}
      </thead>
    ),
    tbody: ({ children, ...props }) => (
      <tbody className="divide-y divide-gray-700" {...props}>
        {children}
      </tbody>
    ),
    th: ({ children, ...props }) => (
      <th
        className="px-4 py-2 text-left text-gray-300 font-bold whitespace-nowrap"
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td
        className="px-4 py-2 text-gray-300 whitespace-nowrap"
        {...props}
      >
        {children}
      </td>
    ),

    // Media elements
    img: ({ src, alt, ...props }) => (
      <img
        src={src}
        alt={alt}
        className="max-w-full h-auto rounded-lg my-4"
        loading="lazy"
        {...props}
      />
    ),

    // Formatting
    hr: ({ ...props }) => <hr className="my-8 border-gray-700" {...props} />,
    em: ({ children }) => <em className="italic">{children}</em>,
    strong: ({ children }) => (
      <strong className="font-bold text-gray-200">{children}</strong>
    ),
    del: ({ children }) => (
      <del className="line-through text-gray-500">{children}</del>
    ),

    // Code blocks
    pre: ({ children, ...props }) => (
      <pre className="bg-transparent" {...props}>
        {children}
      </pre>
    ),
  };

  return components;
};

export function CourseClient({ initialCourse }: { initialCourse: Course }) {
  const [activeModule, setActiveModule] = useState<string | null>(
    initialCourse?.modules[0]?.id || null
  );
  
  const canEdit = initialCourse.author.id === Cookies.get("token");
  const {
    isForking,
    isPublishing,
    handleFork,
    handlePublishCourse,
  } = useCourseActions(initialCourse.id, initialCourse.status);

  const activeModuleContent = initialCourse.modules.find(
    (m) => m.id === activeModule
  );

  const markdownComponents = createMarkdownComponents(canEdit);

  const renderModuleContent = () => {
    if (!activeModuleContent) {
      return (
        <div className="text-center text-gray-400 py-8">
          <AlertCircle className="h-12 w-12 mx-auto mb-4" />
          <p>No module selected or content available</p>
        </div>
      );
    }

    return (
      <div className="prose prose-invert max-w-none">
        {canEdit ? (
          <FloatingEditor
            key={`module-${activeModuleContent.id}`}
            content={activeModuleContent.content}
            onSave={async (newContent) => {
              await fetch(
                `/api/user/courses/${initialCourse.id}/modules/${activeModuleContent.id}`,
                {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ content: newContent }),
                }
              );
              toast.success("Module content updated successfully");
            }}
            type="markdown"
            course={initialCourse}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={markdownComponents}
            >
              {activeModuleContent.content}
            </ReactMarkdown>
          </FloatingEditor>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
          >
            {activeModuleContent.content}
          </ReactMarkdown>
        )}

        {activeModuleContent.interactiveElements && (
          <div className="mt-8">
            <ModuleInteractiveElements
              elements={activeModuleContent.interactiveElements}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Course Header */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {canEdit ? (
              <FloatingEditor
                key={initialCourse.title}
                content={initialCourse.title}
                onSave={async (newTitle) => {
                  await fetch(`/api/user/courses/${initialCourse.id}`, {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ title: newTitle }),
                  });
                  toast.success("Course title updated successfully");
                }}
                course={initialCourse}
              >
                <h1 className="text-3xl font-bold text-white mb-4">
                  {initialCourse.title}
                </h1>
              </FloatingEditor>
            ) : (
              <h1 className="text-3xl font-bold text-white mb-4">
                {initialCourse.title}
              </h1>
            )}

            <div className="flex flex-wrap gap-4 mb-6">
              <Badge variant="secondary" className="bg-blue-500/20 text-blue-200">
              <Clock className="h-4 w-4 mr-1" />
                {initialCourse.estimatedHours}h duration
              </Badge>
              <Badge variant="secondary" className="bg-purple-500/20 text-purple-200">
                <BookOpen className="h-4 w-4 mr-1" />
                {initialCourse.modules.length} modules
              </Badge>
              {initialCourse.marketRelevance >= 0.8 && (
                <Badge variant="secondary" className="bg-green-500/20 text-green-200">
                  <Target className="h-4 w-4 mr-1" />
                  High Market Relevance
                </Badge>
              )}
              <Badge
                variant="secondary"
                className={`${
                  initialCourse.status === "PUBLISHED"
                    ? "bg-green-500/20 text-green-200"
                    : initialCourse.status === "DRAFT"
                    ? "bg-yellow-500/20 text-yellow-200"
                    : "bg-gray-500/20 text-gray-200"
                }`}
              >
                {initialCourse.status.toLowerCase()}
              </Badge>
            </div>

            {canEdit ? (
              <FloatingEditor
                key={initialCourse.description}
                content={initialCourse.description}
                onSave={async (newDescription) => {
                  await fetch(`/api/user/courses/${initialCourse.id}`, {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ description: newDescription }),
                  });
                  toast.success("Course description updated successfully");
                }}
                course={initialCourse}
              >
                <p className="text-gray-400 mb-6">{initialCourse.description}</p>
              </FloatingEditor>
            ) : (
              <p className="text-gray-400 mb-6">{initialCourse.description}</p>
            )}

            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-gray-400" />
                <span className="text-gray-300">
                  {initialCourse.enrollments?.toLocaleString() || 0} enrolled
                </span>
              </div>
              <div className="flex items-center gap-2">
                <GitFork className="h-5 w-5 text-gray-400" />
                <span className="text-gray-300">
                  {initialCourse.forks?.toLocaleString() || 0} forks
                </span>
              </div>
              <Button
                variant="outline"
                className="border-gray-700 text-gray-300 hover:bg-gray-800"
                onClick={handleFork}
                disabled={isForking}
              >
                {isForking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Forking...
                  </>
                ) : (
                  <>
                    <GitFork className="mr-2 h-4 w-4" />
                    Fork Course
                  </>
                )}
              </Button>
              {canEdit && (
                <Button
                  variant="outline"
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                  onClick={handlePublishCourse}
                  disabled={isPublishing}
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {initialCourse.status === "PUBLISHED"
                        ? "Unpublishing..."
                        : "Publishing..."}
                    </>
                  ) : (
                    <>
                      <BookOpen className="mr-2 h-4 w-4" />
                      {initialCourse.status === "PUBLISHED"
                        ? "Unpublish"
                        : "Publish"}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Progress Card */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Course Progress</CardTitle>
              <CardDescription className="text-gray-400">
                Track your learning journey
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Overall Progress</span>
                  <span className="text-gray-200">
                    {initialCourse.progress || 0}%
                  </span>
                </div>
                <Progress
                  value={initialCourse.progress || 0}
                  className="h-2"
                />
              </div>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                Continue Learning
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Course Content Tabs */}
        <Tabs defaultValue="content" className="space-y-6">
          <TabsList className="bg-gray-800/50 border-gray-700">
            <TabsTrigger
              value="content"
              className="data-[state=active]:bg-gray-700"
            >
              Course Content
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className="data-[state=active]:bg-gray-700"
            >
              Discussion
            </TabsTrigger>
            <TabsTrigger
              value="info"
              className="data-[state=active]:bg-gray-700"
            >
              Course Info
            </TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Module List */}
              <div className="space-y-2">
                {initialCourse.modules.map((module) => (
                  <Card
                    key={module.id}
                    className={`bg-gray-800/50 border-gray-700 cursor-pointer transition-colors ${
                      activeModule === module.id
                        ? "ring-2 ring-blue-500"
                        : "hover:bg-gray-800/70"
                    }`}
                    onClick={() => setActiveModule(module.id)}
                  >
                    <CardHeader className="p-4">
                      <div className="flex justify-between items-start gap-2">
                        <CardTitle className="text-sm text-white">
                          {module.title}
                        </CardTitle>
                        <div className="flex items-center gap-1 text-gray-400">
                          <Clock className="h-4 w-4" />
                          <span className="text-xs">{module.duration}m</span>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>

              {/* Module Content */}
              <div className="lg:col-span-3">
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center justify-between">
                      <span>{activeModuleContent?.title}</span>
                      {activeModuleContent?.lastUpdated && (
                        <span className="text-sm text-gray-400">
                          Last updated: {new Date(activeModuleContent.lastUpdated).toLocaleDateString()}
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <div className="min-w-[800px] w-full">
                        {renderModuleContent()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="chat">
            <CourseChat courseId={initialCourse.id} />
          </TabsContent>

          <TabsContent value="info">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Prerequisites Card */}
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Prerequisites</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-2 text-gray-300">
                    {initialCourse.prerequisites.map((prereq, index) => (
                      <li key={index}>{prereq}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Key Takeaways Card */}
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Key Takeaways</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-2 text-gray-300">
                    {initialCourse.keyTakeaways.map((takeaway, index) => (
                      <li key={index}>{takeaway}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Course Metadata */}
              <Card className="bg-gray-800/50 border-gray-700 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-white">Course Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-gray-400 mb-1">Category</h3>
                    <p className="text-gray-200">{initialCourse.category || "Uncategorized"}</p>
                  </div>
                  <div>
                    <h3 className="text-gray-400 mb-1">Difficulty</h3>
                    <p className="text-gray-200">{initialCourse.difficulty}</p>
                  </div>
                  <div>
                    <h3 className="text-gray-400 mb-1">Created</h3>
                    <p className="text-gray-200">
                      {new Date(initialCourse.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-gray-400 mb-1">Last Updated</h3>
                    <p className="text-gray-200">
                      {new Date(initialCourse.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Course Fork Tree */}
              <Card className="bg-gray-800/50 border-gray-700 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-white">Course History</CardTitle>
                </CardHeader>
                <CardContent>
                  <CourseForksTree courseId={initialCourse.id} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}