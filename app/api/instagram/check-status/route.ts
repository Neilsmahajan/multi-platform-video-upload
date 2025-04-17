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

    // Parse JSON body; expects containerId, igBusinessAccountId, mediaUrl (optional)
    const { containerId, igBusinessAccountId, mediaUrl } = await request.json();

    if (!containerId || !igBusinessAccountId) {
      console.error("Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Get the Instagram account for the current user
    const instagramAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "instagram",
      },
    });

    if (!instagramAccount || !instagramAccount.access_token) {
      console.error("Instagram account not found or missing access token");
      return NextResponse.json(
        { error: "Instagram account not properly connected" },
        { status: 401 },
      );
    }

    const accessToken = instagramAccount.access_token;

    // Check container status
    console.log(`Checking status for container ${containerId}`);
    const statusRes = await fetch(
      `https://graph.instagram.com/${containerId}?fields=status_code&access_token=${accessToken}`,
    );

    if (!statusRes.ok) {
      const statusError = await statusRes.text();
      console.error("Failed to check container status:", statusError);
      return NextResponse.json(
        { error: "Failed to check container status", details: statusError },
        { status: 500 },
      );
    }

    const statusData = await statusRes.json();
    const containerStatus = statusData.status_code;
    console.log(`Container ${containerId} status: ${containerStatus}`);

    if (containerStatus === "ERROR") {
      console.error("Container processing error:", statusData);
      return NextResponse.json(
        {
          error: "Error processing Instagram media container",
          details: JSON.stringify(statusData),
        },
        { status: 500 },
      );
    }

    if (containerStatus !== "FINISHED") {
      // Still processing, return current status
      return NextResponse.json({ status: "processing", containerStatus });
    }

    // Container is ready, publish it
    console.log("Publishing Instagram media container:", containerId);
    const publishParams = new URLSearchParams({
      access_token: accessToken,
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
    if (mediaUrl) {
      try {
        console.log("Deleting blob after successful upload");
        await del(mediaUrl);
        console.log("Blob deleted successfully");
      } catch (delError) {
        console.error("Error deleting blob:", delError);
        // Continue even if blob deletion fails
      }
    }

    return NextResponse.json({
      status: "success",
      mediaId,
    });
  } catch (error: unknown) {
    console.error("Unhandled error during Instagram status check:", error);
    return NextResponse.json(
      {
        error: "Status check failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
