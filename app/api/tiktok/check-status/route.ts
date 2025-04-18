import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { del } from "@vercel/blob";

export async function POST(request: Request) {
  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user) {
      console.error("No session or user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse JSON body; expects publishId, mediaUrl (optional)
    const { publishId, mediaUrl } = await request.json();

    if (!publishId) {
      console.error("Missing required fields");
      return NextResponse.json({ error: "Missing publishId" }, { status: 400 });
    }

    // Get the TikTok account for the current user
    const tiktokAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "tiktok",
      },
    });

    if (!tiktokAccount || !tiktokAccount.access_token) {
      console.error("TikTok account not found or missing access token");
      return NextResponse.json(
        { error: "TikTok account not properly connected" },
        { status: 401 },
      );
    }

    // Check upload status
    console.log(`Checking status for TikTok upload ${publishId}`);
    const statusResponse = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tiktokAccount.access_token}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          publish_id: publishId,
        }),
      },
    );

    if (!statusResponse.ok) {
      const statusError = await statusResponse.text();
      console.error("Failed to check TikTok upload status:", statusError);
      return NextResponse.json(
        { error: "Failed to check upload status", details: statusError },
        { status: statusResponse.status },
      );
    }

    const statusData = await statusResponse.json();
    console.log("TikTok status response:", statusData);

    // If we have a definitive status
    if (statusData.data) {
      if (statusData.data.status === "PUBLISH_FAILED") {
        console.error("TikTok publishing failed:", statusData.data);
        return NextResponse.json({
          status: "error",
          message: "TikTok publishing failed",
          details: statusData.data,
        });
      } else if (
        statusData.data.status === "PUBLISH_SUCCESSFUL" ||
        statusData.data.status === "PUBLISHED"
      ) {
        // Delete the blob after successful upload
        if (mediaUrl) {
          try {
            console.log("Deleting blob after successful upload");
            await del(mediaUrl);
            console.log("Blob deleted successfully");
          } catch (delError) {
            console.error("Error deleting blob:", delError);
            // Continue even if blob deletion fails
          }
        }

        return NextResponse.json({
          status: "success",
          message: "Video successfully published to TikTok inbox",
        });
      } else if (statusData.data.status === "UPLOAD_SUCCESSFUL") {
        // Upload is successful but still needs to be processed for publishing
        return NextResponse.json({
          status: "processing",
          message: "Video uploaded and being processed",
        });
      }
    }

    // Default response for other statuses
    return NextResponse.json({
      status: "processing",
      message: "Video is still being processed",
      details: statusData.data,
    });
  } catch (error: unknown) {
    console.error("Unhandled error during TikTok status check:", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Status check failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
