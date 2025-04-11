import { Metadata } from "next";
import React from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how Multiplatform Video Upload handles your data and protects your privacy",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <div className="w-full border-b bg-background mb-6">
        <div className="container flex h-14 items-center">
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span>Multi-Platform Video Upload</span>
            </Link>
            <Link
              href="/"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Home
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </div>
      <main className="max-w-3xl mx-auto py-8 px-4 font-sans">
        <h1 className="text-4xl font-bold mb-6">Privacy Policy</h1>
        <p className="text-sm text-gray-600 mb-8">
          Effective Date: {new Date().toLocaleDateString()}
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Introduction</h2>
          <p className="mb-4">
            Welcome to Multiplatform Video Upload. We provide a simple way for
            you to upload a short video that can be distributed automatically to
            YouTube, Instagram Reels, and TikTok.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            Information We Collect
          </h2>
          <p className="mb-4">
            When you use our service, we collect data such as your name, email
            address, and video content. We may also obtain metadata related to
            your video uploads and usage information through NextAuth.js when
            you sign in.
          </p>
          <p className="mb-4">
            Our application uses Neon database and Prisma for data management.
            Any data stored is solely used for processing your video uploads and
            facilitating distribution to the specified platforms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            How We Use Your Information
          </h2>
          <p className="mb-4">We use your personal information to:</p>
          <ul className="list-disc list-inside space-y-2 mb-4">
            <li>Authenticate your account securely via NextAuth.js.</li>
            <li>Store and manage your data using Neon database and Prisma.</li>
            <li>
              Process and distribute your uploaded video to YouTube, Instagram
              Reels, and TikTok.
            </li>
            <li>Improve our service and provide customer support.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            Data Sharing and Disclosure
          </h2>
          <p className="mb-4">
            We do not sell or rent your personal information. Your data is
            shared with the video platforms (YouTube, Instagram Reels, and
            TikTok) solely for the purpose of uploading and publishing your
            video. In addition, trusted third parties (such as our
            authentication and database providers) process your data in
            accordance with our policies.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            Your Rights and Choices
          </h2>
          <p className="mb-4">
            You have the right to access, update, or request deletion of your
            personal data. If you have any questions or concerns about your
            privacy, please contact us.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Security</h2>
          <p className="mb-4">
            We implement industry-standard security measures to protect your
            information. Our application leverages secure authentication with
            NextAuth.js, and all data is stored securely in our Neon database
            using Prisma.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            Changes to This Privacy Policy
          </h2>
          <p className="mb-4">
            We may update this Privacy Policy from time to time. If we make
            material changes, we will update the effective date and notify you
            by posting the new policy on this page.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy or our data
            practices, please contact us at multiplatformvideoupload@gmail.com.
          </p>
        </section>
      </main>
    </>
  );
}
