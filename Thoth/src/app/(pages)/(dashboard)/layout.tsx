"use client";

import Link from "next/link";
import Logo from "@/components/global/logo";
import ProfileDropdown from "@/components/global/ProfileDropdown";

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800">
      {/* Header */}
      <header className="border-b border-gray-800/40 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/dashboard"
              className="focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-2 focus:ring-offset-gray-900 rounded-lg"
            >
              <Logo variant="default" className="transform hover:scale-105 transition-transform duration-200" />
            </Link>
            <ProfileDropdown />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full">
        {children}
      </main>
      
      {/* Radial gradient backgrounds */}
      <div className="fixed inset-0 z-[-1] bg-black">
        <div className="absolute top-0 left-1/4 w-3/4 h-1/2 bg-amber-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-3/4 h-1/2 bg-amber-600/10 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}