import { NextRequest } from "next/server";
import { fetchApplicants, generateExcelWorkbook, Applicant } from "../../../../lib/attendance";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { applicants?: Applicant[] };
    const applicants = Array.isArray(body.applicants) && body.applicants.length > 0
      ? body.applicants
      : await fetchApplicants();

    const buffer = await generateExcelWorkbook(applicants);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="SyncThon.xlsx"',
      },
    });
  } catch (error) {
    console.error("Export POST error:", error);
    return new Response(JSON.stringify({ error: "Failed to export Excel" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET() {
  try {
    const applicants = await fetchApplicants();
    const buffer = await generateExcelWorkbook(applicants);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="SyncThon.xlsx"',
      },
    });
  } catch (error) {
    console.error("Export GET error:", error);
    return new Response(JSON.stringify({ error: "Failed to export Excel" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
