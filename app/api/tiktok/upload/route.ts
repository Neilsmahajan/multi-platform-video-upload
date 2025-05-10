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

      // First fetch creator info directly from TikTok API
      console.log("Fetching TikTok creator info");

      // Set a timeout for the creator info query
      const infoController = new AbortController();
      const infoTimeoutId = setTimeout(() => infoController.abort(), 8000);

      try {
        // Query creator info directly
        const creatorInfoResponse = await fetch(
          "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tiktokAccount.access_token}`,
              "Content-Type": "application/json; charset=UTF-8",
            },
            signal: infoController.signal,
          },
        );
        clearTimeout(infoTimeoutId);

        // Handle response
        if (!creatorInfoResponse.ok) {
          const errorText = await creatorInfoResponse.text();
          console.error("Failed to fetch TikTok creator info:", {
            status: creatorInfoResponse.status,
            response: errorText,
          });

          // Check for invalid access token error
          if (
            creatorInfoResponse.status === 401 &&
            errorText.includes("access_token_invalid")
          ) {
            return NextResponse.json(
              {
                error: "TikTok token expired",
                errorType: "token_expired",
                details:
                  "Your TikTok authorization has expired. Please disconnect and reconnect your TikTok account.",
                action: "reconnect",
              },
              { status: 401 },
            );
          }

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

        let creatorInfo;
        try {
          creatorInfo = JSON.parse(creatorInfoText);
          console.log("Creator info parsed successfully");
        } catch (parseError) {
          console.error("Failed to parse creator info:", parseError);
          return NextResponse.json(
            {
              error: "Failed to parse TikTok creator info",
              details: "Could not parse the response from TikTok",
            },
            { status: 500 },
          );
        }

        // Check if the account privacy settings allow posting with unaudited clients
        // Unaudited clients can only post to private accounts, so we need to verify
        // that SELF_ONLY is in the available options
        const privacyLevelOptions =
          creatorInfo.data?.privacy_level_options || [];

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

          // Check specifically for the private account error
          if (
            responseText.includes(
              "unaudited_client_can_only_post_to_private_accounts",
            )
          ) {
            return NextResponse.json(
              {
                error: "TikTok account not set to private",
                details:
                  "Unaudited TikTok API clients can only post to private accounts. Please set your TikTok account to private in the TikTok app before uploading.",
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
        console.log(
          "TikTok direct post initialized with publish_id:",
          publishId,
        );
        console.log("TikTok upload URL:", uploadUrl);

        // Step 2: Upload the video file to TikTok's provided URL
        console.log("Uploading video to TikTok...");

        // Set a new timeout for the upload operation
        const uploadController = new AbortController();
        const uploadTimeoutId = setTimeout(
          () => uploadController.abort(),
          8000,
        );

        try {
          const uploadResponse = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type":
                videoResponse.headers.get("content-type") || "video/mp4",
              "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
            },
            body: new Uint8Array(videoBuffer),
            signal: uploadController.signal,
          });
          clearTimeout(uploadTimeoutId);

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

          // Return immediately with the publishId
          return NextResponse.json({
            status: "processing",
            publishId: publishId,
            accessToken: tiktokAccount.access_token,
            mediaUrl: mediaUrl,
            message:
              "Video uploaded to TikTok and is being processed for direct posting.",
            note: "Your video will be posted with private (Only Me) visibility. You can change the visibility settings in the TikTok app after publishing is complete.",
          });
        } catch (uploadError) {
          clearTimeout(uploadTimeoutId);
          console.error("Error during video upload to TikTok:", uploadError);

          // Check if this is an AbortError (timeout)
          if (
            uploadError instanceof Error &&
            uploadError.name === "AbortError"
          ) {
            return NextResponse.json(
              {
                error: "TikTok upload timeout",
                details:
                  "The upload to TikTok took too long and was aborted. Try with a smaller video file.",
              },
              { status: 504 },
            );
          }

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
      } catch (infoError) {
        clearTimeout(infoTimeoutId);
        console.error("Error fetching TikTok creator info:", infoError);

        // Check if this is an AbortError (timeout)
        if (infoError instanceof Error && infoError.name === "AbortError") {
          return NextResponse.json(
            {
              error: "TikTok API timeout",
              details: "Fetching creator info took too long and was aborted",
            },
            { status: 504 },
          );
        }

        return NextResponse.json(
          {
            error: "Failed to fetch TikTok creator info",
            details:
              infoError instanceof Error ? infoError.message : "Unknown error",
          },
          { status: 500 },
        );
      }
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
