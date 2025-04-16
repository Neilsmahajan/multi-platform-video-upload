import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { igUserId, mediaUrl, caption, alt_text } = await request.json();
    if (!mediaUrl) {
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
      return NextResponse.json(
        { error: "Instagram account not connected" },
        { status: 401 },
      );
    }

    const accessToken = instagramAccount.access_token;

    // If igUserId is not provided, use the one from the account
    const instagramUserId = igUserId || instagramAccount.providerAccountId;

    if (!instagramUserId) {
      return NextResponse.json(
        { error: "Instagram user ID not found" },
        { status: 400 },
      );
    }

    // Step 1: Create Media Container
    const createContainerUrl = `https://graph.facebook.com/v22.0/${instagramUserId}/media`;
    const createParams = new URLSearchParams({
      access_token: accessToken,
      video_url: mediaUrl, // for reels, use video_url
      caption: caption || "",
      media_type: "REELS", // Explicitly specify media type as REELS
    });

    if (alt_text) {
      createParams.append("alt_text", alt_text);
    }

    console.log("Creating media container with URL:", createContainerUrl);
    console.log("With params:", Object.fromEntries(createParams.entries()));

    const createRes = await fetch(
      `${createContainerUrl}?${createParams.toString()}`,
      {
        method: "POST",
      },
    );

    const createData = await createRes.json();
    console.log("Media container response:", createRes.status, createData);

    if (!createRes.ok) {
      console.error("Error creating media container:", createData);
      return NextResponse.json(
        { error: "Failed to create media container", details: createData },
        { status: 500 },
      );
    }

    const creationId = createData.id;

    // Step 2: Publish Media Container
    const publishUrl = `https://graph.facebook.com/v22.0/${instagramUserId}/media_publish`;
    const publishParams = new URLSearchParams({
      access_token: accessToken,
      creation_id: creationId,
    });

    console.log("Publishing media with URL:", publishUrl);
    console.log("With params:", Object.fromEntries(publishParams.entries()));

    const publishRes = await fetch(
      `${publishUrl}?${publishParams.toString()}`,
      {
        method: "POST",
      },
    );

    const publishData = await publishRes.json();
    console.log("Media publish response:", publishRes.status, publishData);

    if (!publishRes.ok) {
      console.error("Error publishing media:", publishData);
      return NextResponse.json(
        { error: "Failed to publish media", details: publishData },
        { status: 500 },
      );
    }

    return NextResponse.json({ mediaId: publishData.id });
  } catch (error) {
    console.error("Error uploading media to Instagram:", error);
    return NextResponse.json(
      { error: "Instagram upload failed" },
      { status: 500 },
    );
  }
}
