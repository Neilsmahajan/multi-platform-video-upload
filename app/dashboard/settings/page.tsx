import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Youtube, Instagram, Shield, User, Bell } from "lucide-react";
import DashboardHeader from "@/app/dashboard/dashboard-header";

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader />
      <main className="flex-1 container py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-gray-500">
            Manage your account and platform settings
          </p>
        </div>

        <Tabs defaultValue="account" className="space-y-6">
          <TabsList>
            <TabsTrigger value="account" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Account
            </TabsTrigger>
            <TabsTrigger value="platforms" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Platforms
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="flex items-center gap-2"
            >
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="first-name">First name</Label>
                    <Input id="first-name" defaultValue="John" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last-name">Last name</Label>
                    <Input id="last-name" defaultValue="Doe" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    defaultValue="john.doe@example.com"
                  />
                </div>
                <Button>Save Changes</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your password</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input id="current-password" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input id="new-password" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input id="confirm-password" type="password" />
                </div>
                <Button>Update Password</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="platforms" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Youtube className="h-5 w-5 text-red-600" />
                  YouTube
                </CardTitle>
                <CardDescription>
                  Manage your YouTube connection
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-green-800 font-medium">
                    Connected as @YourChannel
                  </p>
                  <p className="text-green-700 text-sm mt-1">
                    Connected on March 10, 2025
                  </p>
                </div>
                <div className="flex gap-4">
                  <Button variant="outline">Refresh Token</Button>
                  <Button variant="destructive">Disconnect</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Instagram className="h-5 w-5 text-pink-600" />
                  Instagram
                </CardTitle>
                <CardDescription>
                  Connect your Instagram account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="text-gray-800 font-medium">Not connected</p>
                  <p className="text-gray-700 text-sm mt-1">
                    Connect your Instagram account to post Reels
                  </p>
                </div>
                <Button>Connect Instagram</Button>
              </CardContent>
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
                <CardDescription>Connect your TikTok account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="text-gray-800 font-medium">Not connected</p>
                  <p className="text-gray-700 text-sm mt-1">
                    Connect your TikTok account to post videos
                  </p>
                </div>
                <Button>Connect TikTok</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Manage how you receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Upload Completed</p>
                      <p className="text-sm text-gray-500">
                        Receive notifications when your uploads are processed
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="upload-email" className="text-sm">
                        Email
                      </Label>
                      <Input
                        type="checkbox"
                        id="upload-email"
                        className="h-4 w-4"
                      />
                      <Label htmlFor="upload-push" className="text-sm">
                        Push
                      </Label>
                      <Input
                        type="checkbox"
                        id="upload-push"
                        className="h-4 w-4"
                        defaultChecked
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Publishing Status</p>
                      <p className="text-sm text-gray-500">
                        Get notified about publishing success or failures
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="publish-email" className="text-sm">
                        Email
                      </Label>
                      <Input
                        type="checkbox"
                        id="publish-email"
                        className="h-4 w-4"
                        defaultChecked
                      />
                      <Label htmlFor="publish-push" className="text-sm">
                        Push
                      </Label>
                      <Input
                        type="checkbox"
                        id="publish-push"
                        className="h-4 w-4"
                        defaultChecked
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Account Updates</p>
                      <p className="text-sm text-gray-500">
                        Receive updates about your account and new features
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="account-email" className="text-sm">
                        Email
                      </Label>
                      <Input
                        type="checkbox"
                        id="account-email"
                        className="h-4 w-4"
                        defaultChecked
                      />
                      <Label htmlFor="account-push" className="text-sm">
                        Push
                      </Label>
                      <Input
                        type="checkbox"
                        id="account-push"
                        className="h-4 w-4"
                      />
                    </div>
                  </div>
                </div>

                <Button>Save Preferences</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
