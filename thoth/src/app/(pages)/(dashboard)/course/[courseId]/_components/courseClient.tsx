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

interface Module {
  id: string;
  title: string;
  content: string;
  duration: number;
  order: number;
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
  author?: {
    id: string;
    name: string;
    image?: string;
  };
  enrollments?: number;
  forks?: number;
  isCommunity?: boolean;
  ownerId?: string;
}

interface FloatingEditorProps {
  content: string;
  onSave: (content: string) => Promise<void>;
  children?: React.ReactNode;
  type?: "markdown" | "text";
  course: Course;
  currentUserId?: string;
}

interface CourseClientProps {
  initialCourse: Course;
}

export function CourseClient({ initialCourse }: CourseClientProps) {
  const router = useRouter();
  const [activeModule, setActiveModule] = useState<string | null>(
    initialCourse?.modules[0]?.id || null
  );
  const [isForking, setIsForking] = useState(false);
  const canEdit = initialCourse.author.id === Cookies.get("token"); // can modify only if course belongs to user

  console.log(initialCourse);
  console.log(Cookies.get("token"));
  console.log(canEdit);

  if (!initialCourse) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <Card className="bg-gray-800/50 border-gray-700 max-w-md mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpen className="h-16 w-16 text-gray-400 mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">
              Course Not Found
            </h2>
            <p className="text-gray-400 text-center">
              The course you're looking for doesn't exist or has been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleFork = async () => {
    try {
      setIsForking(true);
      const response = await fetch(
        `/api/user/courses/${initialCourse.id}/fork`,
        {
          method: "POST",
        }
      );

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

  const activeModuleContent = initialCourse.modules.find(
    (m) => m.id === activeModule
  );

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
                    body: JSON.stringify({ title: newTitle }),
                  });
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

            {canEdit ? (
              <FloatingEditor
                key={initialCourse.description}
                content={initialCourse.description}
                onSave={async (newDescription) => {
                  await fetch(`/api/user/courses/${initialCourse.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ description: newDescription }),
                  });
                }}
                course={initialCourse}
              >
                <p className="text-gray-400 mb-6">
                  {initialCourse.description}
                </p>
              </FloatingEditor>
            ) : (
              <p className="text-gray-400 mb-6">{initialCourse.description}</p>
            )}

            <div className="flex flex-wrap gap-2 mb-6">
              <Badge
                variant="secondary"
                className="bg-blue-500/20 text-blue-200"
              >
                {initialCourse.estimatedHours}h duration
              </Badge>
              <Badge
                variant="secondary"
                className="bg-purple-500/20 text-purple-200"
              >
                {initialCourse.modules.length} modules
              </Badge>
              {initialCourse.marketRelevance >= 0.8 && (
                <Badge
                  variant="secondary"
                  className="bg-green-500/20 text-green-200"
                >
                  High Market Relevance
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-gray-400" />
                <span className="text-gray-300">
                  {initialCourse.enrollments || 0} enrolled
                </span>
              </div>
              <div className="flex items-center gap-2">
                <GitFork className="h-5 w-5 text-gray-400" />
                <span className="text-gray-300">
                  {initialCourse.forks || 0} forks
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
            </div>
          </div>

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
                <Progress value={initialCourse.progress || 0} className="h-2" />
              </div>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                Continue Learning
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Course Content */}
        <Tabs defaultValue="content" className="space-y-6">
          <TabsList className="bg-gray-800/50 border-gray-700">
            <TabsTrigger
              value="content"
              className="data-[state=active]:bg-gray-700"
            >
              Course Content
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
                    <CardTitle className="text-white">
                      {activeModuleContent?.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          code({
                            node,
                            inline,
                            className,
                            children,
                            ...props
                          }) {
                            const match = /language-(\w+)/.exec(
                              className || ""
                            );
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={dracula}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, "")}
                              </SyntaxHighlighter>
                            ) : (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          },
                          // Custom styling for other markdown elements
                          h1: ({ node, ...props }) => (
                            <h1
                              className="text-2xl font-bold mb-4 text-white"
                              {...props}
                            />
                          ),
                          h2: ({ node, ...props }) => (
                            <h2
                              className="text-xl font-bold mb-3 text-white"
                              {...props}
                            />
                          ),
                          h3: ({ node, ...props }) => (
                            <h3
                              className="text-lg font-bold mb-2 text-white"
                              {...props}
                            />
                          ),
                          p: ({ node, ...props }) => (
                            <p className="mb-4 text-gray-300" {...props} />
                          ),
                          ul: ({ node, ...props }) => (
                            <ul
                              className="list-disc list-inside mb-4 text-gray-300"
                              {...props}
                            />
                          ),
                          ol: ({ node, ...props }) => (
                            <ol
                              className="list-decimal list-inside mb-4 text-gray-300"
                              {...props}
                            />
                          ),
                          li: ({ node, ...props }) => (
                            <li className="mb-1 text-gray-300" {...props} />
                          ),
                          a: ({ node, ...props }) => (
                            <a
                              className="text-blue-400 hover:text-blue-300 underline"
                              {...props}
                            />
                          ),
                          blockquote: ({ node, ...props }) => (
                            <blockquote
                              className="border-l-4 border-gray-700 pl-4 italic my-4 text-gray-400"
                              {...props}
                            />
                          ),
                          table: ({ node, ...props }) => (
                            <div className="overflow-x-auto mb-4">
                              <table
                                className="min-w-full divide-y divide-gray-700"
                                {...props}
                              />
                            </div>
                          ),
                          th: ({ node, ...props }) => (
                            <th
                              className="px-4 py-2 text-left text-gray-300 font-bold bg-gray-800/50"
                              {...props}
                            />
                          ),
                          td: ({ node, ...props }) => (
                            <td
                              className="px-4 py-2 text-gray-300 border-t border-gray-700"
                              {...props}
                            />
                          ),
                          img: ({ node, ...props }) => (
                            <img
                              className="max-w-full h-auto rounded-lg my-4"
                              {...props}
                              loading="lazy"
                            />
                          ),
                          hr: ({ node, ...props }) => (
                            <hr className="my-8 border-gray-700" {...props} />
                          ),
                        }}
                      >
                        {activeModuleContent?.content || ""}
                      </ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="info">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
