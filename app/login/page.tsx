import LoginForm from "@/components/login-form";

export default function LoginPage({ searchParams }: { searchParams?: { mode?: string } }) {
  const initialMode = searchParams?.mode === "signup" ? "signup" : "login";
  return <LoginForm initialMode={initialMode} />;
}
