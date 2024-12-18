"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Save,
  TrendingUp,
  Target,
  Clock,
  RefreshCcw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import SourcesSection from "./_components/SourcesSection";
import { Category, ExpertiseLevel, SavePreferencesPayload } from "@/types/preferences";
import Cookies from "js-cookie";

interface Interest {
  category: Category;
  name: string;
  marketDemand: "High" | "Medium" | "Low";
  description: string;
  trendingTopics: string[];
}

interface MarketInsights {
  trends: string[];
  opportunities: string[];
}

interface LearningPath {
  fundamentals: string[];
  intermediate: string[];
  advanced: string[];
  estimatedTimeMonths: number;
}

interface AnalysisData {
  expertiseLevel: string;
  suggestedWeeklyHours: number;
  interests: Interest[];
  marketInsights: MarketInsights;
  learningPath: LearningPath;
}

interface PreferencesOutput {
  isConcise: boolean;
  message?: string;
  analysis?: AnalysisData;
  sourceUrls?: string[];
}

interface ApiResponse {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}

export default function OnboardingPage() {
  const router = useRouter();
  const userId = Cookies.get("token");
  const [preferences, setPreferences] = useState<string>("");
  const [analysis, setAnalysis] = useState<PreferencesOutput | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showRefinement, setShowRefinement] = useState<boolean>(false);
  const [refinementNotes, setRefinementNotes] = useState<string>("");
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const analyzePreferences = async (includeExisting = false): Promise<void> => {
    setIsLoading(true);
    try {
      const payload = {
        userId,
        preferences,
        // Only include previous analysis and refinement notes if refining
        ...(includeExisting && analysis?.analysis ? {
          previousAnalysis: analysis.analysis,
          refinementNotes
        } : {})
      };
  
      const response = await fetch("/api/analyze-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: PreferencesOutput = await response.json();
      setAnalysis(data);
      
      // Only reset refinement UI if we get a valid analysis back
      if (data.analysis) {
        setShowRefinement(false);
        setRefinementNotes("");
      }
    } catch (error) {
      console.error("Error analyzing preferences:", error);
      toast.error("Failed to analyze preferences. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRefining(false);
    }
  };

  const savePreferences = async (): Promise<void> => {
    if (!analysis?.isConcise || !userId || !analysis.analysis) return;
  
    setIsSaving(true);
    try {
      const payload: SavePreferencesPayload = {
        userId,
        preferences,
        analysis: {
          analysis: {
            ...analysis.analysis,
            expertiseLevel: analysis.analysis.expertiseLevel as ExpertiseLevel,
            interests: analysis.analysis.interests.map(interest => ({
              ...interest,
              category: interest.category as Category || Category.SKILL
            }))
          }
        }
      };
  
      const response = await fetch("/api/save-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save preferences");
      }
  
      toast.success("Preferences saved successfully!");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error saving preferences:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save preferences");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (analysis?.isConcise) {
      await savePreferences();
    } else {
      await analyzePreferences();
    }
  };

  const handleRefinement = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setIsRefining(true);
    await analyzePreferences(true);
  };

  const renderInterestBadge = (marketDemand: Interest["marketDemand"]): string => {
    const badgeClasses = {
      High: "bg-green-500/20 text-green-200",
      Medium: "bg-yellow-500/20 text-yellow-200",
      Low: "bg-red-500/20 text-red-200",
    };
    return badgeClasses[marketDemand];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto space-y-6"
      >
        {!analysis || !analysis.isConcise ? (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-2xl text-white">
                Tell Us About Your Interests
              </CardTitle>
              <CardDescription className="text-gray-400">
                Share your teaching goals, experience level, and what you'd like
                to learn or teach.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <Textarea
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  placeholder="Example: I'm a web developer with 5 years of experience in React and Node.js. I'd like to teach frontend development, focusing on modern frameworks and best practices. I can dedicate about 10 hours per week..."
                  className="h-40 bg-gray-700/50 border-gray-600 text-white"
                />
                {analysis && !analysis.isConcise && (
                  <Alert className="bg-yellow-500/10 border-yellow-500/50">
                    <AlertDescription className="text-yellow-200">
                      {analysis.message}
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Analyze Preferences"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-2xl text-white">
                      Your Learning Profile
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      Based on your preferences, we've created a personalized
                      learning profile.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRefinement(!showRefinement)}
                    className="border-gray-600 text-gray-300 hover:text-white"
                  >
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Refine Analysis
                  </Button>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Refinement Input Section */}
                  <AnimatePresence>
                    {showRefinement && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4"
                      >
                        <form onSubmit={handleRefinement} className="space-y-4">
                          <Textarea
                            value={refinementNotes}
                            onChange={(e) => setRefinementNotes(e.target.value)}
                            placeholder="What would you like to adjust about the analysis? Be specific about what aspects you'd like to change or improve..."
                            className="h-32 bg-gray-700/50 border-gray-600 text-white"
                          />
                          <Button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={isRefining}
                          >
                            {isRefining ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              "Update Analysis"
                            )}
                          </Button>
                        </form>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {analysis.analysis && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-700/30 p-4 rounded-lg">
                          <div className="flex items-center space-x-2 mb-2">
                            <Target className="h-5 w-5 text-blue-400" />
                            <h3 className="text-white font-medium">
                              Expertise Level
                            </h3>
                          </div>
                          <p className="text-gray-300">
                            {analysis.analysis.expertiseLevel}
                          </p>
                        </div>
                        <div className="bg-gray-700/30 p-4 rounded-lg">
                          <div className="flex items-center space-x-2 mb-2">
                            <Clock className="h-5 w-5 text-blue-400" />
                            <h3 className="text-white font-medium">Weekly Hours</h3>
                          </div>
                          <p className="text-gray-300">
                            {analysis.analysis.suggestedWeeklyHours} hours
                          </p>
                        </div>
                        <div className="bg-gray-700/30 p-4 rounded-lg">
                          <div className="flex items-center space-x-2 mb-2">
                            <Clock className="h-5 w-5 text-blue-400" />
                            <h3 className="text-white font-medium">Duration</h3>
                          </div>
                          <p className="text-gray-300">
                            {analysis.analysis.learningPath.estimatedTimeMonths} months
                          </p>
                        </div>
                      </div>

                      {/* Interests Grid */}
                      <div className="space-y-4">
                        <h3 className="text-xl font-semibold text-white">
                          Areas of Interest
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {analysis.analysis.interests.map((interest) => (
                            <div
                              key={interest.name}
                              className="bg-gray-700/30 p-4 rounded-lg space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <h4 className="text-lg font-medium text-white">
                                  {interest.name}
                                </h4>
                                <Badge className={renderInterestBadge(interest.marketDemand)}>
                                  {interest.marketDemand} Demand
                                </Badge>
                              </div>
                              <p className="text-gray-300 text-sm">
                                {interest.description}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {interest.trendingTopics.map((topic) => (
                                  <Badge
                                    key={topic}
                                    variant="secondary"
                                    className="bg-blue-500/20 text-blue-200"
                                  >
                                    {topic}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Market Insights */}
                      <div className="space-y-4">
                        <h3 className="text-xl font-semibold text-white">
                          Market Insights
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-gray-700/30 p-4 rounded-lg space-y-3">
                            <h4 className="text-lg font-medium text-white flex items-center gap-2">
                              <TrendingUp className="h-5 w-5 text-blue-400" />
                              Current Trends
                            </h4>
                            <ul className="space-y-2">
                              {analysis.analysis.marketInsights.trends.map(
                                (trend) => (
                                  <li
                                    key={trend}
                                    className="text-gray-300 flex items-start gap-2"
                                  >
                                    <div className="min-w-[8px] h-[8px] rounded-full bg-blue-400 mt-2" />
                                    <span>{trend}</span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                          <div className="bg-gray-700/30 p-4 rounded-lg space-y-3">
                            <h4 className="text-lg font-medium text-white flex items-center gap-2">
                              <Target className="h-5 w-5 text-blue-400" />
                              Opportunities
                            </h4>
                            <ul className="space-y-2">
                              {analysis.analysis.marketInsights.opportunities.map(
                                (opportunity) => (
                                  <li
                                      key={opportunity}
                                    className="text-gray-300 flex items-start gap-2"
                                  >
                                    <div className="min-w-[8px] h-[8px] rounded-full bg-blue-400 mt-2" />
                                    <span>{opportunity}</span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Learning Path */}
                      <div className="space-y-4">
                        <h3 className="text-xl font-semibold text-white">
                          Learning Path
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-gray-700/30 p-4 rounded-lg space-y-3">
                            <h4 className="text-lg font-medium text-white">
                              Fundamentals
                            </h4>
                            <ul className="space-y-2">
                              {analysis.analysis.learningPath.fundamentals.map(
                                (item) => (
                                  <li
                                    key={item}
                                    className="text-gray-300 flex items-start gap-2"
                                  >
                                    <div className="min-w-[8px] h-[8px] rounded-full bg-green-400 mt-2" />
                                    <span>{item}</span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                          <div className="bg-gray-700/30 p-4 rounded-lg space-y-3">
                            <h4 className="text-lg font-medium text-white">
                              Intermediate
                            </h4>
                            <ul className="space-y-2">
                              {analysis.analysis.learningPath.intermediate.map(
                                (item) => (
                                  <li
                                    key={item}
                                    className="text-gray-300 flex items-start gap-2"
                                  >
                                    <div className="min-w-[8px] h-[8px] rounded-full bg-yellow-400 mt-2" />
                                    <span>{item}</span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                          <div className="bg-gray-700/30 p-4 rounded-lg space-y-3">
                            <h4 className="text-lg font-medium text-white">
                              Advanced
                            </h4>
                            <ul className="space-y-2">
                              {analysis.analysis.learningPath.advanced.map(
                                (item) => (
                                  <li
                                    key={item}
                                    className="text-gray-300 flex items-start gap-2"
                                  >
                                    <div className="min-w-[8px] h-[8px] rounded-full bg-red-400 mt-2" />
                                    <span>{item}</span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Sources Section */}
                      {analysis.sourceUrls && (
                        <SourcesSection urls={analysis.sourceUrls} />
                      )}

                      {/* Save Button */}
                      <Button
                        onClick={savePreferences}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Save and Continue
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
}