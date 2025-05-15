import * as ffmpeg from "fluent-ffmpeg";
// import { join } from "path";

// This function is now mostly for compatibility, as we're using WebAssembly FFmpeg
export function configureFFmpegPaths() {
  try {
    // For local development on macOS, try to use homebrew installed ffmpeg
    if (process.env.NODE_ENV === "development") {
      try {
        ffmpeg.setFfmpegPath("/usr/local/bin/ffmpeg");
        ffmpeg.setFfprobePath("/usr/local/bin/ffprobe");
        console.log("Using local ffmpeg binaries");
      } catch {
        console.warn("Could not set local ffmpeg paths, using system defaults");
      }
    }

    console.log("FFmpeg configured successfully");
  } catch (error) {
    console.error("Error configuring FFmpeg:", error);
  }
}
