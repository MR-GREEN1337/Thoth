import { useState } from 'react';
import { MessageSquare, Send, Bot, User, Loader2, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCourseMessages } from '@/hooks/use-course-messages';
import Cookies from 'js-cookie';

interface CourseChatProps {
  courseId: string;
}

const CourseChat = ({ courseId }: CourseChatProps) => {
  const { messages, isLoading, sendMessage } = useCourseMessages(courseId);
  const userId = Cookies.get("token")
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messageType, setMessageType] = useState<'ai' | 'community'>('ai');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending) return;

    try {
      setIsSending(true);
      await sendMessage(newMessage, messageType === 'ai');
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="bg-gray-800/50 border-gray-700 relative min-h-[500px]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Course Discussion
        </CardTitle>
        <div className="flex items-center gap-3">
          <ToggleGroup
            type="single"
            value={messageType}
            onValueChange={(value) => value && setMessageType(value as 'ai' | 'community')}
            className="bg-gray-700/30 rounded-lg p-1"
          >
            <ToggleGroupItem
              value="ai"
              className="data-[state=on]:bg-gray-600 data-[state=on]:text-white px-3 py-1 rounded"
            >
              <Bot className="h-4 w-4 mr-1" />
              AI Help
            </ToggleGroupItem>
            <ToggleGroupItem
              value="community"
              className="data-[state=on]:bg-gray-600 data-[state=on]:text-white px-3 py-1 rounded"
            >
              <Users className="h-4 w-4 mr-1" />
              Community
            </ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" className="text-gray-300 border-gray-600">
            {messages.length} messages
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-20">
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <Alert className="bg-gray-700/50 border-gray-600">
              <AlertDescription className="text-gray-300">
                Start a discussion or ask questions about the course content. Toggle between AI assistance and community discussions above!
              </AlertDescription>
            </Alert>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4 pb-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.isAI ? 'bg-gray-700/30' : ''
                    } rounded-lg p-3`}
                  >
                    <Avatar className="h-8 w-8">
                      {message.isAI ? (
                        <Bot className="h-5 w-5 text-blue-400" />
                      ) : (
                        <User className="h-5 w-5 text-gray-400" />
                      )}
                    </Avatar>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${
                          message.isAI ? 'text-blue-400' : 'text-gray-300'
                        }`}>
                          {message.isAI ? 'Course AI' : message.user.username}
                          {!message.isAI && message.user.id === userId && (
                            <span className="ml-1 text-xs text-gray-500">(you)</span>
                          )}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(message.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-gray-300">{message.content}</p>
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex items-center gap-2 text-gray-400 pl-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">
                      {messageType === 'ai' ? 'AI is thinking...' : 'Sending...'}
                    </span>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
      
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gray-800/95 border-t border-gray-700 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={messageType === 'ai' ? "Ask the AI for help..." : "Share with the community..."}
              className="bg-gray-700/30 border-gray-600 text-gray-200 placeholder:text-gray-500 rounded-full py-5"
            />
            <Button 
              type="submit"
              size="icon"
              className="bg-blue-600 hover:bg-blue-700 rounded-full h-10 w-10 flex items-center justify-center"
              disabled={isSending || !newMessage.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
};

export default CourseChat;