import React, { useState } from 'react';

export interface LanguageSlice {
  name: string;
  percent: number;
  color: string;
  bytes?: number;
}

interface LanguageDonutChartProps {
  data?: LanguageSlice[];
  totalLabel?: string;
}

export function LanguageDonutChart({
  data = [],
  totalLabel = 'Languages',
}: LanguageDonutChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const radius = 60;
  const strokeWidth = 14;
  const center = 75;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;
  const slices = data.map((slice, index) => {
    const strokeDasharray = `${(slice.percent / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
    accumulatedPercent += slice.percent;
    return {
      ...slice,
      strokeDasharray,
      strokeDashoffset,
      index,
    };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 h-full w-full">
      {/* Donut Circle */}
      <div className="relative flex items-center justify-center shrink-0">
        <svg width="150" height="150" viewBox="0 0 150 150" className="transform -rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            className="stroke-slate-200 dark:stroke-[#141A26]"
            strokeWidth={strokeWidth}
          />

          {slices.map((slice) => {
            const isHovered = activeIndex === slice.index;
            return (
              <circle
                key={slice.name}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
                strokeDasharray={slice.strokeDasharray}
                strokeDashoffset={slice.strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setActiveIndex(slice.index)}
                onMouseLeave={() => setActiveIndex(null)}
                style={{
                  filter: isHovered ? `drop-shadow(0 0 6px ${slice.color})` : 'none',
                }}
              />
            );
          })}
        </svg>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center select-none">
          <span className="text-base font-bold text-slate-900 dark:text-white tracking-tight font-mono">
            {activeIndex !== null ? `${data[activeIndex].percent}%` : totalLabel}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight max-w-[70px] truncate">
            {activeIndex !== null ? data[activeIndex].name : 'Distribution'}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 w-full space-y-1.5 select-none">
        {data.map((item, idx) => {
          const isHovered = activeIndex === idx;
          return (
            <div
              key={item.name}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(null)}
              className={`flex items-center justify-between text-xs py-1 px-2 rounded-lg transition-colors cursor-pointer ${
                isHovered
                  ? 'bg-slate-100 dark:bg-slate-800/60 font-semibold'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-xs shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className={isHovered ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}>
                  {item.name}
                </span>
              </div>
              <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                {item.percent}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
