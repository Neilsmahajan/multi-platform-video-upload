import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();

    // Return unauthorized if no session
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check connections
    const instagramAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "instagram",
      },
    });

    const tiktokAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "tiktok",
      },
    });

    return NextResponse.json({
      instagramConnected: !!instagramAccount,
      tiktokConnected: !!tiktokAccount,
    });
  } catch (error) {
    console.error("Error fetching user connections:", error);
    return NextResponse.json(
      { error: "Failed to fetch connection status" },
      { status: 500 },
    );
  }
}
