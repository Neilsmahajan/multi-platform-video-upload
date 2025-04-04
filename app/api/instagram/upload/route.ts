import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function POST(request: Request) {
  try {
    // Validate session; assuming refreshToken holds the Instagram access token
    const session = await auth();
    if (!session || !session.user || !session.user.refreshToken) {
      console.error("Missing refreshToken in session", session?.user);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { igUserId, mediaUrl, caption, alt_text } = await request.json();
    if (!igUserId || !mediaUrl) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const accessToken = session.user.refreshToken as string;

    // Step 1: Create Media Container
    const createContainerUrl = `https://graph.facebook.com/v22.0/${igUserId}/media`;
    const createParams = new URLSearchParams({
      access_token: accessToken,
      video_url: mediaUrl, // for reels, use video_url
      caption: caption || "",
    });
    if (alt_text) {
      createParams.append("alt_text", alt_text);
    }
    const createRes = await fetch(
      `${createContainerUrl}?${createParams.toString()}`,
      {
        method: "POST",
      },
    );
    const createData = await createRes.json();
    if (!createRes.ok) {
      console.error("Error creating media container:", createData);
      return NextResponse.json(
        { error: "Failed to create media container" },
        { status: 500 },
      );
    }
    const creationId = createData.id;

    // Step 2: Publish Media Container
    const publishUrl = `https://graph.facebook.com/v22.0/${igUserId}/media_publish`;
    const publishParams = new URLSearchParams({
      access_token: accessToken,
      creation_id: creationId,
    });
    const publishRes = await fetch(
      `${publishUrl}?${publishParams.toString()}`,
      {
        method: "POST",
      },
    );
    const publishData = await publishRes.json();
    if (!publishRes.ok) {
      console.error("Error publishing media:", publishData);
      return NextResponse.json(
        { error: "Failed to publish media" },
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
