import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";

export async function POST(request: Request) {
  try {
    // Validate session
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.refreshToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("videoFile");
    const title = formData.get("title")?.toString();
    const description = formData.get("description")?.toString() || "";
    const privacyStatus =
      formData.get("privacyStatus")?.toString() || "private";

    if (!file || !title) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }
    // Convert web File to Node.js stream
    const buffer = Buffer.from(await (file as Blob).arrayBuffer());
    const videoStream = Readable.from(buffer);

    // Create OAuth2 client using YOUTUBE env vars and set refresh token from session
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      // "http://localhost:3000/api/auth/callback/google";
      "https://multi-platform-video-upload.vercel.app/api/auth/callback/google";
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Missing YouTube OAuth credentials" },
        { status: 500 },
      );
    }
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({
      refresh_token: session.user.refreshToken as string,
    });
    // Optionally refresh the access token if needed:
    await oauth2Client.getAccessToken();

    // Upload video to YouTube
    const youtube = google.youtube("v3");
    const response = await youtube.videos.insert({
      auth: oauth2Client,
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: title,
          description,
          tags: ["youtube-upload"],
          categoryId: "22",
        },
        status: {
          privacyStatus,
        },
      },
      media: {
        body: videoStream,
      },
    });
    return NextResponse.json({ videoId: response.data.id });
  } catch (error) {
    console.error("Error uploading video:", error);
    return NextResponse.json({ error: "Video upload failed" }, { status: 500 });
  }
}
