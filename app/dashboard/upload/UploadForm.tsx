"use client";

import type React from "react";
import { useState } from "react";
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
  Upload,
  Youtube,
  Instagram,
  Loader2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "success" | "error"
  >("idle");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    // Simulate upload process
    setTimeout(() => {
      setIsUploading(false);
      setUploadStatus("success");
    }, 2000);
  };

  return (
    <>
      {uploadStatus === "success" && (
        <Alert className="mb-6 bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Upload Successful</AlertTitle>
          <AlertDescription className="text-green-700">
            Your video has been uploaded and is being processed for publishing
            to your selected platforms.
          </AlertDescription>
        </Alert>
      )}

      {uploadStatus === "error" && (
        <Alert className="mb-6 bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Upload Failed</AlertTitle>
          <AlertDescription className="text-red-700">
            There was an error uploading your video. Please try again.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
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
                        <Upload className="mx-auto h-8 w-8 text-gray-400" />
                        <div>
                          <Label
                            htmlFor="video-upload"
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer"
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
                  <Input id="title" placeholder="Enter video title" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">General Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Enter a description that works across platforms"
                    className="min-h-[120px]"
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
              <Tabs defaultValue="youtube">
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
                  <TabsTrigger
                    value="tiktok"
                    className="flex items-center gap-2"
                  >
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
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-green-600 font-medium">
                        Connected
                      </span>
                      <Switch defaultChecked id="youtube-publish" />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="youtube-title">Title</Label>
                      <Input
                        id="youtube-title"
                        placeholder="Enter YouTube title"
                      />
                      <p className="text-xs text-gray-500">
                        Max 100 characters
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="youtube-description">Description</Label>
                      <Textarea
                        id="youtube-description"
                        placeholder="Enter YouTube description"
                        className="min-h-[120px]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="youtube-tags">
                        Tags (comma separated)
                      </Label>
                      <Input id="youtube-tags" placeholder="tag1, tag2, tag3" />
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch id="youtube-comments" defaultChecked />
                      <Label htmlFor="youtube-comments">Allow comments</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="instagram" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Instagram className="h-5 w-5 text-pink-600" />
                      <span className="font-medium">Instagram Reels</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-red-600 font-medium">
                        Not Connected
                      </span>
                      <Switch id="instagram-publish" disabled />
                    </div>
                  </div>

                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800">
                      Account Not Connected
                    </AlertTitle>
                    <AlertDescription className="text-amber-700">
                      Please connect your Instagram account in the dashboard to
                      enable posting to Reels.
                    </AlertDescription>
                  </Alert>
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
                      <span className="text-sm text-red-600 font-medium">
                        Not Connected
                      </span>
                      <Switch id="tiktok-publish" disabled />
                    </div>
                  </div>

                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800">
                      Account Not Connected
                    </AlertTitle>
                    <AlertDescription className="text-amber-700">
                      Please connect your TikTok account in the dashboard to
                      enable posting.
                    </AlertDescription>
                  </Alert>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline">
            Save as Draft
          </Button>
          <Button type="submit" disabled={!file || isUploading}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload & Publish
              </>
            )}
          </Button>
        </div>
      </form>
    </>
  );
}
