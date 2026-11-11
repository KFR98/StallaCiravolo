"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

const AXIS = "var(--fg-3)";
const GRID = "var(--border)";
const tip = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--fg)" };

export function SalesTrendChart({ data }: { data: { day: string; stalla: number; governo: number }[] }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tick={{ fill: AXIS, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tip} formatter={(v) => "$" + Number(v ?? 0).toLocaleString("it-IT")} cursor={{ fill: "var(--surface-3)" }} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="stalla" name="Stalla" stackId="a" fill="var(--accent)" />
          <Bar dataKey="governo" name="Blip" stackId="a" fill="var(--fg-3)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EmployeeChart({ data }: { data: { name: string; incasso: number; catture: number; vendite: number }[] }) {
  return (
    <div className="w-full" style={{ height: Math.max(220, data.length * 44 + 60) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: AXIS, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fill: "var(--fg-2)", fontSize: 13 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tip} cursor={{ fill: "var(--surface-3)" }} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="incasso" name="Incasso $" fill="var(--accent)" />
          <Bar dataKey="catture" name="Catture" fill="var(--fg-3)" />
          <Bar dataKey="vendite" name="Vendite" fill="var(--warn-strong)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
