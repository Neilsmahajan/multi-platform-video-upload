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

// Define maximum chunk size for TikTok uploads
// TikTok's documentation says each chunk must be at least 5MB but no greater than 64MB
const MIN_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_CHUNK_SIZE = 64 * 1024 * 1024; // 64MB

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

    // First, fetch the video content from blob storage
    console.log("Fetching video file from blob:", mediaUrl);

    try {
      // First fetch creator info directly from TikTok API
      console.log("Fetching TikTok creator info");
      const creatorInfoResponse = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tiktokAccount.access_token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
        },
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
      const headResponse = await fetch(mediaUrl, { method: "HEAD" });
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

      // Calculate optimal chunk size based on file size
      // - For files under 5MB, use the file size as chunk size (single chunk)
      // - For files between 5MB and 64MB, use the file size as chunk size (single chunk)
      // - For files over 64MB, use 64MB chunks
      let chunkSize;
      if (videoSize <= MIN_CHUNK_SIZE) {
        chunkSize = videoSize; // Single chunk for small files
      } else if (videoSize <= MAX_CHUNK_SIZE) {
        chunkSize = videoSize; // Single chunk for medium files
      } else {
        chunkSize = MAX_CHUNK_SIZE; // Multiple chunks for large files
      }

      const totalChunkCount = Math.ceil(videoSize / chunkSize);

      console.log("Chunking configuration:", {
        videoSize,
        chunkSize,
        totalChunkCount,
      });

      // Start the video upload process with TikTok
      console.log("Initializing TikTok video upload with FILE_UPLOAD method");
      const initResponse = await fetch(
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
      );

      const responseText = await initResponse.text();

      if (!initResponse.ok) {
        console.error("Failed to initialize TikTok upload:", {
          status: initResponse.status,
          response: responseText.substring(0, 500),
        });

        return NextResponse.json(
          {
            error: "Failed to initialize TikTok direct post",
            details: `TikTok API returned ${
              initResponse.status
            }: ${responseText.substring(0, 200)}`,
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

        // Now fetch the entire video first
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

        // Get video as array buffer
        const videoBuffer = await videoResponse.arrayBuffer();

        // Upload the video in chunks to TikTok
        if (totalChunkCount === 1) {
          // Single chunk upload (entire file)
          console.log("Using single chunk upload for the entire file");

          const uploadResponse = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": contentType,
              "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
              "Content-Length": videoSize.toString(),
            },
            body: new Uint8Array(videoBuffer),
          });

          if (!uploadResponse.ok) {
            let uploadError;
            try {
              uploadError = await uploadResponse.text();
            } catch {
              uploadError = "Could not read error response";
            }

            console.error("Failed to upload video to TikTok:", {
              status: uploadResponse.status,
              statusText: uploadResponse.statusText,
              errorText: uploadError,
              contentRange: `bytes 0-${videoSize - 1}/${videoSize}`,
              contentType,
            });

            return NextResponse.json(
              {
                error: "Failed to upload video to TikTok",
                details: `Upload failed with status ${uploadResponse.status}: ${uploadResponse.statusText}`,
              },
              { status: 500 },
            );
          }

          console.log("Video successfully uploaded to TikTok");
        } else {
          // Multi-chunk upload
          console.log(`Starting ${totalChunkCount}-chunk upload`);

          for (let chunkIndex = 0; chunkIndex < totalChunkCount; chunkIndex++) {
            const startByte = chunkIndex * chunkSize;
            const endByte = Math.min(
              (chunkIndex + 1) * chunkSize - 1,
              videoSize - 1,
            );
            const currentChunkSize = endByte - startByte + 1;

            console.log(
              `Uploading chunk ${chunkIndex + 1}/${totalChunkCount}:`,
              {
                startByte,
                endByte,
                chunkSize: currentChunkSize,
              },
            );

            // Create chunk data from the video buffer
            const chunkData = new Uint8Array(
              videoBuffer.slice(startByte, endByte + 1),
            );

            const chunkResponse = await fetch(uploadUrl, {
              method: "PUT",
              headers: {
                "Content-Type": contentType,
                "Content-Range": `bytes ${startByte}-${endByte}/${videoSize}`,
                "Content-Length": currentChunkSize.toString(),
              },
              body: chunkData,
            });

            if (!chunkResponse.ok) {
              let chunkError;
              try {
                chunkError = await chunkResponse.text();
              } catch {
                chunkError = "Could not read error response";
              }

              console.error(
                `Failed to upload chunk ${chunkIndex + 1}/${totalChunkCount}:`,
                {
                  status: chunkResponse.status,
                  statusText: chunkResponse.statusText,
                  errorText: chunkError,
                  contentRange: `bytes ${startByte}-${endByte}/${videoSize}`,
                },
              );

              return NextResponse.json(
                {
                  error: "Failed to upload video chunk to TikTok",
                  details: `Chunk ${chunkIndex + 1} upload failed with status ${
                    chunkResponse.status
                  }: ${chunkResponse.statusText}`,
                },
                { status: 500 },
              );
            }

            console.log(
              `Chunk ${chunkIndex + 1}/${totalChunkCount} uploaded successfully`,
            );
          }

          console.log("All chunks uploaded successfully");
        }

        // Return success response
        return NextResponse.json({
          status: "processing",
          publishId: publishId,
          accessToken: tiktokAccount.access_token,
          mediaUrl: mediaUrl,
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
