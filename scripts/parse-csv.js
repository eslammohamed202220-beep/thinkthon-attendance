const fs = require('fs');

const csvPath = 'D:\\thinkthon_applications_rows (1).csv';
const content = fs.readFileSync(csvPath, 'utf-8');

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const row = [];
    let inQuotes = false;
    let field = '';
    
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(field);
        field = '';
      } else {
        field += char;
      }
    }
    row.push(field);

    const obj = {};
    headers.forEach((h, idx) => {
      let val = (row[idx] || '').trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      obj[h.trim()] = val;
    });
    results.push(obj);
  }
  return results;
}

const parsed = parseCSV(content);
console.log('Parsed rows:', parsed.length);

const formatted = parsed.map(r => ({
  id: r.id,
  name: r.name,
  student_id: r.student_id,
  email: r.email,
  phone: r.phone,
  batch: r.batch,
  major: r.major,
  linkedin: r.linkedin || ''
}));

fs.writeFileSync('D:\\SyncThon-Attendance\\data\\applicants-seed.json', JSON.stringify(formatted, null, 2), 'utf-8');
if (fs.existsSync('D:\\SyncThon\\data')) {
  fs.writeFileSync('D:\\SyncThon\\data\\applicants-seed.json', JSON.stringify(formatted, null, 2), 'utf-8');
}

console.log('SUCCESS: Written exactly', formatted.length, 'real Supabase rows to applicants-seed.json');
