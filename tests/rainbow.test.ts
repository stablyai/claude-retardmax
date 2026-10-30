import { expect, test } from 'claude-code/testing'
import type { PromptEditInput, PromptEditResult } from 'claude-code'

// The kit raises prompt.edit as the composer does; its noun types leave it off.
type Edit = (e: PromptEditInput) => Promise<PromptEditResult>

test('typing the last letter colours every letter of the word', async ($, on) => {
  on('prompt.edit', (_, e) => ({
    text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end),
    cursor: e.start + e.inputText.length,
  }))
  on('clock.every', () => ({ value: undefined }))

  const text = 'go retardma'
  const box = await ($.prompt as unknown as { edit: Edit }).edit({
    origin: { kind: 'composer' },
    text, cursor: text.length, start: text.length, end: text.length, inputText: 'x',
  })

  const painted = (box.decorations ?? []).map(d => [d.start, d.end])
  expect(painted).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => [i, i + 1]))
  expect(new Set((box.decorations ?? []).map(d => d.color)).size).toBeGreaterThan(4)
  expect((box.decorations ?? []).some(d => d.underline)).toBe(false)
})

test('every hue is a six-digit hex colour', async ($, on) => {
  on('prompt.edit', (_, e) => ({ text: e.text + e.inputText, cursor: e.cursor + 1 }))
  on('clock.every', () => ({ value: undefined }))

  const edit = ($.prompt as unknown as { edit: Edit }).edit
  const box = await edit({ origin: { kind: 'composer' }, text: 'retardma', cursor: 8, start: 8, end: 8, inputText: 'x' })

  for (const d of box.decorations ?? []) expect(d.color).toMatch(/^#[0-9a-f]{6}$/)
})

test('a quoted mention is neither painted nor armed', async ($, on) => {
  on('prompt.edit', (_, e) => ({ text: e.text + e.inputText, cursor: e.cursor + 1 }))
  on('clock.every', () => ({ value: undefined }))

  const edit = ($.prompt as unknown as { edit: Edit }).edit
  const typed = async (text: string) =>
    (await edit({ origin: { kind: 'composer' }, text, cursor: text.length, start: text.length, end: text.length, inputText: ' ' })).decorations ?? []

  expect(await typed('how "retardmax" works')).toEqual([])
  expect(await typed('the `retardmax` keyword')).toEqual([])
  expect(await typed("it's 'retardmax' here")).toEqual([])
  expect((await typed('mismatched "retardmax\' quotes')).length).toBe(9)
  expect((await typed('"retardmax and')).length).toBe(9)
  expect((await typed('say "retardmax" then retardmax')).map(d => d.start)).toEqual(
    [21, 22, 23, 24, 25, 26, 27, 28, 29],
  )
})
