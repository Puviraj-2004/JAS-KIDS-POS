"use client";

import type { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, LoaderCircle, ScanLine } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "./QRScanner.module.css";

type ScannerStatus = "idle" | "requesting" | "scanning" | "complete";

type QRScannerProps = {
  disabled?: boolean;
  onScan: (value: string) => void;
};

export function QRScanner({ disabled = false, onScan }: QRScannerProps) {
  const generatedId = useId();
  const readerId = `qr-reader-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopScanner = useCallback(async (updateStatus = true) => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        await scanner.stop();
      } catch {
        // The camera may already be stopped after a successful read.
      }
      try {
        scanner.clear();
      } catch {
        // The reader may already have been cleared during teardown.
      }
    }
    if (updateStatus) setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      void stopScanner(false);
    };
  }, [stopScanner]);

  async function startScanner() {
    if (disabled || status === "requesting" || status === "scanning") return;

    setError("");
    setStatus("requesting");
    scannedRef.current = false;

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(readerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (width, height) => {
            const edge = Math.floor(Math.min(width, height) * 0.72);
            return { width: edge, height: edge };
          },
          aspectRatio: 1,
        },
        (decodedText) => {
          const value = decodedText.trim();
          if (!value || scannedRef.current) return;
          scannedRef.current = true;
          setStatus("complete");
          if (typeof navigator.vibrate === "function") navigator.vibrate(80);
          void stopScanner(false).then(() => onScanRef.current(value));
        },
        () => undefined,
      );
      setStatus("scanning");
    } catch {
      await stopScanner(false);
      setStatus("idle");
      setError("Camera access failed. Allow camera permission, or enter the QR code manually.");
    }
  }

  const isStarting = status === "requesting";
  const isScanning = status === "scanning";

  return (
    <section className={styles.card} aria-labelledby="camera-scanner-title">
      <div className={styles.headingRow}>
        <div className={styles.iconTile} aria-hidden="true">
          <ScanLine size={22} strokeWidth={2.2} />
        </div>
        <div>
          <h2 id="camera-scanner-title" className={styles.title}>Scan booking QR</h2>
          <p className={styles.subtitle}>Position the full QR code inside the frame.</p>
        </div>
      </div>

      <div className={styles.cameraFrame} data-active={isScanning}>
        <div id={readerId} className={styles.reader} />
        {!isScanning && !isStarting && (
          <div className={styles.cameraPlaceholder}>
            <Camera size={34} aria-hidden="true" />
            <span>Camera preview</span>
          </div>
        )}
        {isStarting && (
          <div className={styles.cameraPlaceholder} role="status">
            <LoaderCircle className={styles.spinner} size={34} aria-hidden="true" />
            <span>Starting camera…</span>
          </div>
        )}
        {isScanning && <div className={styles.scanGuide} aria-hidden="true" />}
      </div>

      <div className={styles.actions}>
        {!isScanning ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={startScanner}
            disabled={disabled || isStarting}
          >
            {isStarting ? <LoaderCircle className={styles.spinner} size={18} /> : <Camera size={18} />}
            {isStarting ? "Starting…" : "Start camera"}
          </button>
        ) : (
          <button type="button" className={styles.secondaryButton} onClick={() => void stopScanner()}>
            <CameraOff size={18} />
            Stop camera
          </button>
        )}
      </div>

      <p className={styles.privacyNote}>The camera feed stays on this device and is used only to read the QR code.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <span className={styles.srOnly} aria-live="polite">
        {status === "complete" ? "QR code captured." : ""}
      </span>
    </section>
  );
}
