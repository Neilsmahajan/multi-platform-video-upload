"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface TikTokConnectProps {
  tiktokConnected: boolean;
}

export default function TikTokConnect({ tiktokConnected }: TikTokConnectProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      // Use current page URL as callback destination
      await signIn("tiktok", {
        callbackUrl: window.location.href,
        redirect: true,
      });
      // No need for additional code due to redirect
    } catch (err) {
      console.error("TikTok connection error:", err);
      setError("Failed to connect TikTok account. Please try again.");
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);

    try {
      router.push("/api/auth/disconnect/tiktok");
    } catch (err) {
      console.error("TikTok disconnect error:", err);
      setError("Failed to disconnect TikTok account");
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <div className="p-3 mb-3 bg-red-50 border border-red-200 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {tiktokConnected ? (
        <Button
          variant="destructive"
          onClick={handleDisconnect}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Disconnecting...
            </>
          ) : (
            "Disconnect TikTok"
          )}
        </Button>
      ) : (
        <Button onClick={handleConnect} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            "Connect TikTok"
          )}
        </Button>
      )}
    </>
  );
}
