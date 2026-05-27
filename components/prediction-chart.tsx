"use client"

import { useMemo } from "react"

export interface PredictionChartPoint {
  date: string
  timestamp: number
  actual: number | null
  predicted: number | null
}

export interface AnomalyPoint {
  timestamp: number
  type: string
  value: number
  expected: number
  severity: "low" | "medium" | "high"
  description: string
}

interface Props {
  data: PredictionChartPoint[]
  minStock: number
  anomalies?: AnomalyPoint[]
}

const WIDTH = 760
const HEIGHT = 320
const PADDING = { top: 16, right: 16, bottom: 36, left: 40 }

const SEVERITY_COLOR: Record<string, string> = {
  high: "#ef4444",
  medium: "#f97316",
  low: "#eab308",
}

export default function PredictionChart({ data, minStock, anomalies = [] }: Props) {
  const geometry = useMemo(() => {
    if (data.length === 0) return null

    const values = data
      .flatMap((d) => [d.actual, d.predicted])
      .filter((v): v is number => v !== null && !Number.isNaN(v))
    const maxVal = Math.max(...values, minStock, 1)
    const minVal = Math.min(...values, 0)
    const yPad = (maxVal - minVal) * 0.1 || 1
    const yMax = maxVal + yPad
    const yMin = Math.max(0, minVal - yPad)

    const innerW = WIDTH - PADDING.left - PADDING.right
    const innerH = HEIGHT - PADDING.top - PADDING.bottom

    const xAt = (i: number) =>
      PADDING.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
    const yAt = (v: number) =>
      PADDING.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH

    const buildPath = (key: "actual" | "predicted") => {
      const segments: string[] = []
      let pen: "M" | "L" = "M"
      data.forEach((d, i) => {
        const val = d[key]
        if (val === null || Number.isNaN(val)) {
          pen = "M"
          return
        }
        segments.push(`${pen} ${xAt(i).toFixed(1)} ${yAt(val).toFixed(1)}`)
        pen = "L"
      })
      return segments.join(" ")
    }

    const ticks = 5
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
      const v = yMin + ((yMax - yMin) * i) / ticks
      return { value: v, y: yAt(v) }
    })

    const labelStep = Math.max(1, Math.ceil(data.length / 8))
    const xLabels = data
      .map((d, i) => ({ i, label: d.date, x: xAt(i) }))
      .filter((_, i) => i % labelStep === 0 || i === data.length - 1)

    const anomalyMarkers = anomalies
      .map((a) => {
        const idx = data.findIndex((d) => Math.abs(d.timestamp - a.timestamp) < 86400000 * 1.5)
        if (idx === -1) return null
        const d = data[idx]
        const val = d.actual ?? d.predicted
        if (val === null) return null
        return {
          x: xAt(idx),
          y: yAt(val),
          color: SEVERITY_COLOR[a.severity] ?? "#ef4444",
          description: a.description,
          date: d.date,
        }
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)

    return {
      actualPath: buildPath("actual"),
      predictedPath: buildPath("predicted"),
      points: data.map((d, i) => ({
        x: xAt(i),
        actualY: d.actual !== null ? yAt(d.actual) : null,
        predictedY: d.predicted !== null ? yAt(d.predicted) : null,
        date: d.date,
        actual: d.actual,
        predicted: d.predicted,
      })),
      yTicks,
      xLabels,
      minStockY: yAt(minStock),
      innerH,
      anomalyMarkers,
    }
  }, [data, minStock, anomalies])

  if (!geometry) {
    return (
      <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">
        Tidak ada data untuk ditampilkan.
      </div>
    )
  }

  const { actualPath, predictedPath, points, yTicks, xLabels, minStockY, anomalyMarkers } = geometry

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-[320px]"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Grafik prediksi stok"
      >
        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={t.y}
              y2={t.y}
              stroke="currentColor"
              className="text-border/50"
              strokeDasharray="3 3"
            />
            <text
              x={PADDING.left - 6}
              y={t.y + 4}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize="10"
            >
              {t.value.toFixed(0)}
            </text>
          </g>
        ))}

        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={minStockY}
          y2={minStockY}
          stroke="#f59e0b"
          strokeDasharray="4 4"
          strokeWidth={1.2}
        />
        <text
          x={WIDTH - PADDING.right}
          y={minStockY - 4}
          textAnchor="end"
          fontSize="10"
          fill="#f59e0b"
        >
          Min Stok ({minStock})
        </text>

        {xLabels.map((l) => (
          <text
            key={`x-${l.i}`}
            x={l.x}
            y={HEIGHT - PADDING.bottom + 16}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
          >
            {l.label}
          </text>
        ))}

        {actualPath && (
          <path
            d={actualPath}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {predictedPath && (
          <path
            d={predictedPath}
            fill="none"
            stroke="#16a34a"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {points.map((p, i) => (
          <g key={`pt-${i}`}>
            {p.actualY !== null && (
              <circle cx={p.x} cy={p.actualY} r={3} fill="#2563eb">
                <title>{`${p.date} · historis: ${p.actual}`}</title>
              </circle>
            )}
            {p.predictedY !== null && (
              <circle cx={p.x} cy={p.predictedY} r={2.5} fill="#16a34a">
                <title>{`${p.date} · prediksi: ${p.predicted?.toFixed(2)}`}</title>
              </circle>
            )}
          </g>
        ))}

        {anomalyMarkers.map((m, i) => (
          <g key={`anomaly-${i}`}>
            <circle cx={m.x} cy={m.y} r={7} fill={m.color} opacity={0.2} />
            <circle cx={m.x} cy={m.y} r={4} fill={m.color}>
              <title>{`${m.date} · ${m.description}`}</title>
            </circle>
          </g>
        ))}
      </svg>

      <div className="flex items-center gap-4 justify-center text-xs text-muted-foreground mt-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 bg-[#2563eb]" /> Historis
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-[#16a34a]" /> Prediksi
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-[#f59e0b]" /> Min Stok
        </span>
        {anomalyMarkers.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ef4444]" /> Anomali
          </span>
        )}
      </div>
    </div>
  )
}
