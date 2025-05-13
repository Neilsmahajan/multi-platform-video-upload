import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { put } from "@vercel/blob";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import ffmpeg from "fluent-ffmpeg";
import { configureFFmpegPaths } from "../ffmpeg-config";

// Configure FFmpeg paths
configureFFmpegPaths();

// Configure for longer processing time on serverless, limit to 60 seconds allowed by Vercel hobby tier
export const maxDuration = 60;

// Helper function to download file from URL to local temp path
async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
}

// Helper function to create a temporary file path
function getTempFilePath(prefix: string, extension: string): string {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}${extension}`);
}

export async function POST(request: Request) {
  // Create temp file paths
  const inputPath = getTempFilePath("input", ".mp4");
  const outputPath = getTempFilePath("output", ".mp4");

  try {
    // Validate session
    const session = await auth();
    if (!session || !session.user) {
      console.error("No session or user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const {
      sourceUrl,
      originalFileName,
      targetSizeMB = 25,
    } = await request.json();
    if (!sourceUrl || !originalFileName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    console.log(`Starting video compression for ${originalFileName}`);
    console.log(`Source URL: ${sourceUrl}`);
    console.log(`Target size: ${targetSizeMB}MB`);

    // Create output filename
    const outputFileName =
      originalFileName.substring(0, originalFileName.lastIndexOf(".")) +
      "_compressed.mp4";

    console.log(`Output filename: ${outputFileName}`);

    try {
      // Download the file to temp location
      console.log(`Downloading source video to temp location: ${inputPath}`);
      await downloadFile(sourceUrl, inputPath);

      // Get file size info for compression calculation
      const stats = fs.statSync(inputPath);
      const sourceSize = stats.size;
      const sourceSizeMB = sourceSize / (1024 * 1024);
      console.log(`Source video size: ${sourceSizeMB.toFixed(2)} MB`);

      // Determine bitrate (assuming 3 minute video to be safe)
      const durationSeconds = 180;
      const videoBitrate = Math.floor(
        (targetSizeMB * 8 * 1024) / durationSeconds,
      );
      const audioBitrate = "128k";

      console.log(`Target size: ${targetSizeMB.toFixed(2)} MB`);
      console.log(`Calculated video bitrate: ${videoBitrate}k`);

      // Create a promise for the FFmpeg process
      await new Promise<void>((resolve, reject) => {
        // Different command for .mov vs other formats
        const command = ffmpeg(inputPath);

        if (originalFileName.toLowerCase().endsWith(".mov")) {
          // More aggressive settings for .mov files
          command.outputOptions([
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast", // Faster but less efficient compression
            "-crf",
            "28", // Higher CRF = more compression
            "-vf",
            "scale=-2:720", // Resize to 720p height, maintain aspect ratio
            "-r",
            "30", // 30fps
            "-c:a",
            "aac",
            "-b:a",
            audioBitrate,
            "-movflags",
            "+faststart",
          ]);
        } else {
          // For mp4 and other formats
          command.outputOptions([
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast", // Use ultrafast for serverless environment
            "-b:v",
            `${videoBitrate}k`,
            "-maxrate",
            `${videoBitrate * 1.5}k`,
            "-bufsize",
            `${videoBitrate * 2}k`,
            "-vf",
            "scale=-2:720", // Resize to 720p height
            "-c:a",
            "aac",
            "-b:a",
            audioBitrate,
            "-movflags",
            "+faststart",
          ]);
        }

        command
          .on("start", (commandLine) => {
            console.log("FFmpeg process started:", commandLine);
          })
          .on("error", (err, stdout, stderr) => {
            console.error("FFmpeg error:", err.message);
            console.error("FFmpeg stderr:", stderr);
            reject(err);
          })
          .on("end", () => {
            console.log("FFmpeg processing completed");
            resolve();
          })
          .save(outputPath);
      });

      // Check the size of the compressed file
      const compressedStats = fs.statSync(outputPath);
      const compressedSize = compressedStats.size;
      console.log(
        `Original size: ${sourceSizeMB.toFixed(2)} MB, Compressed size: ${(
          compressedSize /
          (1024 * 1024)
        ).toFixed(2)} MB`,
      );

      // Upload the compressed file to Vercel Blob
      console.log("Uploading compressed file to Vercel Blob...");
      const fileBuffer = fs.readFileSync(outputPath);
      const compressedBlob = new Blob([fileBuffer], { type: "video/mp4" });

      const uploadResult = await put(outputFileName, compressedBlob, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      console.log("Compressed file uploaded, URL:", uploadResult.url);

      // Clean up temp files
      try {
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
      } catch (cleanupError) {
        console.error("Error cleaning up temp files:", cleanupError);
      }

      // Return the URL of the compressed file
      return NextResponse.json({
        compressedUrl: uploadResult.url,
        originalSize: sourceSize,
        compressedSize: compressedSize,
        compressionRatio: sourceSize / compressedSize,
      });
    } catch (ffmpegError) {
      console.error("FFmpeg processing error:", ffmpegError);

      // Clean up temp files in case of error
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (cleanupError) {
        console.error("Error cleaning up temp files:", cleanupError);
      }

      return NextResponse.json(
        {
          error: "Video compression failed",
          details:
            ffmpegError instanceof Error
              ? ffmpegError.message
              : "Unknown FFmpeg error",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Unhandled error during video compression:", error);

    // Clean up temp files in case of error
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (cleanupError) {
      console.error("Error cleaning up temp files:", cleanupError);
    }

    return NextResponse.json(
      {
        error: "Video compression failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
