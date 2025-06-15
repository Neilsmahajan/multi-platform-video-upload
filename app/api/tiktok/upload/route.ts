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

// Define chunk sizes for TikTok uploads - optimized for reliability
const MIN_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB - minimum chunk size required by TikTok
const OPTIMAL_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB - optimal for network reliability

// Upload timeout and retry configuration
const UPLOAD_TIMEOUT_MS = 120000; // 2 minutes per chunk
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 second delay between retries

// Helper function to create a fetch request with timeout
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  }
}

// Helper function to upload a chunk with retry logic
async function uploadChunkWithRetry(
  uploadUrl: string,
  chunk: Uint8Array,
  start: number,
  end: number,
  videoSize: number,
  contentType: string,
  chunkIndex: number,
  totalChunks: number,
): Promise<void> {
  const chunkLength = end - start + 1;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `Uploading chunk ${
          chunkIndex + 1
        }/${totalChunks}: bytes ${start}-${end}/${videoSize} (${(
          chunkLength /
          (1024 * 1024)
        ).toFixed(2)} MB) - Attempt ${attempt}/${MAX_RETRIES}`,
      );

      const uploadResponse = await fetchWithTimeout(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${videoSize}`,
          "Content-Length": chunkLength.toString(),
        },
        body: chunk,
      });

      if (!uploadResponse.ok) {
        let uploadError;
        try {
          uploadError = await uploadResponse.text();
        } catch {
          uploadError = "Could not read error response";
        }

        const errorMessage = `Chunk ${
          chunkIndex + 1
        }/${totalChunks} upload failed with status ${uploadResponse.status}: ${
          uploadResponse.statusText
        }. Error: ${uploadError}`;

        if (attempt === MAX_RETRIES) {
          throw new Error(errorMessage);
        }

        console.warn(
          `${errorMessage}. Retrying in ${RETRY_DELAY_MS / 1000} seconds...`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }

      console.log(
        `✓ Chunk ${chunkIndex + 1}/${totalChunks} uploaded successfully`,
      );
      return; // Success, exit retry loop
    } catch (error) {
      const errorMessage = `Chunk ${
        chunkIndex + 1
      }/${totalChunks} upload attempt ${attempt} failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;

      if (attempt === MAX_RETRIES) {
        throw new Error(errorMessage);
      }

      console.warn(
        `${errorMessage}. Retrying in ${RETRY_DELAY_MS / 1000} seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
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
    const {
      mediaUrl,
      caption = "",
      originalMediaUrl = null,
    } = await request.json();

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

    try {
      // First fetch creator info directly from TikTok API
      console.log("Fetching TikTok creator info");
      const creatorInfoResponse = await fetchWithTimeout(
        "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tiktokAccount.access_token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
        },
        30000, // 30 second timeout for API calls
      );

      // Handle response
      if (!creatorInfoResponse.ok) {
        const errorText = await creatorInfoResponse.text();
        console.error("Failed to fetch TikTok creator info:", {
          status: creatorInfoResponse.status,
          response: errorText,
        });
        return NextResponse.json(
          {
            error: "Failed to fetch TikTok creator info",
            details: `TikTok API returned ${creatorInfoResponse.status}: ${errorText}`,
          },
          { status: 500 },
        );
      }

      // Get response text and parse JSON
      const creatorInfoText = await creatorInfoResponse.text();
      console.log("Creator info response:", creatorInfoText);

      // For unaudited clients, we must use SELF_ONLY (private) privacy level
      const privacyLevel = "SELF_ONLY";

      console.log(
        "Using privacy level:",
        privacyLevel,
        "(Required for unaudited TikTok API clients)",
      );

      // Get information about the file first with a HEAD request
      const headResponse = await fetchWithTimeout(
        mediaUrl,
        {
          method: "HEAD",
        },
        30000,
      ); // 30 second timeout for metadata

      if (!headResponse.ok) {
        console.error("Failed to get video metadata", {
          status: headResponse.status,
        });
        return NextResponse.json(
          { error: "Failed to get video metadata" },
          { status: 500 },
        );
      }

      // Get content length (file size) and content type
      const contentType =
        headResponse.headers.get("content-type") || "video/mp4";
      const contentLength = headResponse.headers.get("content-length");
      const videoSize = contentLength ? parseInt(contentLength, 10) : 0;

      console.log(
        `Video size from headers: ${videoSize} bytes (${(
          videoSize /
          (1024 * 1024)
        ).toFixed(2)} MB)`,
      );
      console.log(`Content type: ${contentType}`);

      // Calculate optimal chunk size and count based on TikTok's exact requirements
      let chunkSize;
      let totalChunkCount;

      if (videoSize < MIN_CHUNK_SIZE) {
        // Files under 5MB must be uploaded as a single chunk
        chunkSize = videoSize;
        totalChunkCount = 1;
        console.log(
          `Using single chunk for ${(videoSize / (1024 * 1024)).toFixed(
            2,
          )}MB file (under 5MB - must be single chunk)`,
        );
      } else {
        // For files 5MB and above, use optimal chunk size for better reliability
        // Use 10MB chunks for better network reliability instead of maximum 64MB
        chunkSize = OPTIMAL_CHUNK_SIZE;

        // Calculate total chunks following TikTok's formula:
        // From the documentation example: 50,000,123 bytes with 10,000,000 chunk size = 5 chunks
        // This means: total_chunk_count = ceil(video_size / chunk_size)
        totalChunkCount = Math.ceil(videoSize / chunkSize);

        // Validate constraints
        if (totalChunkCount > 1000) {
          // Adjust chunk size to stay within 1000 chunk limit
          chunkSize = Math.ceil(videoSize / 1000);
          // Ensure chunk size is at least 5MB
          if (chunkSize < MIN_CHUNK_SIZE) {
            chunkSize = MIN_CHUNK_SIZE;
          }
          totalChunkCount = Math.ceil(videoSize / chunkSize);
          console.log(
            `Adjusted chunk size to ${(chunkSize / (1024 * 1024)).toFixed(
              2,
            )}MB to stay within 1000 chunk limit`,
          );
        }

        console.log(
          `Using ${totalChunkCount} chunks of ${(
            chunkSize /
            (1024 * 1024)
          ).toFixed(2)}MB each for ${(videoSize / (1024 * 1024)).toFixed(
            2,
          )}MB file (optimized for network reliability)`,
        );
      }

      console.log("Chunking configuration:", {
        videoSize,
        chunkSize,
        totalChunkCount,
      });

      // Start the video upload process with TikTok
      console.log("Initializing TikTok video upload with FILE_UPLOAD method");
      const initResponse = await fetchWithTimeout(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tiktokAccount.access_token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({
            post_info: {
              title: caption.substring(0, 2200), // TikTok limits captions to 2200 chars
              privacy_level: privacyLevel,
              disable_duet: false,
              disable_comment: false,
              disable_stitch: false,
              video_cover_timestamp_ms: 0, // Use first frame as cover
            },
            source_info: {
              source: "FILE_UPLOAD",
              video_size: videoSize,
              chunk_size: chunkSize,
              total_chunk_count: totalChunkCount,
            },
          }),
        },
        45000, // 45 second timeout for init call
      );

      const responseText = await initResponse.text();

      if (!initResponse.ok) {
        // Try to parse the error response for more specific information
        let errorDetails = "Unknown error";
        let parsedError = null;

        try {
          parsedError = JSON.parse(responseText);
          if (parsedError?.error?.message) {
            errorDetails = parsedError.error.message;
          }
        } catch {
          errorDetails = responseText.substring(0, 200);
        }

        console.error("Failed to initialize TikTok upload:", {
          status: initResponse.status,
          response: responseText.substring(0, 500),
          parsedError: parsedError,
        });

        // Provide a more helpful error message for chunking issues
        if (errorDetails.includes("chunk count is invalid")) {
          return NextResponse.json(
            {
              error:
                "Failed to initialize TikTok upload due to invalid chunking",
              details: `TikTok requires specific chunk size calculations. The current configuration (${totalChunkCount} chunks of ${(
                chunkSize /
                (1024 * 1024)
              ).toFixed(2)}MB each for a ${(videoSize / (1024 * 1024)).toFixed(
                2,
              )}MB file) is invalid. Please try again with a smaller file or contact support.`,
              technicalDetails: errorDetails,
            },
            { status: initResponse.status },
          );
        }

        return NextResponse.json(
          {
            error: "Failed to initialize TikTok direct post",
            details: `TikTok API returned ${initResponse.status}: ${errorDetails}`,
          },
          { status: initResponse.status },
        );
      }

      try {
        const initData = JSON.parse(responseText);
        console.log("TikTok init response:", initData);

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

        console.log(
          "TikTok direct post initialized with publish_id:",
          publishId,
        );
        console.log("TikTok upload URL:", uploadUrl);

        // Now fetch the video with timeout
        console.log("Fetching video from blob storage...");
        const videoResponse = await fetchWithTimeout(
          mediaUrl,
          {
            method: "GET",
          },
          60000,
        ); // 1 minute timeout for video download

        if (!videoResponse.ok) {
          console.error("Failed to fetch video from blob URL", {
            status: videoResponse.status,
          });
          return NextResponse.json(
            { error: "Failed to fetch video from blob storage" },
            { status: 500 },
          );
        }

        // Get video as array buffer
        console.log("Converting video to buffer...");
        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`Video buffer size: ${videoBuffer.byteLength} bytes`);

        if (totalChunkCount === 1) {
          // Single chunk upload (entire file) with timeout and retry
          console.log("Using single chunk upload for the entire file");

          try {
            await uploadChunkWithRetry(
              uploadUrl,
              new Uint8Array(videoBuffer),
              0,
              videoSize - 1,
              videoSize,
              contentType,
              0,
              1,
            );
          } catch (error) {
            console.error("Failed to upload single chunk to TikTok:", error);
            return NextResponse.json(
              {
                error: "Failed to upload video to TikTok",
                details:
                  error instanceof Error
                    ? error.message
                    : "Unknown upload error",
              },
              { status: 500 },
            );
          }
        } else {
          // Multi-chunk upload for larger files
          console.log(
            `Using multi-chunk upload with ${totalChunkCount} chunks`,
          );

          try {
            for (let i = 0; i < totalChunkCount; i++) {
              const start = i * chunkSize;
              // Calculate the end byte position for this chunk
              // The last chunk might be larger to accommodate remaining bytes
              let end;

              if (i === totalChunkCount - 1) {
                // Last chunk - use the actual end of the file
                end = videoSize - 1;
              } else {
                // Regular chunk - use standard chunk size
                end = start + chunkSize - 1;
              }

              const chunk = new Uint8Array(videoBuffer.slice(start, end + 1));

              await uploadChunkWithRetry(
                uploadUrl,
                chunk,
                start,
                end,
                videoSize,
                contentType,
                i,
                totalChunkCount,
              );
            }

            console.log("✓ All chunks uploaded successfully");
          } catch (error) {
            console.error("Multi-chunk upload failed:", error);
            return NextResponse.json(
              {
                error: "Failed to upload video chunks to TikTok",
                details:
                  error instanceof Error
                    ? error.message
                    : "Unknown upload error",
              },
              { status: 500 },
            );
          }
        }

        console.log("Video successfully uploaded to TikTok");

        // Return success response
        return NextResponse.json({
          status: "processing",
          publishId: publishId,
          accessToken: tiktokAccount.access_token,
          mediaUrl: mediaUrl,
          originalMediaUrl: originalMediaUrl || null,
          message:
            "Video uploaded to TikTok and is being processed for direct posting.",
          note: "Your video will be posted with private (Only Me) visibility. You can change the visibility settings in the TikTok app after publishing is complete.",
        });
      } catch (parseError) {
        console.error(
          "Failed to parse TikTok init response as JSON:",
          parseError,
        );
        return NextResponse.json(
          {
            error: "Invalid response from TikTok",
            details: "Failed to parse TikTok API response as JSON",
          },
          { status: 500 },
        );
      }
    } catch (error) {
      console.error("Error processing TikTok upload:", error);
      return NextResponse.json(
        {
          error: "Failed to process TikTok upload",
          details: error instanceof Error ? error.message : "Unknown error",
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
