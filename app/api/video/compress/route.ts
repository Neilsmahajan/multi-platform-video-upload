import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { put } from "@vercel/blob";
import { createWriteStream } from "fs";
import { mkdir, unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import ffmpeg from "fluent-ffmpeg";

// Configure max file size - 100MB
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "100mb",
    },
  },
};

// Helper function to download a file from a URL
async function downloadFile(url: string, outputPath: string): Promise<void> {
  console.log(`Downloading file from ${url} to ${outputPath}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const fileStream = createWriteStream(outputPath);

  return new Promise((resolve, reject) => {
    // Get the data as a buffer and write it to the file
    response
      .arrayBuffer()
      .then((buffer) => {
        fileStream.write(Buffer.from(buffer));
        fileStream.end();
        fileStream.on("finish", () => {
          console.log("Download complete");
          resolve();
        });
      })
      .catch((err) => {
        reject(err);
      });

    fileStream.on("error", (err) => {
      reject(err);
    });
  });
}

// Helper function to compress video using fluent-ffmpeg
async function compressVideo(
  inputPath: string,
  outputPath: string,
  targetSizeMB: number,
): Promise<void> {
  console.log(
    `Compressing video from ${inputPath} to ${outputPath} with target size ${targetSizeMB}MB`,
  );

  return new Promise((resolve, reject) => {
    // Get video duration first to calculate bitrate
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.error("Error probing video:", err);
        return reject(err);
      }

      // Get duration in seconds
      const durationInSeconds = metadata.format.duration || 60;
      console.log(`Video duration: ${durationInSeconds} seconds`);

      // Calculate target bitrate based on size
      const targetSizeKb = targetSizeMB * 8 * 1024; // Convert MB to kilobits
      const calculatedBitrate = Math.floor(
        (targetSizeKb / durationInSeconds) * 0.9, // 0.9 as safety factor
      );
      console.log(`Calculated bitrate: ${calculatedBitrate}k`);

      // Start ffmpeg process
      ffmpeg(inputPath)
        .videoCodec("libx264")
        .videoBitrate(`${calculatedBitrate}k`)
        .audioCodec("aac")
        .audioBitrate("128k")
        .outputOptions([
          `-maxrate ${calculatedBitrate * 1.5}k`,
          `-bufsize ${calculatedBitrate * 3}k`,
          "-movflags +faststart", // Optimize for web streaming
          "-preset fast",
        ])
        .format("mp4")
        .on("start", (commandLine) => {
          console.log("Spawned ffmpeg with command: " + commandLine);
        })
        .on("progress", (progress) => {
          console.log(`Processing: ${progress.percent}% done`);
        })
        .on("error", (err) => {
          console.error("Error during ffmpeg processing:", err);
          reject(err);
        })
        .on("end", () => {
          console.log("Compression complete");
          resolve();
        })
        .save(outputPath);
    });
  });
}

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

    await mkdir(tempDir, { recursive: true });

    // Generate input and output file paths
    const inputFilePath = join(tempDir, `input-${jobId}-${originalFileName}`);
    const outputFileName = `compressed-${jobId}-${originalFileName}`;
    const outputFilePath = join(tempDir, outputFileName);

    try {
      // Download the source file
      await downloadFile(sourceUrl, inputFilePath);

      // Compress the video using fluent-ffmpeg
      await compressVideo(inputFilePath, outputFilePath, targetSizeMB);

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
