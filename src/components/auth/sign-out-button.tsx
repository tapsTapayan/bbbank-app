"use client";

import { useTransition } from "react";
import { Loader2, LogOut } from "lucide-react";
import { signOut } from "@/actions/auth";

export function SignOutButton({
  className,
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();

  const text = pending ? "Signing out…" : label;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
      aria-label={text || "Sign out"}
      className={className ?? "rl-btn rl-btn-primary"}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      {text || null}
    </button>
  );
}
