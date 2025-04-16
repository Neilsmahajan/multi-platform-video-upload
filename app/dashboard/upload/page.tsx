import { Metadata } from "next";
import UploadForm from "@/app/dashboard/upload/UploadForm";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Upload Video",
  description:
    "Upload videos to multiple social media platforms simultaneously",
};

export default async function UploadPage() {
  const session = await auth();

  // Default connection status
  let instagramConnected = false;
  let tiktokConnected = false;

  if (session) {
    // Check Instagram connection status
    const instagramAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "instagram" },
    });
    instagramConnected = !!instagramAccount;

    // Check TikTok connection status
    const tiktokAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "tiktok" },
    });
    tiktokConnected = !!tiktokAccount;
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Upload Video</h1>
        <p className="text-gray-500">
          Upload once and publish to multiple platforms
        </p>
      </div>
      <UploadForm
        initialInstagramConnected={instagramConnected}
        initialTiktokConnected={tiktokConnected}
      />
    </>
  );
}
