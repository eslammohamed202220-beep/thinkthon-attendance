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
    const firstCount = applicants.filter((a) => a.attended_first).length;
    const lastCount = applicants.filter((a) => a.attended_last).length;

    await generateExcelWorkbook(applicants, EXCEL_LOCAL_PATH);
    await generateExcelWorkbook(applicants, EXCEL_BACKUP_PATH);

    return NextResponse.json({
      success: true,
      stats: {
        total,
        attended_first: firstCount,
        attended_last: lastCount,
        attended: firstCount,
        absent: total - firstCount,
        rate: total > 0 ? Math.round((firstCount / total) * 100) : 0,
      },
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
    const { id, studentId, type = "first", attended, time } = body;
    const targetKey = id || studentId;

    if (!targetKey || typeof attended !== "boolean") {
      return NextResponse.json(
        { error: "Target student ID and attended boolean are required." },
        { status: 400 }
      );
    }

    const updatedApplicants = await toggleAttendance(targetKey, type as "first" | "last", attended, time);
    const total = updatedApplicants.length;
    const firstCount = updatedApplicants.filter((a) => a.attended_first).length;
    const lastCount = updatedApplicants.filter((a) => a.attended_last).length;

    return NextResponse.json({
      success: true,
      stats: {
        total,
        attended_first: firstCount,
        attended_last: lastCount,
        attended: firstCount,
        absent: total - firstCount,
        rate: total > 0 ? Math.round((firstCount / total) * 100) : 0,
      },
      updatedId: targetKey,
      type,
      attended,
      time,
      excelPath: EXCEL_LOCAL_PATH,
    });
  } catch (error) {
    console.error("Attendance POST error:", error);
    return NextResponse.json({ error: "Failed to update attendance." }, { status: 500 });
  }
}
