"use client";

import { useState, useTransition } from "react";
import { Loader2, KeyRound, Mail, Lock, UserRound, ShieldCheck } from "lucide-react";
import { updateOwnEmail, updateOwnPassword } from "@/actions/auth";
import { clearUserPin, setUserPin } from "@/actions/pin";
import { PinInput } from "@/components/auth/pin-input";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { PIN_LENGTH } from "@/lib/auth/pin-constants";
import { setRememberedAccountHasPin } from "@/lib/auth/remembered-accounts";
import { isStaffSyntheticEmail } from "@/lib/auth/staff-identity";
import { PageHeader } from "@/components/ui/page-header";
import { FundCanvas } from "@/components/system/frames/fund-canvas";

type PinStep =
  | "idle"
  | "create"
  | "confirm-create"
  | "change-current"
  | "change-new"
  | "change-confirm"
  | "remove";

export function ProfileSettings({
  userId,
  name,
  loginId,
  role,
  email,
  username,
  hasPin: initialHasPin,
}: {
  userId: string;
  name: string;
  loginId: string;
  role: string;
  email: string | null;
  username: string | null;
  hasPin: boolean;
  variant?: "member" | "console";
}) {
  const canEditEmail = !username && !isStaffSyntheticEmail(email);
  const [hasPin, setHasPin] = useState(initialHasPin);
  const [pinStep, setPinStep] = useState<PinStep>("idle");
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  const [emailValue, setEmailValue] = useState(email ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const [pending, startTransition] = useTransition();

  function resetPinFlow() {
    setPinStep("idle");
    setPinValue("");
    setPinConfirm("");
    setCurrentPin("");
    setPinError(null);
  }

  function syncLocalHasPin(next: boolean) {
    setHasPin(next);
    setRememberedAccountHasPin(userId, next);
  }

  function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setEmailMessage(null);
    startTransition(async () => {
      const result = await updateOwnEmail({ email: emailValue });
      if (!result.ok) {
        setEmailError(result.error);
        return;
      }
      setEmailMessage("Email updated.");
    });
  }

  function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    startTransition(async () => {
      const result = await updateOwnPassword({
        currentPassword,
        newPassword,
      });
      if (!result.ok) {
        setPasswordError(result.error);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated.");
    });
  }

  return (
    <FundCanvas>
      <PageHeader
        eyebrow="Security & Identity"
        title="Account Profile & PIN"
        description={`${name} · ${loginId} · ${role}`}
      />

      <div className="rl-dash-grid">
        {/* Left Column: Account PIN + Identity */}
        <div className="rl-fund-stack">
          <section className="rl-panel rl-stack" aria-labelledby="pin-heading">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <KeyRound
                  className="h-4 w-4 text-[var(--brand)]"
                  aria-hidden
                />
                <h2 className="type-title" id="pin-heading">
                  6-Digit Quick Unlock PIN
                </h2>
              </div>
              <span
                className={`rl-pill ${
                  hasPin ? "rl-pill-verified" : "rl-pill-neutral"
                }`}
              >
                {hasPin ? "PIN Active" : "Not Set"}
              </span>
            </div>

            <p className="type-body-sm type-muted">
              Configure a 6-digit PIN once and use it for instant unlock on any device where you remember this account.
            </p>

            {pinMessage ? (
              <p className="rl-alert rl-alert-ok">{pinMessage}</p>
            ) : null}

            {pinStep === "idle" ? (
              <div className="flex flex-wrap gap-2.5 pt-1">
                {hasPin ? (
                  <>
                    <button
                      type="button"
                      className="rl-btn rl-btn-primary"
                      onClick={() => {
                        setPinMessage(null);
                        setPinError(null);
                        setPinValue("");
                        setPinStep("change-current");
                      }}
                    >
                      Change PIN
                    </button>
                    <button
                      type="button"
                      className="rl-btn rl-btn-danger-outline"
                      onClick={() => {
                        setPinMessage(null);
                        setPinError(null);
                        setPinValue("");
                        setPinStep("remove");
                      }}
                    >
                      Remove PIN
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="rl-btn rl-btn-primary"
                    onClick={() => {
                      setPinMessage(null);
                      setPinError(null);
                      setPinValue("");
                      setPinStep("create");
                    }}
                  >
                    Create 6-Digit PIN
                  </button>
                )}
              </div>
            ) : null}

            {(pinStep === "create" || pinStep === "confirm-create") && (
              <div className="rl-inset p-4">
                <PinInput
                  title={
                    pinStep === "create" ? "Create a PIN" : "Confirm New PIN"
                  }
                  subtitle={
                    pinStep === "create"
                      ? `Choose a ${PIN_LENGTH}-digit PIN`
                      : "Enter the same PIN again"
                  }
                  value={pinStep === "create" ? pinValue : pinConfirm}
                  onChange={pinStep === "create" ? setPinValue : setPinConfirm}
                  error={pinError}
                  disabled={pending}
                  onComplete={(next) => {
                    if (pinStep === "create") {
                      setPinValue(next);
                      setPinConfirm("");
                      setPinError(null);
                      setPinStep("confirm-create");
                      return;
                    }
                    if (next !== pinValue) {
                      setPinError("PINs do not match. Try again.");
                      setPinConfirm("");
                      return;
                    }
                    startTransition(async () => {
                      const result = await setUserPin({ pin: next });
                      if (!result.ok) {
                        setPinError(result.error);
                        setPinConfirm("");
                        return;
                      }
                      syncLocalHasPin(true);
                      setPinMessage("PIN saved.");
                      resetPinFlow();
                    });
                  }}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={resetPinFlow}
                  className="rl-btn rl-btn-ghost rl-btn-block mt-4"
                >
                  Cancel
                </button>
              </div>
            )}

            {(pinStep === "change-current" ||
              pinStep === "change-new" ||
              pinStep === "change-confirm") && (
              <div className="rl-inset p-4">
                <PinInput
                  title={
                    pinStep === "change-current"
                      ? "Verify Current PIN"
                      : pinStep === "change-new"
                        ? "Enter New PIN"
                        : "Confirm New PIN"
                  }
                  subtitle={
                    pinStep === "change-current"
                      ? "Enter your current PIN to continue"
                      : pinStep === "change-new"
                        ? `Choose a new ${PIN_LENGTH}-digit PIN`
                        : "Enter the new PIN again"
                  }
                  value={
                    pinStep === "change-current"
                      ? currentPin
                      : pinStep === "change-new"
                        ? pinValue
                        : pinConfirm
                  }
                  onChange={
                    pinStep === "change-current"
                      ? setCurrentPin
                      : pinStep === "change-new"
                        ? setPinValue
                        : setPinConfirm
                  }
                  error={pinError}
                  disabled={pending}
                  onComplete={(next) => {
                    if (pinStep === "change-current") {
                      setCurrentPin(next);
                      setPinValue("");
                      setPinError(null);
                      setPinStep("change-new");
                      return;
                    }
                    if (pinStep === "change-new") {
                      setPinValue(next);
                      setPinConfirm("");
                      setPinError(null);
                      setPinStep("change-confirm");
                      return;
                    }
                    if (next !== pinValue) {
                      setPinError("PINs do not match. Try again.");
                      setPinConfirm("");
                      return;
                    }
                    startTransition(async () => {
                      const result = await setUserPin({
                        pin: next,
                        currentPin,
                      });
                      if (!result.ok) {
                        setPinError(result.error);
                        setCurrentPin("");
                        setPinValue("");
                        setPinConfirm("");
                        setPinStep("change-current");
                        return;
                      }
                      syncLocalHasPin(true);
                      setPinMessage("PIN updated.");
                      resetPinFlow();
                    });
                  }}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={resetPinFlow}
                  className="rl-btn rl-btn-ghost rl-btn-block mt-4"
                >
                  Cancel
                </button>
              </div>
            )}

            {pinStep === "remove" && (
              <div className="rl-inset p-4">
                <PinInput
                  title="Remove PIN"
                  subtitle="Enter your current PIN to disable PIN unlock"
                  value={pinValue}
                  onChange={setPinValue}
                  error={pinError}
                  disabled={pending}
                  onComplete={(next) => {
                    startTransition(async () => {
                      const result = await clearUserPin({ currentPin: next });
                      if (!result.ok) {
                        setPinError(result.error);
                        setPinValue("");
                        return;
                      }
                      syncLocalHasPin(false);
                      setPinMessage("PIN removed.");
                      resetPinFlow();
                    });
                  }}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={resetPinFlow}
                  className="rl-btn rl-btn-ghost rl-btn-block mt-4"
                >
                  Cancel
                </button>
              </div>
            )}
          </section>

          <section
            className="rl-panel rl-stack"
            aria-labelledby="identity-heading"
          >
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
              {canEditEmail ? (
                <Mail className="h-4 w-4 text-[var(--brand)]" aria-hidden />
              ) : (
                <UserRound
                  className="h-4 w-4 text-[var(--brand)]"
                  aria-hidden
                />
              )}
              <h2 className="type-title" id="identity-heading">
                {canEditEmail ? "Sign-In Email Address" : "Sign-In Identity"}
              </h2>
            </div>

            {canEditEmail ? (
              <form onSubmit={onEmailSubmit} className="rl-stack">
                <label className="rl-field">
                  <span className="rl-field-label">Email Address</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    className="rl-input"
                  />
                  <span className="rl-field-hint">
                    Used for sign-in and official fund notifications.
                  </span>
                </label>
                {emailError ? (
                  <p className="rl-alert rl-alert-error">{emailError}</p>
                ) : null}
                {emailMessage ? (
                  <p className="rl-alert rl-alert-ok">{emailMessage}</p>
                ) : null}
                <div>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rl-btn rl-btn-secondary"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Save Email Address
                  </button>
                </div>
              </form>
            ) : (
              <div className="rl-inset">
                <p className="font-mono text-sm font-semibold text-[var(--ink)]">
                  {loginId}
                </p>
                <p className="type-caption mt-1">
                  {username
                    ? "Staff accounts authenticate via username."
                    : "Contact a fund administrator to update your login identifier."}
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Password Update & Session Controls */}
        <div className="rl-fund-stack">
          <section
            className="rl-panel rl-stack"
            aria-labelledby="password-heading"
          >
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
              <Lock className="h-4 w-4 text-[var(--brand)]" aria-hidden />
              <h2 className="type-title" id="password-heading">
                Change Password
              </h2>
            </div>

            <form onSubmit={onPasswordSubmit} className="rl-stack">
              <label className="rl-field">
                <span className="rl-field-label">Current Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="rl-input"
                />
              </label>
              <label className="rl-field">
                <span className="rl-field-label">New Password</span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="rl-input"
                  minLength={8}
                />
              </label>
              <label className="rl-field">
                <span className="rl-field-label">Confirm New Password</span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="rl-input"
                  minLength={8}
                />
              </label>

              {passwordError ? (
                <p className="rl-alert rl-alert-error">{passwordError}</p>
              ) : null}
              {passwordMessage ? (
                <p className="rl-alert rl-alert-ok">{passwordMessage}</p>
              ) : null}

              <div>
                <button
                  type="submit"
                  disabled={pending}
                  className="rl-btn rl-btn-primary"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                  )}
                  Update Password
                </button>
              </div>
            </form>
          </section>

          <div className="md:hidden">
            <SignOutButton className="rl-btn rl-btn-danger-outline rl-btn-block" />
          </div>
        </div>
      </div>
    </FundCanvas>
  );
}
