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

async function draw($: EngineInterface, e: RenderInput<'AbovePrompt' | 'Pane'>) {
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
    <Box flexDirection="row" flexWrap="wrap" gap={2}>
      {list.length === 0 ? (
        <Text dimColor>残り使用量: 最初の応答のあとに表示されます</Text>
      ) : (
        list.map(l => {
          const remaining = remainingOf(l)
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
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => toLimits(e.rateLimits))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.component === 'AbovePrompt' && e.props.hasSurvey) return next(e)
    return draw($, e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => draw($, e))
}
