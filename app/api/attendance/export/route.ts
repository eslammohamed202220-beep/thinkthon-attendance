import { fetchApplicants, generateExcelWorkbook } from "../../../../lib/attendance";

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
    console.error("Export error:", error);
    return new Response(JSON.stringify({ error: "Failed to export Excel" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
