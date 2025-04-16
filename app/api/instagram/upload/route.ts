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

    // Get the Instagram business account ID
    console.log("Fetching Instagram business account ID");
    const userRes = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,instagram_business_account&access_token=${instagramAccount.access_token}`,
    );

    if (!userRes.ok) {
      const userError = await userRes.text();
      console.error("Failed to get Instagram business account:", userError);
      return NextResponse.json(
        {
          error: "Failed to get Instagram business account",
          details: userError,
        },
        { status: 500 },
      );
    }

    const userData = await userRes.json();

    if (
      !userData.instagram_business_account ||
      !userData.instagram_business_account.id
    ) {
      console.error("Instagram business account not found", userData);
      return NextResponse.json(
        {
          error:
            "Instagram business account not found or not properly configured",
          details: JSON.stringify(userData),
        },
        { status: 500 },
      );
    }

    const igUserId = userData.instagram_business_account.id;
    console.log("Using Instagram Business Account ID:", igUserId);

    // Step 1: Create a media container
    console.log("Creating Instagram media container with video URL:", mediaUrl);
    const containerParams = new URLSearchParams({
      access_token: instagramAccount.access_token,
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
        `https://graph.facebook.com/v18.0/${containerId}?fields=status_code&access_token=${instagramAccount.access_token}`,
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
      access_token: instagramAccount.access_token,
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
