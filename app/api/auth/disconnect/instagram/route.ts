import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.redirect(
        new URL(
          "/auth/signin",
          process.env.NEXTAUTH_URL || "http://localhost:3000",
        ),
      );
    }

    // Find and delete the Instagram account for this user
    await prisma.account.deleteMany({
      where: {
        userId: session.user.id,
        provider: "instagram",
      },
    });

    // Redirect back to settings page
    return NextResponse.redirect(
      new URL(
        "/dashboard/settings",
        process.env.NEXTAUTH_URL || "http://localhost:3000",
      ),
    );
  } catch (error) {
    console.error("Error disconnecting Instagram:", error);
    // Redirect to settings with an error parameter
    return NextResponse.redirect(
      new URL(
        "/dashboard/settings?error=disconnect_failed",
        process.env.NEXTAUTH_URL || "http://localhost:3000",
      ),
    );
  }
}
