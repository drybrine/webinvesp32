export function buildCsv(rows: unknown[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? "" : String(cell)
          return `"${value.replace(/"/g, '""')}"`
        })
        .join(","),
    )
    .join("\n")
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
