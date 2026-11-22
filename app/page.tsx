"use client";

import Image from "next/image";
import { useEffect, useState, useMemo, useTransition } from "react";

export interface Applicant {
  id: string;
  name: string;
  student_id: string;
  email: string;
  phone: string;
  batch: string;
  major?: string;
  attended_first?: boolean;
  attended_last?: boolean;
  attended_last_time?: string | null;
  attended?: boolean;
  attended_at?: string | null;
}

interface Stats {
  total: number;
  attended_first: number;
  attended_last: number;
}

export default function AttendancePortal() {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, attended_first: 0, attended_last: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "first" | "last" | "absent">("all");
  const [activeTabBatch, setActiveTabBatch] = useState<string>("all");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [exporting, setExporting] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  const STORAGE_KEY = "syncthon_attendance_dual_v2";

  async function loadData() {
    setLoading(true);
    setError("");

    // 1. Instantly restore from localStorage
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Record<
          string,
          { attended_first?: boolean; attended_last?: boolean; attended_last_time?: string | null }
        >;
        setApplicants((prev) =>
          prev.map((a) => {
            const key = a.student_id || a.id;
            const rec = parsed[key];
            if (!rec) return a;
            return {
              ...a,
              attended_first: rec.attended_first ?? a.attended_first,
              attended_last: rec.attended_last ?? a.attended_last,
              attended_last_time: rec.attended_last_time ?? a.attended_last_time,
            };
          })
        );
      }
    } catch {}

    // 2. Fetch from server
    try {
      const res = await fetch("/api/attendance");
      if (!res.ok) throw new Error("Could not connect to attendance service.");
      const json = await res.json();
      if (json.success && Array.isArray(json.applicants)) {
        let localMap: Record<
          string,
          { attended_first?: boolean; attended_last?: boolean; attended_last_time?: string | null }
        > = {};
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) localMap = JSON.parse(raw);
        } catch {}

        const merged: Applicant[] = json.applicants.map((a: Applicant) => {
          const key = a.student_id || a.id;
          const localRec = localMap[key];
          const isFirst = localRec?.attended_first !== undefined ? localRec.attended_first : Boolean(a.attended_first);
          const isLast = localRec?.attended_last !== undefined ? localRec.attended_last : Boolean(a.attended_last);
          const lastTime = localRec?.attended_last_time || a.attended_last_time || null;

          return {
            ...a,
            attended_first: isFirst,
            attended_last: isLast,
            attended_last_time: lastTime,
            attended: isFirst || isLast,
          };
        });

        const firstCount = merged.filter((a) => a.attended_first).length;
        const lastCount = merged.filter((a) => a.attended_last).length;

        setApplicants(merged);
        setStats({
          total: merged.length,
          attended_first: firstCount,
          attended_last: lastCount,
        });

        // Persist merged map back to localStorage
        const newLocalMap: Record<
          string,
          { attended_first?: boolean; attended_last?: boolean; attended_last_time?: string | null }
        > = {};
        merged.forEach((a) => {
          const k = a.student_id || a.id;
          if (a.attended_first || a.attended_last) {
            newLocalMap[k] = {
              attended_first: a.attended_first,
              attended_last: a.attended_last,
              attended_last_time: a.attended_last_time,
            };
          }
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newLocalMap));
      } else {
        throw new Error(json.error || "Failed to load records.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleToggle(applicant: Applicant, type: "first" | "last") {
    const targetKey = applicant.student_id || applicant.id;
    const lockKey = `${targetKey}_${type}`;
    setPendingKey(lockKey);

    const nowTime = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const isCurrent = type === "first" ? Boolean(applicant.attended_first) : Boolean(applicant.attended_last);
    const newStatus = !isCurrent;

    const prev = [...applicants];
    const updated = applicants.map((a) => {
      if (a.student_id === targetKey || a.id === targetKey) {
        if (type === "first") {
          return {
            ...a,
            attended_first: newStatus,
          };
        } else {
          return {
            ...a,
            attended_last: newStatus,
            attended_last_time: newStatus ? nowTime : null,
          };
        }
      }
      return a;
    });

    const firstCount = updated.filter((a) => a.attended_first).length;
    const lastCount = updated.filter((a) => a.attended_last).length;

    setApplicants(updated);
    setStats({
      total: updated.length,
      attended_first: firstCount,
      attended_last: lastCount,
    });

    // Save to localStorage immediately
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      const cur = map[targetKey] || {};
      if (type === "first") {
        cur.attended_first = newStatus;
      } else {
        cur.attended_last = newStatus;
        cur.attended_last_time = newStatus ? nowTime : null;
      }
      map[targetKey] = cur;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {}

    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: applicant.id,
          studentId: applicant.student_id,
          type,
          attended: newStatus,
          time: newStatus && type === "last" ? nowTime : undefined,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || "Failed to update attendance on server.");
      }

      setToastMessage(
        type === "first"
          ? (newStatus ? `✓ ${applicant.name} marked present (First Attendance)` : `✕ ${applicant.name} unmarked (First Attendance)`)
          : (newStatus ? `✓ ${applicant.name} check-out recorded at ${nowTime} (Last Attendance)` : `✕ ${applicant.name} unmarked (Last Attendance)`)
      );
      setTimeout(() => setToastMessage(""), 3500);
    } catch (err) {
      console.warn("Server sync notice:", err);
      setToastMessage(`✓ Saved locally: ${applicant.name}`);
      setTimeout(() => setToastMessage(""), 3000);
    } finally {
      setPendingKey(null);
    }
  }

  async function handleDownloadExcel() {
    setExporting(true);
    try {
      const res = await fetch("/api/attendance/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicants }),
      });

      if (!res.ok) throw new Error("Excel export returned status " + res.status);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "SyncThon.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setToastMessage("✓ SyncThon.xlsx downloaded with First & Last attendance and timestamps!");
      setTimeout(() => setToastMessage(""), 4000);
    } catch (err) {
      console.error("Export download failed:", err);
      window.location.href = "/api/attendance/export";
    } finally {
      setExporting(false);
    }
  }

  const batches = useMemo(() => {
    const set = new Set<string>();
    applicants.forEach((a) => {
      if (a.batch) set.add(a.batch.trim());
    });
    return Array.from(set).sort();
  }, [applicants]);

  const filteredApplicants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applicants.filter((a) => {
      const matchesSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.student_id.toLowerCase().includes(q) ||
        (a.email && a.email.toLowerCase().includes(q)) ||
        (a.batch && a.batch.toLowerCase().includes(q));

      if (!matchesSearch) return false;
      if (filter === "first" && !a.attended_first) return false;
      if (filter === "last" && !a.attended_last) return false;
      if (filter === "absent" && (a.attended_first || a.attended_last)) return false;
      if (activeTabBatch !== "all" && a.batch !== activeTabBatch) return false;
      return true;
    });
  }, [applicants, search, filter, activeTabBatch]);

  return (
    <div className="portal-layout">
      {/* Top Navbar */}
      <header className="portal-nav">
        <div className="nav-container page-width">
          <div className="brand-group">
            <div className="brand-logo-wrap">
              <Image
                src="/thinkthon-wordmark.png"
                alt="THINKTHON"
                width={170}
                height={32}
                priority
              />
            </div>
            <div className="nav-badge">
              <span className="live-dot" />
              <span>Attendance Portal</span>
            </div>
          </div>

          <div className="nav-actions">
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={exporting}
              className="excel-download-btn"
              title="Download live Excel spreadsheet"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{exporting ? "Generating..." : "Export SyncThon.xlsx"}</span>
            </button>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="refresh-btn"
              title="Sync latest applicants from Supabase"
            >
              <svg
                className={loading ? "spin" : ""}
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span>{loading ? "Syncing..." : "Sync"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sub-header */}
      <div className="portal-subbar">
        <div className="page-width subbar-inner">
          <div>
            <h1 className="portal-title">THINKTHON 2026 Check-in</h1>
            <p className="portal-subtitle">
              Dual-session Attendance: <strong>Attendance First (البداية)</strong> &amp; <strong>Attendance Last (النهاية مع التوقيت)</strong>.
            </p>
          </div>

          <div className="sync-status-indicator">
            <span className="sync-pill">
              <span className="green-ping" />
              Auto-Save Active (Cloud &amp; Local)
            </span>
          </div>
        </div>
      </div>

      <main className="page-width portal-body">
        {/* KPI Counter Cards */}
        <section className="stats-row">
          <div className="stat-box">
            <span className="stat-label">Total Registered</span>
            <span className="stat-num">{stats.total}</span>
            <span className="stat-desc">58 applicants roster</span>
          </div>

          <div className="stat-box stat-present-box">
            <div className="stat-box-header">
              <span className="stat-label">Attendance First (البداية)</span>
              <span className="rate-chip">
                {stats.total > 0 ? Math.round((stats.attended_first / stats.total) * 100) : 0}%
              </span>
            </div>
            <span className="stat-num text-success">{stats.attended_first}</span>
            <div className="mini-progress">
              <div
                className="mini-progress-bar"
                style={{ width: `${stats.total > 0 ? (stats.attended_first / stats.total) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="stat-box stat-last-box">
            <div className="stat-box-header">
              <span className="stat-label">Attendance Last (النهاية)</span>
              <span className="rate-chip rate-chip-blue">
                {stats.total > 0 ? Math.round((stats.attended_last / stats.total) * 100) : 0}%
              </span>
            </div>
            <span className="stat-num text-blue">{stats.attended_last}</span>
            <div className="mini-progress">
              <div
                className="mini-progress-bar bar-blue"
                style={{ width: `${stats.total > 0 ? (stats.attended_last / stats.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </section>

        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="toast-notification">
            <span>{toastMessage}</span>
          </div>
        )}

        {error && (
          <div className="alert-banner">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="alert-close">✕</button>
          </div>
        )}

        {/* Controls Toolbar */}
        <div className="portal-card">
          <div className="toolbar">
            <div className="search-wrapper">
              <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search by student name, ID (e.g. 2025...), or batch..."
                value={search}
                onChange={(e) => startTransition(() => setSearch(e.target.value))}
                className="search-field"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="clear-btn">
                  Clear
                </button>
              )}
            </div>

            <div className="filter-pills">
              <button
                type="button"
                className={`pill-btn ${filter === "all" ? "pill-active" : ""}`}
                onClick={() => setFilter("all")}
              >
                All ({applicants.length})
              </button>
              <button
                type="button"
                className={`pill-btn pill-green ${filter === "first" ? "pill-active-green" : ""}`}
                onClick={() => setFilter("first")}
              >
                First Round ({stats.attended_first})
              </button>
              <button
                type="button"
                className={`pill-btn pill-blue ${filter === "last" ? "pill-active-blue" : ""}`}
                onClick={() => setFilter("last")}
              >
                Final Round ({stats.attended_last})
              </button>
              <button
                type="button"
                className={`pill-btn pill-gray ${filter === "absent" ? "pill-active-gray" : ""}`}
                onClick={() => setFilter("absent")}
              >
                Pending
              </button>
            </div>
          </div>

          {/* Batch Selector Bar */}
          {batches.length > 0 && (
            <div className="batch-tabs">
              <span className="batch-tabs-label">Filter Batch:</span>
              <button
                type="button"
                className={`batch-tab ${activeTabBatch === "all" ? "active" : ""}`}
                onClick={() => setActiveTabBatch("all")}
              >
                All Batches
              </button>
              {batches.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={`batch-tab ${activeTabBatch === b ? "active" : ""}`}
                  onClick={() => setActiveTabBatch(b)}
                >
                  {b}
                </button>
              ))}
            </div>
          )}

          {/* Table Container */}
          <div className="table-responsive">
            {loading ? (
              <div className="empty-state">
                <div className="spinner" />
                <p>Connecting and loading participants...</p>
              </div>
            ) : filteredApplicants.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">No participants found</p>
                <p className="empty-sub">Try searching by a different name or ID.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                    setActiveTabBatch("all");
                  }}
                  className="reset-filters-btn"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <table className="roster-table">
                <thead>
                  <tr>
                    <th style={{ width: "45px", textAlign: "center" }}>#</th>
                    <th>Student Information</th>
                    <th>ID &amp; Batch</th>
                    <th style={{ textAlign: "center", width: "170px" }}>
                      Attendance First
                      <span className="th-sub">البداية</span>
                    </th>
                    <th style={{ textAlign: "center", width: "190px" }}>
                      Attendance Last
                      <span className="th-sub">النهاية (مع التوقيت)</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApplicants.map((applicant, index) => {
                    const isFirst = Boolean(applicant.attended_first);
                    const isLast = Boolean(applicant.attended_last);
                    const targetKey = applicant.student_id || applicant.id;
                    const isPendingFirst = pendingKey === `${targetKey}_first`;
                    const isPendingLast = pendingKey === `${targetKey}_last`;

                    return (
                      <tr
                        key={applicant.id || applicant.student_id}
                        className={`student-row ${isFirst || isLast ? "is-present" : "is-pending"}`}
                      >
                        <td className="cell-num">{index + 1}</td>
                        <td className="cell-student">
                          <div className="student-profile">
                            <div className={`avatar ${isFirst && isLast ? "avatar-green" : isFirst ? "avatar-teal" : "avatar-slate"}`}>
                              {applicant.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="student-meta">
                              <span className="name-text">{applicant.name}</span>
                              <span className="major-text">{applicant.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="cell-id">
                          <div className="id-block">
                            <span className="id-code">{applicant.student_id}</span>
                            {applicant.batch && (
                              <span className="batch-tag">Batch {applicant.batch}</span>
                            )}
                          </div>
                        </td>

                        {/* Attendance First Column */}
                        <td className="cell-action">
                          <button
                            type="button"
                            disabled={isPendingFirst}
                            onClick={() => handleToggle(applicant, "first")}
                            className={`checkin-btn ${
                              isFirst ? "checkin-btn-checked" : "checkin-btn-unchecked"
                            }`}
                            title="Toggle First Attendance (البداية)"
                          >
                            <span className="checkbox-custom">
                              {isFirst ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : null}
                            </span>
                            <span className="btn-text">
                              {isFirst ? "First: In" : "First: Check In"}
                            </span>
                          </button>
                        </td>

                        {/* Attendance Last Column (with Time) */}
                        <td className="cell-action">
                          <div className="action-cell-container">
                            <button
                              type="button"
                              disabled={isPendingLast}
                              onClick={() => handleToggle(applicant, "last")}
                              className={`checkin-btn ${
                                isLast ? "checkin-btn-blue-checked" : "checkin-btn-unchecked"
                              }`}
                              title="Toggle Last Attendance with Time (النهاية)"
                            >
                              <span className="checkbox-custom">
                                {isLast ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : null}
                              </span>
                              <span className="btn-text">
                                {isLast ? "Last: In" : "Last: Check In"}
                              </span>
                            </button>
                            {isLast && applicant.attended_last_time && (
                              <span className="checkin-time-badge" title="Check-out recorded time">
                                🕒 {applicant.attended_last_time}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="portal-footer">
          <div className="footer-content">
            <p>
              THINKTHON Attendance Portal · Organizers Console. Exporting generates <code>SyncThon.xlsx</code> with First &amp; Last attendance and timestamps.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
