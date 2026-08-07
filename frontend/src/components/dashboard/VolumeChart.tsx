'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CardWatermark } from '@/components/ui/card-watermark'
import { Icons } from '@/components/ui/icons'

interface VolumeChartProps {
  data: { date: string; count: number }[]
}

// Split into its own chunk (dynamic-imported from page.tsx) since recharts
// is a genuinely heavy dependency not needed for first paint.
export default function VolumeChart({ data }: VolumeChartProps) {
  const total = data.reduce((acc, d) => acc + d.count, 0)

  return (
    <Card className='relative overflow-hidden'>
      <CardWatermark opacity={4} scale={1.2} />
      <CardHeader className='pb-2'>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Icons.activity className='h-5 w-5 text-brand-cornflower' strokeWidth={1.5} />
              Ticket Volume
            </CardTitle>
            <p className='mt-1 text-sm text-muted-foreground'>Tickets entering the pipeline per day</p>
          </div>
          <div className='text-right'>
            <p className='text-micro uppercase text-brand-muted'>Total</p>
            <p className='font-display text-lg font-bold text-brand-navy'>{total.toLocaleString()}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className='pt-0'>
        <div className='mt-4 h-[240px] w-full'>
          {data.length === 0 ? (
            <div className='flex h-full items-center justify-center text-sm text-muted-foreground'>
              No ticket volume data yet
            </div>
          ) : (
            <ResponsiveContainer width='100%' height='100%'>
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id='gradientVolume' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0%' stopColor='#5B8DEF' stopOpacity={0.4} />
                    <stop offset='95%' stopColor='#5B8DEF' stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray='3 3' stroke='rgba(20, 26, 66, 0.06)' vertical={false} />
                <XAxis
                  dataKey='date'
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#7B8AB8', fontSize: 11, fontWeight: 500 }}
                  dy={8}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#7B8AB8', fontSize: 11 }} />
                <Tooltip />
                <Area
                  type='monotone'
                  dataKey='count'
                  name='Tickets'
                  stroke='#5B8DEF'
                  strokeWidth={2.5}
                  fill='url(#gradientVolume)'
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
