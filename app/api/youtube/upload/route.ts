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
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user) {
      console.error("No session or user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Processing YouTube upload for user:", session.user.id);

    // Parse JSON body; expects blobUrl, title, description, privacyStatus
    const {
      blobUrl,
      title,
      description = "",
      privacyStatus,
    } = await request.json();

    if (!blobUrl || !title) {
      console.error("Missing required fields", {
        blobUrl: !!blobUrl,
        title: !!title,
      });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    console.log("Upload request received for:", { title, privacyStatus });

    // Get the Google account for the current user
    const googleAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "google",
      },
    });

    if (!googleAccount || !googleAccount.refresh_token) {
      console.error("Google account not found or missing refresh token", {
        accountFound: !!googleAccount,
        hasRefreshToken: !!googleAccount?.refresh_token,
      });
      return NextResponse.json(
        { error: "Google account not properly connected" },
        { status: 401 },
      );
    }

    console.log("Found Google account with refresh token");

    // Fetch the video stream from the blob URL
    console.log("Fetching video from blob URL:", blobUrl);
    const blobRes = await fetch(blobUrl);
    if (!blobRes.ok || !blobRes.body) {
      console.error("Failed to retrieve video from blob", {
        status: blobRes.status,
        statusText: blobRes.statusText,
        hasBody: !!blobRes.body,
      });
      return NextResponse.json(
        { error: "Could not retrieve video from blob" },
        { status: 500 },
      );
    }

    console.log("Successfully fetched blob content, creating stream");
    const blobStream = Readable.fromWeb(
      blobRes.body as WebReadableStream<unknown>,
    );

    // Create OAuth2 client using environment variables
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      "https://multiplatformvideoupload.com/api/auth/callback/google";

    if (!clientId || !clientSecret) {
      console.error("Missing YouTube OAuth credentials", {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
      });
      return NextResponse.json(
        { error: "Missing YouTube OAuth credentials" },
        { status: 500 },
      );
    }

    console.log("Creating OAuth2 client");
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({
      refresh_token: googleAccount.refresh_token,
    });

    try {
      console.log("Refreshing access token");
      const tokenResponse = await oauth2Client.getAccessToken();
      console.log("Access token refreshed successfully", {
        hasToken: !!tokenResponse.token,
      });
    } catch (tokenError) {
      console.error("Failed to refresh access token:", tokenError);
      return NextResponse.json(
        { error: "Failed to authenticate with YouTube" },
        { status: 401 },
      );
    }

    // Upload video to YouTube using the stream from blob
    console.log("Preparing YouTube API client");
    const youtube = google.youtube("v3");

    console.log("Starting YouTube upload with params:", {
      title,
      descriptionLength: description?.length || 0,
      privacyStatus,
    });

    try {
      const response = await youtube.videos.insert({
        auth: oauth2Client,
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title,
            description,
            tags: ["youtube-upload"],
            categoryId: "22", // People & Blogs
          },
          status: { privacyStatus },
        },
        media: { body: blobStream },
      });

      console.log("YouTube upload successful, video ID:", response.data.id);

      // Delete the blob from Blob storage after successful YouTube upload.
      try {
        console.log("Deleting blob after successful upload");
        await del(blobUrl);
        console.log("Blob deleted successfully");
      } catch (delError) {
        console.error("Error deleting blob:", delError);
        // Continue even if blob deletion fails
      }

      return NextResponse.json({ videoId: response.data.id });
    } catch (youtubeError: unknown) {
      console.error("YouTube API Error:", youtubeError);
      console.error(
        "Error details:",
        youtubeError &&
          typeof youtubeError === "object" &&
          "response" in youtubeError &&
          youtubeError.response &&
          typeof youtubeError.response === "object" &&
          "data" in youtubeError.response
          ? youtubeError.response.data
          : "No additional details",
      );

      return NextResponse.json(
        {
          error: "Video upload failed",
          details:
            youtubeError instanceof Error
              ? youtubeError.message
              : "Unknown error",
        },
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    console.error("Unhandled error during YouTube upload process:", error);
    return NextResponse.json(
      {
        error: "Video upload failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
