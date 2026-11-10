"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

const INK = "#5b4632";
const GRID = "rgba(90,58,34,.18)";
const tooltipStyle = { background: "#f1e4c6", border: "1px solid #b89a66", borderRadius: 3, fontFamily: "EB Garamond, serif" };

export function SalesTrendChart({ data }: { data: { day: string; stalla: number; governo: number }[] }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tick={{ fill: INK, fontSize: 12 }} axisLine={{ stroke: INK }} tickLine={false} />
          <YAxis tick={{ fill: INK, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => "$" + Number(v ?? 0).toLocaleString("it-IT")} cursor={{ fill: "rgba(214,178,94,.15)" }} />
          <Legend wrapperStyle={{ fontFamily: "IM Fell English SC, serif", fontSize: 13 }} />
          <Bar dataKey="stalla" name="Stalla" stackId="a" fill="#6b4428" />
          <Bar dataKey="governo" name="Governo" stackId="a" fill="#a8823a" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EmployeeChart({ data }: { data: { name: string; incasso: number; catture: number; vendite: number }[] }) {
  return (
    <div className="w-full" style={{ height: Math.max(220, data.length * 42 + 60) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: INK, fontSize: 12 }} axisLine={{ stroke: INK }} tickLine={false} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fill: INK, fontSize: 13 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(214,178,94,.15)" }} />
          <Legend wrapperStyle={{ fontFamily: "IM Fell English SC, serif", fontSize: 13 }} />
          <Bar dataKey="incasso" name="Incasso $" fill="#6b4428" />
          <Bar dataKey="catture" name="Catture" fill="#a8823a" />
          <Bar dataKey="vendite" name="Vendite" fill="#55703f" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
