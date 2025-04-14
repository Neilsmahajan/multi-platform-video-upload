"use client";

import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function DashboardAuthCheck({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl">Loading...</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Sign in Required</h1>
          <p className="text-gray-500 mb-6">
            Please sign in to access the dashboard
          </p>
        </div>
        <Button size="lg" onClick={() => signIn("google")} className="gap-1">
          Sign in with Google <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
