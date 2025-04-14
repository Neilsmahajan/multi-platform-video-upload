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
    try {
      setLoading(true);
      setError(null);

      // Simplest approach - direct provider sign-in
      signIn("tiktok");

      // No need for additional code as the page will redirect
    } catch (err) {
      console.error("Error during TikTok sign-in:", err);
      setError("Failed to connect to TikTok. Please try again.");
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    router.push("/api/auth/disconnect/tiktok");
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
          Disconnect TikTok
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
