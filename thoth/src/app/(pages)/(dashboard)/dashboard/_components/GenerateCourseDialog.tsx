"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Sparkles, BookOpen, Share2, Users, GitFork } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
const GenerateCourseDialog = ({ 
  preferences,
  onCourseGenerated 
}: {
  preferences: {
      expertiseLevel: any; preferenceAnalysis: string 
};
  onCourseGenerated: (course: any) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const steps = [
    'Analyzing learning path',
    'Generating course structure',
    'Creating content modules',
    'Finalizing course materials'
  ];

  const handleGenerate = async () => {
    if (!preferences?.preferenceAnalysis) {
      toast.error('No preference analysis found');
      return;
    }

    setIsGenerating(true);
    try {
      // Simulate steps for visual feedback
      for (let i = 0; i < steps.length; i++) {
        setGenerationStep(i);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const response = await fetch('/api/user/generate-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          analysis: preferences.preferenceAnalysis 
        })
      });
      
      if (!response.ok) throw new Error('Failed to generate course');
      
      const course = await response.json();
      onCourseGenerated(course);
      toast.success('Course generated successfully!');
      setIsOpen(false);
    } catch (error) {
      console.error('Error generating course:', error);
      toast.error('Failed to generate course');
    } finally {
      setIsGenerating(false);
      setGenerationStep(0);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          size="lg" 
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Sparkles className="mr-2 h-5 w-5" />
          Generate New Course
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">
            Generate Learning Experience
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Create an AI-powered course tailored to your learning path
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {!isGenerating ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-lg">
                <BookOpen className="h-8 w-8 text-blue-400" />
                <div>
                  <h3 className="font-medium text-white">Personalized Course</h3>
                  <p className="text-sm text-gray-400">
                    Based on your {preferences?.expertiseLevel?.toLowerCase()} level profile
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-gray-800/30 rounded-lg">
                  <Share2 className="h-5 w-5 text-green-400" />
                  <span className="text-sm text-gray-300">Shareable</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-gray-800/30 rounded-lg">
                  <Users className="h-5 w-5 text-purple-400" />
                  <span className="text-sm text-gray-300">Community-driven</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-gray-800/30 rounded-lg">
                  <GitFork className="h-5 w-5 text-orange-400" />
                  <span className="text-sm text-gray-300">Forkable</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-gray-800/30 rounded-lg">
                  <Badge className="bg-blue-500/20 text-blue-200">
                    AI Enhanced
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            <motion.div 
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Progress value={(generationStep + 1) * 25} className="h-2" />
              <AnimatePresence mode="wait">
                <motion.div
                  key={generationStep}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="text-center text-gray-300"
                >
                  {steps[generationStep]}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Course
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateCourseDialog;