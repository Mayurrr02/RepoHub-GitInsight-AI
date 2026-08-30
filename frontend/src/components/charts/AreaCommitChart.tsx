import React, { useState } from 'react';

export interface DataPoint {
  date: string;
  commits: number;
}

interface AreaCommitChartProps {
  data?: DataPoint[];
  height?: number;
}

export function AreaCommitChart({ data = [], height = 180 }: AreaCommitChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points: DataPoint[] = React.useMemo(() => {
    if (data && data.length > 0) return data;
    return [
      { date: 'Start', commits: 0 },
      { date: 'Today', commits: 0 },
    ];
  }, [data]);

  const maxVal = Math.max(...points.map((p) => p.commits), 10);
  const minVal = 0;
  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 28;
  const svgWidth = 600;
  const svgHeight = height;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const coordinates = points.map((p, i) => {
    const divisor = Math.max(1, points.length - 1);
    const x = paddingLeft + (i / divisor) * chartWidth;
    const y = paddingTop + chartHeight - ((p.commits - minVal) / (maxVal - minVal)) * chartHeight;
    return { x, y, date: p.date, commits: p.commits };
  });

  let pathD = `M ${coordinates[0].x},${coordinates[0].y}`;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const p0 = coordinates[i];
    const p1 = coordinates[i + 1];
    const midX = (p0.x + p1.x) / 2;
    pathD += ` C ${midX},${p0.y} ${midX},${p1.y} ${p1.x},${p1.y}`;
  }

  const areaD = `${pathD} L ${coordinates[coordinates.length - 1].x},${
    paddingTop + chartHeight
  } L ${coordinates[0].x},${paddingTop + chartHeight} Z`;

  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <div className="relative w-full overflow-hidden select-none">
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible">
        <defs>
          <linearGradient id="repoHubAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#6366F1" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y =
            paddingTop +
            chartHeight -
            ((tick - minVal) / (maxVal - minVal)) * chartHeight;
          return (
            <g key={tick}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={svgWidth - paddingRight}
                y2={y}
                className="stroke-slate-200 dark:stroke-[#182030]"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 8}
                y={y + 3}
                className="fill-slate-400 dark:fill-slate-500 font-mono text-[10px]"
                textAnchor="end"
              >
                {tick}
              </text>
            </g>
          );
        })}

        <path d={areaD} fill="url(#repoHubAreaGrad)" />

        <path
          d={pathD}
          fill="none"
          stroke="#8B5CF6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Date labels */}
        {coordinates.map((pt, i) => {
          const step = Math.max(1, Math.floor(coordinates.length / 5));
          if (i % step === 0 || i === coordinates.length - 1) {
            return (
              <text
                key={i}
                x={pt.x}
                y={svgHeight - 8}
                className="fill-slate-400 dark:fill-slate-500 text-[10px]"
                textAnchor="middle"
              >
                {pt.date}
              </text>
            );
          }
          return null;
        })}

        {/* Hover Nodes */}
        {coordinates.map((pt, i) => (
          <g key={i}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={hoverIndex === i ? 5 : 3}
              fill={hoverIndex === i ? '#ffffff' : '#8B5CF6'}
              stroke="#0D111A"
              strokeWidth="2"
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            />
            <circle
              cx={pt.x}
              cy={pt.y}
              r="12"
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          </g>
        ))}

        {hoverIndex !== null && (
          <g>
            <rect
              x={Math.max(10, Math.min(svgWidth - 100, coordinates[hoverIndex].x - 45))}
              y={Math.max(8, coordinates[hoverIndex].y - 32)}
              width="90"
              height="22"
              rx="6"
              className="fill-slate-900 stroke-brand-purple"
              strokeWidth="1"
            />
            <text
              x={Math.max(55, Math.min(svgWidth - 55, coordinates[hoverIndex].x))}
              y={Math.max(22, coordinates[hoverIndex].y - 17)}
              fill="#ffffff"
              fontSize="10"
              fontWeight="bold"
              textAnchor="middle"
              className="font-mono"
            >
              {coordinates[hoverIndex].commits} commits
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
