import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export interface CourseMessage {
  id: string;
  content: string;
  createdAt: Date;
  isAI: boolean;
  user: {
    id: string;
    username: string;
  };
  parentId?: string;
}

export function useCourseMessages(courseId: string) {
  const [messages, setMessages] = useState<CourseMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
  }, [courseId]);

  const fetchMessages = async () => {
    try {
      const response = await fetch(`/api/user/courses/${courseId}/messages`);
      if (!response.ok) throw new Error('Failed to fetch messages');
      
      const data = await response.json();
      setMessages(data);
    } catch (error) {
      toast.error('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (content: string, withAI: boolean = true) => {
    try {
      const response = await fetch(`/api/user/courses/${courseId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, withAI }),
      });

      if (!response.ok) throw new Error('Failed to send message');
      
      const newMessages = await response.json();
      setMessages(prev => [...prev, ...newMessages]);
      return newMessages;
    } catch (error) {
      toast.error('Failed to send message');
      throw error;
    }
  };

  return {
    messages,
    isLoading,
    sendMessage,
    refreshMessages: fetchMessages,
  };
}