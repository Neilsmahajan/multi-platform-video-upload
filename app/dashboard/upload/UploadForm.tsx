"use client";

import type React from "react";
import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { useSession } from "next-auth/react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  CheckCircle2,
  Upload as UploadIcon,
  Youtube,
  Instagram,
  Loader2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface UploadFormProps {
  initialInstagramConnected: boolean;
  initialTiktokConnected: boolean;
}

export default function UploadForm({
  initialInstagramConnected,
  initialTiktokConnected,
}: UploadFormProps) {
  const { status } = useSession();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacyStatus] = useState("private"); // fixed value for now
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("youtube");

  // Initialize connection state from props
  const [instagramConnected] = useState(initialInstagramConnected);
  const [tiktokConnected] = useState(initialTiktokConnected);
  const [connecting, setConnecting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];

      // Check if file is too large (50MB for TikTok)
      const MAX_TIKTOK_SIZE = 50 * 1024 * 1024; // 50MB

      if (selectedFile.size > MAX_TIKTOK_SIZE && activeTab === "tiktok") {
        setErrorMessages([
          `This file is ${(selectedFile.size / (1024 * 1024)).toFixed(
            2,
          )}MB. TikTok has a 50MB file size limit. Please select a smaller file for TikTok uploads.`,
        ]);
        setUploadStatus("error");
      } else {
        // Clear any previous errors
        if (errorMessages.length > 0) {
          setErrorMessages([]);
          setUploadStatus("idle");
        }
      }

      setFile(selectedFile);
    }
  };

  const handleInstagramConnection = (checked: boolean) => {
    if (checked) {
      setConnecting(true);
      signIn("instagram", {
        callbackUrl: window.location.href,
        redirect: true,
      });
    } else {
      router.push("/api/auth/disconnect/instagram");
    }
  };

  const handleTikTokConnection = (checked: boolean) => {
    if (checked) {
      setConnecting(true);
      signIn("tiktok", {
        callbackUrl: window.location.href,
        redirect: true,
      });
    } else {
      router.push("/api/auth/disconnect/tiktok");
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);

    // Check if current file is too large for TikTok when switching to that tab
    if (value === "tiktok" && file) {
      const MAX_TIKTOK_SIZE = 50 * 1024 * 1024; // 50MB
      if (file.size > MAX_TIKTOK_SIZE) {
        setErrorMessages([
          `This file is ${(file.size / (1024 * 1024)).toFixed(
            2,
          )}MB. TikTok has a 50MB file size limit. Please select a smaller file for TikTok uploads.`,
        ]);
        setUploadStatus("error");
      } else if (errorMessages.length > 0 && uploadStatus === "error") {
        // Clear TikTok-specific size errors when switching back
        const nonSizeErrors = errorMessages.filter(
          (msg) => !msg.includes("TikTok has a 50MB file size limit"),
        );
        if (nonSizeErrors.length !== errorMessages.length) {
          setErrorMessages(nonSizeErrors);
          if (nonSizeErrors.length === 0) {
            setUploadStatus("idle");
          }
        }
      }
    }
  };

  const handleUpload = async (platform: string) => {
    if (!file || !title) return;
    setIsUploading(true);
    setUploadStatus("idle");
    setErrorMessages([]);

    try {
      // First, upload directly to Vercel Blob
      console.log(`Starting file upload to Vercel Blob for ${platform}`);
      const blobResult = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/video/uploadBlob",
      });
      console.log("File uploaded to Vercel Blob successfully", blobResult);

      // Platform-specific upload logic
      let uploadSuccess = false;
      const uploadErrors = [];

      if (platform === "youtube") {
        try {
          console.log("Starting YouTube upload with blob URL:", blobResult.url);
          const youtubeRes = await fetch("/api/youtube/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              blobUrl: blobResult.url,
              title,
              description,
              privacyStatus,
            }),
          });
          const youtubeData = await youtubeRes.json();

          if (youtubeRes.ok && youtubeData.videoId) {
            console.log("YouTube upload successful:", youtubeData.videoId);
            uploadSuccess = true;
          } else {
            console.error("YouTube upload failed:", youtubeData);
            const errorMessage = youtubeData.details
              ? `YouTube: ${youtubeData.error} - ${youtubeData.details}`
              : `YouTube: ${youtubeData.error || "Unknown error"}`;
            uploadErrors.push(errorMessage);
          }
        } catch (error) {
          console.error("Error in YouTube upload:", error);
          uploadErrors.push(
            `YouTube: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      } else if (platform === "instagram" && instagramConnected) {
        try {
          const instagramRes = await fetch("/api/instagram/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mediaUrl: blobResult.url,
              caption: description || title,
            }),
          });

          const instagramData = await instagramRes.json();

          if (instagramRes.ok) {
            if (
              instagramData.status === "processing" &&
              instagramData.containerId
            ) {
              // Container created, now poll for status
              setUploadStatus("success");
              // Add a notification that it's still processing in the background
              setErrorMessages([
                "Instagram: Your video is being processed. It will appear on Instagram shortly.",
              ]);

              // Start polling for container status (every 2 seconds)
              const checkStatus = async () => {
                try {
                  const statusRes = await fetch("/api/instagram/check-status", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      containerId: instagramData.containerId,
                      igBusinessAccountId: instagramData.igBusinessAccountId,
                      mediaUrl: blobResult.url, // Pass this to clean up the blob after publishing
                    }),
                  });

                  const statusData = await statusRes.json();

                  if (statusRes.ok) {
                    if (statusData.status === "success") {
                      console.log(
                        "Instagram upload complete, mediaId:",
                        statusData.mediaId,
                      );
                      // Container published successfully, no need to poll anymore
                      return;
                    } else if (statusData.status === "processing") {
                      // Still processing, continue polling
                      console.log("Instagram container still processing...");
                      setTimeout(checkStatus, 2000);
                    }
                  } else {
                    console.error(
                      "Error checking Instagram status:",
                      statusData,
                    );
                    // If there's an error, stop polling
                  }
                } catch (error) {
                  console.error("Error in status check:", error);
                  // If there's an error, stop polling
                }
              };

              // Start the polling process
              checkStatus();

              // Mark this as successful for the UI since we've started the background process
              uploadSuccess = true;
            } else if (instagramData.mediaId) {
              // Direct success (unlikely with our new approach but keep for compatibility)
              uploadSuccess = true;
            }
          } else {
            console.error("Instagram upload failed:", instagramData);
            uploadErrors.push(
              `Instagram: ${instagramData.error || "Unknown error"}`,
            );
            if (instagramData.details) {
              console.error("Instagram error details:", instagramData.details);
            }
          }
        } catch (error) {
          console.error("Error uploading to Instagram:", error);
          uploadErrors.push(
            `Instagram: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      } else if (platform === "tiktok" && tiktokConnected) {
        try {
          console.log("Starting TikTok upload with blob URL:", blobResult.url);
          const tiktokRes = await fetch("/api/tiktok/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mediaUrl: blobResult.url,
              caption: description || title,
            }),
          });

          // First try to parse the response as JSON
          let tiktokData;
          try {
            tiktokData = await tiktokRes.json();
          } catch (jsonError) {
            console.error(
              "Failed to parse TikTok response as JSON:",
              jsonError,
            );
            // If we can't parse JSON, get the response text
            const errorText = await tiktokRes.text();
            throw new Error(
              `TikTok API returned non-JSON response: ${errorText.substring(
                0,
                100,
              )}`,
            );
          }

          if (tiktokRes.ok) {
            if (tiktokData.status === "processing" && tiktokData.publishId) {
              // Similar to Instagram, start a polling process for status
              setUploadStatus("success");
              // Add a notification that it's still processing in the background
              setErrorMessages([
                "TikTok: Your video is being processed. Check your TikTok app notifications to continue editing and publishing.",
              ]);

              // Start polling for status (every 2 seconds)
              const checkStatus = async () => {
                try {
                  const statusRes = await fetch("/api/tiktok/check-status", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      publishId: tiktokData.publishId,
                      accessToken: tiktokData.accessToken,
                      mediaUrl: blobResult.url, // Pass this to clean up the blob after publishing
                    }),
                  });

                  let statusData;
                  try {
                    statusData = await statusRes.json();
                  } catch (jsonError) {
                    console.error(
                      "Failed to parse status response as JSON:",
                      jsonError,
                    );
                    throw new Error(
                      "Status check returned invalid JSON response",
                    );
                  }

                  if (statusRes.ok) {
                    if (statusData.status === "success") {
                      console.log(
                        "TikTok upload complete, publishId:",
                        statusData.publishId,
                      );

                      // Show detailed instructions to the user
                      setErrorMessages([
                        `TikTok: ${statusData.message}${
                          statusData.note ? `\n${statusData.note}` : ""
                        }`,
                      ]);

                      // Container published successfully, no need to poll anymore
                      return;
                    } else if (statusData.status === "processing") {
                      // Still processing, continue polling
                      console.log("TikTok upload still processing...");

                      // Update the message if there are notes
                      if (
                        statusData.note &&
                        statusData.note !== tiktokData.note
                      ) {
                        setErrorMessages([
                          `TikTok: ${statusData.message}${
                            statusData.note ? `\n${statusData.note}` : ""
                          }`,
                        ]);
                      }

                      setTimeout(checkStatus, 2000);
                    } else if (statusData.status === "error") {
                      // Error occurred
                      console.error("TikTok processing error:", statusData);
                      setUploadStatus("error");
                      setErrorMessages([
                        `TikTok: ${statusData.error}${
                          statusData.details ? ` - ${statusData.details}` : ""
                        }`,
                      ]);
                    }
                  } else {
                    console.error("Error checking TikTok status:", statusData);
                    // If there's an error, stop polling
                  }
                } catch (error) {
                  console.error("Error in TikTok status check:", error);
                  // Show the error in the UI
                  setUploadStatus("error");
                  setErrorMessages([
                    `TikTok status check failed: ${
                      error instanceof Error ? error.message : "Unknown error"
                    }`,
                  ]);
                }
              };

              // Start the polling process
              checkStatus();

              // Mark this as successful for the UI since we've started the background process
              uploadSuccess = true;
            } else if (tiktokData.publishId) {
              // Direct success (unlikely with our new approach but keep for compatibility)
              uploadSuccess = true;

              if (tiktokData.message) {
                setErrorMessages([`TikTok: ${tiktokData.message}`]);
              }
            }
          } else {
            console.error("TikTok upload failed:", tiktokData);
            let errorMessage = `TikTok: ${tiktokData.error || "Unknown error"}`;

            // Check if this is a token expiration error
            if (tiktokData.errorType === "token_expired") {
              errorMessage = `TikTok: Your TikTok authorization has expired. Please disconnect and reconnect your account.`;
            }
            // Add details if available
            else if (tiktokData.details) {
              errorMessage += ` - ${tiktokData.details}`;
              console.error("TikTok error details:", tiktokData.details);
            }

            uploadErrors.push(errorMessage);
          }
        } catch (error) {
          console.error("Error uploading to TikTok:", error);
          uploadErrors.push(
            `TikTok: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      }

      // Set upload status based on results
      if (uploadSuccess) {
        setUploadStatus("success");
        // Clear form fields
        setFile(null);
        setTitle("");
        setDescription("");
      } else {
        setUploadStatus("error");
        setErrorMessages(uploadErrors);
        console.error("Upload errors:", uploadErrors);
      }
    } catch (err) {
      console.error("Upload failed", err);
      setUploadStatus("error");
      setErrorMessages([
        `General error: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
      ]);
    }
    setIsUploading(false);
  };

  return (
    <>
      {uploadStatus === "success" && (
        <Alert className="mb-6 bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Upload Successful</AlertTitle>
          <AlertDescription className="text-green-700">
            Your video has been uploaded and is being processed for publishing.
            {errorMessages.length > 0 &&
              errorMessages[0].includes("TikTok:") && (
                <div className="mt-2 text-amber-600 whitespace-pre-line font-medium">
                  {errorMessages[0]}
                </div>
              )}
            {errorMessages.length > 0 &&
              !errorMessages[0].includes("TikTok:") &&
              errorMessages[0].includes("being processed") && (
                <p className="mt-2 text-amber-600">{errorMessages[0]}</p>
              )}
          </AlertDescription>
        </Alert>
      )}

      {uploadStatus === "error" && (
        <Alert className="mb-6 bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Upload Failed</AlertTitle>
          <AlertDescription className="text-red-700">
            <p>There was an error uploading your video. Please try again.</p>
            {errorMessages.length > 0 && (
              <ul className="mt-2 list-disc list-inside">
                {errorMessages.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            )}

            {/* TikTok token expired error */}
            {errorMessages.some(
              (msg) =>
                msg.includes("TikTok token expired") ||
                msg.includes("TikTok: Your TikTok authorization has expired"),
            ) && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-md">
                <h4 className="font-medium text-amber-800 mb-2">
                  TikTok Account Reconnection Required
                </h4>
                <p className="text-amber-700 mb-2">
                  Your TikTok authorization has expired. Please follow these
                  steps to reconnect:
                </p>
                <ol className="list-decimal list-inside text-amber-700 space-y-1">
                  <li>Go to the TikTok tab on this page</li>
                  <li>Toggle the switch to disconnect your account</li>
                  <li>
                    Toggle the switch again to reconnect your TikTok account
                  </li>
                  <li>Try uploading again after reconnecting</li>
                </ol>
                <p className="text-amber-700 mt-2 text-sm">
                  Note: TikTok access tokens periodically expire and require
                  reconnection.
                </p>
              </div>
            )}

            {/* Display setup instructions for Instagram errors */}
            {errorMessages.some(
              (msg) =>
                msg.includes("Instagram Professional Account Required") ||
                msg.includes("Instagram Business Account Required"),
            ) && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-md">
                <h4 className="font-medium text-amber-800 mb-2">
                  Instagram Professional Account Required
                </h4>
                <p className="text-amber-700 mb-2">
                  To publish videos to Instagram, you need:
                </p>
                <ol className="list-decimal list-inside text-amber-700">
                  <li>
                    An Instagram Professional account (Business or Creator)
                  </li>
                </ol>
                <a
                  href="https://help.instagram.com/502981923235522"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline mt-2 inline-block"
                >
                  Learn how to convert to a Professional account
                </a>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
        <Card className="col-span-full lg:col-span-1">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">Video File</h2>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  {file ? (
                    <div className="space-y-2">
                      <CheckCircle2 className="mx-auto h-8 w-8 text-green-500" />
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setFile(null)}
                        className="mt-2"
                      >
                        Change File
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <UploadIcon className="mx-auto h-8 w-8 text-gray-400" />
                      <div>
                        <Label
                          htmlFor="video-upload"
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer"
                        >
                          Select Video
                        </Label>
                        <Input
                          id="video-upload"
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </div>
                      <p className="text-sm text-gray-500">
                        MP4, MOV or WebM. Max 1GB.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Video Title</Label>
                <Input
                  id="title"
                  placeholder="Enter video title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">General Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter a description that works across platforms"
                  className="min-h-[120px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  This will be used as the default for all platforms. You can
                  customize per platform in the tabs.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-full lg:col-span-2">
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-4">Platform Settings</h2>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="mb-4">
                <TabsTrigger
                  value="youtube"
                  className="flex items-center gap-2"
                >
                  <Youtube className="h-4 w-4" />
                  YouTube
                </TabsTrigger>
                <TabsTrigger
                  value="instagram"
                  className="flex items-center gap-2"
                >
                  <Instagram className="h-4 w-4" />
                  Instagram
                </TabsTrigger>
                <TabsTrigger value="tiktok" className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M19.589 6.686a4.793 4.793 0 0 0-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743l-.002-.001.002.001a2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.857-4.424V8.687a8.182 8.182 0 0 0 4.773 1.526V6.79a4.831 4.831 0 0 1-1.003-.104z"
                      fill="currentColor"
                    />
                  </svg>
                  TikTok
                </TabsTrigger>
              </TabsList>

              <TabsContent value="youtube" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Youtube className="h-5 w-5 text-red-600" />
                    <span className="font-medium">YouTube Shorts</span>
                  </div>
                  <div>
                    <span className="text-sm text-green-600 font-medium">
                      Connected
                    </span>
                  </div>
                </div>

                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">
                    Account Connected
                  </AlertTitle>
                  <AlertDescription className="text-green-700">
                    Your YouTube account is connected through your Google login
                    and ready to post Shorts.
                  </AlertDescription>
                </Alert>

                <Separator />

                <div className="flex justify-end mt-4">
                  <Button
                    onClick={() => handleUpload("youtube")}
                    disabled={!file || isUploading || !title}
                  >
                    {isUploading && activeTab === "youtube" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading to YouTube...
                      </>
                    ) : (
                      <>
                        <UploadIcon className="mr-2 h-4 w-4" />
                        Upload to YouTube
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="instagram" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Instagram className="h-5 w-5 text-pink-600" />
                    <span className="font-medium">Instagram Reels</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        instagramConnected ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {instagramConnected ? "Connected" : "Not Connected"}
                    </span>
                    <Switch
                      id="instagram-publish"
                      disabled={connecting || status !== "authenticated"}
                      checked={instagramConnected}
                      onCheckedChange={handleInstagramConnection}
                    />
                  </div>
                </div>

                {instagramConnected ? (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800">
                      Account Connected
                    </AlertTitle>
                    <AlertDescription className="text-green-700">
                      Your Instagram account is connected and ready to post
                      Reels. Toggle the switch to disconnect your account.
                      <div className="mt-2 text-amber-600 text-sm">
                        <strong>Note:</strong> For publishing videos, your
                        Instagram account must be a Professional account
                        (Business or Creator).
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800">
                      Account Not Connected
                    </AlertTitle>
                    <AlertDescription className="text-amber-700">
                      Toggle the switch to connect your Instagram account to
                      enable posting to Reels.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end mt-4">
                  <Button
                    onClick={() => handleUpload("instagram")}
                    disabled={
                      !file || isUploading || !title || !instagramConnected
                    }
                  >
                    {isUploading && activeTab === "instagram" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading to Instagram...
                      </>
                    ) : (
                      <>
                        <UploadIcon className="mr-2 h-4 w-4" />
                        Upload to Instagram
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="tiktok" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M19.589 6.686a4.793 4.793 0 0 0-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743l-.002-.001.002.001a2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.857-4.424V8.687a8.182 8.182 0 0 0 4.773 1.526V6.79a4.831 4.831 0 0 1-1.003-.104z"
                        fill="currentColor"
                      />
                    </svg>
                    <span className="font-medium">TikTok</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        tiktokConnected ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {tiktokConnected ? "Connected" : "Not Connected"}
                    </span>
                    <Switch
                      id="tiktok-publish"
                      disabled={connecting || status !== "authenticated"}
                      checked={tiktokConnected}
                      onCheckedChange={handleTikTokConnection}
                    />
                  </div>
                </div>

                {tiktokConnected ? (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800">
                      Account Connected
                    </AlertTitle>
                    <AlertDescription className="text-green-700">
                      Your TikTok account is connected and ready to post videos.
                      Toggle the switch to disconnect your account.
                      <div className="mt-2 text-amber-600 text-sm">
                        <strong>Note:</strong> Videos will be uploaded to your
                        TikTok inbox. You&apos;ll receive a notification in the
                        TikTok app where you can edit and publish your video.
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800">
                      Account Not Connected
                    </AlertTitle>
                    <AlertDescription className="text-amber-700">
                      Toggle the switch to connect your TikTok account to enable
                      posting.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end mt-4">
                  <Button
                    onClick={() => handleUpload("tiktok")}
                    disabled={
                      !file || isUploading || !title || !tiktokConnected
                    }
                  >
                    {isUploading && activeTab === "tiktok" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading to TikTok...
                      </>
                    ) : (
                      <>
                        <UploadIcon className="mr-2 h-4 w-4" />
                        Upload to TikTok
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
