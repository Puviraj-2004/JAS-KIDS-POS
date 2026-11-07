"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Maximize2, Minimize2, Sparkles, Tv } from "lucide-react";
import styles from "./tv.module.css";

export interface ActiveChild {
  childKey: string;
  bookingId: string;
  referenceNo: string;
  displayName: string;
  childNumber: number;
  totalChildren: number;
  sessionStart: string;
  sessionEnd: string;
  checkinAt: string;
  durationMinutes: number;
  slotTimeLabel: string;
  bookingType: string;
  parentName: string;
}

interface ApiResponse {
  success: boolean;
  branch: {
    id: string;
    name: string;
  };
  availableBranches?: Array<{ id: string; name: string }>;
  count: number;
  children: ActiveChild[];
  refreshedAt: string;
  error?: string;
}

function formatCountdown(startIso: string, endIso: string) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const now = Date.now();

  // 1. Session is Upcoming (Staff checked in early; waiting for slot start)
  if (now < startMs) {
    const diffToStart = startMs - now;
    const totalSecs = Math.floor(diffToStart / 1000);
    const mins = Math.ceil(totalSecs / 60);

    const startTimeFormatted = new Date(startIso).toLocaleTimeString("en-US", {
      timeZone: "Asia/Colombo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    return {
      digits: startTimeFormatted,
      status: "upcoming" as const,
      statusText: mins <= 1 ? "Starts in < 1 min" : `Starts in ${mins} mins`,
      isUpcoming: true,
    };
  }

  // 2. Session has Expired
  const diffToEnd = endMs - now;
  if (diffToEnd <= 0) {
    return {
      digits: "00:00:00",
      status: "expired" as const,
      statusText: "Time Up!",
      isUpcoming: false,
    };
  }

  // 3. Session is Active (Counting down)
  const totalSecs = Math.floor(diffToEnd / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const hStr = hours > 0 ? `${hours.toString().padStart(2, "0")}:` : "";
  const mStr = mins.toString().padStart(2, "0");
  const sStr = secs.toString().padStart(2, "0");

  let status: "normal" | "warning" | "critical" = "normal";
  let statusText = "Remaining";

  if (totalSecs < 300) {
    status = "critical";
    statusText = "Final 5 Mins";
  } else if (totalSecs < 900) {
    status = "warning";
    statusText = "Ending Soon";
  }

  return {
    digits: `${hStr}${mStr}:${sStr}`,
    status,
    statusText,
    isUpcoming: false,
  };
}

export function LiveTvScreen({ initialBranchId }: { initialBranchId?: string }) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(initialBranchId || "");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const PAGE_SIZE = 6;

  // Real-time clock and 1-second countdown trigger
  const [, setTick] = useState(0);

  useEffect(() => {
    const clockInterval = setInterval(() => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          timeZone: "Asia/Colombo",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  // Fetch active sessions from POS API
  async function fetchSessions(silent = false) {
    try {
      const params = new URLSearchParams();
      if (selectedBranchId) params.set("branch_id", selectedBranchId);

      const res = await fetch(`/api/pos/tv?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json: ApiResponse = await res.json();
        if (json.success) {
          setData(json);
          setLastSync(new Date());
        }
      }
    } catch (e) {
      console.error("Failed to load TV sessions:", e);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // Initial fetch and auto-refresh every 8 seconds (< 10 seconds requirement)
  useEffect(() => {
    fetchSessions();
    const pollInterval = setInterval(() => {
      fetchSessions(true);
    }, 8000);

    return () => clearInterval(pollInterval);
  }, [selectedBranchId]);

  // Fullscreen state listener
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  const allChildren = data?.children || [];
  const totalPages = Math.max(1, Math.ceil(allChildren.length / PAGE_SIZE));

  // Auto-pagination rotation every 8 seconds if > 6 children
  useEffect(() => {
    if (totalPages <= 1) {
      setCurrentPage(0);
      return;
    }

    const pageInterval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, 8000);

    return () => clearInterval(pageInterval);
  }, [totalPages]);

  const visibleChildren = useMemo(() => {
    return allChildren.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  }, [allChildren, currentPage]);

  const branchName = data?.branch?.name || "JAS Kids Playhouse";

  // Counts for header badge
  const nowMs = Date.now();
  const playingCount = allChildren.filter((c) => {
    const start = new Date(c.sessionStart).getTime();
    const end = new Date(c.sessionEnd).getTime();
    return nowMs >= start && nowMs < end;
  }).length;
  const upcomingCount = allChildren.filter(
    (c) => new Date(c.sessionStart).getTime() > nowMs
  ).length;

  return (
    <div className={styles.tvContainer}>
      {/* Top Header */}
      <header className={styles.tvHeader}>
        <div className={styles.brandGroup}>
          <div className={styles.brandBadge}>
            <Tv size={28} color="#ffffff" />
          </div>
          <div className={styles.brandTitles}>
            <h1>
              JAS Kids Live
              <span className={styles.branchTag}>{branchName}</span>
            </h1>
          </div>
        </div>

        <div className={styles.centerInfo}>
          <div className={styles.liveIndicator}>
            <span className={styles.pulseDot} />
            LIVE FLOOR
          </div>
          <div className={styles.digitalClock}>{currentTime || "--:--:--"}</div>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.counterBadge}>
            {upcomingCount > 0 ? (
              <>
                <strong>{playingCount}</strong>
                <span>Playing</span>
                <span style={{ opacity: 0.4, margin: "0 2px" }}>•</span>
                <strong style={{ color: "#38bdf8" }}>{upcomingCount}</strong>
                <span style={{ color: "#7dd3fc" }}>Upcoming</span>
              </>
            ) : (
              <>
                <strong>{allChildren.length}</strong>
                <span>Active {allChildren.length === 1 ? "Child" : "Kids"}</span>
              </>
            )}
          </div>

          {data?.availableBranches && data.availableBranches.length > 1 && (
            <select
              className={styles.branchSelect}
              value={selectedBranchId || data.branch.id}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              aria-label="Select Branch"
            >
              {data.availableBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className={styles.actionBtn}
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIconWrap}>
            <Activity size={56} />
          </div>
          <h2>Connecting to POS Live Floor...</h2>
          <p>Loading active sessions for {branchName}</p>
        </div>
      ) : allChildren.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIconWrap}>
            <Sparkles size={56} />
          </div>
          <h2>No Active Playhouse Sessions</h2>
          <p>
            Children checked in via POS QR Scanner or Walk-in Bookings will appear here
            automatically.
          </p>
        </div>
      ) : (
        <main className={styles.cardsGrid}>
          {visibleChildren.map((child) => {
            const { digits, status, statusText } = formatCountdown(
              child.sessionStart,
              child.sessionEnd
            );

            const statusClass =
              status === "upcoming"
                ? styles.statusUpcoming
                : status === "expired"
                ? styles.statusExpired
                : status === "critical"
                ? styles.statusCritical
                : status === "warning"
                ? styles.statusWarning
                : styles.statusNormal;

            return (
              <article key={child.childKey} className={`${styles.sessionCard} ${statusClass}`}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.childName} title={child.displayName}>
                    {child.displayName}
                  </h2>
                  {child.totalChildren > 1 && (
                    <span className={styles.childTag}>
                      Kid {child.childNumber} of {child.totalChildren}
                    </span>
                  )}
                </div>

                <div className={styles.countdownArea}>
                  <div className={styles.timerDigits}>{digits}</div>
                  <div className={styles.statusLabel}>{statusText}</div>
                </div>

                <div className={styles.cardFooter}>
                  <span className={styles.referenceTag}>{child.referenceNo}</span>
                  <span>
                    {child.slotTimeLabel ||
                      `Started: ${new Date(child.sessionStart).toLocaleTimeString("en-US", {
                        timeZone: "Asia/Colombo",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}`}
                  </span>
                </div>
              </article>
            );
          })}
        </main>
      )}

      {/* Pagination dots if multiple pages */}
      {totalPages > 1 && (
        <footer className={styles.paginationBar}>
          <span className={styles.pageText}>
            Page {currentPage + 1} of {totalPages}
          </span>
          <div className={styles.pageDots}>
            {Array.from({ length: totalPages }).map((_, i) => (
              <div
                key={i}
                className={`${styles.pageDot} ${i === currentPage ? styles.pageDotActive : ""}`}
              />
            ))}
          </div>
        </footer>
      )}

      {/* Subtle sync info footer */}
      <footer className={styles.tvFooter}>
        <span>JAS KIDS PLAYHOUSE · POINT OF SALE REAL-TIME FEED</span>
        <span>
          Auto-synced:{" "}
          {lastSync.toLocaleTimeString("en-US", { timeZone: "Asia/Colombo" })} (updates every 8s)
        </span>
      </footer>
    </div>
  );
}
