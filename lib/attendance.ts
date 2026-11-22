import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

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

export function getAttendanceMap(): Record<string, { attended: boolean; attended_at?: string }> {
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

export function saveAttendanceMap(map: Record<string, { attended: boolean; attended_at?: string }>) {
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
    const record = attendanceMap[key] || attendanceMap[applicant.id];
    return {
      ...applicant,
      attended: record ? Boolean(record.attended) : false,
      attended_at: record?.attended_at || null,
    };
  });
}

export async function toggleAttendance(idOrStudentId: string, attended: boolean): Promise<Applicant[]> {
  const applicants = await fetchApplicants();
  const attendanceMap = getAttendanceMap();

  const applicant = applicants.find(
    (a) => a.id === idOrStudentId || a.student_id === idOrStudentId
  );

  if (applicant) {
    const key = applicant.student_id || applicant.id;
    attendanceMap[key] = {
      attended,
      attended_at: attended ? new Date().toISOString() : undefined,
    };
    saveAttendanceMap(attendanceMap);
  }

  const updatedApplicants = applicants.map((a) => {
    const key = a.student_id || a.id;
    const record = attendanceMap[key] || attendanceMap[a.id];
    return {
      ...a,
      attended: record ? Boolean(record.attended) : false,
      attended_at: record?.attended_at || null,
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
  worksheet.mergeCells("A1:G1");
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
  const attendedCount = applicants.filter((a) => a.attended).length;
  const absentCount = total - attendedCount;
  const rate = total > 0 ? Math.round((attendedCount / total) * 100) : 0;

  worksheet.mergeCells("A2:G2");
  const statsCell = worksheet.getCell("A2");
  statsCell.value = `Total Registered: ${total}   |   ✅ Present: ${attendedCount}   |   ❌ Absent: ${absentCount}   |   Turnout Rate: ${rate}%   |   Updated: ${new Date().toLocaleString()}`;
  statsCell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF00B4DC" } };
  statsCell.alignment = { horizontal: "center", vertical: "middle" };
  statsCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF17659A" },
  };
  worksheet.getRow(2).height = 24;

  // Table Headers
  const headers = [
    { header: "#", key: "index", width: 6 },
    { header: "Student Name", key: "name", width: 34 },
    { header: "Student ID", key: "student_id", width: 18 },
    { header: "Attendance Status", key: "status", width: 24 },
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
    const isAttended = Boolean(applicant.attended);
    const statusText = isAttended ? "✅ Attended (حاضر)" : "❌ Not Attended (غائب)";

    const row = worksheet.getRow(rowNumber);
    row.values = [
      i + 1,
      applicant.name,
      applicant.student_id,
      statusText,
      applicant.batch || "-",
      applicant.email,
      applicant.phone,
    ];
    row.height = 24;

    const bgColor = isAttended ? "FFD4EDDA" : "FFF8D7DA";
    const textColor = isAttended ? "FF155724" : "FF721C24";

    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
    row.getCell(2).font = { bold: true };
    row.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(3).font = { name: "Courier New", bold: true };

    const statusCell = row.getCell(4);
    statusCell.alignment = { horizontal: "center", vertical: "middle" };
    statusCell.font = { bold: true, color: { argb: textColor } };
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: bgColor },
    };

    row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(6).alignment = { horizontal: "left", vertical: "middle" };
    row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };

    for (let col = 1; col <= 7; col++) {
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
