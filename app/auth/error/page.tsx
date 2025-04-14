"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-md">
        <div className="mb-4 flex items-center justify-center text-red-500">
          <AlertCircle size={48} />
        </div>
        <h1 className="mb-2 text-center text-2xl font-bold">
          Authentication Error
        </h1>

        <div className="my-4 rounded-md bg-red-50 p-4 text-sm text-red-800">
          {error || "An unknown error occurred during authentication"}
        </div>

        <div className="mb-4 text-center text-gray-600">
          <p>This could be due to:</p>
          <ul className="mt-2 list-inside list-disc text-left">
            <li>Invalid OAuth configuration</li>
            <li>Expired or invalid token</li>
            <li>Provider API limitations</li>
            <li>Permission restrictions</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={() => window.history.back()} className="w-full">
            Try Again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/" className="flex items-center justify-center gap-2">
              <Home size={16} />
              Return Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
