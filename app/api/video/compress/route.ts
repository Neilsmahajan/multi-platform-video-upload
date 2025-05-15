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

  // Get video duration and bitrate information
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.error("Error probing video:", err);
        return reject(err);
      }

      try {
        // Get video duration in seconds
        const duration = metadata.format.duration || 60; // Default to 60 seconds if duration not found
        console.log(`Video duration: ${duration} seconds`);

        // Calculate target bitrate based on desired file size
        // Formula: bitrate (in kbps) = targetSize (in kb) / duration (in seconds) * 0.9
        // The 0.9 factor accounts for container overhead
        const targetSizeKb = targetSizeMB * 8 * 1024; // Convert MB to kilobits
        const calculatedBitrate = Math.floor((targetSizeKb / duration) * 0.9);
        console.log(`Calculated video bitrate: ${calculatedBitrate}k`);

        // Set up ffmpeg command with calculated parameters
        const command = ffmpeg(inputPath)
          .outputOptions([
            "-c:v libx264", // Use H.264 codec for video
            "-preset fast", // Compression preset (faster encoding, larger file size)
            `-b:v ${calculatedBitrate}k`, // Video bitrate
            `-maxrate ${calculatedBitrate * 1.5}k`, // Max bitrate
            `-bufsize ${calculatedBitrate * 3}k`, // Buffer size
            "-c:a aac", // Use AAC codec for audio
            "-b:a 128k", // Audio bitrate
            "-movflags +faststart", // Optimize for web streaming
          ])
          .output(outputPath);

        // Add event handlers
        command
          .on("start", (commandLine) => {
            console.log("FFmpeg process started:", commandLine);
          })
          .on("progress", (progress) => {
            if (progress.percent) {
              console.log(
                `Compression progress: ${Math.round(progress.percent)}%`,
              );
            } else if (progress.frames) {
              console.log(`Processed ${progress.frames} frames`);
            }
          })
          .on("error", (err) => {
            console.error("Error during video compression:", err);
            reject(err);
          })
          .on("end", () => {
            console.log("Video compression completed successfully");
            resolve();
          });

        // Run the ffmpeg command
        command.run();
      } catch (error) {
        console.error("Error setting up ffmpeg command:", error);
        reject(error);
      }
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
