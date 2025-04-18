export const config = {
  api: {
    bodyParser: {
      sizeLimit: "100mb",
    },
  },
};

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Helper function to wait for a specific duration
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Define types for TikTok API responses
interface TikTokUploadStatusData {
  status:
    | "PUBLISH_FAILED"
    | "PUBLISH_SUCCESSFUL"
    | "PUBLISHED"
    | "UPLOAD_SUCCESSFUL";
  [key: string]:
    | string
    | number
    | boolean
    | object
    | unknown[]
    | null
    | undefined; // For other properties in the response
}

interface TikTokUploadResponse {
  data?: TikTokUploadStatusData;
  [key: string]:
    | string
    | number
    | boolean
    | object
    | unknown[]
    | null
    | undefined; // For other properties in the response
}

interface TikTokUploadTimeout {
  status: "timeout";
  message: string;
}

type TikTokUploadResult = TikTokUploadResponse | TikTokUploadTimeout;

// Helper function to poll TikTok status until completion or max attempts reached
export async function pollUploadStatus(
  accessToken: string,
  publishId: string,
  maxAttempts = 5,
): Promise<TikTokUploadResult> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(
      `Checking TikTok upload status (attempt ${attempts}/${maxAttempts})`,
    );

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
      throw new Error(`Status check failed: ${statusError}`);
    }

    const statusData = await statusResponse.json();
    console.log("TikTok upload status response:", statusData);

    // Check if we have a definitive status
    if (statusData.data) {
      if (statusData.data.status === "PUBLISH_FAILED") {
        throw new Error(
          "TikTok publishing failed: " + JSON.stringify(statusData.data),
        );
      } else if (
        statusData.data.status === "PUBLISH_SUCCESSFUL" ||
        statusData.data.status === "PUBLISHED"
      ) {
        return statusData;
      } else if (statusData.data.status === "UPLOAD_SUCCESSFUL") {
        // Upload is successful but still needs to be processed for publishing
        console.log("Upload successful, waiting for processing...");
      }
    }

    // Wait before checking again
    await delay(2000);
  }

  // If we get here, we've hit max attempts without a definitive status
  return {
    status: "timeout",
    message: "Status polling timed out but upload may still be processing",
  };
}

export async function POST(request: Request) {
  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user) {
      console.error("No session or user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Processing TikTok upload for user:", session.user.id);

    // Parse JSON body; expects mediaUrl, caption
    const { mediaUrl, caption = "" } = await request.json();

    if (!mediaUrl) {
      console.error("Missing required fields", {
        mediaUrl: !!mediaUrl,
      });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    console.log("Upload request received with caption:", caption);

    // Get the TikTok account for the current user
    const tiktokAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "tiktok",
      },
    });

    if (!tiktokAccount || !tiktokAccount.access_token) {
      console.error("TikTok account not found or missing access token", {
        accountFound: !!tiktokAccount,
        hasAccessToken: !!tiktokAccount?.access_token,
      });
      return NextResponse.json(
        { error: "TikTok account not properly connected" },
        { status: 401 },
      );
    }

    console.log("Found TikTok account with access token");

    // First, get the video file from the blob URL to determine its size
    console.log("Fetching video file from blob:", mediaUrl);
    const videoResponse = await fetch(mediaUrl);

    if (!videoResponse.ok) {
      console.error("Failed to fetch video from blob URL", {
        status: videoResponse.status,
      });
      return NextResponse.json(
        { error: "Failed to fetch video from blob storage" },
        { status: 500 },
      );
    }

    // Get video as array buffer to determine size
    const videoBuffer = await videoResponse.arrayBuffer();
    const videoSize = videoBuffer.byteLength;
    console.log("Video size:", videoSize, "bytes");

    // Step 1: Initialize video upload with TikTok using FILE_UPLOAD method
    console.log("Initializing TikTok video upload with FILE_UPLOAD method");

    try {
      // Include caption and draft mode in the initialization request
      const initResponse = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tiktokAccount.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source_info: {
              source: "FILE_UPLOAD",
              video_size: videoSize,
              chunk_size: videoSize,
              total_chunk_count: 1,
            },
            post_info: {
              title: caption.substring(0, 150), // TikTok has a title/caption limit
              privacy_level: "SELF_ONLY", // Create as a draft
            },
          }),
        },
      );

      // Safely parse the response - check content type first
      let initData;
      const contentType = initResponse.headers.get("content-type");
      const responseText = await initResponse.text();

      if (!initResponse.ok) {
        console.error("Failed to initialize TikTok upload:", {
          status: initResponse.status,
          contentType,
          responseBody: responseText.substring(0, 500), // Log part of the body for debugging
        });

        return NextResponse.json(
          {
            error: "Failed to initialize TikTok upload",
            details: `TikTok API returned ${
              initResponse.status
            }: ${responseText.substring(0, 200)}`,
          },
          { status: initResponse.status },
        );
      }

      // Try to parse as JSON if it looks like JSON
      try {
        initData = JSON.parse(responseText);
        console.log("TikTok init response:", initData);
      } catch (parseError) {
        console.error("Failed to parse TikTok init response as JSON:", {
          error: parseError,
          responseBody: responseText.substring(0, 500),
        });
        return NextResponse.json(
          {
            error: "Invalid response from TikTok",
            details: "Failed to parse TikTok API response as JSON",
          },
          { status: 500 },
        );
      }

      if (
        !initData.data ||
        !initData.data.publish_id ||
        !initData.data.upload_url
      ) {
        console.error("Invalid response from TikTok init API:", initData);
        return NextResponse.json(
          { error: "Invalid response from TikTok" },
          { status: 500 },
        );
      }

      const publishId = initData.data.publish_id;
      const uploadUrl = initData.data.upload_url;
      console.log("TikTok upload initialized with publish_id:", publishId);
      console.log("TikTok upload URL:", uploadUrl);

      // Step 2: Upload the video file to TikTok's provided URL
      console.log("Uploading video to TikTok...");

      try {
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type":
              videoResponse.headers.get("content-type") || "video/mp4",
            "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
          },
          body: new Uint8Array(videoBuffer),
          // Add a longer timeout since we're uploading a large file
          signal: AbortSignal.timeout(60000), // 60 second timeout
        });

        if (!uploadResponse.ok) {
          // Try to get response text - this might be HTML or another format
          let uploadError;
          try {
            uploadError = await uploadResponse.text();
          } catch {
            uploadError = "Could not read error response";
          }

          console.error("Failed to upload video to TikTok:", {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            errorText: uploadError.substring(0, 500),
          });

          return NextResponse.json(
            {
              error: "Failed to upload video to TikTok",
              details: `Upload failed with status ${uploadResponse.status}: ${uploadResponse.statusText}`,
            },
            { status: uploadResponse.status },
          );
        }

        console.log("Video successfully uploaded to TikTok");

        // Instead of polling for status here, return immediately with the publishId
        return NextResponse.json({
          status: "processing",
          publishId: publishId,
          accessToken: tiktokAccount.access_token,
          mediaUrl: mediaUrl,
          message:
            "Video uploaded to TikTok and is being processed. Please check the status for updates.",
        });
      } catch (uploadError) {
        console.error("Error during video upload to TikTok:", uploadError);
        return NextResponse.json(
          {
            error: "Failed to upload video to TikTok",
            details:
              uploadError instanceof Error
                ? uploadError.message
                : "Unknown upload error",
          },
          { status: 500 },
        );
      }
    } catch (initError) {
      console.error("Error initializing TikTok upload:", initError);
      return NextResponse.json(
        {
          error: "Failed to initialize TikTok upload",
          details:
            initError instanceof Error
              ? initError.message
              : "Unknown initialization error",
        },
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    console.error("Unhandled error during TikTok upload process:", error);
    return NextResponse.json(
      {
        error: "Video upload failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
