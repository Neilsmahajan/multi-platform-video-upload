import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48">
          <div className="container px-4 md:px-6">
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 xl:grid-cols-2">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-12 w-3/4 mb-2 md:h-16 lg:h-20" />
                  <Skeleton className="h-6 w-full max-w-[600px] md:h-8" />
                  <Skeleton className="h-6 w-2/3 max-w-[400px] md:h-8" />
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <Skeleton className="h-12 w-36" />
                  <Skeleton className="h-12 w-36" />
                </div>
              </div>
              <div className="flex items-center justify-center">
                <Skeleton className="w-full max-w-[500px] aspect-video rounded-xl" />
              </div>
            </div>
          </div>
        </section>
        <section className="w-full py-12 md:py-24 lg:py-32 bg-gray-100 dark:bg-gray-800">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <Skeleton className="h-10 w-48 md:h-12 mx-auto" />
                <Skeleton className="h-6 w-full max-w-[900px] mx-auto" />
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 py-12 md:grid-cols-3 md:gap-12">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col items-center space-y-2 rounded-lg border p-6 shadow-sm">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <Skeleton className="h-6 w-36" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}