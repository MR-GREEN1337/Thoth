// app/dashboard/_components/DashboardClient.tsx
'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Loader2,
  BookOpen,
  Sparkles,
  Trophy,
  TrendingUp,
  Target,
  Users,
  GitFork,
  Rocket,
  Filter,
} from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useUserCourses } from "@/hooks/use-user-courses"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import GenerateCourseDialog from "./GenerateCourseDialog"
import CourseCard from "./CourseCard"
import Cookies from "js-cookie"
import { useCommunityCourses } from "@/hooks/use-community-courses"

interface Course {
  id: string
  title: string
  description: string
  status: string
  estimatedHours: number
  moduleCount: number
  marketRelevance: number
  trendAlignment: number
  progress?: number
  author?: {
    name: string
    image?: string
  }
  enrollments?: any[]
  forks?: any[]
  authorId: string
}

interface Preferences {
  expertiseLevel: string
  weeklyHours: number
  preferenceAnalysis?: string
  hasCompletedOnboarding: boolean
}

interface DashboardClientProps {
  initialPreferences: Preferences
}

export default function DashboardClient({ initialPreferences }: DashboardClientProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [courseFilter, setCourseFilter] = useState<"all" | "in-progress" | "completed">("all")
  const userId = Cookies.get("token")

  // Fetch courses
  const {
    courses: communityCourses,
    isLoading: communityCoursesLoading,
    setParams: setCommunityParams,
  } = useCommunityCourses({
    limit: 20,
    sort: "popular",
  })

  const {
    courses,
    isLoading: coursesLoading,
    refetch: refetchCourses,
  } = useUserCourses()

  // Delete Course Mutation
  const deleteMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const response = await fetch(`/api/user/courses/${courseId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? "You do not have permission to delete this course"
            : "Failed to delete course"
        )
      }
      return courseId
    },
    onMutate: (courseId) => {
      toast.loading("🗑️ Deleting course...", { id: `delete-${courseId}` })
    },
    onSuccess: (courseId) => {
      toast.success("✨ Course deleted successfully", {
        id: `delete-${courseId}`,
      })
      queryClient.invalidateQueries({ queryKey: ["userCourses"] })
    },
    onError: (error, courseId) => {
      toast.error(
        `❌ ${
          error instanceof Error ? error.message : "Failed to delete course"
        }`,
        {
          id: `delete-${courseId}`,
        }
      )
    },
  })

  // Generate Courses Mutation
  const generateMutation = useMutation({
    mutationFn: async (analysis: any) => {
      const response = await fetch("/api/user/generate-courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis }),
      })
      if (!response.ok) throw new Error("Failed to generate courses")
      return response.json()
    },
    onMutate: () => {
      toast.loading("🎯 Generating your learning path...", { id: "generate" })
    },
    onSuccess: () => {
      toast.success("✨ Learning path generated successfully!", {
        id: "generate",
      })
      queryClient.invalidateQueries({ queryKey: ["userCourses"] })
      router.refresh()
    },
    onError: () => {
      toast.error("❌ Failed to generate learning path", { id: "generate" })
    },
  })

  // Fork Course Mutation
  const forkMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const response = await fetch(`/api/user/courses/${courseId}/fork`, {
        method: "POST",
      })
      if (!response.ok) throw new Error("Failed to fork course")
      return courseId
    },
    onMutate: (courseId) => {
      toast.loading("🔄 Forking course...", { id: `fork-${courseId}` })
    },
    onSuccess: (courseId) => {
      toast.success("🎉 Course forked successfully!", {
        id: `fork-${courseId}`,
      })
      queryClient.invalidateQueries({ queryKey: ["userCourses"] })
    },
    onError: (_, courseId) => {
      toast.error("❌ Failed to fork course", { id: `fork-${courseId}` })
    },
  })

  // Event Handlers
  const handleDeleteCourse = (courseId: string) => {
    deleteMutation.mutate(courseId)
  }

  const handleGenerateCourses = () => {
    if (!initialPreferences?.preferenceAnalysis) {
      toast.error("❌ No preference analysis found")
      return
    }
    generateMutation.mutate(initialPreferences.preferenceAnalysis)
  }

  const handleFork = (courseId: string) => {
    forkMutation.mutate(courseId)
  }

  // Loading State
  if (coursesLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  // Calculate progress
  const overallProgress = courses.length
    ? Math.round(
        courses.reduce((acc, course) => acc + (course.progress || 0), 0) /
          courses.length
      )
    : 0

  // Filter courses based on selected filter
  const filteredCourses = courses.filter((course) => {
    if (courseFilter === "all") return true
    if (courseFilter === "in-progress")
      return course.progress! > 0 && course.progress! < 100
    if (courseFilter === "completed") return course.progress === 100
    return true
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">
              Your Learning Journey
            </h1>
            <p className="text-gray-400">
              {initialPreferences?.expertiseLevel
                ? `${initialPreferences.expertiseLevel.toLowerCase()} level pathway`
                : "Personalized courses based on your profile"}
            </p>
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="border-gray-700 text-gray-300"
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-gray-800 border-gray-700">
                <DropdownMenuLabel className="text-gray-400">
                  Status
                </DropdownMenuLabel>
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
              preferences={{
                expertiseLevel: initialPreferences?.expertiseLevel,
                preferenceAnalysis: initialPreferences?.preferenceAnalysis || ''
              }}
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
                <div className="text-2xl font-bold text-white">
                  {overallProgress}%
                </div>
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
                <div className="text-2xl font-bold text-white">
                  {courses.length}
                </div>
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
                  {initialPreferences?.weeklyHours || 0}h
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
                  {courses.reduce(
                    (acc, course) => acc + (course.forks?.length || 0),
                    0
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Courses Section */}
        <Tabs defaultValue="my-courses" className="space-y-6">
          <TabsList className="bg-gray-800/50 border-gray-700">
            <TabsTrigger
              value="my-courses"
              className="data-[state=active]:bg-gray-700"
            >
              My Courses
            </TabsTrigger>
            <TabsTrigger
              value="community"
              className="data-[state=active]:bg-gray-700"
            >
              Community
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-courses">
            {courses.length === 0 ? (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="text-gray-400 text-center space-y-4">
                    <BookOpen className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <h2 className="text-xl font-semibold text-white">
                      No Courses Yet
                    </h2>
                    <p className="max-w-md mx-auto mb-8">
                      Let's create your personalized learning path based on your
                      interests and expertise level.
                    </p>
                    <Button
                      size="lg"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={handleGenerateCourses}
                      disabled={generateMutation.isPending}
                    >
                      {generateMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Generating Path...
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
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      layout
                    >
                      <CourseCard
                        course={{
                          ...course,
                          onRefresh: refetchCourses,
                        }}
                        onFork={handleFork}
                        onDelete={handleDeleteCourse}
                        isOwner={course.authorId === userId}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>
          <TabsContent value="community">
            <div className="space-y-6">
              {communityCoursesLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {communityCourses.length > 0 ? (
                    communityCourses.map((course: Course) => (
                      <motion.div
                        key={course.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <Card className="bg-gray-800/50 border-gray-700 hover:bg-gray-800/70 transition-colors">
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <CardTitle className="text-white">
                                  {course.title}
                                </CardTitle>
                                <CardDescription className="text-gray-400">
                                  {course.description}
                                </CardDescription>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-2">
                              <Badge
                                variant="secondary"
                                className="bg-blue-500/20 text-blue-200"
                              >
                                {course.estimatedHours}h
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="bg-purple-500/20 text-purple-200"
                              >
                                {course.moduleCount || 0} modules
                              </Badge>
                              {course.marketRelevance >= 0.8 && (
                                <Badge
                                  variant="secondary"
                                  className="bg-green-500/20 text-green-200"
                                >
                                  High Demand
                                </Badge>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                                  {course.author?.name?.charAt(0) || "A"}
                                </div>
                                <div className="text-sm">
                                  <p className="text-gray-200">
                                    {course.author?.name || "Anonymous"}
                                    {course.authorId === userId && " (it's you)"}
                                  </p>
                                  <p className="text-gray-400">Creator</p>
                                </div>
                              </div>
                              <div className="flex gap-4 text-gray-400">
                                <div className="flex items-center gap-1">
                                  <Users className="h-4 w-4" />
                                  <span className="text-sm">
                                    {course.enrollments?.length || 0}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <GitFork className="h-4 w-4" />
                                  <span className="text-sm">
                                    {course.forks?.length || 0}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                                onClick={() => router.push(`/course/${course.id}`)}
                              >
                                <BookOpen className="mr-2 h-4 w-4" />
                                Preview
                              </Button>
                              <Button
                                variant="outline"
                                className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                                onClick={() => handleFork(course.id)}
                                disabled={forkMutation.isPending}
                              >
                                {forkMutation.isPending && forkMutation.variables === course.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <GitFork className="mr-2 h-4 w-4" />
                                )}
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
                    ))
                  ) : (
                    <Card className="bg-gray-800/50 border-gray-700 col-span-full">
                      <CardContent className="flex flex-col items-center justify-center py-16">
                        <div className="text-gray-400 text-center space-y-4">
                          <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
                          <h2 className="text-xl font-semibold text-white">
                            No Community Courses
                          </h2>
                          <p className="max-w-md mx-auto mb-8">
                            Be the first to share your knowledge! Create and
                            publish a course to help others learn.
                          </p>
                          <Button
                            size="lg"
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                            onClick={() => router.push("/course/create")}
                          >
                            <Sparkles className="mr-2 h-5 w-5" />
                            Create Course
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}