"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FullScreenLoader } from "@/components/ui/LoadingSpinner";
import { InterviewRoom } from "@/components/interview/InterviewRoom";
import { api } from "@/lib/api";

function InterviewPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const sessionId = params.get("session");
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!sessionId) {
      router.replace("/");
      return;
    }
    api.getSession(sessionId)
      .then(() => setValid(true))
      .catch(() => {
        router.replace("/");
      });
  }, [sessionId, router]);

  if (!sessionId || valid === null) {
    return <FullScreenLoader text="Verifying session…" />;
  }

  return <InterviewRoom sessionId={sessionId} />;
}

export default function InterviewPage() {
  return (
    <Suspense fallback={<FullScreenLoader text="Loading interview…" />}>
      <InterviewPageInner />
    </Suspense>
  );
}
