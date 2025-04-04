"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface InstagramConnectProps {
  instagramConnected: boolean;
}

export default function InstagramConnect({
  instagramConnected,
}: InstagramConnectProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    await signIn("instagram", { callbackUrl: window.location.href });
    setLoading(false);
  };

  const handleDisconnect = async () => {
    // Redirect to an API route for disconnect when implemented
    router.push("/api/auth/disconnect/instagram");
  };

  return (
    <>
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
          Connect Instagram
        </Button>
      )}
    </>
  );
}
