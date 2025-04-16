"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function UserDataDeletionInstructions() {
  const router = useRouter();

  const handleDisconnect = () => {
    router.push("/api/auth/disconnect/instagram");
  };

  return (
    <div className="container max-w-4xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">
        User Data Deletion Instructions
      </h1>
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">Instagram Account Data</h2>
          <p className="mb-4">
            To comply with Meta&#39;s data privacy requirements, you can delete
            your data by disconnecting your Instagram account.
          </p>
          <p className="mb-6">
            Clicking the button below will remove your Instagram access token
            and all associated data from our database.
          </p>
          <Button onClick={handleDisconnect} variant="destructive">
            Disconnect Instagram
          </Button>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">Account Deletion</h2>
          <p className="mb-4">
            If you wish to completely delete your account and all associated
            data from our platform, please contact us at
            support@multiplatformvideoupload.com.
          </p>
          <p>
            We will process your account deletion request within 30 days and all
            your personal data will be permanently removed from our systems.
          </p>
        </div>
      </div>
    </div>
  );
}
