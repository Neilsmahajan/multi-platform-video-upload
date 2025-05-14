import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { put } from "@vercel/blob";
import { createWriteStream } from "fs";
import { mkdir, unlink, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

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

// Helper function to compress video using WebAssembly FFmpeg
async function compressWebAssemblyVideo(
  inputPath: string,
  outputPath: string,
  targetSizeMB: number,
): Promise<void> {
  console.log(
    `Compressing video from ${inputPath} to ${outputPath} with target size ${targetSizeMB}MB`,
  );

  const ffmpegLogs: string[] = [];
  const ffmpeg = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.2/dist/umd";

  console.log("Loading FFmpeg WebAssembly...");
  ffmpeg.on("log", ({ message }) => {
    ffmpegLogs.push(message);
  });

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  try {
    console.log("FFmpeg WebAssembly loaded successfully");

    // Read input file
    const inputData = await readFile(inputPath);

    // Write file to FFmpeg's virtual filesystem
    console.log("Writing input file to FFmpeg's virtual filesystem");
    await ffmpeg.writeFile("input.mp4", new Uint8Array(inputData));

    // Parse logs to find video duration (hacky but works with WebAssembly FFmpeg)
    const logs = ffmpegLogs.join("\n");
    console.log("FFmpeg analysis logs:", logs);

    // Extract duration from logs
    const durationMatch = logs.match(
      /Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/,
    );
    let durationInSeconds = 0;

    if (durationMatch) {
      const hours = parseInt(durationMatch[1]);
      const minutes = parseInt(durationMatch[2]);
      const seconds = parseInt(durationMatch[3]);
      durationInSeconds = hours * 3600 + minutes * 60 + seconds;
      console.log(`Video duration: ${durationInSeconds} seconds`);
    } else {
      console.log("Could not determine duration, using default bitrate");
      durationInSeconds = 60; // Assume 1 minute if we can't determine duration
    }

    // Calculate target bitrate based on size
    const targetSizeKb = targetSizeMB * 8 * 1024; // Convert MB to kilobits
    const calculatedBitrate = Math.floor(
      (targetSizeKb / durationInSeconds) * 0.9,
    ); // 0.9 as safety factor
    console.log(`Calculated bitrate: ${calculatedBitrate}k`);

    // Perform video compression with calculated bitrate
    console.log("Running compression with WebAssembly FFmpeg");
    await ffmpeg.exec([
      "-i",
      "input.mp4",
      "-c:v",
      "libx264", // Use H.264 codec for video
      "-preset",
      "fast", // Compression preset
      "-b:v",
      `${calculatedBitrate}k`, // Video bitrate
      "-maxrate",
      `${calculatedBitrate * 1.5}k`, // Max bitrate
      "-bufsize",
      `${calculatedBitrate * 3}k`, // Buffer size
      "-c:a",
      "aac", // Use AAC codec for audio
      "-b:a",
      "128k", // Audio bitrate
      "-movflags",
      "+faststart", // Optimize for web streaming
      "output.mp4", // Output filename in virtual filesystem
    ]);

    console.log("Video compression completed");

    // Read the compressed video from FFmpeg's virtual filesystem
    const outputData = await ffmpeg.readFile("output.mp4");

    // Write the compressed video to the output path
    console.log("Writing compressed video to disk");
    await writeFile(outputPath, outputData);

    // Clean up virtual filesystem
    await ffmpeg.deleteFile("input.mp4");
    await ffmpeg.deleteFile("output.mp4");

    console.log("Compression complete");
  } catch (error) {
    console.error("Error during WebAssembly FFmpeg processing:", error);
    throw error;
  } finally {
    // Terminate FFmpeg instance
    ffmpeg.terminate();
  }
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

      // Compress the video using WebAssembly FFmpeg
      await compressWebAssemblyVideo(
        inputFilePath,
        outputFilePath,
        targetSizeMB,
      );

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
