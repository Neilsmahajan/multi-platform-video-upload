/**
 * Validates a TikTok access token
 * @param accessToken The access token to validate
 * @returns Object with validation results
 */
export async function validateTikTokToken(accessToken: string): Promise<{
  valid: boolean;
  error?: string;
  details?: unknown;
}> {
  // Use a timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    // Make a simple API call to test token validity
    const response = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);

    // Get response text for detailed error logging
    const responseText = await response.text();

    // Try to parse as JSON if possible
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = null;
    }

    if (!response.ok) {
      console.error("TikTok token validation failed:", {
        status: response.status,
        response: responseText,
      });

      // Check for specific token invalid error
      const isTokenInvalid =
        response.status === 401 ||
        responseData?.error?.code === "access_token_invalid";

      return {
        valid: false,
        error: isTokenInvalid ? "TOKEN_INVALID" : "API_ERROR",
        details: responseData || responseText,
      };
    }

    return { valid: true };
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Error validating TikTok token:", error);

    // Check for timeout
    if (error instanceof Error && error.name === "AbortError") {
      return { valid: false, error: "TIMEOUT" };
    }

    return {
      valid: false,
      error: "VALIDATION_FAILED",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Attempts to refresh a TikTok access token if possible
 * Note: TikTok requires re-authentication for new tokens,
 * so this is mostly a placeholder for future implementation
 */
export async function refreshTikTokToken(): Promise<boolean> {
  // TikTok doesn't support traditional refresh token flow in their API
  // We would need to store refresh tokens and implement the refresh flow
  // if TikTok adds support for it in the future

  console.log(
    "TikTok token refresh not supported, user must reconnect manually",
  );
  return false;
}
