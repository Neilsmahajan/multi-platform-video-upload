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
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      setLoading(true);
      setError(null);

      // Call signIn for TikTok with explicit parameters
      const result = await signIn("tiktok", {
        callbackUrl: `${window.location.origin}/dashboard/settings`,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        console.error("TikTok sign-in error:", result.error);
      } else if (result?.url) {
        // Redirect manually to have more control
        window.location.href = result.url;
      }
    } catch (err) {
      console.error("Error during TikTok sign-in:", err);
      setError("Failed to connect to TikTok. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    // For disconnect, redirect to an API route to remove the TikTok account (to be implemented)
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
          {loading ? "Connecting..." : "Connect TikTok"}
        </Button>
      )}
    </>
  );
}
