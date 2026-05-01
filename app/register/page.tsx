import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-center text-2xl font-semibold text-slate-950">
        qgyx.asia
      </Link>
      <AuthForm mode="register" />
    </main>
  );
}
