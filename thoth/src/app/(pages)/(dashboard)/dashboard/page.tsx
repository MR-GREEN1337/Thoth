"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Loader2, BookOpen, Sparkles, Trophy, TrendingUp, 
  Target, Users, GitFork, Rocket, Filter
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUserPreferences, useUserCourses } from "@/hooks/use-user-courses";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GenerateCourseDialog from "./_components/GenerateCourseDialog";

export default function DashboardPage() {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("my-courses");
  const [courseFilter, setCourseFilter] = useState("all");
  const { courses, isLoading: coursesLoading, refetch: refetchCourses } = useUserCourses();
  const { 
    preferences, 
    isLoading: preferencesLoading, 
    hasCompletedOnboarding 
  } = useUserPreferences();

  useEffect(() => {
    if (!preferencesLoading && !hasCompletedOnboarding) {
      router.push('/onboarding');
    }
    console.log(courses)
  }, [preferencesLoading, hasCompletedOnboarding, router]);

  const handleGenerateCourses = async () => {
    if (!preferences?.preferenceAnalysis) {
      toast.error('No preference analysis found');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/user/generate-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          analysis: preferences.preferenceAnalysis 
        })
      });
      
      if (!response.ok) throw new Error('Failed to generate courses');
      
      await refetchCourses();
      toast.success('Learning path generated successfully!');
    } catch (error) {
      console.error('Error generating courses:', error);
      toast.error('Failed to generate learning path');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFork = async (course: any) => {
    try {
      const response = await fetch(`/api/courses/${course.id}/fork`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to fork course');
      
      await refetchCourses();
      toast.success('Course forked successfully!');
    } catch (error) {
      toast.error('Failed to fork course');
    }
  };

  if (coursesLoading || preferencesLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const overallProgress = courses.length 
    ? Math.round(courses.reduce((acc, course) => acc + (course.progress || 0), 0) / courses.length)
    : 0;

  const filteredCourses = courses.filter(course => {
    if (courseFilter === "all") return true;
    if (courseFilter === "in-progress") return course.progress > 0 && course.progress < 100;
    if (courseFilter === "completed") return course.progress === 100;
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Your Learning Journey</h1>
            <p className="text-gray-400">
              {preferences?.expertiseLevel ? 
                `${preferences.expertiseLevel.toLowerCase()} level pathway` : 
                'Personalized courses based on your profile'}
            </p>
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-gray-700 text-gray-300">
                  <Filter className="mr-2 h-4 w-4" />
                  Filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-gray-800 border-gray-700">
                <DropdownMenuLabel className="text-gray-400">Status</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-700" />
                <DropdownMenuItem 
                  className="text-gray-200"
                  onClick={() => setCourseFilter("all")}
                >
                  All Courses
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-gray-200"
                  onClick={() => setCourseFilter("in-progress")}
                >
                  In Progress
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-gray-200"
                  onClick={() => setCourseFilter("completed")}
                >
                  Completed
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <GenerateCourseDialog 
              preferences={preferences}
              onCourseGenerated={refetchCourses}
            />
          </div>
        </div>

        {/* Stats Overview */}
        {courses.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  Progress
                </CardTitle>
                <Trophy className="h-4 w-4 text-yellow-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{overallProgress}%</div>
                <Progress value={overallProgress} className="mt-2" />
              </CardContent>
            </Card>
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  Active Courses
                </CardTitle>
                <Target className="h-4 w-4 text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{courses.length}</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  Weekly Hours
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-green-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {preferences?.weeklyHours || 0}h
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  Community Impact
                </CardTitle>
                <Users className="h-4 w-4 text-purple-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {courses.reduce((acc, course) => acc + (course.forks?.length || 0), 0)}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Courses Section */}
        <Tabs defaultValue="my-courses" className="space-y-6">
          <TabsList className="bg-gray-800/50 border-gray-700">
            <TabsTrigger value="my-courses" className="data-[state=active]:bg-gray-700">
              My Courses
            </TabsTrigger>
            <TabsTrigger value="community" className="data-[state=active]:bg-gray-700">
              Community
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-courses">
            {courses.length === 0 ? (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="text-gray-400 text-center space-y-4">
                    <BookOpen className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <h2 className="text-xl font-semibold text-white">No Courses Yet</h2>
                    <p className="max-w-md mx-auto mb-8">
                      Let's create your personalized learning path based on your interests and expertise level.
                    </p>
                    <Button 
                      size="lg"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={handleGenerateCourses}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Generating Your Path...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-5 w-5" />
                          Generate My Learning Path
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {filteredCourses.map((course) => (
                    <motion.div
                      key={course.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      <a href={`/course/${course.id}`}>
                      <Card className="bg-gray-800/50 border-gray-700 hover:bg-gray-800/70 transition-colors cursor-pointer">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <CardTitle className="text-white">{course.title}</CardTitle>
                            <Badge 
                              variant="secondary"
                              className={
                                course.status === 'PUBLISHED' 
                                  ? 'bg-green-500/20 text-green-200'
                                  : course.status === 'DRAFT'
                                  ? 'bg-yellow-500/20 text-yellow-200'
                                  : 'bg-gray-500/20 text-gray-200'
                              }
                            >
                              {course.status.toLowerCase()}
                            </Badge>
                          </div>
                          <CardDescription className="text-gray-400">
                            {course.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Progress</span>
                              <span className="text-gray-200">{course.progress || 0}%</span>
                            </div>
                            <Progress value={course.progress || 0} className="h-2" />
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-400">Duration</p>
                              <p className="text-gray-200">{course.estimatedHours}h</p>
                            </div>
                            <div>
                              <p className="text-gray-400">Modules</p>
                              <p className="text-gray-200">{course.moduleCount || 0}</p>
                            </div>
                          </div>
                          {course.forkedFrom && (
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                              <GitFork className="h-4 w-4" />
                              <span>Forked from community</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      </a>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          <TabsContent value="community">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {courses
                  .filter(course => course.status === 'PUBLISHED')
                  .map((course) => (
                    <motion.div
                      key={course.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className="bg-gray-800/50 border-gray-700 hover:bg-gray-800/70 transition-colors">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <CardTitle className="text-white">{course.title}</CardTitle>
                              <CardDescription className="text-gray-400">
                                {course.description}
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="secondary" className="bg-blue-500/20 text-blue-200">
                              {course.estimatedHours}h
                            </Badge>
                            <Badge variant="secondary" className="bg-purple-500/20 text-purple-200">
                              {course.moduleCount || 0} modules
                              </Badge>
                              {course.marketRelevance >= 0.8 && (
                                <Badge variant="secondary" className="bg-green-500/20 text-green-200">
                                  High Demand
                                </Badge>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                                  {course.author?.name?.charAt(0) || 'A'}
                                </div>
                                <div className="text-sm">
                                  <p className="text-gray-200">{course.author?.name || 'Anonymous'}</p>
                                  <p className="text-gray-400">Creator</p>
                                </div>
                              </div>
                              <div className="flex gap-4 text-gray-400">
                                <div className="flex items-center gap-1">
                                  <Users className="h-4 w-4" />
                                  <span className="text-sm">{course.enrollments?.length || 0}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <GitFork className="h-4 w-4" />
                                  <span className="text-sm">{course.forks?.length || 0}</span>
                                </div>
                              </div>
                            </div>
  
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                                onClick={() => router.push(`/courses/${course.id}`)}
                              >
                                <BookOpen className="mr-2 h-4 w-4" />
                                Preview
                              </Button>
                              <Button
                                variant="outline"
                                className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                                onClick={() => handleFork(course)}
                              >
                                <GitFork className="mr-2 h-4 w-4" />
                                Fork Course
                              </Button>
                            </div>
  
                            {course.trendAlignment > 0.7 && (
                              <div className="flex items-center gap-2 text-sm text-gray-400 bg-blue-500/10 p-2 rounded">
                                <Rocket className="h-4 w-4 text-blue-400" />
                                <span>Trending in your field</span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                </div>
  
                {courses.filter(course => course.status === 'PUBLISHED').length === 0 && (
                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <div className="text-gray-400 text-center space-y-4">
                        <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
                        <h2 className="text-xl font-semibold text-white">No Community Courses</h2>
                        <p className="max-w-md mx-auto mb-8">
                          Be the first to share your knowledge! Create and publish a course to help others learn.
                        </p>
                        <Button 
                          size="lg"
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                          onClick={() => router.push('/courses/create')}
                        >
                          <Sparkles className="mr-2 h-5 w-5" />
                          Create Course
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }