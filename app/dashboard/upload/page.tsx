import { Metadata } from "next";
import UploadForm from "@/app/dashboard/upload/UploadForm";

export const metadata: Metadata = {
  title: "Upload Video",
  description:
    "Upload videos to multiple social media platforms simultaneously",
};

export default function UploadPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Upload Video</h1>
        <p className="text-gray-500">
          Upload once and publish to multiple platforms
        </p>
      </div>
      <UploadForm />
    </>
  );
}
