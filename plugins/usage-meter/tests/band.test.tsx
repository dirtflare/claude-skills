import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-meter',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, columns: 100 },
} as const

test('shows remaining usage and toggles, on every surface', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'usage-meter' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 200000 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-11-08T00:00:00Z' },
      { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-11-05T05:00:00Z' },
    ],
    changed: ['rateLimits'],
  } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    expect((await ui.find({ type: 'Text', text: /残り76.5%/ }))).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /残り60%/ }))).toBeTruthy()
    await ui.press({ key: 'hide' } as never)
    expect((await ui.find({ type: 'Text', text: /残り60%/ }))).toBeFalsy()
    await ui.press({ key: 'show' } as never)
    expect((await ui.find({ type: 'Text', text: /残り60%/ }))).toBeTruthy()
    await ui.unmount()
  }

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const pane = await $.ui.mount({
      plugin: 'usage-meter', component: 'Pane', requestId: 'usage-meter', surface,
      props: { title: '残り使用量', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 10 }, view: {} },
    } as never)
    expect((await pane.find({ type: 'Text', text: /残り60%/ }))).toBeTruthy()
    await pane.unmount()
  }
})
