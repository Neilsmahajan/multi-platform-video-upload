"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface InstagramConnectProps {
  instagramConnected: boolean;
}

export default function InstagramConnect({
  instagramConnected,
}: InstagramConnectProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);

    // Clear any previous errors
    setError(null);

    try {
      // Use callbackUrl as the current URL and force redirect
      // to handle the OAuth flow properly
      await signIn("instagram", {
        callbackUrl: window.location.href,
        redirect: true,
      });

      // Note: The page will redirect, so the code below won't run
      // unless there's an error in the signIn function itself
    } catch (err) {
      console.error("Instagram auth error:", err);
      setError("Failed to connect to Instagram. Please try again.");
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      // Redirect to an API route for disconnect
      router.push("/api/auth/disconnect/instagram");
    } catch (err) {
      console.error("Instagram disconnect error:", err);
      setError("Failed to disconnect Instagram account");
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

      {instagramConnected ? (
        <Button
          variant="destructive"
          onClick={handleDisconnect}
          disabled={loading}
        >
          Disconnect Instagram
        </Button>
      ) : (
        <Button onClick={handleConnect} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            "Connect Instagram"
          )}
        </Button>
      )}
    </>
  );
}
