import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ChartTooltip } from '../../../components';

interface DayData {
  idx: number;
  label: string;
  avgRpe: number;
}

interface TeamRPEChartProps {
  data: DayData[];
}

export function TeamRPEChart({ data }: TeamRPEChartProps) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} barSize={28}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
        <XAxis
          dataKey="idx"
          tickFormatter={(idx) => data[idx]?.label ?? ''}
          tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false}
        />
        <YAxis domain={[0, 10]} tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} width={24} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="avgRpe" fill="#00E5A0" radius={[4, 4, 0, 0]} fillOpacity={0.85} name="RPE moy." />
      </BarChart>
    </ResponsiveContainer>
  );
}
