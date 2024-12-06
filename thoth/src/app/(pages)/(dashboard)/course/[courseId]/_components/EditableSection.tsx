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
import { generateSuggestions } from "@/app/actions/generate-suggestion";
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


const AiSuggestionsPanel: React.FC<AiSuggestionsPanelProps> = ({
    onClose,
    onApply,
    context
  }) => {
    const [prompt, setPrompt] = useState("");
  
    const suggestionsMutation = useMutation({
      mutationFn: async (prompt: string) => {
        return generateSuggestions(prompt, context);
      },
      onSuccess: (suggestions) => {
        setSuggestions(suggestions);
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Failed to get AI suggestions");
      }
    });
  
    const [suggestions, setSuggestions] = useState<string[]>([]);
  
    const handleSuggest = () => {
      suggestionsMutation.mutate(prompt);
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
              onClick={handleSuggest}
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
  
          {suggestions.length > 0 && (
            <div className="space-y-4">
              {suggestions.map((suggestion, index) => (
                <motion.div
                  key={`suggestion-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-4 bg-gray-800/50 rounded-lg"
                >
                  <div className="prose prose-invert max-w-none">
                    <ReactMarkdown>{suggestion}</ReactMarkdown>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => onApply(suggestion)}
                  >
                    Use This Version
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
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