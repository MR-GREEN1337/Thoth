"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Book, ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import debounce from "lodash/debounce";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IntertwiningArcs } from "@/components/auth/IntertwiningArcs";
import Logo from "@/components/global/logo";
import { checkUsername, signUpAction } from "@/app/actions/auth";
import Cookies from "js-cookie";

export default function SignUpPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [preferences, setPreferences] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameExists, setUsernameExists] = useState(false);
  const router = useRouter();

  // Debounced username check
  const debouncedCheckUsername = debounce(async (username: string) => {
    if (username.length >= 3) {
      setIsCheckingUsername(true);
      try {
        const exists = await checkUsername(username);
        setUsernameExists(exists);
      } catch (error) {
        console.error("Error checking username:", error);
      } finally {
        setIsCheckingUsername(false);
      }
    }
  }, 500);

  useEffect(() => {
    if (username) {
      debouncedCheckUsername(username);
    } else {
      setUsernameExists(false);
    }
    return () => {
      debouncedCheckUsername.cancel();
    };
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (usernameExists) {
      setError("Username already taken. Please choose a different one.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);
      formData.append("rawPreferences", preferences);

      const userResult = await signUpAction(formData);
      Cookies.set("token", userResult.userId);
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign up");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row">
      {/* Form Section */}
      <div className="w-full md:w-1/2 p-4 md:p-8 flex flex-col justify-center items-center bg-[#020817] min-h-[50vh] md:min-h-screen relative">
        <Button
          variant="outline"
          onClick={() => router.back()}
          className="absolute top-4 left-4 text-gray-400 mt-10 bg-transparent"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="space-y-2">
              <a href="/">
                <Logo className="mb-4" variant="auth" />
              </a>
              <Alert className="mb-4 bg-blue-900/20 border-blue-800">
                <AlertTitle className="text-blue-400">👋 Hello There!</AlertTitle>
                <AlertDescription className="text-gray-300">
                  This is a demo implementation with basic user management. Authentication is simplified for hackathon purposes. Please use any test credentials to explore the app.
                </AlertDescription>
              </Alert>
              <CardTitle className="text-2xl md:text-3xl text-white">
                Join Thoth (Demo)
              </CardTitle>
              <CardDescription className="text-gray-400">
                Create a test account to explore our hackathon project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-gray-300">
                    Username
                  </Label>
                  <div className="relative">
                    <Input
                      id="username"
                      placeholder="username"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setError(null);
                      }}
                      required
                      className={`bg-gray-900/50 border-gray-800 text-white ${
                        usernameExists ? "border-red-500" : ""
                      }`}
                    />
                    {isCheckingUsername && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      </div>
                    )}
                    {usernameExists && !isCheckingUsername && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      </div>
                    )}
                  </div>
                  {usernameExists && !isCheckingUsername && (
                    <p className="text-sm text-red-500">
                      Username already taken. Please choose a different one.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-300">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-gray-900/50 border-gray-800 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preferences" className="text-gray-300">
                    Your Teaching & Learning Interests (optional)
                  </Label>
                  <Textarea
                    id="preferences"
                    placeholder="What topics are you passionate about? What emerging fields interest you? What would you like to teach or learn?"
                    value={preferences}
                    onChange={(e) => setPreferences(e.target.value)}
                    className="bg-gray-900/50 border-gray-800 text-white min-h-[100px]"
                  />
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                  type="submit"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Book className="mr-2 h-4 w-4" />
                      Create Test Account
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex justify-center">
              <p className="text-sm text-gray-400">
                Already have an account?{" "}
                <Link
                  href="/sign-in"
                  className="text-blue-400 hover:text-blue-300"
                >
                  Sign in here
                </Link>
              </p>
            </CardFooter>
          </Card>
        </motion.div>
      </div>

      {/* Decorative Section */}
      <div className="w-full md:w-1/2 bg-gradient-to-br from-[#020817] via-[#0f1629] to-[#020817] flex items-center justify-center p-4 md:p-8 relative overflow-hidden min-h-[50vh] md:min-h-screen">
        <IntertwiningArcs />

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10 w-full max-w-md"
        >
          <div className="bg-gray-900/40 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-gray-800/50 shadow-2xl">
            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <h2 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Hackathon Demo Features
                </h2>
                <p className="text-gray-400 mt-2 text-sm md:text-base">
                  Explore our core functionality with simplified auth
                </p>
              </motion.div>

              {[
                "Basic User Management",
                "Course Creation Interface",
                "AI-Powered Content Generation",
                "Learning Path Visualization",
                "Community Features Demo",
                "Knowledge Graph Preview",
              ].map((feature, index) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  className="flex items-center space-x-3"
                >
                  <div className="h-2 w-2 rounded-full bg-blue-400" />
                  <p className="text-sm text-gray-300">{feature}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}