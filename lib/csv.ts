function escapeCsvCell(cell: unknown): string {
  const value = cell === null || cell === undefined ? "" : String(cell)
  const safe = /^[=+\-@\t\r]/.test(value) ? `\t${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function buildCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")
}

export function downloadCsv(filename: string, rows: unknown[][]): void {
  const blob = new Blob([`\uFEFF${buildCsv(rows)}`], {
    type: "text/csv;charset=utf-8;",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.style.display = "none"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
