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
import { del } from "@vercel/blob";

export async function POST(request: Request) {
  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user) {
      console.error("No session or user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Processing Instagram upload for user:", session.user.id);

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

    // Get the Instagram account for the current user
    const instagramAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "instagram",
      },
    });

    if (!instagramAccount || !instagramAccount.access_token) {
      console.error("Instagram account not found or missing access token", {
        accountFound: !!instagramAccount,
        hasAccessToken: !!instagramAccount?.access_token,
      });
      return NextResponse.json(
        { error: "Instagram account not properly connected" },
        { status: 401 },
      );
    }

    console.log("Found Instagram account with access token");

    // Try to determine if this is a Facebook token or an Instagram direct token
    const accessToken = instagramAccount.access_token;
    let igBusinessAccountId;
    let pageAccessToken;

    try {
      // Try direct Instagram Graph API approach first
      console.log("Trying direct Instagram API access");
      const igUserRes = await fetch(
        `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`,
      );

      if (igUserRes.ok) {
        const igUserData = await igUserRes.json();
        console.log("Instagram user data:", igUserData);

        // Get long-lived Instagram User token (may already be long-lived)
        console.log("Getting long-lived Instagram user token");
        const longLivedTokenRes = await fetch(
          `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.AUTH_INSTAGRAM_SECRET}&access_token=${accessToken}`,
        );

        if (longLivedTokenRes.ok) {
          const tokenData = await longLivedTokenRes.json();
          console.log("Long-lived token response:", tokenData);

          // Store the refreshed token
          if (tokenData.access_token) {
            await prisma.account.update({
              where: { id: instagramAccount.id },
              data: { access_token: tokenData.access_token },
            });
            console.log("Updated Instagram token in database");
          }
        }

        // Now use the token to upload with direct Instagram API instead of returning an error
        const userId = igUserData.id;
        console.log("Using direct Instagram API with user ID:", userId);
        pageAccessToken = instagramAccount.access_token;
        igBusinessAccountId = userId;

        // Continue with direct Instagram API for content publishing
      } else {
        // If direct Instagram approach failed, return a helpful error
        console.error("Direct Instagram API access failed");
        return NextResponse.json(
          {
            error: "Instagram Professional Account Required",
            details:
              "Your Instagram account must be a Professional account (Business or Creator) to publish content via the API. Please convert your account to a Professional account and try again.",
            setupInstructions: [
              "1. Go to your Instagram profile and tap the hamburger menu",
              "2. Tap Settings > Account > Switch to Professional Account",
              "3. Follow the steps to set up a Business or Creator account",
              "4. Reconnect your Instagram account in this app",
              "Learn more at: https://help.instagram.com/502981923235522",
            ],
          },
          { status: 403 },
        );
      }
    } catch (authError) {
      console.error("Authentication error:", authError);

      return NextResponse.json(
        {
          error: "Instagram Authentication Failed",
          details:
            "There was an error authenticating with Instagram. Please ensure your account is properly connected and your Instagram account is a Professional account (Business or Creator).",
        },
        { status: 401 },
      );
    }

    if (!igBusinessAccountId || !pageAccessToken) {
      return NextResponse.json(
        {
          error: "Invalid Instagram Configuration",
          details:
            "Could not find a valid Instagram Professional Account ID or access token. Please ensure your account is properly connected.",
        },
        { status: 500 },
      );
    }

    // Now we have a valid Instagram ID and access token
    // Step 1: Create a media container
    console.log("Creating Instagram media container with video URL:", mediaUrl);
    const containerParams = new URLSearchParams({
      access_token: pageAccessToken,
      media_type: "REELS",
      video_url: mediaUrl,
      caption: caption,
    });

    // Use the direct Instagram graph API endpoint
    const createContainerRes = await fetch(
      `https://graph.instagram.com/${igBusinessAccountId}/media`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: containerParams.toString(),
      },
    );

    if (!createContainerRes.ok) {
      const createError = await createContainerRes.text();
      console.error("Failed to create Instagram media container:", createError);
      return NextResponse.json(
        {
          error: "Failed to create Instagram media container",
          details: createError,
        },
        { status: 500 },
      );
    }

    const containerData = await createContainerRes.json();
    const containerId = containerData.id;
    console.log("Instagram media container created, ID:", containerId);

    // Check container status before publishing
    console.log("Checking container status before publishing");
    let containerStatus = "";
    const maxRetries = 10;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      const statusRes = await fetch(
        `https://graph.instagram.com/${containerId}?fields=status_code&access_token=${pageAccessToken}`,
      );

      if (!statusRes.ok) {
        const statusError = await statusRes.text();
        console.error("Failed to check container status:", statusError);
        break;
      }

      const statusData = await statusRes.json();
      containerStatus = statusData.status_code;
      console.log(`Container ${containerId} status: ${containerStatus}`);

      if (containerStatus === "FINISHED") {
        break;
      } else if (containerStatus === "ERROR") {
        console.error("Container processing error:", statusData);
        return NextResponse.json(
          {
            error: "Error processing Instagram media container",
            details: JSON.stringify(statusData),
          },
          { status: 500 },
        );
      }

      // Wait before checking again
      await new Promise((resolve) => setTimeout(resolve, 2000));
      retryCount++;
    }

    if (containerStatus !== "FINISHED" && retryCount >= maxRetries) {
      console.error("Container processing timeout");
      return NextResponse.json(
        { error: "Timeout waiting for Instagram media container processing" },
        { status: 500 },
      );
    }

    // Step 2: Publish the container using direct Instagram API
    console.log("Publishing Instagram media container:", containerId);
    const publishParams = new URLSearchParams({
      access_token: pageAccessToken,
      creation_id: containerId,
    });

    const publishRes = await fetch(
      `https://graph.instagram.com/${igBusinessAccountId}/media_publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: publishParams.toString(),
      },
    );

    if (!publishRes.ok) {
      const publishError = await publishRes.text();
      console.error("Failed to publish Instagram media:", publishError);
      return NextResponse.json(
        { error: "Failed to publish Instagram media", details: publishError },
        { status: 500 },
      );
    }

    const publishData = await publishRes.json();
    const mediaId = publishData.id;
    console.log("Instagram media published successfully, ID:", mediaId);

    // Delete the blob from Blob storage after successful Instagram upload
    try {
      console.log("Deleting blob after successful upload");
      await del(mediaUrl);
      console.log("Blob deleted successfully");
    } catch (delError) {
      console.error("Error deleting blob:", delError);
      // Continue even if blob deletion fails
    }

    return NextResponse.json({ mediaId });
  } catch (error: unknown) {
    console.error("Unhandled error during Instagram upload process:", error);
    return NextResponse.json(
      {
        error: "Video upload failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
