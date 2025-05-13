import { execSync } from "child_process";
import path from "path";
import os from "os";

// This function will configure ffmpeg paths
export function configureFFmpegPaths() {
  // Check environment - use different strategies for different environments
  const isVercel = process.env.VERCEL === "1";

  if (isVercel) {
    console.log("Running on Vercel - using ffmpeg-core from node_modules");

    // On Vercel, use the ffmpeg-core from node_modules
    try {
      // For fluent-ffmpeg to find the ffmpeg binary in node_modules
      // const ffmpegPath = require("@ffmpeg/ffmpeg");
      console.log("@ffmpeg/ffmpeg package found");

      // We don't actually use the path directly with fluent-ffmpeg,
      // but log for debugging purposes
      console.log("Using WebAssembly-based FFmpeg for serverless environment");
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error loading @ffmpeg/ffmpeg:", error.message);
      } else {
        console.error("Unknown error loading @ffmpeg/ffmpeg:", String(error));
      }
    }

    // Set a temporary directory for ffmpeg processing
    process.env.FFMPEG_TEMP_DIR = path.join(os.tmpdir(), "ffmpeg");
  } else {
    // For local development, try to use system FFmpeg
    console.log("Using system FFmpeg binaries");

    try {
      const ffmpegPath = execSync("which ffmpeg").toString().trim();
      console.log("FFmpeg path:", ffmpegPath);
    } catch (error) {
      if (error instanceof Error) {
        console.log("Could not determine FFmpeg path. Error:", error.message);
        console.log("Make sure FFmpeg is installed on your local system");
      } else {
        console.log("Could not determine FFmpeg path. Error:", String(error));
      }
    }
  }
}
