"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateOwnEmail, updateOwnPassword } from "@/actions/auth";
import { clearUserPin, setUserPin } from "@/actions/pin";
import { PinInput } from "@/components/auth/pin-input";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { PIN_LENGTH } from "@/lib/auth/pin-constants";
import { setRememberedAccountHasPin } from "@/lib/auth/remembered-accounts";
import { isStaffSyntheticEmail } from "@/lib/auth/staff-identity";
import { PageHeader } from "@/components/ui/page-header";

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
  variant = "member",
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
  const isConsole = variant === "console";
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

  const pinSection = (
    <section className="ui-stack-sm">
      <div>
        <h2 className="type-title">Account PIN</h2>
        <p className="type-body-sm type-muted mt-1">
          Set once and reuse whenever you remember this account with PIN unlock.
        </p>
      </div>

      {pinMessage ? <p className="ui-alert ui-alert-ok">{pinMessage}</p> : null}

      {pinStep === "idle" ? (
        <div className="ui-stack-sm">
          <p className="type-body-sm">
            Status:{" "}
            <span className="font-medium text-[var(--ink)]">
              {hasPin ? "PIN configured" : "No PIN set"}
            </span>
          </p>
          {hasPin ? (
            <div className={isConsole ? "flex flex-wrap gap-2" : "ui-stack-sm"}>
              <button
                type="button"
                className={
                  isConsole
                    ? "ui-btn ui-btn-secondary"
                    : "ui-btn ui-btn-secondary ui-btn-block"
                }
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
                className={
                  isConsole ? "ui-btn ui-btn-ghost" : "ui-btn ui-btn-ghost ui-btn-block"
                }
                onClick={() => {
                  setPinMessage(null);
                  setPinError(null);
                  setPinValue("");
                  setPinStep("remove");
                }}
              >
                Remove PIN
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={
                isConsole
                  ? "ui-btn ui-btn-primary"
                  : "ui-btn ui-btn-primary ui-btn-block"
              }
              onClick={() => {
                setPinMessage(null);
                setPinError(null);
                setPinValue("");
                setPinStep("create");
              }}
            >
              Create PIN
            </button>
          )}
        </div>
      ) : null}

      {pinStep === "create" || pinStep === "confirm-create" ? (
        <div>
          <PinInput
            title={pinStep === "create" ? "Create a PIN" : "Confirm PIN"}
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
            className={
              isConsole
                ? "ui-btn ui-btn-ghost mt-4"
                : "ui-btn ui-btn-ghost ui-btn-block mt-4"
            }
          >
            Cancel
          </button>
        </div>
      ) : null}

      {pinStep === "change-current" ||
      pinStep === "change-new" ||
      pinStep === "change-confirm" ? (
        <div>
          <PinInput
            title={
              pinStep === "change-current"
                ? "Current PIN"
                : pinStep === "change-new"
                  ? "New PIN"
                  : "Confirm new PIN"
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
            className={
              isConsole
                ? "ui-btn ui-btn-ghost mt-4"
                : "ui-btn ui-btn-ghost ui-btn-block mt-4"
            }
          >
            Cancel
          </button>
        </div>
      ) : null}

      {pinStep === "remove" ? (
        <div>
          <PinInput
            title="Remove PIN"
            subtitle="Enter your current PIN to remove unlock"
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
            className={
              isConsole
                ? "ui-btn ui-btn-ghost mt-4"
                : "ui-btn ui-btn-ghost ui-btn-block mt-4"
            }
          >
            Cancel
          </button>
        </div>
      ) : null}
    </section>
  );

  const identitySection = canEditEmail ? (
    <section className="ui-stack-sm">
      <div>
        <h2 className="type-title">Email</h2>
        <p className="type-body-sm type-muted mt-1">
          Used for sign-in and payment notices.
        </p>
      </div>
      <form onSubmit={onEmailSubmit} className="ui-stack-sm">
        <label className="ui-field">
          <span className="ui-field-label">Email address</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            className="ui-input"
          />
        </label>
        {emailError ? <p className="ui-alert ui-alert-error">{emailError}</p> : null}
        {emailMessage ? <p className="ui-alert ui-alert-ok">{emailMessage}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className={
            isConsole
              ? "ui-btn ui-btn-secondary"
              : "ui-btn ui-btn-secondary ui-btn-block"
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save email
        </button>
      </form>
    </section>
  ) : (
    <section className="ui-stack-sm">
      <div>
        <h2 className="type-title">Sign-in identity</h2>
        <p className="type-body-sm type-muted mt-1">
          {username
            ? "Staff accounts sign in with username."
            : "Contact an admin to change your login email."}
        </p>
      </div>
      <p className="type-body-sm font-medium">{loginId}</p>
    </section>
  );

  const passwordSection = (
    <section className="ui-desk-section ui-stack-sm">
      <div>
        <h2 className="type-title">Password</h2>
        <p className="type-body-sm type-muted mt-1">
          Update the password linked to this account.
        </p>
      </div>
      <form onSubmit={onPasswordSubmit} className="ui-stack-sm">
        <label className="ui-field">
          <span className="ui-field-label">Current password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="ui-input"
          />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">New password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="ui-input"
            minLength={8}
          />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Confirm new password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="ui-input"
            minLength={8}
          />
        </label>
        {passwordError ? (
          <p className="ui-alert ui-alert-error">{passwordError}</p>
        ) : null}
        {passwordMessage ? (
          <p className="ui-alert ui-alert-ok">{passwordMessage}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className={
            isConsole
              ? "ui-btn ui-btn-secondary"
              : "ui-btn ui-btn-secondary ui-btn-block"
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Update password
        </button>
      </form>
    </section>
  );

  return (
    <div className="ui-fund-frame mx-auto w-full max-w-3xl">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description={`${name} · ${loginId}${role !== "MEMBER" ? ` · ${role}` : ""}`}
      />
      <div className="ui-fund-stack">
        <div className="ui-desk ui-desk-col">
          <div className="ui-desk-split">
            {pinSection}
            {identitySection}
          </div>
          {passwordSection}
        </div>
        <SignOutButton className="ui-btn ui-btn-secondary ui-btn-block md:hidden" />
      </div>
    </div>
  );
}
