import Link from "next/link";
import { Metadata } from "next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Youtube, Instagram, Clock } from "lucide-react";
import DashboardHeader from "@/app/dashboard/DashboardHeader";
import DashboardAuthCheck from "@/components/DashboardAuthCheck";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import TikTokConnect from "@/components/TikTokConnect";
import InstagramConnect from "@/components/InstagramConnect";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage your videos and social media connections",
};

export default async function DashboardPage() {
  const session = await auth();

  // Default connection status
  let tiktokConnected = false;
  let instagramConnected = false;

  if (session) {
    // Check TikTok connection status
    const tiktokAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "tiktok" },
    });
    tiktokConnected = !!tiktokAccount;

    // Check Instagram connection status
    const instagramAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "instagram" },
    });
    instagramConnected = !!instagramAccount;
  }

  return (
    <DashboardAuthCheck>
      <div className="flex min-h-screen flex-col">
        <DashboardHeader />
        <main className="flex-1 container py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <Link href="/dashboard/upload">
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                New Upload
              </Button>
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Connected Accounts</CardTitle>
                <CardDescription>
                  Manage your social media connections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Youtube className="h-5 w-5 text-red-600" />
                      <span>YouTube</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-green-50 text-green-700 border-green-200"
                    >
                      Connected
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Instagram className="h-5 w-5 text-pink-600" />
                      <span>Instagram</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        instagramConnected
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }
                    >
                      {instagramConnected ? "Connected" : "Not Connected"}
                    </Badge>
                  </div>
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
                      <span>TikTok</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        tiktokConnected
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }
                    >
                      {tiktokConnected ? "Connected" : "Not Connected"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/dashboard/settings">Manage Connections</Link>
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Recent Uploads</CardTitle>
                <CardDescription>Your latest content</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded bg-gray-200 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">Summer Vlog 2025</p>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Clock className="h-3 w-3" />
                        <span>2 days ago</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded bg-gray-200 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">Product Review</p>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Clock className="h-3 w-3" />
                        <span>1 week ago</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full">
                  View All Uploads
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Quick Stats</CardTitle>
                <CardDescription>Your content performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Total Uploads</span>
                    <span className="font-medium">12</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">This Month</span>
                    <span className="font-medium">3</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Platforms</span>
                    <span className="font-medium">1/3</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full">
                  View Analytics
                </Button>
              </CardFooter>
            </Card>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-bold mb-4">Connect Your Platforms</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Youtube className="h-5 w-5 text-red-600" />
                    YouTube
                  </CardTitle>
                  <CardDescription>
                    Connected as {session?.user.email}
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button variant="outline" className="w-full">
                    Manage
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Instagram className="h-5 w-5 text-pink-600" />
                    Instagram
                  </CardTitle>
                  <CardDescription>Connect to post Reels</CardDescription>
                </CardHeader>
                <CardFooter>
                  <InstagramConnect instagramConnected={instagramConnected} />
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
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
                    TikTok
                  </CardTitle>
                  <CardDescription>Connect to post videos</CardDescription>
                </CardHeader>
                <CardFooter>
                  <TikTokConnect tiktokConnected={tiktokConnected} />
                </CardFooter>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </DashboardAuthCheck>
  );
}
