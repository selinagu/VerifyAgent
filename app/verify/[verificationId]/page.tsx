import { PersonaVerificationLauncher } from "@/components/persona-verification-launcher";

export default async function VerificationPage({ params }: { params: Promise<{ verificationId: string }> }) {
  const { verificationId } = await params;
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <PersonaVerificationLauncher verificationId={verificationId} />
    </main>
  );
}
