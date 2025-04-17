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

    // Get video as array buffer to determine size
    const videoBuffer = await videoResponse.arrayBuffer();
    const videoSize = videoBuffer.byteLength;
    console.log("Video size:", videoSize, "bytes");

    // Step 1: Initialize video upload with TikTok using FILE_UPLOAD method
    console.log("Initializing TikTok video upload with FILE_UPLOAD method");

    const initResponse = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tiktokAccount.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_info: {
            source: "FILE_UPLOAD",
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
          },
        }),
      },
    );

    if (!initResponse.ok) {
      const errorBody = await initResponse.text();
      console.error("Failed to initialize TikTok upload:", errorBody);
      return NextResponse.json(
        {
          error: "Failed to initialize TikTok upload",
          details: errorBody,
        },
        { status: initResponse.status },
      );
    }

    const initData = await initResponse.json();
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
    console.log("TikTok upload initialized with publish_id:", publishId);
    console.log("TikTok upload URL:", uploadUrl);

    // Step 2: Upload the video file to TikTok's provided URL
    console.log("Uploading video to TikTok...");

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type":
          videoResponse.headers.get("content-type") || "video/mp4",
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      },
      body: new Uint8Array(videoBuffer),
    });

    if (!uploadResponse.ok) {
      const uploadError = await uploadResponse.text();
      console.error("Failed to upload video to TikTok:", uploadError);
      return NextResponse.json(
        {
          error: "Failed to upload video to TikTok",
          details: uploadError,
        },
        { status: uploadResponse.status },
      );
    }

    console.log("Video successfully uploaded to TikTok");

    // Step 3: Check upload status
    console.log("Checking TikTok upload status");

    // Wait a moment before checking status (TikTok might need time to process)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const statusResponse = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tiktokAccount.access_token}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          publish_id: publishId,
        }),
      },
    );

    if (!statusResponse.ok) {
      const statusError = await statusResponse.text();
      console.error("Failed to check TikTok upload status:", statusError);
      return NextResponse.json(
        {
          error: "Failed to check upload status",
          details: statusError,
        },
        { status: statusResponse.status },
      );
    }

    const statusData = await statusResponse.json();
    console.log("TikTok upload status response:", statusData);

    // Delete the blob after successful upload
    try {
      console.log("Deleting blob after successful upload");
      await del(mediaUrl);
      console.log("Blob deleted successfully");
    } catch (delError) {
      console.error("Error deleting blob:", delError);
      // Continue even if blob deletion fails
    }

    return NextResponse.json({
      status: "success",
      publishId: publishId,
      message:
        "Video successfully sent to TikTok inbox. The user will need to open TikTok to review and publish.",
    });
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
