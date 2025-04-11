import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "./AuthProvider";
import Footer from "./Footer"; // Added import

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Multiplatform Video Upload",
    template: "%s | Multiplatform Video Upload",
  },
  description:
    "Connect your YouTube, Instagram, and TikTok accounts to upload and manage your short-form videos from one place.",
  keywords: [
    "video upload",
    "youtube shorts",
    "instagram reels",
    "tiktok",
    "content creation",
    "social media management"
  ],
  authors: [
    {
      name: "Neil Mahajan",
      url: "https://multiplatformvideoupload.com",
    },
  ],
  creator: "Neil Mahajan",
  metadataBase: new URL("https://multiplatformvideoupload.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://multiplatformvideoupload.com",
    title: "Multiplatform Video Upload",
    description: "Upload once, share everywhere. Streamline your short-form content across YouTube, Instagram, and TikTok.",
    siteName: "Multiplatform Video Upload",
    images: [
      {
        url: "/multiplatform-video-upload-cover-photo.png",
        width: 1200,
        height: 630,
        alt: "Multiplatform Video Upload",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Multiplatform Video Upload",
    description: "Upload once, share everywhere. Streamline your short-form content across YouTube, Instagram, and TikTok.",
    images: ["/multiplatform-video-upload-cover-photo.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {children}
          <Footer />
        </body>
      </html>
    </AuthProvider>
  );
}
