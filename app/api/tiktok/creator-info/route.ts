import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user) {
      console.error("No session or user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    console.log("Fetching TikTok creator info");

    // Set a timeout for the creator info query
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    try {
      // Query creator info
      const infoResponse = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tiktokAccount.access_token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);

      // Get response content
      const responseText = await infoResponse.text();
      console.log("TikTok creator info response:", responseText);

      if (!infoResponse.ok) {
        return NextResponse.json(
          {
            error: "Failed to fetch TikTok creator info",
            details: `TikTok API returned ${infoResponse.status}: ${responseText}`,
          },
          { status: infoResponse.status },
        );
      }

      // Parse response
      try {
        const creatorInfo = JSON.parse(responseText);
        console.log("Creator info retrieved successfully");
        return NextResponse.json(creatorInfo);
      } catch (parseError) {
        console.error("Failed to parse creator info response:", parseError);
        return NextResponse.json(
          {
            error: "Invalid response from TikTok",
            details: "Failed to parse TikTok API response as JSON",
          },
          { status: 500 },
        );
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error("Error fetching TikTok creator info:", fetchError);

      // Check if this is an AbortError (timeout)
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json(
          {
            error: "TikTok API timeout",
            details: "Fetching creator info took too long and was aborted",
          },
          { status: 504 },
        );
      }

      return NextResponse.json(
        {
          error: "Failed to fetch TikTok creator info",
          details:
            fetchError instanceof Error
              ? fetchError.message
              : "Unknown fetch error",
        },
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    console.error("Unhandled error during TikTok creator info fetch:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch creator info",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
