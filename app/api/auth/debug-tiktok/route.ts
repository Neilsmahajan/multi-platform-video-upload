import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
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
        }).toString(),
      },
    );

    const data = await response.json();

    return NextResponse.json({
      status: response.status,
      data: data,
      code: code,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Token exchange failed",
        details: error,
      },
      { status: 500 },
    );
  }
}
