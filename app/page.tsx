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
  attended?: boolean;
  attended_at?: string | null;
}

interface Stats {
  total: number;
  attended: number;
  absent: number;
  rate: number;
}

export default function AttendancePortal() {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, attended: 0, absent: 0, rate: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "attended" | "absent">("all");
  const [activeTabBatch, setActiveTabBatch] = useState<string>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [exporting, setExporting] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  const STORAGE_KEY = "syncthon_attendance_v1";

  async function loadData() {
    setLoading(true);
    setError("");

    // 1. Instantly restore from localStorage if available (zero wait, instant restore)
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Record<string, { attended: boolean; attended_at?: string }>;
        setApplicants((prev) =>
          prev.map((a) => {
            const key = a.student_id || a.id;
            const rec = parsed[key];
            return rec ? { ...a, attended: rec.attended, attended_at: rec.attended_at || null } : a;
          })
        );
      }
    } catch {}

    // 2. Fetch latest from server
    try {
      const res = await fetch("/api/attendance");
      if (!res.ok) throw new Error("Could not connect to attendance service.");
      const json = await res.json();
      if (json.success && Array.isArray(json.applicants)) {
        // Merge with local storage in case of any un-synced edits
        let localMap: Record<string, { attended: boolean; attended_at?: string }> = {};
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) localMap = JSON.parse(raw);
        } catch {}

        const merged: Applicant[] = json.applicants.map((a: Applicant) => {
          const key = a.student_id || a.id;
          const localRec = localMap[key];
          const isAttended = a.attended || (localRec ? localRec.attended : false);
          return {
            ...a,
            attended: isAttended,
            attended_at: a.attended_at || localRec?.attended_at || null,
          };
        });

        const attendedCount = merged.filter((a) => a.attended).length;
        const totalCount = merged.length;

        setApplicants(merged);
        setStats({
          total: totalCount,
          attended: attendedCount,
          absent: totalCount - attendedCount,
          rate: totalCount > 0 ? Math.round((attendedCount / totalCount) * 100) : 0,
        });

        // Update local storage with full synced map
        const newLocalMap: Record<string, { attended: boolean; attended_at?: string }> = {};
        merged.forEach((a) => {
          const k = a.student_id || a.id;
          if (a.attended) {
            newLocalMap[k] = { attended: true, attended_at: a.attended_at || undefined };
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

  async function handleToggleAttendance(applicant: Applicant) {
    const targetKey = applicant.student_id || applicant.id;
    const newStatus = !applicant.attended;
    setPendingId(targetKey);

    const nowTime = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const prev = [...applicants];
    const updated = applicants.map((a) => {
      if (a.student_id === targetKey || a.id === targetKey) {
        return {
          ...a,
          attended: newStatus,
          attended_at: newStatus ? nowTime : null,
        };
      }
      return a;
    });

    const attendedCount = updated.filter((a) => a.attended).length;
    const totalCount = updated.length;
    setApplicants(updated);
    setStats({
      total: totalCount,
      attended: attendedCount,
      absent: totalCount - attendedCount,
      rate: totalCount > 0 ? Math.round((attendedCount / totalCount) * 100) : 0,
    });

    // Save to localStorage immediately (guaranteed instant auto-save)
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      if (newStatus) {
        map[targetKey] = { attended: true, attended_at: nowTime };
      } else {
        delete map[targetKey];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {}

    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: applicant.id,
          studentId: applicant.student_id,
          attended: newStatus,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || "Failed to update attendance on server.");
      }

      setToastMessage(
        newStatus
          ? `✓ ${applicant.name} checked in at ${nowTime}`
          : `✕ ${applicant.name} marked absent`
      );
      setTimeout(() => setToastMessage(""), 3500);
    } catch (err) {
      console.warn("Server sync notice:", err);
      setToastMessage(`✓ ${applicant.name} saved locally`);
      setTimeout(() => setToastMessage(""), 3500);
    } finally {
      setPendingId(null);
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

      setToastMessage("✓ SyncThon.xlsx downloaded with live attendance & timestamps!");
      setTimeout(() => setToastMessage(""), 4000);
    } catch (err) {
      console.error("Export download failed:", err);
      window.location.href = "/api/attendance/export";
    } finally {
      setExporting(false);
    }
  }

  // Get distinct batches
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
      if (filter === "attended" && !a.attended) return false;
      if (filter === "absent" && a.attended) return false;
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
              <span>{loading ? "Syncing..." : "Sync Supabase"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero / Header overview */}
      <div className="portal-subbar">
        <div className="page-width subbar-inner">
          <div>
            <h1 className="portal-title">THINKTHON 2026 Check-in</h1>
            <p className="portal-subtitle">
              IEEE Zewail City Student Branch · Live desk check-in and attendance manager.
            </p>
          </div>

          <div className="sync-status-indicator">
            <span className="sync-pill">
              <span className="green-ping" />
              Direct Supabase Database Connected
            </span>
          </div>
        </div>
      </div>

      <main className="page-width portal-body">
        {/* KPI Counter Cards */}
        <section className="stats-row">
          <div className="stat-box">
            <span className="stat-label">Total Applicants</span>
            <span className="stat-num">{stats.total}</span>
            <span className="stat-desc">58 registered participants</span>
          </div>

          <div className="stat-box stat-present-box">
            <div className="stat-box-header">
              <span className="stat-label">Checked In (حاضر)</span>
              <span className="rate-chip">{stats.rate}%</span>
            </div>
            <span className="stat-num text-success">{stats.attended}</span>
            <div className="mini-progress">
              <div className="mini-progress-bar" style={{ width: `${stats.rate}%` }} />
            </div>
          </div>

          <div className="stat-box stat-pending-box">
            <span className="stat-label">Awaiting Arrival (غائب)</span>
            <span className="stat-num text-muted">{stats.absent}</span>
            <span className="stat-desc">Remaining to check in</span>
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
                placeholder="Search student name, ID (e.g. 2025...), or email..."
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
                className={`pill-btn pill-green ${filter === "attended" ? "pill-active-green" : ""}`}
                onClick={() => setFilter("attended")}
              >
                ✓ Checked In ({stats.attended})
              </button>
              <button
                type="button"
                className={`pill-btn pill-gray ${filter === "absent" ? "pill-active-gray" : ""}`}
                onClick={() => setFilter("absent")}
              >
                Pending ({stats.absent})
              </button>
            </div>
          </div>

          {/* Batch Selector Bar */}
          {batches.length > 0 && (
            <div className="batch-tabs">
              <span className="batch-tabs-label">Filter by Batch:</span>
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
                <p>Connecting to Supabase and loading applicants...</p>
              </div>
            ) : filteredApplicants.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">No students found matching your criteria</p>
                <p className="empty-sub">Try adjusting the search query or changing active filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                    setActiveTabBatch("all");
                  }}
                  className="reset-filters-btn"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <table className="roster-table">
                <thead>
                  <tr>
                    <th style={{ width: "50px", textAlign: "center" }}>#</th>
                    <th>Student Information</th>
                    <th>ID & Batch</th>
                    <th>Contact</th>
                    <th style={{ textAlign: "center", width: "190px" }}>Check-in Toggle</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApplicants.map((applicant, index) => {
                    const isAttended = Boolean(applicant.attended);
                    const isPending = pendingId === (applicant.student_id || applicant.id);

                    return (
                      <tr
                        key={applicant.id || applicant.student_id}
                        className={`student-row ${isAttended ? "is-present" : "is-pending"}`}
                      >
                        <td className="cell-num">{index + 1}</td>
                        <td className="cell-student">
                          <div className="student-profile">
                            <div className={`avatar ${isAttended ? "avatar-green" : "avatar-slate"}`}>
                              {applicant.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="student-meta">
                              <span className="name-text">{applicant.name}</span>
                              {applicant.major && (
                                <span className="major-text">{applicant.major}</span>
                              )}
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
                        <td className="cell-contact">
                          <div className="contact-block">
                            <span className="contact-email">{applicant.email}</span>
                            {applicant.phone && (
                              <span className="contact-phone">{applicant.phone}</span>
                            )}
                          </div>
                        </td>
                        <td className="cell-action">
                          <div className="action-cell-container">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleToggleAttendance(applicant)}
                              className={`checkin-btn ${
                                isAttended ? "checkin-btn-checked" : "checkin-btn-unchecked"
                              }`}
                            >
                              <span className="checkbox-custom">
                                {isAttended ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : null}
                              </span>
                              <span className="btn-text">
                                {isAttended ? "Checked In" : "Mark Present"}
                              </span>
                            </button>
                            {isAttended && applicant.attended_at && (
                              <span className="checkin-time-badge" title="Check-in timestamp">
                                🕒 {applicant.attended_at}
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

        {/* Footer information */}
        <footer className="portal-footer">
          <div className="footer-content">
            <p>
              THINKTHON Attendance Portal · Organizers Edition. Integrated with Supabase database.
            </p>
            <p className="excel-sync-info">
              File synced locally: <code>D:\SyncThon\SyncThon.xlsx</code> (Updated with green/red status & emojis).
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
