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

export async function POST(request: Request) {
  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user) {
      console.error("No session or user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Processing TikTok upload for user:", session.user.id);

    // Store user ID to use in nested functions
    const userId = session.user.id;

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
        {
          error: "TikTok account not properly connected",
          needsReconnect: true,
        },
        { status: 401 },
      );
    }

    console.log("Found TikTok account with access token");
    let accessToken = tiktokAccount.access_token;

    // First, get the video file from the blob URL to determine its size
    console.log("Fetching video file from blob:", mediaUrl);

    // Use a timeout for fetch operations
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    try {
      const videoResponse = await fetch(mediaUrl, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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

      // Function to attempt the TikTok API call with retry logic for invalid tokens
      // Define the interface for the API function callback
      interface TikTokApiFunction<T> {
        (token: string): Promise<T>;
      }

      // Generic function to attempt TikTok API calls with retries
      async function attemptTikTokApiCall<T>(
        apiFunction: TikTokApiFunction<T>,
        maxRetries: number = 1,
      ): Promise<T> {
        let retries: number = 0;

        while (retries <= maxRetries) {
          try {
            return await apiFunction(accessToken);
          } catch (apiError: unknown) {
            // Check if this is an invalid token error
            const isInvalidToken: boolean =
              apiError instanceof Error &&
              apiError.message.includes("access_token_invalid");

            // If it's an invalid token and we haven't exceeded retries
            if (isInvalidToken && retries < maxRetries) {
              console.log("Access token invalid, attempting to refresh...");

              // Try to refresh the token
              try {
                const refreshResponse: Response = await fetch(
                  "/api/tiktok/refresh-token",
                  {
                    method: "POST",
                  },
                );

                if (!refreshResponse.ok) {
                  throw new Error(
                    `Token refresh failed with status: ${refreshResponse.status}`,
                  );
                }

                // Get the updated account with the new token
                const updatedAccount = await prisma.account.findFirst({
                  where: {
                    userId: userId,
                    provider: "tiktok",
                  },
                });

                if (updatedAccount?.access_token) {
                  accessToken = updatedAccount.access_token;
                  retries++;
                  continue; // Try the API call again with the new token
                }

                // If we couldn't get a valid token after refresh
                console.error("Failed to get valid token after refresh");
                throw new Error(
                  "TikTok token expired and refresh failed. Please reconnect your account.",
                );
              } catch (refreshError: unknown) {
                console.error("Error refreshing token:", refreshError);
                throw new Error(
                  "TikTok token expired and refresh failed. Please reconnect your account.",
                );
              }
            } else {
              // For other errors or if we're out of retries, just rethrow
              throw apiError;
            }
          }
        }

        // If we've exhausted all retries without returning or throwing
        throw new Error("Maximum retries exceeded for TikTok API call");
      }

      // Attempt to fetch creator info with retry for invalid token
      console.log("Fetching TikTok creator info");
      let creatorInfo;

      try {
        creatorInfo = await attemptTikTokApiCall(async (token) => {
          const infoController = new AbortController();
          const infoTimeoutId = setTimeout(() => infoController.abort(), 8000);

          try {
            const creatorInfoResponse = await fetch(
              "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json; charset=UTF-8",
                },
                signal: infoController.signal,
              },
            );
            clearTimeout(infoTimeoutId);

            if (!creatorInfoResponse.ok) {
              const errorText = await creatorInfoResponse.text();
              console.error("Failed to fetch TikTok creator info:", {
                status: creatorInfoResponse.status,
                response: errorText,
              });

              // Check if this is an invalid token error
              if (errorText.includes("access_token_invalid")) {
                throw new Error("access_token_invalid");
              }

              throw new Error(
                `TikTok API returned ${creatorInfoResponse.status}: ${errorText}`,
              );
            }

            const creatorInfoText = await creatorInfoResponse.text();
            console.log("Creator info response:", creatorInfoText);

            try {
              return JSON.parse(creatorInfoText);
            } catch (parseError) {
              console.error("Failed to parse creator info:", parseError);
              throw new Error("Failed to parse TikTok creator info response");
            }
          } catch (error) {
            clearTimeout(infoTimeoutId);
            throw error;
          }
        });
      } catch (creatorInfoError) {
        console.error("Failed to fetch TikTok creator info:", creatorInfoError);

        // If this is a token-related error that couldn't be refreshed, tell the user to reconnect
        if (
          creatorInfoError instanceof Error &&
          (creatorInfoError.message.includes("token expired") ||
            creatorInfoError.message.includes("access_token_invalid"))
        ) {
          return NextResponse.json(
            {
              error: "TikTok authentication expired",
              details:
                "Your TikTok connection has expired. Please reconnect your account.",
              needsReconnect: true,
            },
            { status: 401 },
          );
        }

        return NextResponse.json(
          {
            error: "Failed to fetch TikTok creator info",
            details:
              creatorInfoError instanceof Error
                ? creatorInfoError.message
                : "Unknown error",
          },
          { status: 500 },
        );
      }

      // Check if the account privacy settings allow posting with unaudited clients
      // Unaudited clients can only post to private accounts, so we need to verify
      // that SELF_ONLY is in the available options
      const privacyLevelOptions = creatorInfo.data?.privacy_level_options || [];

      if (!privacyLevelOptions.includes("SELF_ONLY")) {
        return NextResponse.json(
          {
            error: "TikTok account not set to private",
            details:
              "Unaudited TikTok API clients can only post to private accounts. Please set your TikTok account to private in the TikTok app before uploading. You can change it back to public after uploading if desired.",
            setupInstructions: [
              "1. Open the TikTok app and go to your profile",
              "2. Tap the three lines (≡) in the top right and go to 'Settings and privacy'",
              "3. Tap 'Privacy' and set 'Private account' to ON",
              "4. Try uploading again after your account is set to private",
              "5. You can change your account back to public after uploading if desired",
            ],
          },
          { status: 403 },
        );
      }

      // For unaudited clients, we must use SELF_ONLY (private) privacy level
      // Force SELF_ONLY regardless of what's available in privacy_level_options
      const privacyLevel = "SELF_ONLY";

      console.log(
        "Using privacy level:",
        privacyLevel,
        "(Required for unaudited TikTok API clients)",
      );

      // Extract hashtags from the caption (if any)
      const hashtagRegex = /#(\w+)/g;
      const hashtags = [];
      let match;
      while ((match = hashtagRegex.exec(caption)) !== null) {
        hashtags.push(match[1]);
      }

      // Step 1: Initialize video upload with TikTok using FILE_UPLOAD method with DIRECT POST
      console.log("Initializing TikTok video direct post");

      // Set a new timeout for the TikTok initialization
      const initController = new AbortController();

      // Include caption, hashtags, and privacy level in the initialization request
      try {
        const initResponse = await fetch(
          "https://open.tiktokapis.com/v2/post/publish/video/init/",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json; charset=UTF-8",
            },
            body: JSON.stringify({
              post_info: {
                title: caption.substring(0, 2200), // Use full caption with hashtags
                privacy_level: privacyLevel, // Always use SELF_ONLY (private)
                disable_duet: false,
                disable_comment: false,
                disable_stitch: false,
                video_cover_timestamp_ms: 0, // Use first frame for cover
              },
              source_info: {
                source: "FILE_UPLOAD",
                video_size: videoSize,
                chunk_size: videoSize,
                total_chunk_count: 1,
              },
            }),
            signal: initController.signal,
          },
        );

        if (!initResponse.ok) {
          const errorText = await initResponse.text();
          console.error("Failed to initialize TikTok video upload:", {
            status: initResponse.status,
            response: errorText,
          });

          return NextResponse.json(
            {
              error: "Failed to initialize TikTok video upload",
              details: `TikTok API returned ${initResponse.status}: ${errorText}`,
            },
            { status: 500 },
          );
        }

        const initData = await initResponse.json();
        console.log("TikTok video upload initialized:", initData);

        // TODO: Implement the actual video upload using the publish_id from initData
        // This would typically include uploading the video chunks and then finalizing the upload

        return NextResponse.json({
          success: true,
          message: "TikTok upload initialized successfully",
          details: initData,
        });

        // Rest of your existing upload logic
        // ...existing code...
      } catch (error) {
        console.error("Error during TikTok video upload:", error);
        return NextResponse.json(
          {
            error: "Failed to upload video to TikTok",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        );
      }

      // The remainder of your existing function continues from here...
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error("Error fetching video from blob:", fetchError);

      // Check if this is an AbortError (timeout)
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json(
          {
            error: "Video fetch timeout",
            details:
              "Fetching the video took too long and was aborted. Try with a smaller video file.",
          },
          { status: 504 },
        );
      }

      return NextResponse.json(
        {
          error: "Failed to fetch video",
          details:
            fetchError instanceof Error
              ? fetchError.message
              : "Unknown fetch error",
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
