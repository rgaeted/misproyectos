import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isUserId } from "@/lib/access";
import { AuthPage } from "@/components/AuthPage";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (isUserId((await auth())?.user?.id)) redirect("/");
  return <AuthPage mode="login" error={(await searchParams).error} />;
}
