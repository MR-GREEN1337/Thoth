import { useState } from 'react';
import { 
  Users, GitFork, MessageSquare, Share2, 
  ThumbsUp, Edit, History, BookOpen 
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

const CourseCard = ({ course, onFork }: { course: any, onFork: (course: any) => void }) => {
  const [isForking, setIsForking] = useState(false);

  const handleFork = async () => {
    setIsForking(true);
    try {
      const response = await fetch(`/api/courses/${course.id}/fork`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to fork course');
      
      const forkedCourse = await response.json();
      onFork(forkedCourse);
      toast.success('Course forked successfully!');
    } catch (error) {
      toast.error('Failed to fork course');
    } finally {
      setIsForking(false);
    }
  };

  return (
    <Card className="bg-gray-800/50 border-gray-700 hover:bg-gray-800/70 transition-colors">
      <CardHeader className="space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <CardTitle className="text-white">{course.title}</CardTitle>
            <CardDescription className="text-gray-400">
              {course.description}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-gray-400">
                <Share2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-gray-800 border-gray-700">
              <DropdownMenuItem className="text-gray-200">
                Share Link
              </DropdownMenuItem>
              <DropdownMenuItem className="text-gray-200">
                Embed Course
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex gap-2">
          <Badge variant="secondary" className="bg-blue-500/20 text-blue-200">
            {course.estimatedHours}h
          </Badge>
          <Badge variant="secondary" className="bg-purple-500/20 text-purple-200">
            {course.modules?.length || 0} modules
          </Badge>
          {course.forkedFrom && (
            <Badge variant="secondary" className="bg-orange-500/20 text-orange-200">
              Forked
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={course.author?.image} />
              <AvatarFallback>{course.author?.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="text-sm">
              <p className="text-gray-200">{course.author?.name}</p>
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

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
            onClick={() => {}}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            View Course
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
            onClick={handleFork}
            disabled={isForking}
          >
            <GitFork className="mr-2 h-4 w-4" />
            Fork Course
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const CommunitySection = ({ courses, onFork }: { courses: any[], onFork: (course: any) => void }) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-white">Community Courses</h2>
        <Button variant="outline" className="border-gray-700 text-gray-300">
          <Users className="mr-2 h-4 w-4" />
          Browse All
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} onFork={onFork} />
        ))}
      </div>
    </div>
  );
};

export { CourseCard, CommunitySection };