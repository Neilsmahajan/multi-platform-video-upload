import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { put } from "@vercel/blob";
import { unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
// import ffmpeg from "fluent-ffmpeg";
import { downloadFile, compressVideoFallback } from "@/lib/serverless-ffmpeg";

// Configure max file size - 100MB
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "100mb",
    },
  },
};

export async function POST(request: Request) {
  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user) {
      console.error("No session or user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse JSON body; expects sourceUrl, originalFileName, targetSizeMB
    const {
      sourceUrl,
      originalFileName,
      targetSizeMB = 25,
    } = await request.json();

    // Validate required fields
    if (!sourceUrl || !originalFileName) {
      console.error("Missing required fields for video compression", {
        hasSourceUrl: !!sourceUrl,
        hasOriginalFileName: !!originalFileName,
      });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    console.log(
      `Starting video compression for ${originalFileName} targeting ${targetSizeMB}MB`,
    );

    // Create a unique ID for this compression job
    const jobId = randomUUID();

    // Create temp directory for processing
    const tempDir = join(tmpdir(), `compress-${jobId}`);
    console.log(`Using temp directory: ${tempDir}`);

    // Generate input and output file paths
    const inputFilePath = join(tempDir, `input-${jobId}-${originalFileName}`);
    const outputFileName = `compressed-${jobId}-${originalFileName}`;
    const outputFilePath = join(tempDir, outputFileName);

    try {
      // Download the source file
      await downloadFile(sourceUrl, inputFilePath);

      // Compress the video using our fallback method that works in serverless
      await compressVideoFallback(inputFilePath, outputFilePath, targetSizeMB);

      // Upload the compressed file to blob storage
      console.log("Uploading compressed video to blob storage");
      const fileBuffer = await readFile(outputFilePath);
      const blob = await put(outputFileName, new Blob([fileBuffer]), {
        access: "public",
      });

      console.log(`Compressed video uploaded to ${blob.url}`);

      // Clean up temp files
      await unlink(inputFilePath).catch((err) =>
        console.error("Error deleting input file:", err),
      );
      await unlink(outputFilePath).catch((err) =>
        console.error("Error deleting output file:", err),
      );

      // Return the URL of the compressed video
      return NextResponse.json({
        compressedUrl: blob.url,
        originalUrl: sourceUrl,
        sizeMB: targetSizeMB,
      });
    } catch (error) {
      console.error("Error during video compression:", error);
      return NextResponse.json(
        {
          error: "Video compression failed",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    } finally {
      // Clean up temp directory
      try {
        // Attempt to remove files if they still exist
        await unlink(inputFilePath).catch(() => {});
        await unlink(outputFilePath).catch(() => {});
      } catch (error) {
        console.error("Error cleaning up temp files:", error);
      }
    }
  } catch (error) {
    console.error("Unhandled error in video compression endpoint:", error);
    return NextResponse.json(
      {
        error: "Server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
