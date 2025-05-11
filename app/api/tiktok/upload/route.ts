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
const MAX_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB per chunk
// Define size threshold for switching to PULL_FROM_URL
const PULL_FROM_URL_THRESHOLD = 75 * 1024 * 1024; // 75MB

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
      isCompressed = false,
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

    // First, get the video file metadata from the blob URL
    console.log("Getting video file metadata from blob:", mediaUrl);

    try {
      // If this is a large file, use PULL_FROM_URL method
      let videoSize = 0;

      if (!isCompressed) {
        // Check file size with HEAD request
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

        // Get content length (file size)
        const contentLength = headResponse.headers.get("content-length");
        videoSize = contentLength ? parseInt(contentLength, 10) : 0;
        console.log(
          `Video size from headers: ${videoSize} bytes (${(
            videoSize /
            (1024 * 1024)
          ).toFixed(2)} MB)`,
        );
      }

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
      console.log("Creator info parsed successfully");

      // For unaudited clients, we must use SELF_ONLY (private) privacy level
      const privacyLevel = "SELF_ONLY";

      console.log(
        "Using privacy level:",
        privacyLevel,
        "(Required for unaudited TikTok API clients)",
      );

      // Determine upload method based on file size
      const usePullFromUrl =
        videoSize > PULL_FROM_URL_THRESHOLD || isCompressed;
      console.log(
        `Using ${
          usePullFromUrl ? "PULL_FROM_URL" : "FILE_UPLOAD"
        } method for TikTok upload`,
      );

      if (usePullFromUrl) {
        // For large files or compressed files, use PULL_FROM_URL method
        console.log(
          "Initializing TikTok video upload with PULL_FROM_URL method",
        );

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
                title: caption.substring(0, 2200),
                privacy_level: privacyLevel,
                disable_duet: false,
                disable_comment: false,
                disable_stitch: false,
                video_cover_timestamp_ms: 0,
              },
              source_info: {
                source: "PULL_FROM_URL",
                video_url: mediaUrl,
              },
            }),
          },
        );

        const responseText = await initResponse.text();

        if (!initResponse.ok) {
          console.error(
            "Failed to initialize TikTok upload with PULL_FROM_URL:",
            {
              status: initResponse.status,
              response: responseText.substring(0, 500),
            },
          );

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

        // Parse response
        try {
          const initData = JSON.parse(responseText);
          console.log("TikTok PULL_FROM_URL init response:", initData);

          if (!initData.data || !initData.data.publish_id) {
            console.error("Invalid response from TikTok init API:", initData);
            return NextResponse.json(
              { error: "Invalid response from TikTok" },
              { status: 500 },
            );
          }

          const publishId = initData.data.publish_id;
          console.log(
            "TikTok PULL_FROM_URL initialized with publish_id:",
            publishId,
          );

          // Return status info - TikTok will pull the video from our URL
          return NextResponse.json({
            status: "processing",
            publishId: publishId,
            accessToken: tiktokAccount.access_token,
            mediaUrl: mediaUrl,
            usesPullFromUrl: true,
            message: "Video URL sent to TikTok for processing.",
            note: "TikTok is pulling your video. You'll receive a notification in the TikTok app when it's ready to edit.",
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
      } else {
        // For smaller files, continue with FILE_UPLOAD method
        // Fetch video content
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
        const videoSize = videoBuffer.byteLength;
        console.log("Video size:", videoSize, "bytes");

        // Calculate chunking parameters
        const useChunking = videoSize > MAX_CHUNK_SIZE;
        const chunkSize = useChunking ? MAX_CHUNK_SIZE : videoSize;
        const totalChunkCount = useChunking
          ? Math.ceil(videoSize / MAX_CHUNK_SIZE)
          : 1;

        console.log("Chunking configuration:", {
          useChunking,
          videoSize,
          chunkSize,
          totalChunkCount,
        });

        // Initialize video upload with FILE_UPLOAD method
        console.log(
          "Initializing TikTok video direct post with FILE_UPLOAD method:",
          {
            videoSize,
            chunkSize,
            totalChunkCount,
          },
        );

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
                title: caption.substring(0, 2200),
                privacy_level: privacyLevel,
                disable_duet: false,
                disable_comment: false,
                disable_stitch: false,
                video_cover_timestamp_ms: 0,
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
          console.error(
            "Failed to initialize TikTok upload with FILE_UPLOAD:",
            {
              status: initResponse.status,
              response: responseText.substring(0, 500),
            },
          );

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

        // Parse init response
        try {
          const initData = JSON.parse(responseText);
          console.log("TikTok FILE_UPLOAD init response:", initData);

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

          // Handle file upload based on chunking
          if (totalChunkCount === 1) {
            // Single chunk upload
            console.log(
              "Using single chunk upload (file size under chunk limit)",
            );

            const uploadResponse = await fetch(uploadUrl, {
              method: "PUT",
              headers: {
                "Content-Type":
                  videoResponse.headers.get("content-type") || "video/mp4",
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
                errorText: uploadError?.substring(0, 500),
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
          } else {
            // Multi-chunk upload
            console.log(
              `Starting multi-chunk upload with ${totalChunkCount} chunks`,
            );

            for (
              let chunkIndex = 0;
              chunkIndex < totalChunkCount;
              chunkIndex++
            ) {
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
                  "Content-Type":
                    videoResponse.headers.get("content-type") || "video/mp4",
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
                  `Failed to upload chunk ${
                    chunkIndex + 1
                  }/${totalChunkCount}:`,
                  {
                    status: chunkResponse.status,
                    statusText: chunkResponse.statusText,
                    errorText: chunkError?.substring(0, 500),
                  },
                );

                return NextResponse.json(
                  {
                    error: "Failed to upload video chunk to TikTok",
                    details: `Chunk ${
                      chunkIndex + 1
                    } upload failed with status ${chunkResponse.status}: ${
                      chunkResponse.statusText
                    }`,
                  },
                  { status: chunkResponse.status },
                );
              }

              console.log(
                `Chunk ${
                  chunkIndex + 1
                }/${totalChunkCount} uploaded successfully`,
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
