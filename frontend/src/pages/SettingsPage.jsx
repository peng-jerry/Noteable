import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { authApi } from "../api";
import { useAuth } from "../auth/AuthContext";
import AppHeader from "../components/AppHeader";
import Dialog from "../components/Dialog";
import FormField from "../components/FormField";
import Icon from "../components/Icon";
import { useToast } from "../components/Toasts";
import { fullDate } from "../utils/date";
import { compact, validateDisplayName, validatePassword } from "../utils/validation";

/** Private page: profile, password and account deletion. */
export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="page">
      <AppHeader />
      <main className="settings container" id="main">
        <Link to="/notes" className="back-link">
          <Icon name="arrow-left" /> Back to notes
        </Link>
        <h1>Settings</h1>
        <p className="muted">
          Signed in as <strong>{user.email}</strong> · member since {fullDate(user.created_at)}
        </p>
        <ProfileForm />
        <PasswordForm />
        <DangerZone />
      </main>
    </div>
  );
}

function ProfileForm() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.display_name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    const problem = trimmed ? validateDisplayName(trimmed) : "Enter a name.";
    setError(problem);
    if (problem || trimmed === user.display_name) return;
    setBusy(true);
    try {
      setUser(await authApi.updateMe({ display_name: trimmed }));
      toast.success("Profile updated.");
    } catch (err) {
      setError(err.fieldErrors?.display_name || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card" aria-labelledby="profile-heading">
      <h2 id="profile-heading">Profile</h2>
      <form onSubmit={submit} noValidate>
        <FormField
          label="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="name"
          error={error}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </section>
  );
}

function PasswordForm() {
  const { setUser } = useAuth();
  const toast = useToast();
  const empty = { current_password: "", new_password: "", confirm: "" };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const found = compact({
      current_password: form.current_password ? "" : "Enter your current password.",
      new_password: validatePassword(form.new_password),
      confirm: form.confirm === form.new_password ? "" : "Passwords don't match.",
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const data = await authApi.changePassword({
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setUser(data.user);
      setForm(empty);
      toast.success("Password changed. Other devices have been signed out.");
    } catch (err) {
      const fields = err.fieldErrors ?? {};
      setErrors(Object.keys(fields).length ? fields : { current_password: err.message });
    } finally {
      setBusy(false);
    }
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <section className="settings-card" aria-labelledby="password-heading">
      <h2 id="password-heading">Change password</h2>
      <form onSubmit={submit} noValidate>
        <FormField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={form.current_password}
          onChange={set("current_password")}
          error={errors.current_password}
        />
        <FormField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={form.new_password}
          onChange={set("new_password")}
          error={errors.new_password}
          hint="At least 8 characters, including a letter and a number."
        />
        <FormField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set("confirm")}
          error={errors.confirm}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </section>
  );
}

function DangerZone() {
  const { clearSession, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsRelogin, setNeedsRelogin] = useState(false);
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setPassword("");
    setError("");
    setNeedsRelogin(false);
  }

  async function confirm(e) {
    e.preventDefault();
    if (!password) return setError("Enter your password to confirm.");
    setBusy(true);
    setError("");
    try {
      await authApi.deleteAccount(password);
      clearSession("Your account and all of its notes have been deleted.");
      navigate("/login", { replace: true });
    } catch (err) {
      if (err.code === "fresh_token_required") setNeedsRelogin(true);
      else setError(err.fieldErrors?.password || err.message);
      setBusy(false);
    }
  }

  return (
    <section className="settings-card danger-card" aria-labelledby="danger-heading">
      <h2 id="danger-heading">Delete account</h2>
      <p className="muted">
        Permanently delete your account, every folder and every note. This can't be undone.
      </p>
      <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
        Delete my account
      </button>

      <Dialog open={open} title="Delete your account?" onClose={close}>
        {needsRelogin ? (
          <>
            <p>For your security, please log in again before deleting your account.</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await logout();
                  navigate("/login", { replace: true, state: { from: { pathname: "/settings" } } });
                }}
              >
                Log in again
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={confirm} noValidate>
            <p>All of your notes and folders will be permanently deleted.</p>
            <FormField
              label="Enter your password to confirm"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error}
              autoFocus
            />
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-danger" disabled={busy}>
                {busy ? "Deleting…" : "Delete everything"}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  );
}
