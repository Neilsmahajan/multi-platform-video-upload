export const config = {
  api: {
    bodyParser: {
      sizeLimit: "100mb",
    },
  },
};

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";
import { ReadableStream as WebReadableStream } from "stream/web";
import { del } from "@vercel/blob";

export async function POST(request: Request) {
  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user || !session.user.refreshToken) {
      // Log for debugging missing refreshToken in production
      console.error("Missing refreshToken in session", session?.user);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Parse JSON body; expects blobUrl, title, description, privacyStatus
    const {
      blobUrl,
      title,
      description = "",
      privacyStatus,
    } = await request.json();
    if (!blobUrl || !title) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }
    // Fetch the video stream from the blob URL
    const blobRes = await fetch(blobUrl);
    if (!blobRes.ok || !blobRes.body) {
      return NextResponse.json(
        { error: "Could not retrieve video from blob" },
        { status: 500 },
      );
    }
    const blobStream = Readable.fromWeb(
      blobRes.body as WebReadableStream<unknown>,
    );

    // Create OAuth2 client using environment variables
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      // "http://localhost:3000/api/auth/callback/google";
      "https://multiplatformvideoupload.com/api/auth/callback/google";
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
    await oauth2Client.getAccessToken();

    // Upload video to YouTube using the stream from blob
    const youtube = google.youtube("v3");
    const response = await youtube.videos.insert({
      auth: oauth2Client,
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title,
          description,
          tags: ["youtube-upload"],
          categoryId: "22",
        },
        status: { privacyStatus },
      },
      media: { body: blobStream },
    });

    // Delete the blob from Blob storage after successful YouTube upload.
    try {
      await del([blobUrl]);
    } catch (err) {
      console.error("Error deleting blob:", err);
    }

    return NextResponse.json({ videoId: response.data.id });
  } catch (error) {
    console.error("Error uploading video:", error);
    return NextResponse.json({ error: "Video upload failed" }, { status: 500 });
  }
}
