import { AuthForm } from "@/features/auth/components/auth-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return <AuthForm mode="signup" initialInviteCode={code} />;
}
