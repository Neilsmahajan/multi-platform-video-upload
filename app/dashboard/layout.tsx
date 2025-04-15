import DashboardHeader from "./DashboardHeader";
import DashboardAuthCheck from "@/components/DashboardAuthCheck";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardAuthCheck>
      <div className="flex min-h-screen flex-col">
        <DashboardHeader />
        <main className="flex-1 container py-6">{children}</main>
      </div>
    </DashboardAuthCheck>
  );
}
