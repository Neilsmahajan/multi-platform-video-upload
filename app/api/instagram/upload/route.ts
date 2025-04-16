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

    // Get app credentials from environment variables
    const appId = process.env.AUTH_INSTAGRAM_ID;
    const appSecret = process.env.AUTH_INSTAGRAM_SECRET;

    if (!appId || !appSecret) {
      console.error("Missing Instagram app credentials");
      return NextResponse.json(
        { error: "Server configuration error - missing Instagram credentials" },
        { status: 500 },
      );
    }

    // Exchange short-lived token for a long-lived token if not already done
    // Note: If your token is already long-lived, you can skip this step
    let accessToken = instagramAccount.access_token;

    try {
      console.log("Converting to long-lived token...");
      const exchangeResponse = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${accessToken}`,
      );

      if (exchangeResponse.ok) {
        const exchangeData = await exchangeResponse.json();
        accessToken = exchangeData.access_token;
        console.log("Successfully obtained long-lived token");

        // Update the token in database for future use
        await prisma.account.update({
          where: { id: instagramAccount.id },
          data: { access_token: accessToken },
        });
      } else {
        const errorText = await exchangeResponse.text();
        console.log("Could not exchange for long-lived token:", errorText);
        // Continue with original token as fallback
      }
    } catch (tokenError) {
      console.error("Error exchanging token:", tokenError);
      // Continue with original token as fallback
    }

    // Debug token to check its validity and associated permissions
    console.log("Checking token information...");
    const debugResponse = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${accessToken}`,
    );

    if (debugResponse.ok) {
      const debugData = await debugResponse.json();
      console.log("Token debug info:", JSON.stringify(debugData, null, 2));
    } else {
      console.log("Could not debug token");
    }

    // Get the Instagram business account ID
    console.log("Fetching Instagram business account ID");
    const userRes = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`,
    );

    if (!userRes.ok) {
      const userError = await userRes.text();
      console.error("Failed to get Facebook Pages:", userError);
      return NextResponse.json(
        {
          error:
            "Failed to get Facebook Pages. Make sure your Instagram account is a Professional account linked to a Facebook Page.",
          details: userError,
        },
        { status: 500 },
      );
    }

    const pagesData = await userRes.json();
    console.log("Facebook Pages data:", JSON.stringify(pagesData, null, 2));

    if (!pagesData.data || pagesData.data.length === 0) {
      return NextResponse.json(
        {
          error:
            "No Facebook Pages found. Make sure your Instagram account is linked to a Facebook Page.",
          details: JSON.stringify(pagesData),
        },
        { status: 500 },
      );
    }

    // Get the first page
    const page = pagesData.data[0];
    const pageId = page.id;
    const pageAccessToken = page.access_token;

    // Get the Instagram business account linked to this page
    const igAccountRes = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`,
    );

    if (!igAccountRes.ok) {
      const igError = await igAccountRes.text();
      console.error("Failed to get Instagram business account:", igError);
      return NextResponse.json(
        {
          error:
            "Failed to get Instagram business account. Make sure your Facebook Page is linked to an Instagram Professional account.",
          details: igError,
        },
        { status: 500 },
      );
    }

    const igAccountData = await igAccountRes.json();
    console.log(
      "Instagram business account data:",
      JSON.stringify(igAccountData, null, 2),
    );

    if (
      !igAccountData.instagram_business_account ||
      !igAccountData.instagram_business_account.id
    ) {
      return NextResponse.json(
        {
          error:
            "No Instagram business account found linked to your Facebook Page.",
          details: JSON.stringify(igAccountData),
        },
        { status: 500 },
      );
    }

    const igUserId = igAccountData.instagram_business_account.id;
    console.log("Using Instagram Business Account ID:", igUserId);

    // Step 1: Create a media container
    console.log("Creating Instagram media container with video URL:", mediaUrl);
    const containerParams = new URLSearchParams({
      access_token: pageAccessToken, // Use page access token for publishing
      media_type: "REELS",
      video_url: mediaUrl,
      caption: caption,
    });

    const createContainerRes = await fetch(
      `https://graph.facebook.com/v18.0/${igUserId}/media`,
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
        `https://graph.facebook.com/v18.0/${containerId}?fields=status_code&access_token=${pageAccessToken}`,
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

    // Step 2: Publish the container
    console.log("Publishing Instagram media container:", containerId);
    const publishParams = new URLSearchParams({
      access_token: pageAccessToken, // Use page access token for publishing
      creation_id: containerId,
    });

    const publishRes = await fetch(
      `https://graph.facebook.com/v18.0/${igUserId}/media_publish`,
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
