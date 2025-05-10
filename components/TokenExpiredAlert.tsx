"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCw } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";

interface TokenExpiredAlertProps {
  provider: string;
  onClose?: () => void;
}

export default function TokenExpiredAlert({
  provider,
  onClose,
}: TokenExpiredAlertProps) {
  const [isReconnecting, setIsReconnecting] = useState(false);

  const handleReconnect = () => {
    setIsReconnecting(true);
    signIn(provider.toLowerCase(), {
      callbackUrl: window.location.href,
      redirect: true,
    });
  };

  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

  return (
    <Alert className="mb-6 bg-amber-50 border-amber-200">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800">
        {providerName} Connection Expired
      </AlertTitle>
      <AlertDescription className="text-amber-700">
        <p className="mb-3">
          Your {providerName} access token has expired. Please reconnect your
          account to continue uploading videos.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700"
            onClick={handleReconnect}
            disabled={isReconnecting}
          >
            {isReconnecting ? (
              <>
                <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                Reconnecting...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-3 w-3" />
                Reconnect {providerName}
              </>
            )}
          </Button>
          {onClose && (
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              className="border-amber-200 text-amber-700 hover:bg-amber-100"
            >
              Dismiss
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
