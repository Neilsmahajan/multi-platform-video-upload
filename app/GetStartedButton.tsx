"use client";
import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function GetStartedButton() {
  const { data: session, status } = useSession();
  console.log(session, status);

  if (status === "loading") {
    return <>...</>;
  }

  if (status === "authenticated") {
    return (
      <Link href="/dashboard">
        <Button size="lg" className="gap-1">
          Go to Dashboard <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    );
  }

  return (
    <Button size="lg" onClick={() => signIn("google")} className="gap-1">
      Get Started <ArrowRight className="h-4 w-4" />
    </Button>
  );
}
