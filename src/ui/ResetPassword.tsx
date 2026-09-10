/**
 * The "set a new password" screen, reached only via a reset-password email
 * link. `GameApp.tsx` routes here on Supabase's `PASSWORD_RECOVERY` auth
 * event — the recovery session it opens is what makes `updatePassword`
 * work without the player re-entering their old password.
 */
import { useState } from "react";
import { updatePassword } from "../data/account.ts";
import { fireAuthToast } from "../data/authToast.ts";

type MessageKind = "error" | "info" | null;

interface Props {
  onDone: () => void;
}

export function ResetPassword({ onDone }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<MessageKind>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMessage("Passwords don't match.");
      setMessageKind("error");
      return;
    }
    setBusy(true);
    setMessage("");
    const result = await updatePassword(password);
    setBusy(false);
    if (result.ok) {
      fireAuthToast("signed-in");
      onDone();
      return;
    }
    setMessage(result.reason);
    setMessageKind("error");
  }

  return (
    <div className="screen">
      <h2>Set a new password</h2>
      <form className="account-form" onSubmit={(e) => void handleSubmit(e)}>
        <label className="account-field">
          <span>New password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="account-field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
      {message && (
        <p
          className={
            messageKind === "error"
              ? "account-message account-message-error"
              : "account-message account-message-info"
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
