from pathlib import Path
path = Path('index.html')
text = path.read_text(encoding='utf-8')
old = "  const csv=rows.map(r=>r.map(x=>'\"'+String(x??'').replace(/\"/g,'\"\"')+'\"').join(',')).join('\\n');\\n  downloadText(`dev_text_check_${new Date().toISOString().slice(0,10)}.csv`,'\\uFEFF'+csv,'text/csv;charset=utf-8');"
new = "  const csv=rows.map(r=>r.map(x=>'\"'+String(x??'').replace(/\"/g,'\"\"')+'\"').join(',')).join('\\n');\n  downloadText(`dev_text_check_${new Date().toISOString().slice(0,10)}.csv`,'\\uFEFF'+csv,'text/csv;charset=utf-8');"
if old not in text:
    raise SystemExit('old text not found')
path.write_text(text.replace(old, new), encoding='utf-8')
print('patched')
