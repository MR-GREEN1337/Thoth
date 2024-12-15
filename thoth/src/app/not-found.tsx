"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";

function NotFoundPage() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-semibold mb-4">Page Not Found</h2>
        <p className="text-muted-foreground mb-8 max-w-md">
          Don&apos;t worry, it happens to the best of us. Let&apos;s get you
          back on track.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link
            onClick={() => {
              router.push("/dashboard");
            }}
            className="flex items-center justify-center px-4 py-2 bg-primary text-black rounded-md hover:bg:primary/80 transition-colors transition-transform duration-300 transform hover:scale-110"
            href={""}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to dashboard
          </Link>
        </div>
      </div>
      <div className="mt-12 text-center">
        <p className="text-sm text-muted-foreground">
          If you believe this is a mistake, please contact support.
        </p>
      </div>
    </div>
  );
}

export default NotFoundPage;
