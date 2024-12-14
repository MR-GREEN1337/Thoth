import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { 
  MessageCircle, 
  CheckCircle2, 
  XCircle, 
  ChevronDown,
  Brain,
  Dumbbell,
  Trophy
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const getDifficultyColor = (difficulty) => {
  switch (difficulty?.toLowerCase()) {
    case 'beginner':
      return 'text-green-400';
    case 'intermediate':
      return 'text-yellow-400';
    case 'advanced':
      return 'text-red-400';
    default:
      return 'text-blue-400';
  }
};

const getDifficultyIcon = (difficulty) => {
  switch (difficulty?.toLowerCase()) {
    case 'beginner':
      return <Brain className="h-5 w-5" />;
    case 'intermediate':
      return <Dumbbell className="h-5 w-5" />;
    case 'advanced':
      return <Trophy className="h-5 w-5" />;
    default:
      return <Brain className="h-5 w-5" />;
  }
};

const getTypeIcon = (type) => {
  switch (type) {
    case 'quiz':
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    case 'exercise':
      return <XCircle className="h-5 w-5 text-blue-500" />;
    case 'discussion':
      return <MessageCircle className="h-5 w-5 text-purple-500" />;
    default:
      return null;
  }
};

const InteractiveElement = ({ element }) => {
  const [showSolution, setShowSolution] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCheck = () => {
    if (element.type === 'quiz') {
      const correct = selectedAnswer === element.solution;
      setIsCorrect(correct);
    }
    setShowSolution(true);
  };

  return (
    <div className="my-6">
      <Card className="bg-gray-800/50 border-gray-700 hover:bg-gray-800/60 transition-all duration-200">
        <CardHeader 
          className="cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getTypeIcon(element.type)}
              <div>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  {element.title}
                  <span className={`text-sm ${getDifficultyColor(element.difficulty)} flex items-center gap-1`}>
                    {getDifficultyIcon(element.difficulty)}
                    {element.difficulty}
                  </span>
                </CardTitle>
              </div>
            </div>
            <ChevronDown 
              className={`h-5 w-5 text-gray-400 transform transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`} 
            />
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="space-y-6 pt-2">
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300 leading-relaxed">{element.content}</p>
            </div>

            {element.type === 'quiz' && (
              <div className="space-y-4">
                <RadioGroup 
                  value={selectedAnswer} 
                  onValueChange={setSelectedAnswer}
                  className="space-y-3"
                >
                  {element.options?.map((option, index) => (
                    <div 
                      key={index} 
                      className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-700/30 transition-colors"
                    >
                      <RadioGroupItem 
                        value={option} 
                        id={`option-${index}`}
                        className="border-gray-500"
                      />
                      <Label 
                        htmlFor={`option-${index}`} 
                        className="text-gray-300 cursor-pointer"
                      >
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>

                {isCorrect !== null && (
                  <Alert className={isCorrect ? 'bg-green-500/20' : 'bg-red-500/20'}>
                    <AlertDescription className={isCorrect ? 'text-green-300' : 'text-red-300'}>
                      {isCorrect ? '✨ Correct! Well done!' : '❌ Incorrect. Try again!'}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {!showSolution && (
              <Button 
                onClick={handleCheck}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {element.type === 'quiz' ? 'Check Answer' : 'Show Solution'}
              </Button>
            )}

            {showSolution && (
              <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Solution
                </h4>
                <div className="text-gray-300 prose prose-invert max-w-none">
                  {element.solution}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};
const ModuleInteractiveElements = ({elements}: { elements: any[] }) => {
  if (!elements || elements.length === 0) return null;
  console.log("hihpo", elements);
  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
        <MessageCircle className="h-5 w-5" />
        Interactive Elements
      </h3>
      {elements.map((element, index) => (
        <InteractiveElement key={index} element={element} />
      ))}
    </div>
  );
};

export default ModuleInteractiveElements;