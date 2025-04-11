import DashboardHeader from "@/app/dashboard/DashboardHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function SettingsLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader />
      <main className="flex-1 container py-6">
        <div className="mb-6">
          <Skeleton className="h-9 w-28 mb-2" />
          <Skeleton className="h-5 w-56" />
        </div>

        <div className="mb-4">
          <Skeleton className="h-10 w-64" />
        </div>

        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-6 w-24" />
                </div>
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <Skeleton className="h-5 w-40 mb-1" />
                  <Skeleton className="h-4 w-56" />
                </div>
                <Skeleton className="h-9 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}