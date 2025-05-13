import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { del } from "@vercel/blob";

export async function POST(request: Request) {
  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user) {
      console.error("No session or user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse JSON body; expects publishId, accessToken, mediaUrl (optional)
    const {
      publishId,
      accessToken,
      mediaUrl,
      originalMediaUrl = null,
    } = await request.json();

    if (!publishId || !accessToken) {
      console.error("Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Check the status of the direct post
    console.log(`Checking TikTok status for publish ID: ${publishId}`);
    const statusRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          publish_id: publishId,
        }),
      },
    );

    if (!statusRes.ok) {
      const statusError = await statusRes.text();
      console.error("Failed to check TikTok post status:", statusError);
      return NextResponse.json(
        {
          error: "Failed to check TikTok post status",
          details: statusError,
          status: "error",
        },
        { status: statusRes.status },
      );
    }

    // Parse the response
    const statusData = await statusRes.json();
    console.log("TikTok status response:", statusData);

    // Extract status information
    const publishStatus = statusData.data?.publish_status || "PROCESSING";
    console.log(`TikTok publish status: ${publishStatus}`);

    if (publishStatus === "PUBLISH_FAILED") {
      console.error("TikTok publishing failed:", statusData);

      // Clean up blobs if provided
      await cleanupBlobs(mediaUrl, originalMediaUrl);

      return NextResponse.json({
        status: "error",
        error: "TikTok publishing failed",
        details: statusData.data?.fail_reason || "Unknown reason",
      });
    } else if (publishStatus === "PUBLISH_DONE") {
      console.log("TikTok publishing completed successfully");

      // Clean up blobs if provided
      await cleanupBlobs(mediaUrl, originalMediaUrl);

      return NextResponse.json({
        status: "success",
        publishId: publishId,
        message: "Your video has been successfully uploaded to TikTok.",
        note: "It's now available in your TikTok app with private (Only Me) visibility. You can change the privacy settings in the TikTok app.",
      });
    } else {
      // Still processing
      return NextResponse.json({
        status: "processing",
        publishId: publishId,
        message: "Your video is still being processed by TikTok.",
        note: "It will appear in your TikTok app with private (Only Me) visibility once processing is complete.",
      });
    }
  } catch (error: unknown) {
    console.error("Error during TikTok status check:", error);
    return NextResponse.json(
      {
        error: "Status check failed",
        details: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      },
      { status: 500 },
    );
  }
}

// Helper function to clean up blob files
async function cleanupBlobs(
  mediaUrl?: string,
  originalMediaUrl?: string | null,
) {
  if (mediaUrl) {
    try {
      console.log("Deleting compressed blob after TikTok upload");
      await del(mediaUrl);
      console.log("Compressed blob deleted successfully");
    } catch (delError) {
      console.error("Error deleting compressed blob:", delError);
    }
  }

  if (originalMediaUrl) {
    try {
      console.log("Deleting original blob after TikTok upload");
      await del(originalMediaUrl);
      console.log("Original blob deleted successfully");
    } catch (delError) {
      console.error("Error deleting original blob:", delError);
    }
  }
}
