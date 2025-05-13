import { execSync } from "child_process";

// This function will configure ffmpeg paths in a Vercel serverless environment
export function configureFFmpegPaths() {
  // On Vercel, the binaries are typically available in the PATH
  // Vercel uses Amazon Linux 2 which should have ffmpeg installed
  console.log("Using system FFmpeg binaries");

  // You can log the current ffmpeg command path for debugging
  // Check if FFmpeg is available in the PATH
  try {
    const ffmpegPath = execSync("which ffmpeg").toString().trim();
    console.log("FFmpeg path:", ffmpegPath);
  } catch (error) {
    if (error instanceof Error) {
      console.log("Could not determine FFmpeg path. Error:", error.message);
    } else {
      console.log("Could not determine FFmpeg path. Error:", String(error));
    }
  }
}
