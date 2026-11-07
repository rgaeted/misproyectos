import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isUserId } from "@/lib/access";
import { AuthPage } from "@/components/AuthPage";
export default async function RegisterPage() {
  if (isUserId((await auth())?.user?.id)) redirect("/");
  return <AuthPage mode="register" />;
}
