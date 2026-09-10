"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./ConfirmProvider.module.css";

type Options = { title: string; description: string; confirmLabel?: string; danger?: boolean; inputLabel?: string; inputType?: "text" | "password"; minLength?: number };
type RequestConfirmation = (options: Options) => Promise<string | null>;
const Context = createContext<RequestConfirmation | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [value, setValue] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const resolve = useRef<((value: string | null) => void) | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const request = useCallback<RequestConfirmation>((next) => {
    if (resolve.current) return Promise.resolve(null);
    trigger.current = document.activeElement as HTMLElement | null;
    setValue("");
    setOptions(next);
    return new Promise(result => { resolve.current = result; });
  }, []);
  const finish = useCallback((result: string | null) => {
    dialog.current?.close();
    resolve.current?.(result);
    resolve.current = null;
    setOptions(null);
    trigger.current?.focus();
  }, []);
  useEffect(() => {
    if (options) dialog.current?.showModal();
  }, [options]);
  useEffect(() => () => { resolve.current?.(null); }, []);
  return <Context.Provider value={request}>{children}<dialog ref={dialog} className={styles.dialog} aria-labelledby="confirm-title" aria-describedby="confirm-description" onCancel={event => { event.preventDefault(); finish(null); }}>
    {options && <form onSubmit={event => { event.preventDefault(); finish(options.inputLabel ? value : "confirmed"); }}>
      <h2 id="confirm-title">{options.title}</h2><p id="confirm-description">{options.description}</p>
      {options.inputLabel && <label>{options.inputLabel}<input type={options.inputType ?? "text"} value={value} onChange={event => setValue(event.target.value)} required minLength={options.minLength ?? 1} autoComplete={options.inputType === "password" ? "new-password" : "off"}/></label>}
      <div className={styles.actions}><button type="button" autoFocus onClick={() => finish(null)}>Cancel</button><button type="submit" className={options.danger ? styles.danger : styles.primary}>{options.confirmLabel ?? "Confirm"}</button></div>
    </form>}
  </dialog></Context.Provider>;
}

export function useConfirm() {
  const request = useContext(Context);
  if (!request) throw new Error("ConfirmProvider is required");
  return request;
}
