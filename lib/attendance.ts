import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

export interface AttendanceRecord {
  attended_first?: boolean;
  attended_last?: boolean;
  attended_last_time?: string | null;
  // legacy compatibility
  attended?: boolean;
  attended_at?: string | null;
}

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

const DATA_DIR = path.join(process.cwd(), "data");
const ATTENDANCE_FILE = path.join(DATA_DIR, "attendance.json");
const SEED_FILE = path.join(DATA_DIR, "applicants-seed.json");
export const EXCEL_LOCAL_PATH = path.join(process.cwd(), "SyncThon.xlsx");
export const EXCEL_BACKUP_PATH = "D:\\SyncThon\\SyncThon.xlsx";

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getAttendanceMap(): Record<string, AttendanceRecord> {
  ensureDataDir();
  if (fs.existsSync(ATTENDANCE_FILE)) {
    try {
      const content = fs.readFileSync(ATTENDANCE_FILE, "utf-8");
      return JSON.parse(content);
    } catch {
      return {};
    }
  }
  return {};
}

export function saveAttendanceMap(map: Record<string, AttendanceRecord>) {
  ensureDataDir();
  fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(map, null, 2), "utf-8");
}

export async function fetchApplicants(): Promise<Applicant[]> {
  ensureDataDir();

  const supabaseUrl = process.env.SUPABASE_URL || "https://rewuznplwdmvxywxcarf.supabase.co";
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let rawApplicants: Applicant[] = [];

  if (supabaseUrl && supabaseKey) {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/thinkthon_applications?select=id,name,student_id,email,phone,batch,major&order=created_at.asc`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(6000),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          rawApplicants = data;
        }
      }
    } catch (err) {
      console.warn("Direct Supabase fetch fallback to local seed:", err);
    }
  }

  // Load from seed data (58 registered applicants)
  if (rawApplicants.length === 0 && fs.existsSync(SEED_FILE)) {
    try {
      const content = fs.readFileSync(SEED_FILE, "utf-8");
      rawApplicants = JSON.parse(content);
    } catch (e) {
      console.error("Failed to read seed file:", e);
    }
  }

  const attendanceMap = getAttendanceMap();

  return rawApplicants.map((applicant) => {
    const key = applicant.student_id || applicant.id;
    const record = attendanceMap[key] || attendanceMap[applicant.id] || {};
    const attendedFirst = record.attended_first !== undefined ? Boolean(record.attended_first) : Boolean(record.attended);
    const attendedLast = Boolean(record.attended_last);
    const attendedLastTime = record.attended_last_time || null;

    return {
      ...applicant,
      attended_first: attendedFirst,
      attended_last: attendedLast,
      attended_last_time: attendedLastTime,
      attended: attendedFirst || attendedLast,
      attended_at: attendedLastTime || record.attended_at || null,
    };
  });
}

export async function toggleAttendance(
  idOrStudentId: string,
  type: "first" | "last",
  attended: boolean,
  timeStr?: string
): Promise<Applicant[]> {
  const applicants = await fetchApplicants();
  const attendanceMap = getAttendanceMap();

  const applicant = applicants.find(
    (a) => a.id === idOrStudentId || a.student_id === idOrStudentId
  );

  if (applicant) {
    const key = applicant.student_id || applicant.id;
    const current = attendanceMap[key] || {};

    if (type === "first") {
      current.attended_first = attended;
      current.attended = attended || Boolean(current.attended_last);
    } else {
      current.attended_last = attended;
      current.attended_last_time = attended
        ? timeStr || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
        : null;
      current.attended = Boolean(current.attended_first) || attended;
    }

    attendanceMap[key] = current;
    saveAttendanceMap(attendanceMap);
  }

  const updatedApplicants = applicants.map((a) => {
    const key = a.student_id || a.id;
    const record = attendanceMap[key] || {};
    return {
      ...a,
      attended_first: Boolean(record.attended_first),
      attended_last: Boolean(record.attended_last),
      attended_last_time: record.attended_last_time || null,
      attended: Boolean(record.attended_first) || Boolean(record.attended_last),
      attended_at: record.attended_last_time || null,
    };
  });

  await generateExcelWorkbook(updatedApplicants, EXCEL_LOCAL_PATH);
  await generateExcelWorkbook(updatedApplicants, EXCEL_BACKUP_PATH);

  return updatedApplicants;
}

export async function generateExcelWorkbook(applicants: Applicant[], savePath?: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SyncThon Attendance System";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("THINKTHON Attendance", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  // Title Banner
  worksheet.mergeCells("A1:I1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "THINKTHON 2026 — Official Attendance Roster (سجل الحضور الرسمي)";
  titleCell.font = { name: "Arial", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0B1C30" }, // Navy
  };
  worksheet.getRow(1).height = 36;

  // Stats Subheader
  const total = applicants.length;
  const firstCount = applicants.filter((a) => a.attended_first).length;
  const lastCount = applicants.filter((a) => a.attended_last).length;

  worksheet.mergeCells("A2:I2");
  const statsCell = worksheet.getCell("A2");
  statsCell.value = `Total Registered: ${total}   |   ✅ Attendance First: ${firstCount}   |   ✅ Attendance Last: ${lastCount}   |   Generated: ${new Date().toLocaleString()}`;
  statsCell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF00B4DC" } };
  statsCell.alignment = { horizontal: "center", vertical: "middle" };
  statsCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF17659A" },
  };
  worksheet.getRow(2).height = 24;

  // Table Headers (9 columns)
  const headers = [
    { header: "#", key: "index", width: 6 },
    { header: "Student Name", key: "name", width: 34 },
    { header: "Student ID", key: "student_id", width: 18 },
    { header: "Attendance First (حضور البداية)", key: "first", width: 26 },
    { header: "Attendance Last (حضور النهاية)", key: "last", width: 26 },
    { header: "Exit Time (وقت حضور النهاية)", key: "time", width: 24 },
    { header: "Batch", key: "batch", width: 14 },
    { header: "Email Address", key: "email", width: 34 },
    { header: "Phone Number", key: "phone", width: 20 },
  ];

  worksheet.getRow(3).values = headers.map((h) => h.header);
  worksheet.getRow(3).height = 28;
  worksheet.getRow(3).font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(3).alignment = { horizontal: "center", vertical: "middle" };

  for (let col = 1; col <= headers.length; col++) {
    worksheet.getCell(3, col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B1C30" },
    };
    worksheet.getColumn(col).width = headers[col - 1].width;
  }

  // Rows
  applicants.forEach((applicant, i) => {
    const rowNumber = i + 4;
    const isFirst = Boolean(applicant.attended_first);
    const isLast = Boolean(applicant.attended_last);
    const firstText = isFirst ? "✅ Attended (حاضر)" : "❌ Not Attended (غائب)";
    const lastText = isLast ? "✅ Attended (حاضر)" : "❌ Not Attended (غائب)";
    const lastTime = isLast ? (applicant.attended_last_time || "Recorded") : "-";

    const row = worksheet.getRow(rowNumber);
    row.values = [
      i + 1,
      applicant.name,
      applicant.student_id,
      firstText,
      lastText,
      lastTime,
      applicant.batch || "-",
      applicant.email,
      applicant.phone,
    ];
    row.height = 24;

    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
    row.getCell(2).font = { bold: true };
    row.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(3).font = { name: "Courier New", bold: true };

    // Attendance First cell
    const cellFirst = row.getCell(4);
    cellFirst.alignment = { horizontal: "center", vertical: "middle" };
    cellFirst.font = { bold: true, color: { argb: isFirst ? "FF155724" : "FF721C24" } };
    cellFirst.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isFirst ? "FFD4EDDA" : "FFF8D7DA" },
    };

    // Attendance Last cell
    const cellLast = row.getCell(5);
    cellLast.alignment = { horizontal: "center", vertical: "middle" };
    cellLast.font = { bold: true, color: { argb: isLast ? "FF155724" : "FF721C24" } };
    cellLast.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isLast ? "FFD4EDDA" : "FFF8D7DA" },
    };

    // Attendance Last Time cell
    const cellTime = row.getCell(6);
    cellTime.alignment = { horizontal: "center", vertical: "middle" };
    cellTime.font = { name: "Courier New", bold: isLast, color: { argb: isLast ? "FF155724" : "FF64748B" } };
    if (isLast) {
      cellTime.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE8F5E9" },
      };
    }

    row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(8).alignment = { horizontal: "left", vertical: "middle" };
    row.getCell(9).alignment = { horizontal: "center", vertical: "middle" };

    for (let col = 1; col <= 9; col++) {
      const cell = row.getCell(col);
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const nodeBuffer = Buffer.from(buffer);

  if (savePath) {
    try {
      const dir = path.dirname(savePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(savePath, nodeBuffer);
    } catch (err) {
      console.warn(`Could not save to ${savePath}:`, err);
    }
  }

  return nodeBuffer;
}
