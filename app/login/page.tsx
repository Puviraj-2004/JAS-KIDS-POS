"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Login failed"); return; }
      router.push(data.redirect_to ?? "/pos/dashboard");
      router.refresh();
    } catch { setError("Login failed. Check the connection and try again."); }
    finally { setLoading(false); }
  }

  return <main className={styles.page}><section className={styles.panel}>
    <div className={styles.brand}><Image src="/Jaskids_Logo.png" alt="JAS Kids Indoor Playhouse" width={420} height={136} priority/><span>POINT OF SALE</span></div>
    <div className={styles.copy}><p>SECURE STAFF ACCESS</p><h1>Welcome back</h1><span>Sign in with your JASKIDS POS account.</span></div>
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Email address<input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)}/></label>
      <label htmlFor="password">Password<input id="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)}/></label>
      <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in to POS"}</button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </form>
  </section></main>;
}
