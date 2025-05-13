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

    // Parse JSON body; expects publishId, accessToken, mediaUrl (and now originalMediaUrl for compressed videos)
    const { publishId, accessToken, mediaUrl, originalMediaUrl } =
      await request.json();

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

      const statusPayload = JSON.stringify({
        publish_id: publishId,
      });

      const statusResponse = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "Content-Length": statusPayload.length.toString(),
          },
          body: statusPayload,
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
          statusData.data.status === "PUBLISHED" ||
          statusData.data.status === "UPLOAD_SUCCESSFUL"
        ) {
          // Delete the blob files after successful upload
          if (mediaUrl) {
            try {
              console.log("Deleting compressed blob after successful upload");
              await del(mediaUrl);
              console.log("Compressed blob deleted successfully");
            } catch (delError) {
              console.error("Error deleting compressed blob:", delError);
              // Continue even if blob deletion fails
            }
          }

          // Also delete the original blob if it exists and is different from mediaUrl
          if (originalMediaUrl && originalMediaUrl !== mediaUrl) {
            try {
              console.log("Deleting original blob after successful upload");
              await del(originalMediaUrl);
              console.log("Original blob deleted successfully");
            } catch (delError) {
              console.error("Error deleting original blob:", delError);
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
            message: "Video successfully uploaded to your TikTok inbox!",
            note: "Check your TikTok app notifications to edit and publish your video.",
          });
        } else if (statusData.data.status === "PROCESSING_UPLOAD") {
          // This is a common status during processing
          return NextResponse.json({
            status: "processing",
            publishId: publishId,
            processingStatus: statusData.data.status,
            message: "TikTok is still processing your video upload.",
            note: "You'll receive a notification in the TikTok app when it's ready to edit.",
          });
        } else {
          // Still processing with other status
          return NextResponse.json({
            status: "processing",
            publishId: publishId,
            processingStatus: statusData.data.status || "PROCESSING",
            message: "Video is still being processed by TikTok.",
            note: "Check your TikTok app notifications to complete the process.",
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
