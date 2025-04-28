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
      // Use a timeout for the status check request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

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
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);

      // Get the full response text first
      const responseText = await statusResponse.text();
      const contentType = statusResponse.headers.get("content-type");

      // Log the status response for debugging
      console.log("TikTok status check response:", {
        status: statusResponse.status,
        contentType,
        responsePreview: responseText.substring(0, 200),
      });

      if (!statusResponse.ok) {
        console.error("Failed to check TikTok upload status:", {
          status: statusResponse.status,
          contentType,
          response: responseText.substring(0, 500),
        });

        return NextResponse.json(
          {
            status: "error",
            error: "Failed to check TikTok status",
            details: `Status check failed with ${
              statusResponse.status
            }: ${responseText.substring(0, 200)}`,
          },
          { status: 500 },
        );
      }

      // Try to parse as JSON
      let statusData;
      try {
        // Only attempt to parse if the response is not empty
        if (responseText && responseText.trim()) {
          statusData = JSON.parse(responseText);
          console.log("TikTok upload status data:", statusData);
        } else {
          throw new Error("Empty response received");
        }
      } catch (parseError) {
        console.error("Failed to parse TikTok status response as JSON:", {
          error: parseError,
          responseText: responseText.substring(0, 500),
        });

        return NextResponse.json(
          {
            status: "error",
            error: "Invalid response from TikTok",
            details:
              "Failed to parse status check response as JSON. Raw response: " +
              responseText.substring(0, 100),
          },
          { status: 500 },
        );
      }

      // Process the status data
      if (statusData.data) {
        if (statusData.data.status === "PUBLISH_FAILED") {
          return NextResponse.json({
            status: "error",
            error: "TikTok publishing failed",
            details: JSON.stringify(statusData.data),
          });
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

          let itemId = "";
          if (statusData.data.item_id) {
            itemId = statusData.data.item_id;
          }

          return NextResponse.json({
            status: "success",
            publishId: publishId,
            itemId: itemId,
            processingStatus: statusData.data.status,
            message: "Video successfully published to your TikTok profile!",
            note: itemId
              ? `Your TikTok post ID is: ${itemId}`
              : "Check your TikTok profile to see your new video",
          });
        } else if (statusData.data.status === "UPLOAD_SUCCESSFUL") {
          // Upload is successful but still needs to be processed for publishing
          return NextResponse.json({
            status: "processing",
            publishId: publishId,
            processingStatus: statusData.data.status,
            message: "Upload successful, TikTok is now processing your video.",
            note: "Your video will be published directly to your profile once processing is complete.",
          });
        } else if (statusData.data.status === "PROCESSING_UPLOAD") {
          // This is a common status during processing
          return NextResponse.json({
            status: "processing",
            publishId: publishId,
            processingStatus: statusData.data.status,
            message: "TikTok is still processing your video upload.",
            note: "This may take a few minutes depending on video size.",
          });
        } else {
          // Still processing with other status
          return NextResponse.json({
            status: "processing",
            publishId: publishId,
            processingStatus: statusData.data.status || "PROCESSING",
            message: "Video is still being processed by TikTok.",
            note: "Current status: " + statusData.data.status,
          });
        }
      } else {
        // No status data
        return NextResponse.json({
          status: "processing",
          publishId: publishId,
          message:
            "Status check did not return definitive status. Still processing.",
          note: "Please check your TikTok profile for your video.",
        });
      }
    } catch (statusError) {
      console.error("Error checking TikTok upload status:", statusError);

      // Check if this is an AbortError (timeout)
      if (statusError instanceof Error && statusError.name === "AbortError") {
        return NextResponse.json(
          {
            status: "error",
            error: "TikTok status check timeout",
            details: "The status check took too long and was aborted.",
          },
          { status: 504 },
        );
      }

      return NextResponse.json({
        status: "error",
        error: "Failed to check TikTok status",
        details:
          statusError instanceof Error
            ? statusError.message
            : "Unknown error during status check",
      });
    }
  } catch (error: unknown) {
    console.error("Unhandled error during TikTok status check:", error);
    return NextResponse.json({
      status: "error",
      error: "Status check failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
