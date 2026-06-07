"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Participation } from "@/lib/types";

// NovaSpark accent palette: primary + supporting accent shades
const COLORS = [
  "#2563EB",
  "#b4c5ff",
  "#22C55E",
  "#F97316",
  "#38BDF8",
  "#C084FC",
  "#2DD4BF",
  "#FB923C",
];

interface Props {
  participation: Participation[];
}

export default function TalkTimeChart({ participation }: Props) {
  if (!participation || participation.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: "var(--text-3)" }}>
        No participation data yet.
      </p>
    );
  }

  const data = participation.map((p) => ({
    name: p.employeeName,
    pct:  Math.round(p.talkPct * 10) / 10,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 48)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 44, left: 0, bottom: 4 }}
        barCategoryGap="30%"
      >
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fill: "var(--text-3)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: "var(--text-2)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          contentStyle={{
            background:   "var(--bg-surface-high)",
            border:       "1px solid var(--border)",
            borderRadius: "0.625rem",
            color:        "var(--text-1)",
            fontSize:     "12px",
            padding:      "8px 12px",
          }}
          labelStyle={{ color: "var(--text-2)", marginBottom: 2 }}
          formatter={(val) => [`${val}%`, "Talk time"] as [string, string]}
        />
        <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
          {data.map((_entry, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
