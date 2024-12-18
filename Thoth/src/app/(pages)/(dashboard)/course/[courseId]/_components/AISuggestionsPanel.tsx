"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2,
  RotateCcw,
  Check,
  X,
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { generateSuggestions, type AiSuggestion, type AiSuggestContext } from "@/app/actions/generate-suggestion";

interface ErrorState {
  message: string;
  code: string;
  canRetry: boolean;
}

interface AiSuggestionsPanelProps {
  onClose: () => void;
  onApply: (suggestion: AiSuggestion) => void;
  context: AiSuggestContext;
  className?: string;
}

const SuggestionCard: React.FC<{
  suggestion: AiSuggestion;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  contentType: string;
}> = ({ suggestion, index, isSelected, onSelect, contentType }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const renderContent = () => {
    if (contentType === 'markdown') {
      return (
        <div className="prose prose-invert max-w-none prose-pre:max-h-[300px] prose-pre:overflow-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {suggestion.content}
          </ReactMarkdown>
        </div>
      );
    }
    
    return (
      <div className="text-gray-200 whitespace-pre-wrap">
        {suggestion.content}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        "rounded-lg overflow-hidden transition-all duration-200",
        isSelected ? "bg-gray-700/50 border-2 border-gray-600" : "bg-gray-800/50"
      )}
    >
      <Collapsible
        open={isExpanded}
        onOpenChange={setIsExpanded}
        className="w-full"
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-400">
                Version {index + 1}
              </span>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="p-0 h-5 w-5">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      isExpanded && "transform rotate-180"
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isSelected ? "default" : "secondary"}
                    size="sm"
                    onClick={onSelect}
                    className={cn(
                      "transition-all duration-200",
                      isSelected && "bg-green-600 hover:bg-green-700"
                    )}
                  >
                    {isSelected ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Selected
                      </>
                    ) : (
                      "Use This"
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isSelected ? "Currently selected" : "Apply this version"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <CollapsibleContent className="space-y-2">
            {suggestion.reasoning && (
              <div className="text-sm text-gray-400 bg-gray-800/50 rounded-md p-3 mb-3">
                <p className="font-medium text-gray-300 mb-1">AI Reasoning:</p>
                {suggestion.reasoning}
              </div>
            )}
          </CollapsibleContent>

          <div className="mt-2">{renderContent()}</div>
        </div>
      </Collapsible>
    </motion.div>
  );
};

export const AiSuggestionsPanel: React.FC<AiSuggestionsPanelProps> = ({
  onClose,
  onApply,
  context,
  className
}) => {
  const [prompt, setPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);

  const suggestionsMutation = useMutation({
    mutationFn: async (prompt: string) => {
      setError(null);
      try {
        const result = await generateSuggestions(prompt, context);
        if (!result || !Array.isArray(result)) {
          throw new Error('Invalid response format');
        }
        return result;
      } catch (error: any) {
        setError({
          message: error.message || 'An unexpected error occurred',
          code: error.code || 'UNKNOWN_ERROR',
          canRetry: error.shouldRetry || true
        });
        throw error;
      }
    },
    onSuccess: (suggestions) => {
      setSuggestions(suggestions);
      setSelectedVersion(null);
      setError(null);
    },
    onError: () => {
      if (!error) {
        toast.error("Failed to generate suggestions");
      }
    }
  });

  const handleApply = (suggestion: AiSuggestion, version: number) => {
    setSelectedVersion(version);
    onApply(suggestion);
  };

  const handleRetry = () => {
    if (prompt) {
      suggestionsMutation.mutate(prompt);
    }
  };

  const getErrorMessage = (code: string): string => {
    const errorMessages: Record<string, string> = {
      'SERVICE_ERROR': 'AI service is temporarily unavailable',
      'CONFIG_ERROR': 'AI service is not properly configured',
      'VALIDATION_ERROR': 'Invalid input provided',
      'INIT_ERROR': 'Failed to initialize AI service',
      'UNKNOWN_ERROR': 'An unexpected error occurred'
    };
    
    return errorMessages[code] || 'An unexpected error occurred';
  };

  const renderError = () => {
    if (!error) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 mb-4"
      >
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-red-300">
              {getErrorMessage(error.code)}
            </h4>
            <p className="text-xs text-red-400 mt-1">
              {error.message}
            </p>
            {error.canRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={suggestionsMutation.isPending}
                className="mt-2 border-red-700 hover:bg-red-900/20"
              >
                <RotateCcw className="h-3 w-3 mr-2" />
                Try Again
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  const promptPlaceholders = {
    title: "E.g., Make it more engaging, clarify the main topic...",
    description: "E.g., Make it more concise, add key benefits...",
    markdown: "E.g., Add examples, improve structure, clarify concepts...",
    text: "E.g., Improve readability, enhance clarity..."
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className={cn(
        "fixed right-0 top-0 h-full w-96 bg-gray-900/95 border-l border-gray-700/50",
        "shadow-xl backdrop-blur-sm p-6 overflow-y-auto z-50",
        className
      )}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-200">AI Assistant</h3>
            <p className="text-sm text-gray-400">
              Suggesting improvements for: {context.contentType}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {renderError()}

        <div className="space-y-3">
          <label className="text-sm text-gray-400">
            How should I improve this?
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={promptPlaceholders[context.contentType as keyof typeof promptPlaceholders]}
            className="bg-gray-800/50 border-gray-700 min-h-[100px] resize-vertical"
          />
          <Button
            onClick={() => suggestionsMutation.mutate(prompt)}
            className="w-full"
            disabled={suggestionsMutation.isPending || !prompt.trim()}
          >
            {suggestionsMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            {suggestionsMutation.isPending ? "Thinking..." : "Get Suggestions"}
          </Button>
        </div>

        <AnimatePresence mode="wait">
          {suggestions.length > 0 && !error && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {suggestions.map((suggestion, index) => (
                <SuggestionCard
                  key={`suggestion-${index}`}
                  suggestion={suggestion}
                  index={index}
                  isSelected={selectedVersion === index}
                  onSelect={() => handleApply(suggestion, index)}
                  contentType={context.contentType}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default AiSuggestionsPanel;