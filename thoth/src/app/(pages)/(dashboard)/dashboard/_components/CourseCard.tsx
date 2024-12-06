import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  GitFork,
  BookOpen,
  Loader2,
  Clock,
  Trash2,
  MoreVertical,
  Link,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const CourseCard = ({
  course,
  onFork,
  onDelete,
  isOwner = false,
}: {
  course: any;
  onFork: (courseId: string) => void;
  onDelete?: (courseId: string) => void;
  isOwner?: boolean;
}) => {
  const router = useRouter();
  const [isForking, setIsForking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const handleViewCourse = () => {
    router.push(`/course/${course.id}`);
  };

  const handleCopyUrl = async () => {
    const courseUrl = `${window.location.origin}/course/${course.id}`;
    try {
      await navigator.clipboard.writeText(courseUrl);
      toast.success("Course URL copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy URL");
    }
  };

  const handlePublishCourse = async () => {
    setIsPublishing(true);
    try {
      const response = await fetch(`/api/user/courses/${course.id}/publish`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update course status");
      }

      toast.success(
        course.status === "PUBLISHED"
          ? "Course unpublished successfully"
          : "Course published successfully"
      );

      if (course.onRefresh) {
        await course.onRefresh();
      }
    } catch (error) {
      toast.error("Failed to update course status");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleFork = async () => {
    setIsForking(true);
    try {
      await onFork(course.id);
      toast.success("Course forked successfully!");
    } catch (error) {
      toast.error("Failed to fork course");
    } finally {
      setIsForking(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(course.id);
    } catch (error) {
      toast.error("Failed to delete course");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="relative bg-gradient-to-br from-gray-800/50 to-gray-900/50 border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/10">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none" />

      <CardHeader className="space-y-4 relative">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-white group-hover:text-blue-400 transition-colors">
                {course.title}
              </CardTitle>
              {course.status && (
                <Badge
                  variant="secondary"
                  className={
                    course.status === "PUBLISHED"
                      ? "bg-green-500/20 text-green-200"
                      : course.status === "DRAFT"
                      ? "bg-yellow-500/20 text-yellow-200"
                      : "bg-gray-500/20 text-gray-200"
                  }
                >
                  {course.status.toLowerCase()}
                </Badge>
              )}
            </div>
            <CardDescription className="text-gray-400 line-clamp-2">
              {course.description}
            </CardDescription>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-gray-400 hover:text-gray-200"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-gray-800 border-gray-700"
            >
              <DropdownMenuItem
                className="text-gray-200 focus:text-gray-200 focus:bg-gray-700"
                onClick={handleCopyUrl}
              >
                <Link className="h-4 w-4 mr-2" />
                Copy URL
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuItem
                    className="text-gray-200 focus:text-gray-200 focus:bg-gray-700"
                    onClick={handlePublishCourse}
                    disabled={isPublishing}
                  >
                    {isPublishing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {course.status === "PUBLISHED"
                          ? "Unpublishing..."
                          : "Publishing..."}
                      </>
                    ) : (
                      <>
                        <BookOpen className="h-4 w-4 mr-2" />
                        {course.status === "PUBLISHED"
                          ? "Unpublish"
                          : "Publish"}
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-gray-700" />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        className="text-red-400 focus:text-red-400 focus:bg-red-900/20"
                        onSelect={(e) => e.preventDefault()}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-gray-800 border-gray-700">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">
                          Delete Course
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-400">
                          Are you sure you want to delete "{course.title}"? This
                          action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel
                          className="bg-gray-700 text-white hover:bg-gray-600"
                          disabled={isDeleting}
                        >
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 text-white hover:bg-red-700"
                          onClick={handleDelete}
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            "Delete"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-blue-500/20 text-blue-200">
            <Clock className="h-3 w-3 mr-1" />
            {course.estimatedHours}h
          </Badge>
          <Badge
            variant="secondary"
            className="bg-purple-500/20 text-purple-200"
          >
            {course.modules?.length || 0} modules
          </Badge>
          {course.forkedFrom && (
            <Badge
              variant="secondary"
              className="bg-orange-500/20 text-orange-200"
            >
              Forked
            </Badge>
          )}
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
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8 border-2 border-blue-500/20">
              <AvatarImage src={course.author?.image} />
              <AvatarFallback className="bg-blue-500/20 text-blue-200">
                {course.author?.name?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="text-sm">
              <p className="text-gray-200 font-medium">{course.author?.name}</p>
              <p className="text-gray-400">Author</p>
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

        {course.progress !== undefined && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Progress</span>
              <span className="text-gray-200">{course.progress}%</span>
            </div>
            <Progress value={course.progress} className="h-2" />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="secondary"
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200"
            onClick={handleViewCourse}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            View Course
          </Button>
          <Button
            variant="secondary"
            className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200"
            onClick={handleFork}
            disabled={isForking}
          >
            {isForking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <GitFork className="mr-2 h-4 w-4" />
                Fork Course
              </>
            )}
          </Button>
        </div>
      </CardContent>

    </Card>
  );
};

export default CourseCard;