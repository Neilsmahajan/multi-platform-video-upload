import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    return NextResponse.json(
      {
        error,
        errorDescription,
        message: "Error response received from TikTok",
      },
      { status: 400 },
    );
  }

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    console.log(
      `Attempting token exchange with code: ${code.substring(0, 10)}...`,
    );

    // Log exact parameters being sent
    const params = {
      client_key: process.env.AUTH_TIKTOK_ID,
      client_secret: process.env.AUTH_TIKTOK_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback/tiktok`,
    };

    console.log("Token request parameters:", JSON.stringify(params, null, 2));

    // Try manual token exchange to debug
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
          code: code,
          grant_type: "authorization_code",
          redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback/tiktok`,
        }).toString(),
      },
    );

    const data = await response.json();

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
      requestInfo: {
        code: code.substring(0, 10) + "...", // Truncate for security
        state,
        url: process.env.NEXTAUTH_URL,
      },
    });
  } catch (error) {
    console.error("Debug route error:", error);
    return NextResponse.json(
      {
        error: "Token exchange failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
