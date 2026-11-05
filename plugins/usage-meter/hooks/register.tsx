import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, SessionRateLimit } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'usage-meter', key: 'limits' } as const, [] as Limit[])
const isOpen = atom({ plugin: 'usage-meter', key: 'isOpen' } as const, true)

const OPEN_KEY = 'isOpen'

const LABELS: Record<string, string> = {
  five_hour: '5時間',
  seven_day: '週間',
}

const pad = (n: number) => String(n).padStart(2, '0')

const formatReset = (iso: string | undefined, kind: string): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return kind === 'five_hour' ? `${time}にリセット` : `${d.getMonth() + 1}/${d.getDate()} ${time}にリセット`
}

const bar = (remaining: number, width = 10): string => {
  const filled = Math.max(0, Math.min(width, Math.round((remaining / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const color = (remaining: number) => (remaining <= 10 ? 'red' : remaining <= 30 ? 'yellow' : 'green')

const toLimits = (list: SessionRateLimit[]): Limit[] =>
  list
    .filter(l => l.kind in LABELS)
    .sort((a, b) => Object.keys(LABELS).indexOf(a.kind) - Object.keys(LABELS).indexOf(b.kind))
    .map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))

const PANE = 'usage-meter'
const PANE_TITLE = '残り使用量'

const remainingOf = (l: Limit) => Math.max(0, Math.round((100 - l.percentUsed) * 10) / 10)

const describe = (list: Limit[]): string =>
  list.length === 0
    ? 'まだ数値がありません (最初の応答のあとに届きます)'
    : list
        .map(l => {
          const reset = formatReset(l.resetsAt, l.kind)
          return `${LABELS[l.kind]}: 残り${remainingOf(l)}%${reset ? ` (${reset})` : ''}`
        })
        .join(' / ')

// "あと4時間50分" / "あと2日2時間" / "あと12分"
function untilReset(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - now
  if (Number.isNaN(ms) || ms <= 0) return ''
  const min = Math.floor(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `あと${d}日${h}時間`
  if (h > 0) return `あと${h}時間${m}分`
  return `あと${m}分`
}

async function draw($: EngineInterface, e: RenderInput<'AbovePrompt' | 'Pane'>) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const open = await read($, isOpen)
  const toggle = async () => {
    const value = await update($, isOpen, v => !v)
    await $.store.set(OPEN_KEY, value)
  }

  if (!open) {
    return (
      <Box flexDirection="row" justifyContent="flex-end">
        <Button key="show" plain dimColor label="▸ 残り使用量" onPress={toggle} />
      </Box>
    )
  }

  const list = await read($, limits)
  const now = await $.clock.now()

  return (
    <Box flexDirection="row" flexWrap="nowrap" alignItems="center" justifyContent="space-between" gap={2}>
      <Box flexDirection="row" flexWrap="nowrap" flexShrink={1} gap={3}>
        {list.length === 0 ? (
          <Text dimColor wrap="truncate">残り使用量: 最初の応答のあとに表示されます</Text>
        ) : (
          list.map(l => {
            const remaining = remainingOf(l)
            const left = untilReset(l.resetsAt, now)
            return (
              <Text key={l.kind} wrap="truncate">
                <Text bold>{LABELS[l.kind]}</Text> <Text color={color(remaining)}>{bar(remaining, 8)} 残り{remaining}%</Text>
                {left ? <Text dimColor> {left}</Text> : null}
              </Text>
            )
          })
        )}
      </Box>
      <Button key="hide" plain dimColor label="隠す" onPress={toggle} />
    </Box>
  )
}

const THRESHOLDS = [50, 30, 10]

// Posts a notice in the conversation when a window's remaining share first
// drops below 50%, 30% or 10%: once per threshold per window (resetsAt).
async function notifyThresholds($: EngineInterface, list: Limit[]) {
  for (const l of list) {
    const remaining = remainingOf(l)
    const level = THRESHOLDS.filter(t => remaining < t).length
    if (level === 0) continue
    const key = `notified:${l.kind}`
    const stored = (await $.store.get(key)) as { resetsAt?: string; level?: number } | undefined
    const last = stored && stored.resetsAt === l.resetsAt ? (stored.level ?? 0) : 0
    if (level <= last) continue
    await $.store.set(key, { resetsAt: l.resetsAt, level })
    const reset = formatReset(l.resetsAt, l.kind)
    const mark = level >= 3 ? '🔴' : level === 2 ? '🟡' : '🔵'
    await $.session.append({
      message: {
        type: 'system',
        content: [
          { type: 'text', text: `${mark} ${LABELS[l.kind]}の残り使用量が${THRESHOLDS[level - 1]}%を切りました: 残り${remaining}%${reset ? ` (${reset})` : ''}` },
        ],
      },
    })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'usage-meter',
      description: '5時間・週間の残り使用量を表示 (ペインを開く)',
    })
    const stored = await $.store.get(OPEN_KEY)
    if (typeof stored === 'boolean') await update($, isOpen, () => stored)
    const usage = await $.session.usage()
    await update($, limits, () => toLimits(usage.rateLimits))
    void $.ui.open({ id: PANE, title: PANE_TITLE })
    return result
  })

  on('command.run', { command: 'usage-meter' }, async $ => {
    const usage = await $.session.usage()
    const list = toLimits(usage.rateLimits)
    await update($, limits, () => list)
    await update($, isOpen, () => true)
    await $.store.set(OPEN_KEY, true)
    const { isPlaced } = await $.ui.open({ id: PANE, title: PANE_TITLE })
    const surfaces = (await $.session.surfaces()).join(', ') || 'なし'
    return {
      text: `${describe(list)}\n(表示先: ${surfaces} / ペイン${isPlaced ? '表示中' : '未表示'} / 受信した枠: ${usage.rateLimits.map(l => l.kind).join(', ') || 'なし'})`,
    }
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('rateLimits')) {
      const list = toLimits(e.rateLimits)
      await update($, limits, () => list)
      await notifyThresholds($, list)
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.component === 'AbovePrompt' && e.props.hasSurvey) return next(e)
    return draw($, e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => draw($, e))
}
