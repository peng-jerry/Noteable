import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import AppHeader from "../components/AppHeader";
import FormField from "../components/FormField";
import { useDelayedFlag } from "../components/FullPageStatus";
import Icon from "../components/Icon";
import Spinner from "../components/Spinner";
import { compact, validateDisplayName, validateEmail, validatePassword } from "../utils/validation";

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="page">
      <AppHeader />
      <main className="auth-main" id="main">
        <div className="auth-card">
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {children}
        </div>
        <p className="auth-footer">{footer}</p>
      </main>
    </div>
  );
}

function FormAlert({ message, tone = "error" }) {
  if (!message) return null;
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={tone === "error" ? "alert" : "info"} />
      <span>{message}</span>
    </div>
  );
}

/** Explains a slow first request (Render free tier waking up). */
function SlowHint({ busy }) {
  const slow = useDelayedFlag(busy, 4000);
  if (!slow) return null;
  return (
    <p className="muted small slow-hint">
      Waking up the server. The first request after a quiet spell can take up to a minute…
    </p>
  );
}

/** Where to go after logging in: back to the page that required login, or /notes. */
function useReturnTo() {
  const location = useLocation();
  const from = location.state?.from;
  return from ? `${from.pathname}${from.search || ""}` : "/notes";
}

export function LoginPage() {
  const { login, notice, clearNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = useReturnTo();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  // Show "session expired" (etc.) once, then forget it.
  const [shownNotice] = useState(notice);
  useEffect(() => {
    if (notice) clearNotice();
  }, [notice, clearNotice]);

  async function submit(e) {
    e.preventDefault();
    const found = compact({
      email: validateEmail(form.email),
      password: form.password ? "" : "Enter your password.",
    });
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await login({ email: form.email.trim(), password: form.password });
      navigate(returnTo, { replace: true });
    } catch (err) {
      setFormError(err.message);
      setErrors(err.fieldErrors ?? {});
      setBusy(false);
    }
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to see your notes."
      footer={
        <>
          New to Noteable? <Link to="/register" state={location.state}>Create an account</Link>
        </>
      }
    >
      <FormAlert message={shownNotice} tone="info" />
      <FormAlert message={formError} />
      <form onSubmit={submit} noValidate>
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set("email")}
          error={errors.email}
          autoFocus
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={set("password")}
          error={errors.password}
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <Spinner size={14} label="Logging in" /> : null} {busy ? "Logging in…" : "Log in"}
        </button>
        <SlowHint busy={busy} />
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = useReturnTo();
  const [form, setForm] = useState({ display_name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const found = compact({
      display_name: validateDisplayName(form.display_name),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      confirm: form.confirm === form.password ? "" : "Passwords don't match.",
    });
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const body = { email: form.email.trim(), password: form.password };
      if (form.display_name.trim()) body.display_name = form.display_name.trim();
      await register(body);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setFormError(err.message);
      setErrors(err.fieldErrors ?? {});
      setBusy(false);
    }
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free, private and ready in seconds."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" state={location.state}>
            Log in
          </Link>
        </>
      }
    >
      <FormAlert message={formError} />
      <form onSubmit={submit} noValidate>
        <FormField
          label="Name (optional)"
          autoComplete="name"
          value={form.display_name}
          onChange={set("display_name")}
          error={errors.display_name}
          maxLength={80}
          autoFocus
        />
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set("email")}
          error={errors.email}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
          error={errors.password}
          hint="At least 8 characters, including a letter and a number."
        />
        <FormField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set("confirm")}
          error={errors.confirm}
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <Spinner size={14} label="Creating account" /> : null}{" "}
          {busy ? "Creating account…" : "Create account"}
        </button>
        <SlowHint busy={busy} />
      </form>
    </AuthLayout>
  );
}
