import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { put } from "@vercel/blob";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// Configure for longer processing time on serverless
export const maxDuration = 60;

export async function POST(request: Request) {
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
      // Initialize FFmpeg
      const ffmpeg = new FFmpeg();
      console.log("Loading FFmpeg...");

      // Load FFmpeg WebAssembly modules - fix the URLs
      await ffmpeg.load({
        coreURL: await toBlobURL(
          "https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.wasm",
          "application/wasm",
        ),
        wasmURL: await toBlobURL(
          "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/ffmpeg-core.wasm",
          "application/wasm",
        ),
      });

      console.log("FFmpeg loaded");

      // Fetch the source video
      console.log("Fetching source video...");
      const sourceData = await fetch(sourceUrl);
      const sourceBuffer = await sourceData.arrayBuffer();

      // Write the input file to FFmpeg's virtual file system
      console.log("Writing input file to FFmpeg filesystem...");
      ffmpeg.writeFile("input.mp4", new Uint8Array(sourceBuffer));

      // Determine compression settings based on file size
      const sourceSize = sourceBuffer.byteLength;
      const sourceSizeMB = sourceSize / (1024 * 1024);
      console.log(`Source video size: ${sourceSizeMB.toFixed(2)} MB`);

      // Aim for target size (default 25MB which is good for TikTok)
      const compressionRatio = Math.min(targetSizeMB / sourceSizeMB, 0.9);
      // Determine bitrate (assuming 3 minute video to be safe)
      const durationSeconds = 180;
      const videoBitrate = Math.floor(
        (targetSizeMB * 8 * 1024) / durationSeconds,
      );
      const audioBitrate = "128k";

      console.log(`Target size: ${targetSizeMB.toFixed(2)} MB`);
      console.log(`Compression ratio: ${compressionRatio.toFixed(2)}`);
      console.log(`Calculated video bitrate: ${videoBitrate}k`);

      // Run FFmpeg command with aggressive compression
      console.log("Starting compression...");

      // Different command for .mov vs other formats
      if (originalFileName.toLowerCase().endsWith(".mov")) {
        // More aggressive settings for .mov files
        await ffmpeg.exec([
          "-i",
          "input.mp4",
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
          "output.mp4",
        ]);
      } else {
        // For mp4 and other formats
        await ffmpeg.exec([
          "-i",
          "input.mp4",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
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
          "output.mp4",
        ]);
      }

      console.log("Compression completed, reading output file...");

      // Read the compressed file
      const compressedData = await ffmpeg.readFile("output.mp4");
      console.log("Compressed file read, preparing for upload...");

      // Convert the compressed data to a Blob
      const compressedBlob = new Blob([compressedData], { type: "video/mp4" });

      // Upload the compressed file to Vercel Blob
      console.log("Uploading compressed file to Vercel Blob...");
      const uploadResult = await put(outputFileName, compressedBlob, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      console.log("Compressed file uploaded, URL:", uploadResult.url);
      console.log(
        `Original size: ${sourceSizeMB.toFixed(2)} MB, Compressed size: ${(
          compressedBlob.size /
          (1024 * 1024)
        ).toFixed(2)} MB`,
      );

      // Return the URL of the compressed file
      return NextResponse.json({
        compressedUrl: uploadResult.url,
        originalSize: sourceSize,
        compressedSize: compressedBlob.size,
        compressionRatio: sourceSize / compressedBlob.size,
      });
    } catch (ffmpegError) {
      console.error("FFmpeg processing error:", ffmpegError);
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
    return NextResponse.json(
      {
        error: "Video compression failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
