import { NextRequest, NextResponse } from "next/server";
import {
  fetchApplicants,
  toggleAttendance,
  generateExcelWorkbook,
  EXCEL_LOCAL_PATH,
  EXCEL_BACKUP_PATH,
} from "../../../lib/attendance";

export async function GET() {
  try {
    const applicants = await fetchApplicants();
    const total = applicants.length;
    const attended = applicants.filter((a) => a.attended).length;
    const absent = total - attended;
    const rate = total > 0 ? Math.round((attended / total) * 100) : 0;

    await generateExcelWorkbook(applicants, EXCEL_LOCAL_PATH);
    await generateExcelWorkbook(applicants, EXCEL_BACKUP_PATH);

    return NextResponse.json({
      success: true,
      stats: { total, attended, absent, rate },
      applicants,
      excelPath: EXCEL_LOCAL_PATH,
    });
  } catch (error) {
    console.error("Attendance GET error:", error);
    return NextResponse.json({ error: "Failed to fetch attendance records" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, studentId, attended } = body;
    const targetKey = id || studentId;

    if (!targetKey || typeof attended !== "boolean") {
      return NextResponse.json(
        { error: "Target student ID and attended boolean are required." },
        { status: 400 }
      );
    }

    const updatedApplicants = await toggleAttendance(targetKey, attended);
    const total = updatedApplicants.length;
    const attendedCount = updatedApplicants.filter((a) => a.attended).length;
    const absent = total - attendedCount;
    const rate = total > 0 ? Math.round((attendedCount / total) * 100) : 0;

    return NextResponse.json({
      success: true,
      stats: { total, attended: attendedCount, absent, rate },
      updatedId: targetKey,
      attended,
      excelPath: EXCEL_LOCAL_PATH,
    });
  } catch (error) {
    console.error("Attendance POST error:", error);
    return NextResponse.json({ error: "Failed to update attendance." }, { status: 500 });
  }
}
