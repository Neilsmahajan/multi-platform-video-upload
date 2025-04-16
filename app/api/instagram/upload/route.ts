import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { igUserId, mediaUrl, caption, alt_text } = await request.json();
    if (!mediaUrl) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Get the Instagram account for the current user
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

    const accessToken = instagramAccount.access_token;
    console.log("Instagram account data:", {
      id: instagramAccount.id,
      provider: instagramAccount.provider,
      providerAccountId: instagramAccount.providerAccountId,
      tokenLength: accessToken.length,
    });

    // If igUserId is not provided, use the one from the account
    const instagramUserId = igUserId || instagramAccount.providerAccountId;

    if (!instagramUserId) {
      return NextResponse.json(
        { error: "Instagram user ID not found" },
        { status: 400 },
      );
    }

    // Check if token appears valid before attempting to use it
    if (!accessToken.startsWith("IG")) {
      console.warn("Warning: Instagram token does not start with 'IG' prefix");
    }

    // Perform a token validation check before proceeding
    const validateTokenUrl = `https://graph.instagram.com/me?access_token=${accessToken}`;
    try {
      const validateRes = await fetch(validateTokenUrl);
      const validateData = await validateRes.json();

      if (!validateRes.ok) {
        console.error("Token validation failed:", validateData);

        // Try to refresh the token if it's expired
        // Note: This would require implementing a token refresh mechanism

        return NextResponse.json(
          {
            error: "Instagram token validation failed",
            details: validateData,
          },
          { status: 401 },
        );
      }

      console.log("Token validation successful:", validateData);
    } catch (validateError) {
      console.error("Error validating token:", validateError);
    }

    // Step 1: Create Media Container
    const createContainerUrl = `https://graph.facebook.com/v22.0/${instagramUserId}/media`;
    const createParams = new URLSearchParams({
      access_token: accessToken,
      video_url: mediaUrl,
      caption: caption || "",
      media_type: "REELS", // Explicitly specify media type as REELS
    });

    if (alt_text) {
      createParams.append("alt_text", alt_text);
    }

    console.log("Creating media container with URL:", createContainerUrl);
    // Redact part of token for security in logs
    const redactedParams = new URLSearchParams(createParams);
    if (redactedParams.has("access_token")) {
      const token = redactedParams.get("access_token") || "";
      redactedParams.set(
        "access_token",
        token.substring(0, 10) + "..." + token.substring(token.length - 10),
      );
    }
    console.log("With params:", Object.fromEntries(redactedParams.entries()));

    const createRes = await fetch(
      `${createContainerUrl}?${createParams.toString()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const createData = await createRes.json();
    console.log("Media container response:", createRes.status, createData);

    if (!createRes.ok) {
      console.error("Error creating media container:", createData);

      // Additional debug info for specific error codes
      if (createData.error && createData.error.code === 190) {
        console.error("Token issue detected - checking token details");
        // Provide more info on permissions
        const permDebug = await fetch(
          `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${accessToken}`,
        );
        const permData = await permDebug.json();
        console.log("Token debug info:", permData);
      }

      return NextResponse.json(
        { error: "Failed to create media container", details: createData },
        { status: 500 },
      );
    }

    const creationId = createData.id;

    // Step 2: Publish Media Container
    const publishUrl = `https://graph.facebook.com/v22.0/${instagramUserId}/media_publish`;
    const publishParams = new URLSearchParams({
      access_token: accessToken,
      creation_id: creationId,
    });

    console.log("Publishing media with URL:", publishUrl);
    console.log("With creation_id:", creationId);

    const publishRes = await fetch(
      `${publishUrl}?${publishParams.toString()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const publishData = await publishRes.json();
    console.log("Media publish response:", publishRes.status, publishData);

    if (!publishRes.ok) {
      console.error("Error publishing media:", publishData);
      return NextResponse.json(
        { error: "Failed to publish media", details: publishData },
        { status: 500 },
      );
    }

    return NextResponse.json({ mediaId: publishData.id });
  } catch (error) {
    console.error("Error uploading media to Instagram:", error);
    return NextResponse.json(
      { error: "Instagram upload failed" },
      { status: 500 },
    );
  }
}
