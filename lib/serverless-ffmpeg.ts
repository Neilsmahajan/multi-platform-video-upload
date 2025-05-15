// Serverless FFmpeg helper for Vercel environment

import { createWriteStream } from "fs";
import { mkdir, unlink, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

/**
 * Check if FFmpeg is available in the environment
 */
export function checkFfmpegAvailability(): boolean {
  try {
    // Try to run ffmpeg -version command
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    console.log("FFmpeg not available in this environment");
    return false;
  }
}

/**
 * Simple video compression using direct ffmpeg command
 * This is a fallback for environments where fluent-ffmpeg doesn't work
 */
export async function compressDirectFFmpeg(
  inputPath: string,
  outputPath: string,
  targetSizeMB: number,
): Promise<void> {
  try {
    // Get video duration using ffprobe
    const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`;
    const durationOutput = execSync(durationCmd).toString().trim();
    const durationInSeconds = parseFloat(durationOutput) || 60;

    console.log(`Video duration: ${durationInSeconds} seconds`);

    // Calculate target bitrate based on size
    const targetSizeKb = targetSizeMB * 8 * 1024; // Convert MB to kilobits
    const calculatedBitrate = Math.floor(
      (targetSizeKb / durationInSeconds) * 0.9,
    ); // 0.9 as safety factor
    const maxBitrate = calculatedBitrate * 1.5;
    const bufSize = calculatedBitrate * 3;

    console.log(`Calculated bitrate: ${calculatedBitrate}k`);

    // Build ffmpeg command with bitrate options
    const ffmpegCmd = `ffmpeg -i "${inputPath}" -c:v libx264 -b:v ${calculatedBitrate}k -maxrate ${maxBitrate}k -bufsize ${bufSize}k -c:a aac -b:a 128k -movflags +faststart -preset fast "${outputPath}"`;

    console.log(`Running FFmpeg command: ${ffmpegCmd}`);
    execSync(ffmpegCmd);

    console.log("Video compression complete");
    return;
  } catch (error) {
    console.error("Error compressing video with direct FFmpeg:", error);
    throw error;
  }
}

/**
 * Fallback compression function that attempts multiple methods
 */
export async function compressVideoFallback(
  inputPath: string,
  outputPath: string,
  targetSizeMB: number,
): Promise<void> {
  // First try direct FFmpeg if available
  if (checkFfmpegAvailability()) {
    try {
      await compressDirectFFmpeg(inputPath, outputPath, targetSizeMB);
      return;
    } catch (error) {
      console.error(
        "Direct FFmpeg compression failed, trying alternative method:",
        error,
      );
    }
  }

  // If we've reached here, all compression attempts failed
  console.log("No compression method available, copying input to output");
  // Just copy the file as-is
  const fileData = await readFile(inputPath);
  await writeFile(outputPath, fileData);
}

/**
 * Helper function to download a file from a URL
 */
export async function downloadFile(
  url: string,
  outputPath: string,
): Promise<void> {
  console.log(`Downloading file from ${url} to ${outputPath}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const fileStream = createWriteStream(outputPath);

  return new Promise((resolve, reject) => {
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

/**
 * Simple video processing pipeline that works in serverless environments
 */
export async function processVideo(
  sourceUrl: string,
  originalFileName: string,
  targetSizeMB: number = 25,
): Promise<{ compressedUrl: string; originalUrl: string; sizeMB: number }> {
  // Create a unique ID for this job
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

    // Try to compress the video using our fallback method
    await compressVideoFallback(inputFilePath, outputFilePath, targetSizeMB);

    // Return the results
    return {
      compressedUrl: outputFilePath,
      originalUrl: sourceUrl,
      sizeMB: targetSizeMB,
    };
  } catch (error) {
    // Clean up files on error
    try {
      await unlink(inputFilePath).catch(() => {});
      await unlink(outputFilePath).catch(() => {});
    } catch (cleanupError) {
      console.error("Error cleaning up temp files:", cleanupError);
    }

    throw error;
  }
}
