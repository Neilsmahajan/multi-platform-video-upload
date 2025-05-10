import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the TikTok account
    const tiktokAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "tiktok",
      },
    });

    if (!tiktokAccount || !tiktokAccount.refresh_token) {
      console.error("TikTok account not found or missing refresh token");
      return NextResponse.json(
        {
          error: "TikTok account not properly connected",
          needsReconnect: true,
        },
        { status: 401 },
      );
    }

    // Attempt to refresh the token
    try {
      const refreshResponse = await fetch(
        "https://open.tiktokapis.com/v2/oauth/token/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_key: process.env.AUTH_TIKTOK_ID!,
            client_secret: process.env.AUTH_TIKTOK_SECRET!,
            grant_type: "refresh_token",
            refresh_token: tiktokAccount.refresh_token,
          }).toString(),
        },
      );

      const refreshData = await refreshResponse.json();

      if (!refreshResponse.ok || !refreshData.data?.access_token) {
        console.error("Failed to refresh TikTok token:", refreshData);
        return NextResponse.json(
          {
            error: "Failed to refresh TikTok token",
            details: refreshData.error?.message || "Token refresh failed",
            needsReconnect: true,
          },
          { status: 401 },
        );
      }

      // Update the tokens in the database
      await prisma.account.update({
        where: { id: tiktokAccount.id },
        data: {
          access_token: refreshData.data.access_token,
          refresh_token: refreshData.data.refresh_token,
          expires_at:
            Math.floor(Date.now() / 1000) + refreshData.data.expires_in,
        },
      });

      return NextResponse.json({
        success: true,
        message: "TikTok token refreshed successfully",
      });
    } catch (error) {
      console.error("Error refreshing TikTok token:", error);
      return NextResponse.json(
        {
          error: "Failed to refresh TikTok token",
          details: error instanceof Error ? error.message : "Unknown error",
          needsReconnect: true,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Unhandled error during TikTok token refresh:", error);
    return NextResponse.json(
      {
        error: "Token refresh failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
