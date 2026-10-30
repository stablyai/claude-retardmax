import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// Stands for the engine beneath the mod: records the effort each step sends.
const engine = (on: On) => {
  const sent: Record<string, string | number | undefined> = {}
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('turn.step', async function* (_, e) {
    sent[`${e.agentId ?? 'main'}:${e.index}`] = e.effort
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  return sent
}

const turn = async ($: Engine, text: string, turnId: string) => {
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text, turnId })
  for await (const _ of $.turn.step({ turnId, index: 0, model: 'opus', effort: 'high', messageCount: 1 }));
  await $.turn.start({ text: 'sub', turnId: `${turnId}-a`, agentId: `${turnId}-agent` })
  for await (const _ of $.turn.step({ turnId: `${turnId}-a`, index: 0, model: 'opus', effort: 'high', messageCount: 1, agentId: `${turnId}-agent` }));
  await $.turn.complete({ turnId, answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
  for await (const _ of $.turn.step({ turnId: `${turnId}-a`, index: 1, model: 'opus', effort: 'high', messageCount: 3, agentId: `${turnId}-agent` }));
}

test('retardmax lowers the turn and the agents it starts', async ($, on) => {
  const sent = engine(on)

  await turn($, 'fix it, RetardMax', 't1')

  expect(sent).toEqual({ 'main:0': 'low', 't1-agent:0': 'low', 't1-agent:1': 'low' })
})

test('a prompt without the keyword keeps its effort', async ($, on) => {
  const sent = engine(on)

  await turn($, 'retardmax please', 't1')
  await turn($, 'now think properly', 't2')

  expect(sent['main:0']).toBe('high')
  expect(sent['t2-agent:0']).toBe('high')
  // The first turn's agent keeps running low after its turn ended.
  expect(sent['t1-agent:1']).toBe('low')
})

test('a quoted mention keeps its effort', async ($, on) => {
  const sent = engine(on)

  await turn($, 'what does "retardmax" do?', 't1')

  expect(sent['main:0']).toBe('high')
})
