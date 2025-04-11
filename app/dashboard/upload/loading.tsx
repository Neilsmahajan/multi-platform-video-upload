import DashboardHeader from "@/app/dashboard/DashboardHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function UploadLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader />
      <main className="flex-1 container py-6">
        <div className="mb-6">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-72" />
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
          <Card className="col-span-full lg:col-span-1">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div>
                  <Skeleton className="h-7 w-28 mb-2" />
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-8 mx-auto rounded-full" />
                      <Skeleton className="h-5 w-32 mx-auto" />
                      <Skeleton className="h-4 w-48 mx-auto" />
                      <Skeleton className="h-9 w-32 mx-auto" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>

                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-4 w-72" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-full lg:col-span-2">
            <CardContent className="p-6">
              <Skeleton className="h-7 w-44 mb-4" />

              <div className="mb-4">
                <Skeleton className="h-10 w-72 mb-4" />
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-5 rounded-full" />
                      <Skeleton className="h-5 w-32" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-10 rounded-full" />
                    </div>
                  </div>

                  <Skeleton className="h-px w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-4">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-40" />
        </div>
      </main>
    </div>
  );
}