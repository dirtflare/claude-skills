import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit } from 'claude-code'

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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const stored = await $.store.get(OPEN_KEY)
    if (typeof stored === 'boolean') await update($, isOpen, () => stored)
    const usage = await $.session.usage()
    await update($, limits, () => toLimits(usage.rateLimits))
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => toLimits(e.rateLimits))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const open = await read($, isOpen)
    const toggle = async () => {
      const value = await update($, isOpen, v => !v)
      await $.store.set(OPEN_KEY, value)
    }

    if (!open) {
      return (
        <Box>
          <Button key="show" label="▸ 残り使用量" onPress={toggle} />
        </Box>
      )
    }

    const list = await read($, limits)

    return (
      <Box flexDirection="row" gap={2}>
        {list.length === 0 ? (
          <Text dimColor>残り使用量: 最初の応答のあとに表示されます</Text>
        ) : (
          list.map(l => {
            const remaining = Math.max(0, Math.round((100 - l.percentUsed) * 10) / 10)
            const reset = formatReset(l.resetsAt, l.kind)
            return (
              <Text key={l.kind}>
                <Text bold>{LABELS[l.kind]}</Text> <Text color={color(remaining)}>{bar(remaining)} 残り{remaining}%</Text>
                {reset ? <Text dimColor> ({reset})</Text> : null}
              </Text>
            )
          })
        )}
        <Button key="hide" label="隠す" onPress={toggle} />
      </Box>
    )
  })
}
