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

    try {
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
          // Add a reasonable timeout
          signal: AbortSignal.timeout(30000), // 30 second timeout
        },
      );

      // Safely parse the response
      let statusData;
      const contentType = statusResponse.headers.get("content-type");
      const responseText = await statusResponse.text();

      if (!statusResponse.ok) {
        console.error("Failed to check TikTok upload status:", {
          status: statusResponse.status,
          contentType,
          response: responseText.substring(0, 500),
        });

        return NextResponse.json(
          {
            error: "Failed to check TikTok status",
            details: `Status check failed with ${
              statusResponse.status
            }: ${responseText.substring(0, 200)}`,
          },
          { status: 500 },
        );
      }

      // Try to parse as JSON
      try {
        statusData = JSON.parse(responseText);
        console.log("TikTok upload status response:", statusData);
      } catch (parseError) {
        console.error("Failed to parse TikTok status response as JSON:", {
          error: parseError,
          responseText: responseText.substring(0, 500),
        });

        return NextResponse.json(
          {
            error: "Invalid response from TikTok",
            details: "Failed to parse status check response as JSON",
          },
          { status: 500 },
        );
      }

      // Process the status data
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
    } catch (statusError) {
      console.error("Error checking TikTok upload status:", statusError);
      return NextResponse.json(
        {
          error: "Failed to check TikTok status",
          details:
            statusError instanceof Error
              ? statusError.message
              : "Unknown error during status check",
        },
        { status: 500 },
      );
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
