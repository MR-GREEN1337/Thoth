"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
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
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { toast } from "sonner";
import { generateSuggestions } from "@/app/actions/generate-suggestion";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import AiSuggestionsPanel from "./AISuggestionsPanel";

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

interface Course {
  title: string;
  description: string;
  currentModule?: {
    title: string;
  };
}

interface FloatingEditorProps {
  content: string;
  onSave: (content: string) => Promise<void>;
  children?: React.ReactNode;
  type?: "markdown" | "text";
  course: Course;
}

interface ErrorState {
  message: string;
  code: string;
  canRetry: boolean;
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

const FloatingToolbar = React.forwardRef<HTMLDivElement, FloatingToolbarProps>(
  ({ children, position = "bottom" }, ref) => {
    const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
    
    const handleDrag = (event: any, info: PanInfo) => {
      setDragPosition(prev => ({
        x: prev.x + info.delta.x,
        y: prev.y + info.delta.y
      }));
    };

    return (
      <motion.div
        ref={ref}
        drag
        dragMomentum={false}
        dragElastic={0}
        onDrag={handleDrag}
        dragConstraints={{ left: -300, right: 300, top: -200, bottom: 200 }}
        initial={{ opacity: 0, y: position === "bottom" ? 20 : -20 }}
        animate={{ 
          opacity: 1,
          y: position === "bottom" ? 0 : dragPosition.y,
          x: dragPosition.x
        }}
        exit={{ opacity: 0, y: position === "bottom" ? 20 : -20 }}
        className={cn(
          "absolute left-1/2 transform -translate-x-1/2 z-50",
          "px-2 py-1.5 rounded-full bg-gray-900/95 border border-gray-700/50",
          "shadow-xl backdrop-blur-sm cursor-move",
          position === "bottom" ? "-bottom-16" : "-top-16"
        )}
      >
        <div className="flex items-center gap-1">{children}</div>
      </motion.div>
    );
  }
);

FloatingToolbar.displayName = "FloatingToolbar";

const FloatingEditor: React.FC<FloatingEditorProps> = ({
    content,
    onSave,
    children,
    type = "markdown",
    course
  }) => {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState(content);
    const [history, setHistory] = useState([content]);
    const [isPreview, setIsPreview] = useState(false);
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
  
    // Determine content type and element type based on children and wrapping
    const determineContentContext = () => {
      if (!children) {
        return {
          contentType: type,
          elementType: "text"
        };
      }
  
      // Check the first child element to determine context
      const firstChild = React.Children.toArray(children)[0];
      
      if (React.isValidElement(firstChild)) {
        if (firstChild.type === 'h1') {
          return {
            contentType: "title",
            elementType: "heading"
          };
        }
        if (firstChild.type === 'p' && !firstChild.props.className?.includes('prose')) {
          return {
            contentType: "description",
            elementType: "paragraph"
          };
        }
        if (firstChild.props.className?.includes('prose')) {
          return {
            contentType: "markdown",
            elementType: "content"
          };
        }
      }
  
      return {
        contentType: type,
        elementType: "text"
      };
    };
  
    const contentContext = determineContentContext();
  
    const context: AiSuggestContext = {
      courseTitle: course.title,
      courseDescription: course.description,
      currentContent: editedContent,
      moduleTitle: course.currentModule?.title,
      ...contentContext
    };
  
    const handleSave = async () => {
      try {
        setIsSaving(true);
        setHistory([...history, editedContent]);
        await onSave(editedContent);
        
        router.refresh();
        
        setIsEditing(false);
        toast.success("Changes saved successfully");
      } catch (error) {
        toast.error("Failed to save changes");
      } finally {
        setIsSaving(false);
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
  
    const toolbarButtons = [
      {
        id: "preview",
        icon: isPreview ? Code : Eye,
        label: isPreview ? "Show Editor" : "Preview",
        onClick: () => setIsPreview(!isPreview),
        disabled: isSaving,
        show: contentContext.contentType === "markdown"
      },
      {
        id: "undo",
        icon: RotateCcw,
        label: "Undo Changes",
        onClick: handleRollback,
        disabled: history.length <= 1 || isSaving,
        show: true
      },
      {
        id: "ai",
        icon: MessageSquare,
        label: "AI Assistant",
        onClick: () => setIsAiOpen(true),
        active: isAiOpen,
        disabled: isSaving,
        show: true
      },
      {
        id: "cancel",
        icon: X,
        label: "Cancel",
        onClick: () => {
          setIsEditing(false);
          setEditedContent(content);
        },
        disabled: isSaving,
        show: true
      },
      {
        id: "save",
        icon: isSaving ? Loader2 : Check,
        label: isSaving ? "Saving..." : "Save Changes",
        onClick: handleSave,
        variant: "default" as const,
        disabled: isSaving,
        show: true
      },
    ] as const;
  
    if (!isEditing) {
      return (
        <div className="group relative inline-block" ref={contentRef}>
          {children || (
            <div className={cn(
              contentContext.contentType === "markdown" && "prose prose-invert max-w-none",
              contentContext.contentType === "title" && "text-3xl font-bold text-white",
              contentContext.contentType === "description" && "text-gray-400"
            )}>
              {contentContext.contentType === "markdown" ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {content}
                </ReactMarkdown>
              ) : (
                content
              )}
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "rounded-lg overflow-hidden transition-all duration-200",
              isPreview ? "bg-gray-800/20" : "bg-gray-800/50"
            )}
          >
            {isPreview && contentContext.contentType === "markdown" ? (
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
                className={cn(
                  "font-mono bg-transparent border-0 resize-none focus:ring-0",
                  contentContext.contentType === "markdown" && "min-h-[400px]",
                  contentContext.contentType === "title" && "text-2xl font-bold",
                  contentContext.contentType === "description" && "min-h-[100px]"
                )}
              />
            )}
          </motion.div>
  
          <FloatingToolbar ref={toolbarRef}>
            {toolbarButtons
              .filter(button => button.show)
              .map((button, index) => (
                <React.Fragment key={`toolbar-button-${button.id}`}>
                  {(button.id === "ai" || button.id === "save") && index > 0 && (
                    <div
                      className="w-px h-4 bg-gray-700 mx-1"
                    />
                  )}
                  <FloatingButton
                    icon={button.icon}
                    label={button.label}
                    onClick={button.onClick}
                    variant={(button as any).variant || "ghost"}
                    active={(button as any).active}
                    disabled={(button as any).disabled}
                  />
                </React.Fragment>
              ))}
          </FloatingToolbar>
  
          {isAiOpen && (
            <AiSuggestionsPanel
              onClose={() => setIsAiOpen(false)}
              context={{...context, contentType: contentContext.contentType as "markdown" | "text" | "title" | "description"}}
              onApply={(suggestion) => {
                setEditedContent(suggestion.content);
                setIsAiOpen(false);
              }}
            />
          )}
        </AnimatePresence>
      </div>
    );
  };  

export default FloatingEditor;