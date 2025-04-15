"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface InstagramConnectProps {
  instagramConnected?: boolean;
}

export default function InstagramConnect({
  instagramConnected = false,
}: InstagramConnectProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await signIn("instagram", {
        callbackUrl: `${window.location.origin}/dashboard/settings`,
        redirect: true,
      });
    } catch (err) {
      console.error("Instagram auth error:", err);
      setError("Failed to connect to Instagram");
    }
    setLoading(false);
  };

  const handleDisconnect = async () => {
    router.push("/api/auth/disconnect/instagram");
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
          className="w-full"
        >
          Disconnect Instagram
        </Button>
      ) : (
        <Button onClick={handleConnect} disabled={loading} className="w-full">
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
