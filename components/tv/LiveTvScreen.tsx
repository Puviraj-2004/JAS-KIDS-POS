"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Activity, ChevronLeft, ChevronRight, Clock3, Maximize2, Minimize2, Sparkles, Tv, UsersRound } from "lucide-react";
import styles from "./tv.module.css";

export interface ActiveChild { childKey: string; bookingId: string; referenceNo: string; displayName: string; childNumber: number; totalChildren: number; sessionStart: string; sessionEnd: string; checkinAt: string; durationMinutes: number; slotTimeLabel: string; bookingType: string; parentName: string; }
type BookingSession = Omit<ActiveChild, "childKey" | "displayName" | "childNumber" | "totalChildren"> & { childNames: string[] };
interface ApiResponse { success: boolean; branch: { id: string; name: string }; availableBranches?: Array<{ id: string; name: string }>; count: number; children: ActiveChild[]; refreshedAt: string; }

function formatCountdown(startIso: string, endIso: string) {
  const startMs = new Date(startIso).getTime(); const endMs = new Date(endIso).getTime(); const now = Date.now();
  if (now < startMs) {
    const remainingMinutes = Math.max(1, Math.ceil((startMs - now) / 60_000));
    return { digits: new Date(startIso).toLocaleTimeString("en-US", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hour12: true }), status: "upcoming" as const, statusText: `Starts in ${remainingMinutes} min`, progress: 0 };
  }
  const secondsRemaining = Math.max(0, Math.floor((endMs - now) / 1000)); const durationSeconds = Math.max(1, Math.floor((endMs - startMs) / 1000));
  const hours = Math.floor(secondsRemaining / 3600); const minutes = Math.floor((secondsRemaining % 3600) / 60); const seconds = secondsRemaining % 60;
  const digits = `${hours > 0 ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (secondsRemaining < 5 * 60) return { digits, status: "red" as const, statusText: "Last minutes", progress: secondsRemaining / durationSeconds };
  if (secondsRemaining < 15 * 60) return { digits, status: "orange" as const, statusText: "Ending soon", progress: secondsRemaining / durationSeconds };
  if (secondsRemaining < 30 * 60) return { digits, status: "yellow" as const, statusText: "Using", progress: secondsRemaining / durationSeconds };
  return { digits, status: "green" as const, statusText: "Running", progress: secondsRemaining / durationSeconds };
}

function groupBookings(children: ActiveChild[]) {
  const grouped = new Map<string, BookingSession>();
  for (const child of children) {
    const current = grouped.get(child.bookingId);
    if (current) { current.childNames.push(child.displayName); continue; }
    const { childKey: _childKey, displayName, childNumber: _childNumber, totalChildren: _totalChildren, ...booking } = child;
    grouped.set(child.bookingId, { ...booking, childNames: [displayName] });
  }
  return Array.from(grouped.values());
}

export function LiveTvScreen({ initialBranchId }: { initialBranchId?: string }) {
  const [selectedBranchId, setSelectedBranchId] = useState(initialBranchId || ""); const [data, setData] = useState<ApiResponse | null>(null); const [loading, setLoading] = useState(true); const [currentTime, setCurrentTime] = useState(""); const [tick, setTick] = useState(0); const [currentPage, setCurrentPage] = useState(0); const [isFullscreen, setIsFullscreen] = useState(false); const [lastSync, setLastSync] = useState<Date | null>(null);
  const PAGE_SIZE = 9;
  useEffect(() => { const interval = setInterval(() => { const now = new Date(); setCurrentTime(now.toLocaleTimeString("en-US", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })); setTick((value) => value + 1); }, 1000); return () => clearInterval(interval); }, []);
  useEffect(() => { async function fetchSessions(silent = false) { try { const params = new URLSearchParams(); if (selectedBranchId) params.set("branch_id", selectedBranchId); const response = await fetch(`/api/pos/tv?${params}`, { cache: "no-store" }); if (!response.ok) return; const json: ApiResponse = await response.json(); if (json.success) { setData(json); setLastSync(new Date()); } } catch (error) { console.error("Failed to load TV sessions:", error); } finally { if (!silent) setLoading(false); } } void fetchSessions(); const interval = setInterval(() => void fetchSessions(true), 8000); return () => clearInterval(interval); }, [selectedBranchId]);
  useEffect(() => { const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", onChange); return () => document.removeEventListener("fullscreenchange", onChange); }, []);
  const bookings = useMemo(() => groupBookings(data?.children || []).filter((booking) => new Date(booking.sessionEnd).getTime() > Date.now()).sort((a, b) => new Date(a.sessionEnd).getTime() - new Date(b.sessionEnd).getTime()), [data, tick]);
  const totalPages = Math.max(1, Math.ceil(bookings.length / PAGE_SIZE)); const visibleBookings = bookings.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE); const branchName = data?.branch.name || "JAS Kids Playhouse";
  useEffect(() => { setCurrentPage((page) => Math.min(page, totalPages - 1)); }, [totalPages]);
  function toggleFullscreen() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => {}); }
  return <div className={styles.tvContainer}>
    <header className={styles.tvHeader}><div className={styles.brandGroup}><div className={styles.brandBadge}><Tv size={30} aria-hidden="true" /></div><div className={styles.brandTitles}><h1>Playhouse <span>TV</span></h1><p>Current bookings · {branchName}</p></div></div><div className={styles.headerMeta}><div className={styles.counterBadge} role="status" aria-atomic="true"><Tv size={26} aria-hidden="true" /><span><small>Total bookings</small><strong>{bookings.length}</strong></span></div><div className={styles.clockBadge}><Clock3 size={25} aria-hidden="true" /><span><strong>{currentTime || "--:--:--"}</strong><small>Live floor</small></span></div>{data?.availableBranches && data.availableBranches.length > 1 && <select className={styles.branchSelect} value={selectedBranchId || data.branch.id} onChange={(event) => setSelectedBranchId(event.target.value)} aria-label="Select branch">{data.availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}<button type="button" className={styles.actionBtn} onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}</button></div></header>
    {loading ? <div className={styles.emptyState}><div className={styles.emptyIconWrap}><Activity size={52} /></div><h2>Connecting to the live floor</h2><p>Loading active playhouse sessions.</p></div> : bookings.length === 0 ? <div className={styles.emptyState}><div className={styles.emptyIconWrap}><Sparkles size={52} /></div><h2>No active playhouse sessions</h2><p>Checked-in playhouse bookings will appear here automatically.</p></div> : <main className={styles.cardsGrid}>{visibleBookings.map((booking) => { const timer = formatCountdown(booking.sessionStart, booking.sessionEnd); const ringStyle = { "--timer-progress": `${Math.round(Math.max(0, Math.min(1, timer.progress)) * 360)}deg` } as CSSProperties; const statusClass = styles[`status${timer.status[0].toUpperCase()}${timer.status.slice(1)}` as keyof typeof styles]; return <article key={booking.bookingId} className={`${styles.sessionCard} ${statusClass}`}><div className={styles.cardDetails}><span className={styles.statusPill}>{timer.statusText}</span><p className={styles.referenceTag}>Ref: {booking.referenceNo}</p><div className={styles.childNames}><UsersRound size={18} aria-hidden="true" /><span>{booking.childNames.join(", ")}</span></div><p className={styles.slotTime}><Clock3 size={18} aria-hidden="true" />{booking.slotTimeLabel}</p></div><div className={styles.timerRing} style={ringStyle}><div className={styles.timerCore}><strong>{timer.digits}</strong><span>remaining</span></div></div></article>; })}</main>}
    {totalPages > 1 && <nav className={styles.paginationBar} aria-label="Booking pages"><button type="button" className={styles.pageButton} disabled={currentPage === 0} onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}><ChevronLeft size={22} />Previous</button><span className={styles.pageText}>Page {currentPage + 1} of {totalPages}</span><button type="button" className={styles.pageButton} disabled={currentPage === totalPages - 1} onClick={() => setCurrentPage((page) => Math.min(totalPages - 1, page + 1))}>Next<ChevronRight size={22} /></button></nav>}
    <footer className={styles.tvFooter}><span>Green · 30+ min &nbsp; Yellow · under 30 min &nbsp; Orange · under 15 min &nbsp; Red · under 5 min</span><span>{lastSync ? `Auto-synced ${lastSync.toLocaleTimeString("en-US", { timeZone: "Asia/Colombo" })}` : "Connecting…"}</span></footer>
  </div>;
}
