// ---- Client Component ----
// The following component will render as a client component.
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface TikTokConnectProps {
  tiktokConnected: boolean;
}

export default function TikTokConnect({ tiktokConnected }: TikTokConnectProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    // Call signIn for TikTok with callback to current page
    await signIn("tiktok");
    setLoading(false);
  };

  const handleDisconnect = async () => {
    // For disconnect, redirect to an API route to remove the TikTok account (to be implemented)
    router.push("/api/auth/disconnect/tiktok");
  };

  return (
    <>
      {tiktokConnected ? (
        <Button
          variant="destructive"
          onClick={handleDisconnect}
          disabled={loading}
        >
          Disconnect TikTok
        </Button>
      ) : (
        <Button onClick={handleConnect} disabled={loading}>
          Connect TikTok
        </Button>
      )}
    </>
  );
}
