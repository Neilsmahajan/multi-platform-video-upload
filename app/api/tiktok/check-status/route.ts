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

    // Parse JSON body; expects publishId, accessToken, mediaUrl
    const { publishId, accessToken, mediaUrl } = await request.json();

    if (!publishId || !accessToken) {
      console.error("Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Check upload status
    console.log(`Checking status for TikTok upload ${publishId}`);
    const statusResponse = await fetch(
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

    if (!statusResponse.ok) {
      const statusError = await statusResponse.text();
      console.error("Failed to check TikTok upload status:", statusError);
      return NextResponse.json(
        { error: "Failed to check TikTok status", details: statusError },
        { status: 500 },
      );
    }

    const statusData = await statusResponse.json();
    console.log("TikTok upload status response:", statusData);

    // Check if we have a definitive status
    if (statusData.data) {
      if (statusData.data.status === "PUBLISH_FAILED") {
        return NextResponse.json(
          {
            status: "error",
            error: "TikTok publishing failed",
            details: JSON.stringify(statusData.data),
          },
          { status: 500 },
        );
      } else if (
        statusData.data.status === "PUBLISH_SUCCESSFUL" ||
        statusData.data.status === "PUBLISHED"
      ) {
        // Delete the blob after successful publish
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
          publishId: publishId,
          processingStatus: statusData.data.status,
          message:
            "Video uploaded to TikTok successfully. Please check your TikTok app notifications and drafts folder to continue editing and publishing.",
          note: "It may take a few minutes for the video to appear in your TikTok drafts.",
        });
      } else if (statusData.data.status === "UPLOAD_SUCCESSFUL") {
        // Upload is successful but still needs to be processed for publishing
        return NextResponse.json({
          status: "processing",
          publishId: publishId,
          processingStatus: statusData.data.status,
          message: "Upload successful, still being processed by TikTok.",
        });
      } else {
        // Still processing
        return NextResponse.json({
          status: "processing",
          publishId: publishId,
          processingStatus: statusData.data.status || "PROCESSING",
          message: "Video is still being processed by TikTok.",
        });
      }
    } else {
      // No status data
      return NextResponse.json({
        status: "processing",
        publishId: publishId,
        message:
          "Status check did not return definitive status. Still processing.",
      });
    }
  } catch (error: unknown) {
    console.error("Unhandled error during TikTok status check:", error);
    return NextResponse.json(
      {
        error: "Status check failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
