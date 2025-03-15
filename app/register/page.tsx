import { redirect } from "next/navigation";

// Immediately redirect to the login page
export default function RegisterPage() {
  redirect("/login");
  return null;
}
