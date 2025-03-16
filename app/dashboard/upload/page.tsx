import DashboardHeader from "@/app/dashboard/DashboardHeader";
import UploadForm from "@/app/dashboard/upload/UploadForm";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export default async function UploadPage() {
  const session = await getServerSession();
  if (!session) {
    return redirect("../../api/auth/signin");
  }
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader />
      <main className="flex-1 container py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Upload Video</h1>
          <p className="text-gray-500">
            Upload once and publish to multiple platforms
          </p>
        </div>
        <UploadForm />
      </main>
    </div>
  );
}
