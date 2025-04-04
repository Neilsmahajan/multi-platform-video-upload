import React from "react";
import Link from "next/link";

export default function TermsOfServicePage() {
  return (
    <main className="max-w-3xl mx-auto py-8 px-4 font-sans">
      <header className="mb-6">
        <Link href="/" className="text-lg font-semibold hover:underline">
          ← Home
        </Link>
      </header>
      <h1 className="text-4xl font-bold mb-6">Terms of Service</h1>
      <p className="text-sm text-gray-600 mb-8">
        Effective Date: {new Date().toLocaleDateString()}
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Acceptance of Terms</h2>
        <p className="mb-4">
          By accessing and using our service, you agree to be bound by these
          Terms of Service. If you do not agree with any part of these terms,
          you must not use our service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Service Description</h2>
        <p className="mb-4">
          Our platform allows you to upload and share video content seamlessly
          across multiple video platforms. We also provide additional supporting
          services as described on our website.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">User Responsibilities</h2>
        <p className="mb-4">
          You are responsible for ensuring that any content you upload complies
          with all applicable laws and regulations. You must not use our service
          for any unlawful purposes.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Intellectual Property</h2>
        <p className="mb-4">
          All content provided on or through our service is the property of its
          respective owners. Unauthorized use of any material may violate
          copyright laws.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Limitation of Liability</h2>
        <p className="mb-4">
          In no event shall we be liable for any direct, indirect, incidental,
          special, or consequential damages arising out of the use of our
          service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Changes to These Terms</h2>
        <p className="mb-4">
          We reserve the right to change these Terms of Service at any time. Any
          changes will be posted on this page and will become effective
          immediately upon posting.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Contact Us</h2>
        <p>
          If you have any questions about these Terms of Service, please contact
          us at multiplatformvideoupload@gmail.com.
        </p>
      </section>
    </main>
  );
}
