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

// Define maximum chunk size for TikTok uploads according to documentation
const MIN_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB - minimum chunk size
const MAX_CHUNK_SIZE = 64 * 1024 * 1024; // 64MB - maximum chunk size

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
        // For files 5MB and above, follow TikTok's exact chunking algorithm
        // TikTok documentation states: "total_chunk_count should be equal to video_size divided by chunk_size, rounded down"
        // This means we ALWAYS use Math.floor() and merge any remainder into the final chunk

        chunkSize = MAX_CHUNK_SIZE; // Start with 64MB
        totalChunkCount = Math.floor(videoSize / chunkSize);

        // If there's no remainder, we're done
        if (videoSize % chunkSize === 0) {
          // Perfect division, no adjustment needed
          console.log(
            `Perfect division: ${totalChunkCount} chunks of ${(
              chunkSize /
              (1024 * 1024)
            ).toFixed(2)}MB each`,
          );
        } else {
          // There's a remainder - we always merge it into the final chunk per TikTok's algorithm
          // This means the final chunk will be larger than chunkSize
          console.log(
            `Remainder detected: ${(
              (videoSize % chunkSize) /
              (1024 * 1024)
            ).toFixed(2)}MB will be merged into final chunk`,
          );
        }

        // Validate constraints
        if (totalChunkCount > 1000) {
          // Adjust chunk size to stay within 1000 chunk limit
          chunkSize = Math.ceil(videoSize / 1000);
          // Ensure chunk size is at least 5MB
          if (chunkSize < MIN_CHUNK_SIZE) {
            chunkSize = MIN_CHUNK_SIZE;
          }
          totalChunkCount = Math.floor(videoSize / chunkSize);
          console.log(
            `Adjusted chunk size to ${(chunkSize / (1024 * 1024)).toFixed(
              2,
            )}MB to stay within 1000 chunk limit`,
          );
        }

        console.log(
          `TikTok chunking: ${totalChunkCount} chunks for ${(
            videoSize /
            (1024 * 1024)
          ).toFixed(2)}MB file`,
        );
        console.log(
          `Base chunk size: ${(chunkSize / (1024 * 1024)).toFixed(2)}MB`,
        );

        // Calculate final chunk size (will be larger if there's a remainder)
        const remainder = videoSize % chunkSize;
        if (remainder > 0) {
          const finalChunkSize = chunkSize + remainder;
          console.log(
            `Final chunk will be ${(finalChunkSize / (1024 * 1024)).toFixed(
              2,
            )}MB (includes ${(remainder / (1024 * 1024)).toFixed(
              2,
            )}MB remainder)`,
          );
        }
      }

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
          const remainder = videoSize % chunkSize;
          return NextResponse.json(
            {
              error:
                "Failed to initialize TikTok upload due to invalid chunking",
              details: `TikTok chunk validation failed. Using floor-based calculation as required: floor(${videoSize} / ${chunkSize}) = ${totalChunkCount} chunks. ${
                remainder > 0
                  ? `Final chunk includes ${(remainder / (1024 * 1024)).toFixed(
                      2,
                    )}MB remainder.`
                  : "Perfect division."
              }`,
              technicalDetails: errorDetails,
              chunkCalculation: {
                videoSize,
                chunkSize,
                totalChunkCount,
                remainder,
                calculation: `floor(${videoSize} / ${chunkSize}) = ${totalChunkCount}`,
              },
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

        // Now fetch the video
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
              contentType: contentType,
            });

            return NextResponse.json(
              {
                error: "Failed to upload video to TikTok",
                details: `Upload failed with status ${uploadResponse.status}: ${uploadResponse.statusText}`,
              },
              { status: 500 },
            );
          }
        } else {
          // Multi-chunk upload for larger files
          console.log(
            `Using multi-chunk upload with ${totalChunkCount} chunks`,
          );

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

            const chunkLength = end - start + 1;

            console.log(
              `Uploading chunk ${
                i + 1
              }/${totalChunkCount}: bytes ${start}-${end}/${videoSize} (${(
                chunkLength /
                (1024 * 1024)
              ).toFixed(2)} MB)`,
            );

            const chunk = new Uint8Array(videoBuffer.slice(start, end + 1));

            const uploadResponse = await fetch(uploadUrl, {
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

              console.error(
                `Failed to upload chunk ${i + 1}/${totalChunkCount} to TikTok:`,
                {
                  status: uploadResponse.status,
                  statusText: uploadResponse.statusText,
                  errorText: uploadError,
                },
              );

              return NextResponse.json(
                {
                  error: "Failed to upload video chunk to TikTok",
                  details: `Chunk ${i + 1} upload failed with status ${
                    uploadResponse.status
                  }: ${uploadResponse.statusText}`,
                },
                { status: 500 },
              );
            }

            console.log(
              `Chunk ${i + 1}/${totalChunkCount} uploaded successfully`,
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
