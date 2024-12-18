import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trees, GitFork, Loader2, Users, Code, GitBranch } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ForkNode {
  id: string;
  title: string;
  description: string;
  authorName: string;
  children: ForkNode[];
}

interface TreeData {
  tree: ForkNode;
  metadata: {
    totalForks: number;
    depth: number;
    generatedAt: string;
  };
}

const FloatingNode = ({ node, depth = 0, index = 0 }: { 
  node: ForkNode; 
  depth?: number; 
  index?: number; 
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Calculate position offsets based on depth and index
  const xOffset = depth * 180;
  const yOffset = index * 120;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ 
          opacity: 1, 
          x: xOffset,
          y: yOffset,
        }}
        transition={{ 
          duration: 0.8,
          delay: depth * 0.2,
        }}
        style={{
          position: 'absolute',
          left: 40,
          top: 40,
        }}
      >
        {/* Connection lines */}
        {depth > 0 && (
          <motion.div
            className="absolute right-full top-1/2 w-[100px] h-[2px] bg-gradient-to-r from-transparent to-blue-500/20"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, delay: depth * 0.2 }}
            style={{
              transformOrigin: 'right',
            }}
          />
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div
                className="relative"
                onHoverStart={() => setIsHovered(true)}
                onHoverEnd={() => setIsHovered(false)}
                animate={{
                  y: [0, 10, 0],
                  rotate: isHovered ? [0, -5, 5, 0] : 0,
                }}
                transition={{
                  y: {
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: index * 0.5,
                  },
                  rotate: {
                    duration: 0.5,
                  }
                }}
              >
                <motion.div 
                  className={`
                    p-4 bg-gray-800/80 rounded-xl border-2 
                    backdrop-blur-sm shadow-lg cursor-pointer
                    ${isHovered ? 'border-blue-500' : 'border-gray-700'}
                  `}
                  animate={{
                    scale: isHovered ? 1.05 : 1,
                    boxShadow: isHovered 
                      ? "0 0 20px rgba(59, 130, 246, 0.5)"
                      : "0 0 0px rgba(59, 130, 246, 0)",
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <div className={`
                      p-2 rounded-lg transition-colors duration-200
                      ${isHovered ? 'bg-blue-500/20' : 'bg-gray-700/50'}
                    `}>
                      <GitBranch className={`
                        h-5 w-5 transition-colors duration-200
                        ${isHovered ? 'text-blue-400' : 'text-gray-400'}
                      `} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-200">
                        {node.title.length > 20 ? `${node.title.slice(0, 20)}...` : node.title}
                      </span>
                      <span className="text-xs text-gray-400">{node.authorName}</span>
                    </div>
                  </div>
                </motion.div>

                {/* Floating particles when hovered */}
                <AnimatePresence>
                  {isHovered && (
                    <>
                      {[...Array(6)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute w-1 h-1 bg-blue-400 rounded-full"
                          initial={{ 
                            opacity: 0,
                            scale: 0,
                            x: 0,
                            y: 0,
                          }}
                          animate={{ 
                            opacity: [0, 1, 0],
                            scale: [0, 1.5, 0],
                            x: Math.cos(i * 60 * Math.PI / 180) * 30,
                            y: Math.sin(i * 60 * Math.PI / 180) * 30,
                          }}
                          exit={{ 
                            opacity: 0,
                            scale: 0,
                            x: 0,
                            y: 0,
                          }}
                          transition={{ 
                            duration: 1,
                            repeat: Infinity,
                            delay: i * 0.1,
                          }}
                        />
                      ))}
                    </>
                  )}
                </AnimatePresence>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent 
              side="right" 
              className="max-w-sm bg-gray-900/90 border-gray-800 backdrop-blur-md"
            >
              <div className="p-3">
                <h4 className="font-medium text-white mb-1">{node.title}</h4>
                <p className="text-sm text-gray-400">{node.description}</p>
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <p className="text-xs text-blue-400">Created by {node.authorName}</p>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </motion.div>

      {/* Render child nodes */}
      {node.children.map((child, childIndex) => (
        <FloatingNode
          key={child.id}
          node={child}
          depth={depth + 1}
          index={childIndex}
        />
      ))}
    </>
  );
};

const CourseForksTree = ({ courseId }: { courseId: string }) => {
  const [treeData, setTreeData] = useState<TreeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchForkTree = async () => {
      try {
        const response = await fetch(`/api/user/courses/${courseId}/fork-tree`);
        if (!response.ok) throw new Error('Failed to fetch fork tree');
        const data = await response.json();
        setTreeData(data);
      } catch (err) {
        setError('Failed to load fork tree');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchForkTree();
  }, [courseId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !treeData) {
    return (
      <div className="text-center p-12">
        <Trees className="h-12 w-12 mx-auto mb-4 text-gray-500" />
        <p className="text-gray-400">{error || 'No fork data available'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-base font-medium text-gray-200">
              Total Forks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <GitFork className="h-5 w-5 text-blue-400" />
              <span className="text-2xl font-bold text-white">
                {treeData.metadata.totalForks}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-base font-medium text-gray-200">
              Tree Depth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Code className="h-5 w-5 text-purple-400" />
              <span className="text-2xl font-bold text-white">
                {treeData.metadata.depth}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-base font-medium text-gray-200">
              Last Updated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-sm text-gray-400">
              {new Date(treeData.metadata.generatedAt).toLocaleDateString()}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <GitFork className="h-5 w-5" /> Fork Tree
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto">
            <div className="min-w-[800px] min-h-[400px] p-4">
              <FloatingNode node={treeData.tree} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CourseForksTree;