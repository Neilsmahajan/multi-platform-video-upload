import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="mx-auto w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Welcome back</h1>
            <p className="text-gray-500 dark:text-gray-400">
              Sign in with your Google account to access your account
            </p>
          </div>
          {/* Removed email/password form and forgot password link */}
          <div className="text-center">
            <Button className="w-full" variant="outline">
              Continue with Google
            </Button>
          </div>
          {/* Removed the Separator and sign-up link */}
        </div>
      </main>
    </div>
  );
}
