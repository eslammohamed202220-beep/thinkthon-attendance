# THINKTHON Attendance Portal (SyncThon)

An autonomous, live attendance & check-in management console for **THINKTHON 2026** (organized by IEEE Zewail City Student Branch).

## Features
- **Direct Supabase Sync**: Connects to the event database to fetch registered participants and dynamically update when new applications arrive.
- **Real-Time Check-In**: One-click toggle between Checked In (حاضر) and Pending (غائب) with instant feedback.
- **Excel Auto-Sync (`SyncThon.xlsx`)**: Every check-in writes directly to a color-coded spreadsheet with custom formatting (Green = Attended, Red = Not Attended).
- **Fast Search & Filters**: Live search across Student Names, IDs, Batches, and Majors.
- **Excel One-Click Export**: Download the live `.xlsx` attendance roster directly from the portal.

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the portal.
