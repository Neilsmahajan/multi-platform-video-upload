import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  let provider: string = "unknown";

  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestData = await request.json();
    provider = requestData.provider;
    if (!provider) {
      return NextResponse.json(
        { error: "Provider is required" },
        { status: 400 },
      );
    }

    // Get the specified provider account for the current user
    const providerAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: provider,
      },
    });

    if (!providerAccount) {
      return NextResponse.json(
        { error: `${provider} account not connected` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      accessToken: providerAccount.access_token,
      refreshToken: providerAccount.refresh_token,
      providerAccountId: providerAccount.providerAccountId,
    });
  } catch (error) {
    console.error(`Error fetching ${provider} token:`, error);
    return NextResponse.json(
      { error: "Failed to fetch provider token" },
      { status: 500 },
    );
  }
}
