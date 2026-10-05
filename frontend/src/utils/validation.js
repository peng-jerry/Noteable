/**
 * Client-side checks that mirror the API's rules, so most mistakes are
 * caught before a request is sent. The server still validates everything.
 */

export function validateEmail(email) {
  if (!email.trim()) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address.";
  return "";
}

export function validatePassword(password) {
  if (!password) return "Enter a password.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password must be at most 128 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }
  return "";
}

export function validateDisplayName(name) {
  if (name.trim().length > 80) return "Name must be at most 80 characters.";
  return "";
}

/** Drop empty messages: { email: "", password: "x" } → { password: "x" }. */
export function compact(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
}
