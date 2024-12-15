"use client";

import { useState, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const GenerateCourseDialog = ({ 
  preferences,
  onCourseGenerated 
}: {
  preferences: {
    expertiseLevel: any;
    preferenceAnalysis: string;
  };
  onCourseGenerated: (course: any) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [courseIdea, setCourseIdea] = useState('');
  const [inputError, setInputError] = useState('');
  const [countdown, setCountdown] = useState(25);
  const [showCountdown, setShowCountdown] = useState(false);

  const steps = [
    'Analyzing course idea',
    'Generating course structure',
    'Creating content modules',
    'Finalizing course materials'
  ];

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showCountdown && countdown > 0) {
      timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown, showCountdown]);

  const handleGenerate = async () => {
    if (!preferences?.preferenceAnalysis) {
      toast.error('No preference analysis found');
      return;
    }

    if (!courseIdea.trim()) {
      setInputError('Please enter a course idea');
      return;
    }

    setInputError('');
    setIsGenerating(true);
    
    try {
      // Simulate steps for visual feedback
      for (let i = 0; i < steps.length; i++) {
        setGenerationStep(i);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      setShowCountdown(true);
      await new Promise(resolve => setTimeout(resolve, 25000));

      const response = await fetch('/api/user/generate-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          analysis: preferences.preferenceAnalysis,
          courseIdea: courseIdea.trim()
        })
      });
      
      if (!response.ok) throw new Error('Failed to generate course');
      
      const course = await response.json();
      onCourseGenerated(course);
      toast.success('Course generated successfully!');
      setIsOpen(false);
      setCourseIdea('');
    } catch (error) {
      console.error('Error generating course:', error);
      toast.error('Failed to generate course');
    } finally {
      setIsGenerating(false);
      setGenerationStep(0);
      setShowCountdown(false);
      setCountdown(25);
    }
  };

  const CountdownDisplay = () => (
    <motion.div
      className="relative w-32 h-32 mx-auto"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
    >
      <motion.div
        className="absolute inset-0 rounded-full border-4 border-blue-500"
        style={{
          borderRadius: '50%',
          borderColor: `hsl(${countdown * 8}, 70%, 50%)`,
        }}
        animate={{
          rotate: 360,
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <span className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
          {countdown}
        </span>
      </motion.div>
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-blue-300/20"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
    </motion.div>
  );

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
              <div className="space-y-2">
                <Label htmlFor="courseIdea" className="text-white">
                  What would you like to learn about?
                </Label>
                <Input
                  id="courseIdea"
                  placeholder="Enter your course idea (e.g., 'Machine Learning Basics', 'Web Development')"
                  value={courseIdea}
                  onChange={(e) => {
                    setCourseIdea(e.target.value);
                    setInputError('');
                  }}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                  disabled={isGenerating}
                />
                {inputError && (
                  <p className="text-sm text-red-400">{inputError}</p>
                )}
              </div>

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
              className="space-y-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {!showCountdown ? (
                <>
                  <Progress value={(generationStep + 1) * 50} className="h-2" />
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
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <CountdownDisplay />
                  <motion.p
                    className="text-center text-gray-400"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    Crafting your personalized learning experience...
                  </motion.p>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setIsOpen(false);
              setCourseIdea('');
              setInputError('');
            }}
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