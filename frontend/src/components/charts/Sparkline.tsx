import React from 'react';

interface SparklineProps {
  data: number[];
  color?: 'purple' | 'emerald' | 'blue' | 'cyan' | 'amber' | 'rose';
  width?: number;
  height?: number;
}

const PALETTE = {
  purple: {
    stroke: '#8B5CF6',
    gradientStart: 'rgba(139, 92, 246, 0.35)',
    gradientEnd: 'rgba(139, 92, 246, 0.0)',
    glow: 'rgba(139, 92, 246, 0.4)',
  },
  emerald: {
    stroke: '#10B981',
    gradientStart: 'rgba(16, 185, 129, 0.35)',
    gradientEnd: 'rgba(16, 185, 129, 0.0)',
    glow: 'rgba(16, 185, 129, 0.4)',
  },
  blue: {
    stroke: '#3B82F6',
    gradientStart: 'rgba(59, 130, 246, 0.35)',
    gradientEnd: 'rgba(59, 130, 246, 0.0)',
    glow: 'rgba(59, 130, 246, 0.4)',
  },
  cyan: {
    stroke: '#06B6D4',
    gradientStart: 'rgba(6, 182, 212, 0.35)',
    gradientEnd: 'rgba(6, 182, 212, 0.0)',
    glow: 'rgba(6, 182, 212, 0.4)',
  },
  amber: {
    stroke: '#F59E0B',
    gradientStart: 'rgba(245, 158, 11, 0.35)',
    gradientEnd: 'rgba(245, 158, 11, 0.0)',
    glow: 'rgba(245, 158, 11, 0.4)',
  },
  rose: {
    stroke: '#F43F5E',
    gradientStart: 'rgba(244, 63, 94, 0.35)',
    gradientEnd: 'rgba(244, 63, 94, 0.0)',
    glow: 'rgba(244, 63, 94, 0.4)',
  },
};

export function Sparkline({
  data,
  color = 'purple',
  width = 110,
  height = 32,
}: SparklineProps) {
  const values = data && data.length >= 2 ? data : [0, 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const paddingY = 3;
  const usableHeight = height - paddingY * 2;

  const points = values.map((val, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - paddingY - ((val - min) / range) * usableHeight;
    return { x, y };
  });

  // Smooth bezier curve
  let pathD = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    pathD += ` C ${midX},${p0.y} ${midX},${p1.y} ${p1.x},${p1.y}`;
  }

  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;
  const cfg = PALETTE[color] || PALETTE.purple;
  const id = `spark-${color}-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <div className="relative inline-flex items-center">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={cfg.gradientStart} />
            <stop offset="100%" stopColor={cfg.gradientEnd} />
          </linearGradient>
        </defs>

        <path d={areaD} fill={`url(#${id})`} />
        <path
          d={pathD}
          fill="none"
          stroke={cfg.stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="2.5"
          fill={cfg.stroke}
        />
      </svg>
    </div>
  );
}
