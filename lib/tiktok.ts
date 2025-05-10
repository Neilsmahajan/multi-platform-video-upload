import { prisma } from "@/lib/prisma";

export interface TikTokTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: Date;
  accountId: string;
}

/**
 * Refreshes a TikTok access token using the refresh token
 */
export async function refreshTikTokToken(
  accountId: string
): Promise<TikTokTokens | null> {
  try {
    // Get the account with its refresh token
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        refresh_token: true,
        id: true,
      },
    });

    if (!account || !account.refresh_token) {
      console.error(
        "No account or refresh token found for accountId:",
        accountId
      );
      return null;
    }

    // Make refresh token request
    const response = await fetch(
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
          refresh_token: account.refresh_token,
        }).toString(),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Token refresh failed:", errorText);
      return null;
    }

    const data = await response.json();
    console.log("Token refresh response:", data);

    if (!data.access_token) {
      console.error("No access token in refresh response:", data);
      return null;
    }

    // Calculate expiration time (default to 2 hours if not provided)
    const expiresIn = data.expires_in || 7200; // Default to 2 hours
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Update the account with the new tokens
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: data.access_token,
        refresh_token: data.refresh_token || account.refresh_token, // Keep old refresh token if not provided
        expires_at: Math.floor(expiresAt.getTime() / 1000), // Convert to Unix timestamp
      },
    });

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || account.refresh_token,
      expires_in: expiresIn,
      expires_at: expiresAt,
      accountId: account.id,
    };
  } catch (error) {
    console.error("Error refreshing TikTok token:", error);
    return null;
  }
}

/**
 * Checks if a token is expired and needs refreshing
 */
export function isTokenExpired(expiresAt: number | null | undefined): boolean {
  if (!expiresAt) return true;

  // Add a 5-minute buffer to account for network delays
  const bufferTime = 5 * 60; // 5 minutes in seconds
  const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds

  return currentTime >= expiresAt - bufferTime;
}

/**
 * Gets a valid TikTok access token for a user, refreshing if necessary
 */
export async function getValidTikTokToken(
  userId: string
): Promise<string | null> {
  try {
    // Get the user's TikTok account
    const account = await prisma.account.findFirst({
      where: {
        userId: userId,
        provider: "tiktok",
      },
    });

    if (!account || !account.access_token) {
      console.error("No TikTok account found for user:", userId);
      return null;
    }

    // Check if token is expired
    if (isTokenExpired(account.expires_at)) {
      console.log("TikTok token expired, attempting refresh");
      const refreshedTokens = await refreshTikTokToken(account.id);

      if (refreshedTokens) {
        return refreshedTokens.access_token;
      }
      // If refresh failed, return null to indicate reconnection needed
      return null;
    }

    // Token is still valid
    return account.access_token;
  } catch (error) {
    console.error("Error getting valid TikTok token:", error);
    return null;
  }
}
