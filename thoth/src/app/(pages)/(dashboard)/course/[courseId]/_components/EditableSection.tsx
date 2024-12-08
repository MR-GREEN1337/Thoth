import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2,
  RotateCcw,
  Check,
  X,
  Pencil,
  Eye,
  Code,
  MessageSquare,
  Sparkles,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { toast } from "sonner";
import Draggable from "react-draggable";
import { Groq } from "groq-sdk";
import { AISuggestionError, generateSuggestions } from "@/app/actions/generate-suggestion";
import { useMutation } from "@tanstack/react-query";

interface AiSuggestContext {
  courseTitle: string;
  courseDescription: string;
  currentContent: string;
  moduleTitle?: string;
}

interface FloatingToolbarProps {
  children: React.ReactNode;
  position?: "top" | "bottom";
}

interface FloatingButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: "ghost" | "default";
  active?: boolean;
  disabled?: boolean;
}

interface AiSuggestionsPanelProps {
  onClose: () => void;
  onApply: (suggestion: string) => void;
  context: AiSuggestContext;
}

interface FloatingEditorProps {
  content: string;
  onSave: (content: string) => Promise<void>;
  children?: React.ReactNode;
  type?: "markdown" | "text";
  course: any
}

const FloatingButton = React.memo<FloatingButtonProps>(
  ({
    icon: Icon,
    label,
    onClick,
    variant = "ghost",
    active = false,
    disabled = false,
  }) => {
    return (
      <div className="relative group">
        <Button
          variant={variant}
          size="sm"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "px-2 h-8 rounded-full transition-all duration-200",
            "hover:bg-gray-800 hover:text-gray-200",
            "data-[state=on]:bg-gray-800 data-[state=on]:text-gray-200",
            active && "bg-gray-800 text-gray-200",
            "disabled:opacity-50"
          )}
        >
          <Icon className="h-4 w-4" />
        </Button>
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="bg-gray-900 text-gray-200 text-xs px-2 py-1 rounded whitespace-nowrap">
            {label}
          </div>
        </div>
      </div>
    );
  }
);

FloatingButton.displayName = "FloatingButton";


interface AiSuggestionsPanelProps {
  onClose: () => void;
  onApply: (suggestion: string) => void;
  context: AiSuggestContext;
}

const AiSuggestionsPanel: React.FC<AiSuggestionsPanelProps> = ({
  onClose,
  onApply,
  context
}) => {
  const [prompt, setPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [error, setError] = useState<{
    message: string;
    code: string;
    canRetry: boolean;
  } | null>(null);

  const suggestionsMutation = useMutation({
    mutationFn: async (prompt: string) => {
      setError(null);
      try {
        const result = await generateSuggestions(prompt, context);
        if (!result || !Array.isArray(result)) {
          throw new Error('Invalid response format');
        }
        return result;
      } catch (error) {
        if (error instanceof AISuggestionError) {
          setError({
            message: (error as any).message,
            code: (error as any).code,
            canRetry: (error as any).shouldRetry
          });
        } else {
          setError({
            message: 'An unexpected error occurred',
            code: 'UNKNOWN_ERROR',
            canRetry: true
          });
        }
        throw error;
      }
    },
    onSuccess: (suggestions) => {
      setSuggestions(suggestions.map(s => s.content));
      setSelectedVersion(null);
      setError(null);
    },
    onError: (error) => {
      // Error state is already set in mutationFn
      if (!error || !(error instanceof AISuggestionError)) {
        toast.error("Failed to generate suggestions");
      }
    }
  });

  const handleApply = (suggestion: string, version: number) => {
    setSelectedVersion(version);
    onApply(suggestion);
  };

  const handleRetry = () => {
    if (prompt) {
      suggestionsMutation.mutate(prompt);
    }
  };

  const getErrorMessage = (code: string): string => {
    switch (code) {
      case 'SERVICE_ERROR':
        return 'AI service is temporarily unavailable';
      case 'CONFIG_ERROR':
        return 'AI service is not properly configured';
      case 'VALIDATION_ERROR':
        return 'Invalid input provided';
      case 'INIT_ERROR':
        return 'Failed to initialize AI service';
      default:
        return 'An unexpected error occurred';
    }
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
          <X className="h-5 w-5 text-red-400 mt-0.5" />
          <div className="flex-1">
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

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className={cn(
        "fixed right-0 top-0 h-full w-96 bg-gray-900/95 border-l border-gray-700/50",
        "shadow-xl backdrop-blur-sm p-6 overflow-y-auto z-50"
      )}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-200">AI Assistant</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {renderError()}

        <div className="space-y-2">
          <label className="text-sm text-gray-400">
            How should I improve this?
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g., Make it more concise, add examples..."
            className="bg-gray-800/50 border-gray-700 min-h-[100px]"
          />
          <Button
            onClick={() => suggestionsMutation.mutate(prompt)}
            className="w-full"
            disabled={suggestionsMutation.isPending}
          >
            {suggestionsMutation.isPending ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
              </motion.div>
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
                <motion.div
                  key={`suggestion-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    "p-4 rounded-lg",
                    selectedVersion === index 
                      ? "bg-gray-700/50 border-2 border-gray-600" 
                      : "bg-gray-800/50"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-400">
                      Version {index + 1}
                    </span>
                    <Button
                      variant={selectedVersion === index ? "default" : "ghost"}
                      size="sm"
                      onClick={() => handleApply(suggestion, index)}
                    >
                      {selectedVersion === index ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Selected
                        </>
                      ) : (
                        "Use This Version"
                      )}
                    </Button>
                  </div>
                  <div className="prose prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {suggestion}
                    </ReactMarkdown>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

const FloatingToolbar = React.forwardRef<HTMLDivElement, FloatingToolbarProps>(
  ({ children, position = "bottom" }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: position === "bottom" ? 20 : -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: position === "bottom" ? 20 : -20 }}
      className={cn(
        "absolute left-1/2 transform -translate-x-1/2 z-50",
        "px-2 py-1.5 rounded-full bg-gray-900/95 border border-gray-700/50",
        "shadow-xl backdrop-blur-sm cursor-move",
        position === "bottom" ? "bottom-4" : "top-4"
      )}
    >
      <div className="flex items-center gap-1">{children}</div>
    </motion.div>
  )
);

FloatingToolbar.displayName = "FloatingToolbar";

const FloatingEditor: React.FC<FloatingEditorProps> = ({
    content,
    onSave,
    children,
    type = "markdown",
    course
  }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const [history, setHistory] = useState([content]);
  const [isPreview, setIsPreview] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const context: AiSuggestContext = {
    courseTitle: course.title,
    courseDescription: course.description,
    currentContent: editedContent,
    moduleTitle: course.currentModule?.title
  };

  const handleSave = async () => {
    try {
      setHistory([...history, editedContent]);
      await onSave(editedContent);
      setIsEditing(false);
      toast.success("Changes saved successfully");
    } catch (error) {
      toast.error("Failed to save changes");
    }
  };

  const handleRollback = () => {
    if (history.length > 1) {
      const previousContent = history[history.length - 2];
      setEditedContent(previousContent);
      setHistory(history.slice(0, -1));
      toast.info("Changes rolled back");
    }
  };

  const initializeGroq = () => {
    const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
    if (!apiKey) {
      console.warn('GROQ API key is not configured');
      return null;
    }
    return new Groq({ apiKey });
  };
  
  const toolbarButtons = [
    {
      id: "preview",
      icon: isPreview ? Code : Eye,
      label: isPreview ? "Show Editor" : "Preview",
      onClick: () => setIsPreview(!isPreview),
    },
    {
      id: "undo",
      icon: RotateCcw,
      label: "Undo Changes",
      onClick: handleRollback,
      disabled: history.length <= 1,
    },
    {
      id: "ai",
      icon: MessageSquare,
      label: "AI Assistant",
      onClick: () => setIsAiOpen(true),
      active: isAiOpen,
    },
    {
      id: "cancel",
      icon: X,
      label: "Cancel",
      onClick: () => setIsEditing(false),
    },
    {
      id: "save",
      icon: Check,
      label: "Save Changes",
      onClick: handleSave,
      variant: "default" as const,
    },
  ];

  if (!isEditing) {
    return (
      <div className="group relative inline-block" ref={contentRef}>
        {children || (
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute -right-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <FloatingButton
            icon={Pencil}
            label="Edit Content"
            onClick={() => setIsEditing(true)}
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative" ref={contentRef}>
      <AnimatePresence>
        {type === "markdown" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "rounded-lg overflow-hidden transition-all duration-200",
              isPreview ? "bg-gray-800/20" : "bg-gray-800/50"
            )}
          >
            {isPreview ? (
              <div className="p-6 prose prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {editedContent}
                </ReactMarkdown>
              </div>
            ) : (
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="min-h-[400px] font-mono bg-transparent border-0 resize-none focus:ring-0"
              />
            )}
          </motion.div>
        )}

        <FloatingToolbar ref={toolbarRef}>
          {toolbarButtons.map((button, index) => {
            const { id, ...buttonProps } = button;
            return (
              <React.Fragment key={`toolbar-button-${id}`}>
                {index > 0 && (index === 2 || index === 4) && (
                  <div
                    key={`divider-${id}`}
                    className="w-px h-4 bg-gray-700 mx-1"
                  />
                )}
                <FloatingButton {...buttonProps} />
              </React.Fragment>
            );
          })}
        </FloatingToolbar>

        {isAiOpen && (
        <AiSuggestionsPanel
          onClose={() => setIsAiOpen(false)}
          context={context}
          onApply={(suggestion) => {
            setEditedContent(suggestion);
            setIsAiOpen(false);
          }}
        />
      )}
      </AnimatePresence>
    </div>
  );
};

export default FloatingEditor;