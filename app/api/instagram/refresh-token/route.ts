import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the Instagram account
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

    const oldToken = instagramAccount.access_token;

    // Check if we have the app secret and client ID in env vars
    if (!process.env.AUTH_INSTAGRAM_ID || !process.env.AUTH_INSTAGRAM_SECRET) {
      return NextResponse.json(
        { error: "Missing Instagram app credentials" },
        { status: 500 },
      );
    }

    // Attempt to exchange the short-lived token for a long-lived token
    // Note: This endpoint requires a client_secret which should be kept server-side
    const tokenUrl = "https://graph.instagram.com/access_token";
    const params = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: process.env.AUTH_INSTAGRAM_SECRET,
      access_token: oldToken,
    });

    const response = await fetch(`${tokenUrl}?${params.toString()}`, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error refreshing Instagram token:", errorText);
      return NextResponse.json(
        { error: "Failed to refresh token", details: errorText },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("Token refresh response:", data);

    if (data.access_token) {
      // Update the account in the database with the new token
      await prisma.account.update({
        where: { id: instagramAccount.id },
        data: {
          access_token: data.access_token,
          // Also update the expires_at if provided in the response
          ...(data.expires_in
            ? {
                expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
              }
            : {}),
        },
      });

      return NextResponse.json({
        success: true,
        message: "Instagram token refreshed successfully",
        expires_in: data.expires_in || null,
      });
    } else {
      return NextResponse.json(
        { error: "Invalid response from Instagram API" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Error in Instagram token refresh:", error);
    return NextResponse.json(
      { error: "Token refresh failed" },
      { status: 500 },
    );
  }
}
