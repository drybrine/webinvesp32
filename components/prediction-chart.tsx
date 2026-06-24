"use client"

import { useMemo, useState } from "react"

export interface PredictionChartPoint {
  date: string
  timestamp: number
  actual: number | null
  predicted: number | null
}

interface Props {
  data: PredictionChartPoint[]
  minStock: number
}

const WIDTH = 760
const HEIGHT = 360
const PADDING = { top: 24, right: 24, bottom: 48, left: 52 }

function formatValue(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-"
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function buildStatus(value: number | null, minStock: number): { label: string; color: string } {
  if (value === null) return { label: "-", color: "hsl(150 8% 50%)" }
  if (value <= 0) return { label: "Habis", color: "hsl(0 72% 51%)" }
  if (value < minStock) return { label: "Di bawah minimum", color: "hsl(38 78% 50%)" }
  return { label: "Aman", color: "hsl(152 38% 38%)" }
}

// Opposed-line smoothing helper for cubic Bezier control points
function getControlPoint(
  current: [number, number],
  prev: [number, number],
  next: [number, number],
  isReverse: boolean
): [number, number] {
  const p = prev || current
  const n = next || current
  const smoothing = 0.15 // Tension factor (0.15 works well for line charts)

  const dx = n[0] - p[0]
  const dy = n[1] - p[1]

  const angle = Math.atan2(dy, dx)
  const length = Math.sqrt(dx * dx + dy * dy) * smoothing

  const x = current[0] + Math.cos(angle + (isReverse ? Math.PI : 0)) * length
  const y = current[1] + Math.sin(angle + (isReverse ? Math.PI : 0)) * length

  return [x, y]
}

export default function PredictionChart({ data, minStock }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

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
    const chartBottom = PADDING.top + innerH

    const xAt = (i: number) =>
      PADDING.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
    const yAt = (v: number) =>
      PADDING.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH

    // Generates smooth Bezier path line and closed area under the line
    const buildBezierPaths = (key: "actual" | "predicted") => {
      // Find contiguous segments of non-null values
      const segments: { x: number; y: number }[][] = []
      let currentSegment: { x: number; y: number }[] = []

      data.forEach((d, i) => {
        const val = d[key]
        if (val === null || Number.isNaN(val)) {
          if (currentSegment.length > 0) {
            segments.push(currentSegment)
            currentSegment = []
          }
        } else {
          currentSegment.push({ x: xAt(i), y: yAt(val) })
        }
      })
      if (currentSegment.length > 0) {
        segments.push(currentSegment)
      }

      const linePaths: string[] = []
      const areaPaths: string[] = []

      segments.forEach((seg) => {
        if (seg.length === 0) return
        if (seg.length === 1) {
          linePaths.push(`M ${seg[0].x.toFixed(1)} ${seg[0].y.toFixed(1)}`)
          return
        }

        // 1. Generate line path using Cubic Bezier
        let linePath = `M ${seg[0].x.toFixed(1)} ${seg[0].y.toFixed(1)}`
        for (let i = 0; i < seg.length - 1; i++) {
          const current = seg[i]
          const next = seg[i + 1]

          const prev = seg[i - 1] || current
          const nextNext = seg[i + 2] || next

          const cp1 = getControlPoint(
            [current.x, current.y],
            [prev.x, prev.y],
            [next.x, next.y],
            false
          )
          const cp2 = getControlPoint(
            [next.x, next.y],
            [current.x, current.y],
            [nextNext.x, nextNext.y],
            true
          )

          linePath += ` C ${cp1[0].toFixed(1)} ${cp1[1].toFixed(1)}, ${cp2[0].toFixed(1)} ${cp2[1].toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`
        }
        linePaths.push(linePath)

        // 2. Generate closed area path for gradient fill
        const firstX = seg[0].x.toFixed(1)
        const lastX = seg[seg.length - 1].x.toFixed(1)
        const areaPath = `${linePath} L ${lastX} ${chartBottom.toFixed(1)} L ${firstX} ${chartBottom.toFixed(1)} Z`
        areaPaths.push(areaPath)
      })

      return {
        linePath: linePaths.filter(Boolean).join(" "),
        areaPath: areaPaths.filter(Boolean).join(" "),
      }
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

    const forecastStartIndex = data.findIndex((d) => d.predicted !== null && !Number.isNaN(d.predicted))
    const forecastStartX = forecastStartIndex >= 0 ? xAt(forecastStartIndex) : null
    const actualCount = data.filter((d) => d.actual !== null && !Number.isNaN(d.actual)).length
    const forecastCount = data.filter((d) => d.predicted !== null && !Number.isNaN(d.predicted)).length
    const minVisibleValue = Math.min(...values, minStock)
    const maxVisibleValue = Math.max(...values, minStock)

    const hitWidth = Math.max(14, innerW / Math.max(1, data.length))
    const { linePath: actualPath, areaPath: actualAreaPath } = buildBezierPaths("actual")
    const { linePath: predictedPath, areaPath: predictedAreaPath } = buildBezierPaths("predicted")

    return {
      actualPath,
      actualAreaPath,
      predictedPath,
      predictedAreaPath,
      points: data.map((d, i) => ({
        index: i,
        x: xAt(i),
        actualY: d.actual !== null ? yAt(d.actual) : null,
        predictedY: d.predicted !== null ? yAt(d.predicted) : null,
        y: d.actual !== null ? yAt(d.actual) : d.predicted !== null ? yAt(d.predicted) : null,
        date: d.date,
        timestamp: d.timestamp,
        actual: d.actual,
        predicted: d.predicted,
        value: d.actual ?? d.predicted,
        type: d.actual !== null ? "Historis" : "Prediksi",
      })),
      yTicks,
      xLabels,
      minStockY: yAt(minStock),
      innerH,
      chartBottom,
      forecastStartX,
      forecastStartIndex,
      actualCount,
      forecastCount,
      hitWidth,
      minVisibleValue,
      maxVisibleValue,
    }
  }, [data, minStock])

  if (!geometry) {
    return (
      <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">
        Tidak ada data untuk ditampilkan.
      </div>
    )
  }

  const {
    actualPath,
    actualAreaPath,
    predictedPath,
    predictedAreaPath,
    points,
    yTicks,
    xLabels,
    minStockY,
    chartBottom,
    forecastStartX,
    forecastStartIndex,
    actualCount,
    forecastCount,
    hitWidth,
    minVisibleValue,
    maxVisibleValue,
  } = geometry
  const activePoint = activeIndex !== null ? points[activeIndex] : null
  const activeY = activePoint?.y ?? null
  const activeValue = activePoint?.value ?? null
  const activeStatus = buildStatus(activeValue, minStock)
  const tooltipW = 156
  const tooltipH = 78
  const tooltipX = activePoint
    ? activePoint.x + tooltipW + 12 > WIDTH - PADDING.right
      ? activePoint.x - tooltipW - 12
      : activePoint.x + 12
    : 0
  const tooltipY = activeY === null
    ? 0
    : Math.max(PADDING.top, Math.min(chartBottom - tooltipH, activeY - tooltipH / 2))

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-[360px]"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Grafik prediksi stok"
        onPointerLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id="actualAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(152 32% 38%)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(152 32% 38%)" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="predictedAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(158 28% 48%)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="hsl(158 28% 48%)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Min Stock Danger Zone Highlight */}
        <rect
          x={PADDING.left}
          y={minStockY}
          width={WIDTH - PADDING.left - PADDING.right}
          height={Math.max(0, chartBottom - minStockY)}
          fill="hsl(38 78% 50%)"
          opacity={0.06}
        />

        {/* Forecast Area Highlight */}
        {forecastStartX !== null && (
          <>
            <rect
              x={forecastStartX}
              y={PADDING.top}
              width={WIDTH - PADDING.right - forecastStartX}
              height={chartBottom - PADDING.top}
              fill="hsl(152 38% 38%)"
              opacity={0.04}
            />
            <line
              x1={forecastStartX}
              x2={forecastStartX}
              y1={PADDING.top}
              y2={chartBottom}
              stroke="hsl(152 38% 38%)"
              strokeDasharray="4 4"
              strokeWidth={1}
              opacity={0.6}
            />
            <text
              x={Math.min(WIDTH - PADDING.right - 4, forecastStartX + 6)}
              y={PADDING.top + 13}
              fontSize="10"
              fill="hsl(152 38% 38%)"
            >
              Forecast
            </text>
          </>
        )}

        {/* Faded Area Gradients under Curves */}
        {actualAreaPath && (
          <path
            d={actualAreaPath}
            fill="url(#actualAreaGradient)"
            pointerEvents="none"
          />
        )}
        {predictedAreaPath && (
          <path
            d={predictedAreaPath}
            fill="url(#predictedAreaGradient)"
            pointerEvents="none"
          />
        )}

        {/* Y Grid Ticks */}
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

        {/* Axes */}
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={chartBottom}
          y2={chartBottom}
          stroke="currentColor"
          className="text-border"
        />
        <line
          x1={PADDING.left}
          x2={PADDING.left}
          y1={PADDING.top}
          y2={chartBottom}
          stroke="currentColor"
          className="text-border"
        />

        {/* Min Stock Dotted Line */}
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={minStockY}
          y2={minStockY}
          stroke="hsl(38 78% 50%)"
          strokeDasharray="4 4"
          strokeWidth={1.2}
        />
        <text
          x={WIDTH - PADDING.right}
          y={minStockY - 4}
          textAnchor="end"
          fontSize="10"
          fill="hsl(38 78% 50%)"
        >
          Min Stok ({minStock})
        </text>

        {/* X Axis Labels */}
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

        {/* Axes Titles */}
        <text
          x={PADDING.left}
          y={HEIGHT - 8}
          textAnchor="start"
          className="fill-muted-foreground"
          fontSize="10"
        >
          Tanggal
        </text>
        <text
          x={12}
          y={PADDING.top + 4}
          textAnchor="start"
          className="fill-muted-foreground"
          fontSize="10"
        >
          Stok
        </text>

        {/* Smooth Curves */}
        {actualPath && (
          <path
            d={actualPath}
            fill="none"
            stroke="hsl(152 32% 38%)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {predictedPath && (
          <path
            d={predictedPath}
            fill="none"
            stroke="hsl(158 28% 48%)"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Individual Points on the curve */}
        {points.map((p, i) => (
          <g key={`pt-${i}`}>
            {p.actualY !== null && (
              <circle cx={p.x} cy={p.actualY} r={3.2} fill="hsl(152 32% 38%)">
                <title>{`${p.date} · historis: ${p.actual}`}</title>
              </circle>
            )}
            {p.predictedY !== null && (
              <circle cx={p.x} cy={p.predictedY} r={3} fill="hsl(158 28% 48%)">
                <title>{`${p.date} · prediksi: ${p.predicted?.toFixed(2)}`}</title>
              </circle>
            )}
          </g>
        ))}

        {/* Interactive Hit Areas */}
        {points.map((p) => (
          <rect
            key={`hit-${p.index}`}
            x={p.x - hitWidth / 2}
            y={PADDING.top}
            width={hitWidth}
            height={chartBottom - PADDING.top}
            fill="transparent"
            onPointerEnter={() => setActiveIndex(p.index)}
            onPointerMove={() => setActiveIndex(p.index)}
            tabIndex={0}
            role="button"
            aria-label={`${p.date} ${p.type} ${formatValue(p.value)}`}
            onFocus={() => setActiveIndex(p.index)}
            onBlur={() => setActiveIndex(null)}
          />
        ))}

        {/* Tooltip Overlay */}
        {activePoint && activeY !== null && (
          <g pointerEvents="none">
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={PADDING.top}
              y2={chartBottom}
              stroke="hsl(150 8% 50%)"
              strokeDasharray="3 3"
              opacity={0.6}
            />
            <circle
              cx={activePoint.x}
              cy={activeY}
              r={5}
              fill={activePoint.actual !== null ? "hsl(152 32% 38%)" : "hsl(158 28% 48%)"}
              stroke="white"
              strokeWidth={2}
            />
            <g transform={`translate(${tooltipX}, ${tooltipY})`}>
              <rect
                width={tooltipW}
                height={tooltipH}
                rx={8}
                className="fill-card stroke-border"
                strokeWidth={1}
              />
              <text x={10} y={18} className="fill-foreground" fontSize="11" fontWeight={600}>
                {activePoint.date}
              </text>
              <text x={10} y={36} className="fill-muted-foreground" fontSize="10">
                {activePoint.type}: {formatValue(activeValue)}
              </text>
              <text x={10} y={52} className="fill-muted-foreground" fontSize="10">
                Min stok: {formatValue(minStock)}
              </text>
              <text x={10} y={68} fill={activeStatus.color} fontSize="10" fontWeight={600}>
                Status: {activeStatus.label}
              </text>
            </g>
          </g>
        )}
      </svg>

      {/* Legends */}
      <div className="flex items-center gap-4 justify-center text-xs text-muted-foreground mt-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 rounded-full" style={{ background: "hsl(152 32% 38%)" }} /> Historis
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed rounded-full" style={{ borderColor: "hsl(158 28% 48%)" }} /> Prediksi
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed" style={{ borderColor: "hsl(38 78% 50%)" }} /> Min Stok
        </span>
        {forecastStartIndex >= 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border" style={{ background: "hsl(152 38% 38% / 0.1)", borderColor: "hsl(152 38% 38% / 0.2)" }} /> Area Forecast
          </span>
        )}
      </div>

      {/* Meta Stats Panel */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="rounded-md border bg-muted/20 px-3 py-2">
          <div className="text-muted-foreground">Titik historis</div>
          <div className="font-semibold text-foreground">{actualCount}</div>
        </div>
        <div className="rounded-md border bg-muted/20 px-3 py-2">
          <div className="text-muted-foreground">Titik forecast</div>
          <div className="font-semibold text-foreground">{forecastCount}</div>
        </div>
        <div className="rounded-md border bg-muted/20 px-3 py-2">
          <div className="text-muted-foreground">Rentang stok</div>
          <div className="font-semibold text-foreground">
            {formatValue(minVisibleValue)} - {formatValue(maxVisibleValue)}
          </div>
        </div>
        <div className="rounded-md border bg-muted/20 px-3 py-2">
          <div className="text-muted-foreground">Batas minimum</div>
          <div className="font-semibold text-foreground">{formatValue(minStock)}</div>
        </div>
      </div>
    </div>
  )
}
