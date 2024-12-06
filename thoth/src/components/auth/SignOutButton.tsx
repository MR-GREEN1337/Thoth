"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";

interface SignOutButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export const SignOutButton = ({ 
  className, 
  children, 
  ...props 
}: SignOutButtonProps) => {
    const router = useRouter()
  const handleSignOut = async () => {
    Cookies.remove("token");
    router.push("/sign-in");
  };

  return (
    <Button
      variant="ghost"
      className={cn("", className)}
      onClick={handleSignOut}
      {...props}
    >
      {children}
    </Button>
  );
};