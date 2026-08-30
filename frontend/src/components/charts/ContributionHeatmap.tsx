import React, { useState } from 'react';

interface ContributionDay {
  date: string;
  commits: number;
}

interface ContributionHeatmapProps {
  data?: ContributionDay[];
}

export function ContributionHeatmap({ data = [] }: ContributionHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  const weeksCount = 16;
  const daysPerWeek = 7;

  const dataMap = React.useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((d) => map.set(d.date, d.commits));
    return map;
  }, [data]);

  const grid = React.useMemo(() => {
    const today = new Date();
    const cells: { date: string; count: number; dayOfWeek: number; month: string }[][] = [];

    for (let w = 0; w < weeksCount; w++) {
      const week: { date: string; count: number; dayOfWeek: number; month: string }[] = [];
      for (let d = 0; d < daysPerWeek; d++) {
        const offset = (weeksCount - 1 - w) * 7 + (6 - d);
        const dateObj = new Date(today);
        dateObj.setDate(today.getDate() - offset);

        const isoDate = dateObj.toISOString().slice(0, 10);
        const monthName = dateObj.toLocaleString('default', { month: 'short' });
        const count = dataMap.get(isoDate) || 0;

        week.push({
          date: isoDate,
          count,
          dayOfWeek: d,
          month: monthName,
        });
      }
      cells.push(week);
    }
    return cells;
  }, [dataMap]);

  const getCellBg = (count: number) => {
    if (count === 0) return 'bg-slate-200/80 hover:bg-slate-300 dark:bg-[#121826] dark:hover:bg-[#1c2436]';
    if (count <= 2) return 'bg-emerald-200 hover:bg-emerald-300 dark:bg-[#064e3b] dark:hover:bg-[#065f46]';
    if (count <= 5) return 'bg-emerald-400 hover:bg-emerald-500 dark:bg-[#047857] dark:hover:bg-[#059669]';
    if (count <= 9) return 'bg-emerald-500 hover:bg-emerald-600 dark:bg-[#10b981] dark:hover:bg-[#34d399]';
    return 'bg-emerald-600 hover:bg-emerald-700 dark:bg-[#34d399] dark:hover:bg-[#6ee7b7] shadow-xs shadow-emerald-500/40';
  };

  return (
    <div className="relative flex flex-col justify-between h-full w-full">
      {/* Month Labels */}
      <div className="flex justify-between pl-7 pr-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2 select-none">
        <span>3 Months Ago</span>
        <span>2 Months Ago</span>
        <span>1 Month Ago</span>
        <span>Today</span>
      </div>

      {/* Matrix Grid */}
      <div className="flex gap-1.5 items-center">
        <div className="flex flex-col justify-between h-[112px] text-[10px] font-medium text-slate-500 dark:text-slate-400 select-none pr-1">
          <span>Mon</span>
          <span>Wed</span>
          <span>Fri</span>
        </div>

        <div className="flex-1 flex gap-1.5 justify-between">
          {grid.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1.5">
              {week.map((cell, dIdx) => (
                <div
                  key={`${wIdx}-${dIdx}`}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredCell({
                      date: cell.date,
                      count: cell.count,
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                    });
                  }}
                  onMouseLeave={() => setHoveredCell(null)}
                  className={`w-3.5 h-3.5 rounded-xs transition-colors duration-150 cursor-pointer ${getCellBg(
                    cell.count
                  )}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-end gap-2 text-[11px] text-slate-500 dark:text-slate-400 select-none">
        <span>Less</span>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-xs bg-slate-200 dark:bg-[#121826]" />
          <div className="w-2.5 h-2.5 rounded-xs bg-emerald-200 dark:bg-[#064e3b]" />
          <div className="w-2.5 h-2.5 rounded-xs bg-emerald-400 dark:bg-[#047857]" />
          <div className="w-2.5 h-2.5 rounded-xs bg-emerald-500 dark:bg-[#10b981]" />
          <div className="w-2.5 h-2.5 rounded-xs bg-emerald-600 dark:bg-[#34d399]" />
        </div>
        <span>More</span>
      </div>

      {hoveredCell && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700 text-[11px] text-white shadow-xl shadow-black/80 whitespace-nowrap"
          style={{ left: hoveredCell.x, top: hoveredCell.y - 6 }}
        >
          <strong className="text-emerald-400">{hoveredCell.count} commits</strong> on {hoveredCell.date}
        </div>
      )}
    </div>
  );
}
