import { useMemo } from "react";
import { courses, sections, fmtPct, scaleLinear } from "@kit";

type Props = Record<string, string>;

export default function GradeTimeScatter(props: Props) {
  const markType = props.markType ?? "points";
  const scope = props.scope ?? "all";

  const data = useMemo(() => {
    const points: Array<{
      code: string;
      time: number;
      aRate: number;
      enrollment: number;
    }> = [];

    for (const course of courses) {
      // Filter by scope
      if (scope === "cs" && course.dept !== "CS") continue;
      if (scope === "remaining" && !course.attributes?.some(a => a !== "cs-core" && a !== "cs-elective" && a !== "math-core" && a !== "gen-ed")) continue;

      // Get sections for this course
      const courseSections = sections.filter((s) => s.course === course.code);
      if (courseSections.length === 0) continue;

      // Check if any section is open
      if (scope === "open") {
        const hasOpen = courseSections.some((s) => s.enrolled < s.capacity);
        if (!hasOpen) continue;
      }

      // Calculate A-grade rate
      const grades = course.grades;
      const total = grades.A + grades.B + grades.C + grades.D + grades.F;
      if (total === 0) continue;
      const aRate = grades.A / total;

      // Get earliest start time for this course (in minutes after midnight)
      const earliestStart = Math.min(...courseSections.map((s) => s.meeting.start));

      // Get total enrollment
      const enrollment = courseSections.reduce((sum, s) => sum + s.enrolled, 0);

      points.push({
        code: course.code,
        time: earliestStart,
        aRate: aRate,
        enrollment: enrollment,
      });
    }

    return points.sort((a, b) => a.time - b.time);
  }, [scope]);

  // SVG dimensions
  const width = 600;
  const height = 400;
  const padding = { top: 40, right: 40, bottom: 40, left: 60 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Scales
  const xScale = scaleLinear([0, 24 * 60], [padding.left, width - padding.right]);
  const yScale = scaleLinear([0, 1], [height - padding.bottom, padding.top]);
  const sizeScale = scaleLinear(
    [Math.min(...data.map((d) => d.enrollment)), Math.max(...data.map((d) => d.enrollment)) || 30],
    [3, 12]
  );

  // Calculate trend line if needed
  let trendPoints: Array<[number, number]> = [];
  if (markType === "trend" && data.length > 1) {
    const n = data.length;
    const sumX = data.reduce((s, d) => s + d.time, 0);
    const sumY = data.reduce((s, d) => s + d.aRate, 0);
    const sumXY = data.reduce((s, d) => s + d.time * d.aRate, 0);
    const sumX2 = data.reduce((s, d) => s + d.time * d.time, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const minTime = Math.min(...data.map((d) => d.time));
    const maxTime = Math.max(...data.map((d) => d.time));
    trendPoints = [
      [minTime, slope * minTime + intercept],
      [maxTime, slope * maxTime + intercept],
    ];
  }

  // Convert minutes to time of day (e.g., "9:30 AM")
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const ampm = hours < 12 ? "AM" : "PM";
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHours}:${mins.toString().padStart(2, "0")} ${ampm}`;
  };

  return (
    <figure className="vbg-chart">
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: "600px" }}
        role="img"
        aria-label="Scatter plot of A-grade percentage by class start time"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line
            key={`h-${pct}`}
            x1={padding.left}
            x2={width - padding.right}
            y1={yScale(pct)}
            y2={yScale(pct)}
            stroke="var(--vbg-border-subtle)"
            strokeWidth="1"
          />
        ))}

        {/* X-axis */}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          stroke="var(--vbg-border-default)"
          strokeWidth="1"
        />

        {/* Y-axis */}
        <line
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
          stroke="var(--vbg-border-default)"
          strokeWidth="1"
        />

        {/* X-axis tick labels */}
        {[0, 6, 12, 18, 24].map((hour) => {
          const x = xScale(hour * 60);
          const label = hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
          return (
            <g key={`x-tick-${hour}`}>
              <line x1={x} x2={x} y1={height - padding.bottom} y2={height - padding.bottom + 4} stroke="var(--vbg-border-default)" strokeWidth="1" />
              <text x={x} y={height - padding.bottom + 16} textAnchor="middle" className="vbg-meta" style={{ fill: "var(--vbg-text-secondary)" }}>
                {label}
              </text>
            </g>
          );
        })}

        {/* Y-axis tick labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = yScale(pct);
          return (
            <g key={`y-tick-${pct}`}>
              <line x1={padding.left - 4} x2={padding.left} y1={y} y2={y} stroke="var(--vbg-border-default)" strokeWidth="1" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="vbg-meta" style={{ fill: "var(--vbg-text-secondary)" }}>
                {fmtPct(pct)}
              </text>
            </g>
          );
        })}

        {/* Trend line */}
        {markType === "trend" && trendPoints.length === 2 && (
          <line
            x1={xScale(trendPoints[0][0])}
            y1={yScale(Math.max(0, Math.min(1, trendPoints[0][1])))}
            x2={xScale(trendPoints[1][0])}
            y2={yScale(Math.max(0, Math.min(1, trendPoints[1][1])))}
            stroke="var(--vbg-chart-1)"
            strokeWidth="2"
            strokeDasharray="4,4"
            opacity="0.6"
          />
        )}

        {/* Data points */}
        {data.map((d) => {
          const x = xScale(d.time);
          const y = yScale(d.aRate);
          const size = markType === "bubble" ? sizeScale(d.enrollment) : 5;
          return (
            <g key={d.code}>
              <circle
                cx={x}
                cy={y}
                r={size}
                fill="var(--vbg-chart-1)"
                opacity="0.7"
                style={{ cursor: "pointer" }}
              />
              {data.length <= 15 && (
                <text
                  x={x}
                  y={y - size - 4}
                  textAnchor="middle"
                  className="vbg-meta"
                  style={{ fill: "var(--vbg-text-secondary)" }}
                  fontSize="10"
                >
                  {d.code}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="vbg-caption">
        Each point represents one course, plotted by when it starts (x-axis) and the percentage of students who earned an A (y-axis).
        {markType === "bubble" && " Circle size represents total enrollment."}
        {markType === "trend" && " The dashed line shows the trend across all courses."}
        {data.length === 0 && " No courses match the current filter."}
      </figcaption>
    </figure>
  );
}