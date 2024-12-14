import React, { useState, useEffect } from 'react';
import { ChevronDown, User, BookOpen, Brain, LogOut, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ExpertiseLevel } from "@prisma/client";

interface ProfileData {
  username: string;
  expertiseLevel: ExpertiseLevel;
  weeklyHours: number;
  preferenceAnalysis: any;
  rawPreferences: string;
  interests: Array<{
    name: string;
    category: string;
    marketDemand: string;
    trendingTopics: string[];
  }>;
  enrollments: Array<{
    status: string;
    progress: number;
  }>;
}

const LoadingSpinner = () => (
    <div className="flex items-center space-x-2">
      <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
      <span className="text-gray-400 animate-pulse">Loading profile...</span>
    </div>
  );
  
  const ProfileDropdown = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfileData = async () => {
      if (isOpen && !profileData) {
        setIsLoading(true);
        try {
          const response = await fetch('/api/user/profile');
          if (!response.ok) throw new Error('Failed to fetch profile data');
          const data = await response.json();
          setProfileData(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchProfileData();
  }, [isOpen]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const dropdown = document.getElementById('profile-dropdown');
      if (dropdown && !dropdown.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div 
      id="profile-dropdown"
      className="relative ml-auto" // Added ml-auto to push to right
    >
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 
                   transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
      >
        <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center">
          <User className="h-4 w-4 text-amber-500" />
        </div>
        <span className="text-gray-200 hidden sm:inline">
          {isLoading ? <LoadingSpinner /> : profileData?.username || 'Profile'}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 
                              ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Content */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-96 z-[100] animate-in fade-in slide-in-from-top-5 
                      duration-200 shadow-xl shadow-black/20">
          <Card className="bg-gray-900/95 border-gray-800 backdrop-blur-sm text-gray-200">
            <CardContent className="pt-4 space-y-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                  <p className="text-sm text-gray-400 animate-pulse">Loading your profile data...</p>
                </div>
              ) : error ? (
                <div className="text-red-400 text-center py-4">{error}</div>
              ) : profileData && (
                <>
                  {/* Interests */}
                  <div className="space-y-2">
                    <div className="text-sm text-gray-400">Interests</div>
                    <div className="flex flex-wrap gap-2">
                      {profileData.interests.map((interest, index) => (
                        <Badge 
                          key={index}
                          variant="secondary" 
                          className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                        >
                          {interest.name}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Preference Analysis */}
                  {profileData.preferenceAnalysis && (
                    <div className="space-y-2">
                      <div className="text-sm text-gray-400">Learning Preferences</div>
                      <div className="text-sm leading-relaxed">
                        {profileData.rawPreferences}
                      </div>
                    </div>
                  )}

                  {/* Sign Out Button */}
                  <div className="pt-2">
                    <SignOutButton className="w-full justify-start text-gray-400 hover:text-gray-200 hover:bg-transparent">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign out
                    </SignOutButton>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ProfileDropdown;