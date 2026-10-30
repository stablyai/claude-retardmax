import { atom, read, update } from 'claude-code'
import type { PromptBox, PromptDecoration, PromptFillArgs, PromptPaintArgs, Register, Timer } from 'claude-code'

// The word on its own, as ultrathink's: after the start, a space, an opening
// bracket or a quote; before the end, a space, punctuation, a closing bracket
// or a quote. `google.com/retardmax` and `retardmax-ish` are not uses.
const KEYWORD = /(?<=^|[\s([{"'`\u201c\u2018])retardmax(?=$|[\s.,!?;:)\]}"'`\u201d\u2019])/gi
const EFFORT = 'low'
const FRAME_MS = 90
// The case changes every CASE_FRAMES frames, and only once the person has
// paused for IDLE_MS: it rewrites the draft, which a keystroke could cross.
const CASE_FRAMES = 4
const IDLE_MS = 300
const NOTE = 'Minimal reasoning requested for this turn'

// Quote pairs that mention the word rather than use it, as ultrathink's.
const QUOTES: Record<string, string> = { '"': '"', "'": "'", '`': '`', '\u201c': '\u201d', '\u2018': '\u2019' }

const isDrafted = atom({ plugin: 'retardmax', key: 'isDrafted' } as const, false)

// The keyword's uses in `text`: every match but one wrapped in a quote pair.
const uses = (text: string) =>
  [...text.matchAll(KEYWORD)].filter(match => {
    const before = text[match.index - 1]
    const after = text[match.index + match[0].length]
    return before === undefined || QUOTES[before] === undefined || QUOTES[before] !== after
  })

const hasKeyword = (text: string) => uses(text).length > 0

// Glitchy spongebob: every use spelled rEtArDmAx, but one or two letters
// flip to the wrong case, others each `caseFrame`. The same length, so
// offsets and the caret stand.
const recase = (text: string, caseFrame: number) =>
  uses(text).reduce((out, match) => {
    const n = match[0].length
    const g1 = Math.floor(hash(caseFrame, 601) * n)
    const g2 = hash(caseFrame, 602) < 0.5 ? Math.floor(hash(caseFrame, 603) * n) : -1
    const word = [...match[0]]
      .map((c, i) => ((i % 2 === 1) !== (i === g1 || i === g2) ? c.toUpperCase() : c.toLowerCase()))
      .join('')
    return out.slice(0, match.index) + word + out.slice(match.index + n)
  }, text)

// What one animation frame reaches through `$`, spelled at the hook's call site.
type Io = {
  read: () => Promise<PromptBox>
  paint: (args: PromptPaintArgs) => Promise<unknown>
  fill: (args: PromptFillArgs) => Promise<unknown>
}

// Drunk rainbow with a derpy bounce: the hue sloshes on layered sines, the
// gaps between letters wobble and now and then hiccup, while a lopsided wave
// rolls through, its crest bold and its slope italic, so the letters bob.
const derp = (i: number, frame: number): Omit<PromptDecoration, 'start' | 'end'> => {
  const slosh = Math.sin(frame * 0.11) * 140 + Math.sin(frame * 0.037) * 220
  const spacing = i * (25 + 30 * Math.sin(frame * 0.07 + i * 1.3))
  const hiccup = hash(frame >> 2, i) < 0.12 ? 160 : 0
  const jitter = (hash(frame, i) - 0.5) * 30
  const wave = Math.sin(frame * 0.35 - i * 0.9 + Math.sin(frame * 0.05) * 2)
  const isUp = wave > 0.45
  const lightness = 0.6 + 0.08 * Math.sin(frame * 0.3 + i) + (isUp ? 0.1 : 0)
  return {
    color: hsl(slosh + spacing + hiccup + jitter, 0.95, lightness),
    bold: isUp,
    italic: wave > -0.1 && wave < 0.6,
  }
}

const rainbow = (text: string, frame: number): PromptDecoration[] =>
  uses(text).flatMap(match =>
    [...match[0]].map((_, i) => ({
      start: match.index + i,
      end: match.index + i + 1,
      ...derp(i, frame),
    })),
  )

// A number from 0 to 1 that looks random but is fixed by its two inputs.
const hash = (a: number, b: number) => {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)
  x ^= x >>> 15
  x = Math.imul(x, 0x2c1b3c6d)
  x ^= x >>> 12
  x = Math.imul(x, 0x297a2d39)
  x ^= x >>> 15
  return (x >>> 0) / 4294967296
}

// Hue in degrees, saturation and lightness 0 to 1, as `#rrggbb`.
const hsl = (hue: number, saturation: number, lightness: number) => {
  const h = ((hue % 360) + 360) % 360
  const a = saturation * Math.min(lightness, 1 - lightness)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const v = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(v * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export const register: Register = on => {
  // Set by the prompt hooks, read by the animation, which runs while it holds.
  // Started from the prompt, not session.start: a mod loaded mid-session
  // never sees that.
  let isLit = false
  let ticker: Timer | undefined
  let phase = 0
  let editedAt = 0

  // Effort: armed by the prompt, held by its main turn and the agents it starts.
  let isArmed = false
  let isMainLow = false
  const lowAgents = new Set<string>()

  // The note above the prompt, written only when it flips.
  let isNoted: boolean | undefined

  const stop = () => {
    isLit = false
    ticker?.cancel()
    ticker = undefined
  }

  // Repaints the colours every frame; on a case frame, with the person idle,
  // rewrites the draft with the new casing and its colours in one write.
  const frame = async (io: Io) => {
    const { text, cursor } = await io.read()
    if (!isLit || !hasKeyword(text)) return stop()
    phase += 1
    const recased = recase(text, Math.floor(phase / CASE_FRAMES))
    const isIdle = performance.now() - editedAt > IDLE_MS
    if (recased !== text && isIdle) {
      await io.fill({ text: recased, mode: 'replace', cursor, decorations: rainbow(recased, phase) })
    } else {
      await io.paint({ text, decorations: rainbow(text, phase) })
    }
  }

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isDrafted))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box justifyContent="flex-end" width={e.props.bodyColumns}>
        <Text dimColor>{NOTE}</Text>
      </Box>
    )
  })

  // Paint on the keystroke itself so the word never flashes uncoloured.
  on('prompt.edit', async ($, e, next) => {
    editedAt = performance.now()
    const typed = await next(e)
    const box = { ...typed, text: recase(typed.text, Math.floor(phase / CASE_FRAMES)) }
    isLit = hasKeyword(box.text)
    if (isNoted !== isLit) {
      isNoted = isLit
      await update($, isDrafted, () => isLit)
    }
    if (!isLit) return box
    ticker ??= $.clock.every(FRAME_MS, () =>
      frame({
        read: () => $.prompt.read(),
        paint: args => $.prompt.paint(args),
        fill: args => $.prompt.fill(args),
      }),
    )
    return {
      ...box,
      decorations: [...(box.decorations ?? []), ...rainbow(box.text, phase)],
    }
  })

  // History recall, a paste through fill: no edit carried it.
  on('prompt.change', async ($, e, next) => {
    isLit = hasKeyword(e.text)
    if (isNoted !== isLit) {
      isNoted = isLit
      await update($, isDrafted, () => isLit)
    }
    if (isLit) {
      ticker ??= $.clock.every(FRAME_MS, () =>
        frame({
          read: () => $.prompt.read(),
          paint: args => $.prompt.paint(args),
          fill: args => $.prompt.fill(args),
        }),
      )
    }
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    if (e.command === undefined && hasKeyword(e.text)) isArmed = true
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      isMainLow = isArmed
      isArmed = false
    } else if (isMainLow) {
      lowAgents.add(e.agentId)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const isLow = e.agentId === undefined ? isMainLow : lowAgents.has(e.agentId)
    // A model without effort carries none; leave it so.
    if (!isLow || e.effort === undefined) return yield* next(e)
    return yield* next({ ...e, effort: EFFORT })
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId !== undefined) {
      lowAgents.delete(e.agentId)
    } else {
      isMainLow = false
    }
    return next(e)
  })
}
