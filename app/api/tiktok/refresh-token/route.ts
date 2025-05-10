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

    if (!tiktokAccount) {
      console.error("TikTok account not found");
      return NextResponse.json(
        {
          error: "Account not found",
          reconnectRequired: true,
        },
        { status: 404 },
      );
    }

    // Unfortunately, TikTok doesn't support standard OAuth refresh tokens
    // We need to tell the client to reconnect completely

    return NextResponse.json({
      success: false,
      message: "TikTok requires reconnection for new tokens",
      reconnectRequired: true,
    });
  } catch (error) {
    console.error("Error during TikTok token refresh attempt:", error);
    return NextResponse.json(
      {
        error: "Failed to refresh token",
        details: error instanceof Error ? error.message : "Unknown error",
        reconnectRequired: true,
      },
      { status: 500 },
    );
  }
}
