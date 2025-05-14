import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { put } from "@vercel/blob";
import { spawn } from "child_process";
import { createWriteStream } from "fs";
import { mkdir, unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { configureFFmpegPaths } from "../ffmpeg-config";

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

// Helper function to run FFmpeg compression
async function compressVideo(
  inputPath: string,
  outputPath: string,
  targetSizeMB: number,
): Promise<void> {
  console.log(
    `Compressing video from ${inputPath} to ${outputPath} with target size ${targetSizeMB}MB`,
  );

  // Convert target size to kilobits (approximate bitrate calculation)
  // Formula: bitrate = (target_size_in_kilobits) / (duration_in_seconds * 1.05)
  // We initially set a default bitrate that will be refined after we analyze the video
  let bitrate = "1000k"; // Default bitrate

  // Configure ffmpeg paths for the environment
  configureFFmpegPaths();

  // First, get video duration and info
  return new Promise((resolve, reject) => {
    const ffprobeProcess = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      inputPath,
    ]);

    let ffprobeOutput = "";

    ffprobeProcess.stdout.on("data", (data) => {
      ffprobeOutput += data.toString();
    });

    ffprobeProcess.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe process exited with code ${code}`));
      }

      try {
        const info = JSON.parse(ffprobeOutput);
        const durationInSeconds = parseFloat(info.format.duration);
        console.log(`Video duration: ${durationInSeconds} seconds`);

        // Calculate bitrate based on target size and duration
        // Target size in kilobits / duration in seconds * safety factor
        const targetSizeKb = targetSizeMB * 8 * 1024; // Convert MB to kilobits
        const calculatedBitrate = Math.floor(
          (targetSizeKb / durationInSeconds) * 0.9,
        ); // 0.9 as safety factor
        bitrate = `${calculatedBitrate}k`;
        console.log(`Calculated bitrate: ${bitrate}`);

        // Now run the actual compression
        const ffmpegProcess = spawn("ffmpeg", [
          "-i",
          inputPath,
          "-c:v",
          "libx264", // Use H.264 codec for video
          "-preset",
          "fast", // Compression preset (slower = better compression)
          "-b:v",
          bitrate, // Video bitrate
          "-maxrate",
          `${calculatedBitrate * 1.5}k`, // Max bitrate (1.5x target for buffer)
          "-bufsize",
          `${calculatedBitrate * 3}k`, // Buffer size
          "-c:a",
          "aac", // Use AAC codec for audio
          "-b:a",
          "128k", // Audio bitrate
          "-movflags",
          "+faststart", // Optimize for web streaming
          "-y", // Overwrite output file if it exists
          outputPath,
        ]);

        ffmpegProcess.stderr.on("data", (data) => {
          console.log(`ffmpeg: ${data.toString()}`);
        });

        ffmpegProcess.on("close", (code) => {
          if (code === 0) {
            console.log("Compression complete");
            resolve();
          } else {
            reject(new Error(`ffmpeg process exited with code ${code}`));
          }
        });
      } catch (error) {
        reject(error);
      }
    });

    ffprobeProcess.stderr.on("data", (data) => {
      console.error(`ffprobe error: ${data.toString()}`);
    });

    ffprobeProcess.on("error", (err) => {
      reject(err);
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

      // Compress the video
      await compressVideo(inputFilePath, outputFilePath, targetSizeMB);

      // Upload the compressed file to blob storage
      console.log("Uploading compressed video to blob storage");
      const blob = await put(
        outputFileName,
        new Blob([await Binder.readFile(outputFilePath)]),
        {
          access: "public",
        },
      );

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

// Helper to read file as buffer
class Binder {
  static async readFile(path: string): Promise<Buffer> {
    return readFile(path);
  }
}
