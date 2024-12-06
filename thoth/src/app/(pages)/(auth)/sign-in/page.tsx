"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { IntertwiningArcs } from "@/components/auth/IntertwiningArcs";
import Logo from "@/components/global/logo";
import { signInAction } from "@/app/actions/auth";
import Cookies from "js-cookie"

export default function SignInPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const { mutate: signIn, isError, error, isPending } = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const formData = new FormData();
      formData.append("username", credentials.username);
      formData.append("password", credentials.password);
      
      const result = await signInAction(formData);
      if (!result.success) {
        throw new Error(result.error || "Failed to sign in");
      }
      console.log(result)
      // set userId as cookie token
      if (result.userId) {
        Cookies.set("token", result.userId);
      }
      return result;
    },
    onSuccess: () => {
      router.push("/dashboard");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    signIn({ username, password });
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
              <CardTitle className="text-2xl md:text-3xl text-white">
                Welcome back
              </CardTitle>
              <CardDescription className="text-gray-400">
                Continue your journey in the hackathon
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {isError && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {error instanceof Error ? error.message : "Failed to sign in"}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-gray-300">
                    Username
                  </Label>
                  <Input
                    id="username"
                    placeholder="hackathon_user"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="bg-gray-900/50 border-gray-800 text-white"
                  />
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
                <Button
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                  type="submit"
                >
                  {isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Sign In
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex justify-center">
              <p className="text-sm text-gray-400">
                Don't have an account?{" "}
                <Link href="/sign-up" className="text-blue-400 hover:text-blue-300">
                  Sign up
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
                  Hackathon Hub
                </h2>
                <p className="text-gray-400 mt-2 text-sm md:text-base">
                  Join fellow hackers in building amazing projects
                </p>
              </motion.div>

              {[
                "Project Collaboration",
                "Real-time Updates",
                "Team Formation",
                "Resource Sharing",
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