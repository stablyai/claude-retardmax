# retardmax

A Claude Code mod that works the opposite way to `ultrathink`. Put the word `retardmax` anywhere in a prompt and that turn runs at the **lowest reasoning effort** (`low`). Every subagent started during the turn also runs at `low`, for as long as it keeps running.

While you type, the word is spelled `rEtArDmAx`, with a letter or two glitching to the wrong case, turns into an animated rainbow and a dim *Minimal reasoning requested for this turn* note appears above the prompt. A quoted mention (`"retardmax"`, `'retardmax'`, `` `retardmax` ``) triggers nothing, and neither does the word inside a bigger one (`google.com/retardmax`, `retardmax-ish`): the same as with `ultrathink`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install retardmax --marketplace stablyai/claude-retardmax
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install retardmax --marketplace stablyai/claude-retardmax
```

The repository is private: you need read access to it, and a git credential for github.com on your machine (`gh auth login` then `gh auth setup-git`).

## How it works

- `prompt.submit` checks for the keyword (case-insensitive, whole word) and arms the next main turn.
- `turn.start` marks that turn, plus every subagent whose loop starts while it runs.
- `turn.step` rewrites `effort` to `low` on each model request of a marked loop. A model that takes no effort setting is left alone.
- The case changes every 4 frames, and only after you have stopped typing for 300 ms, since it rewrites the draft.
- `prompt.edit` and a 90 ms `$.clock.every` repaint the keyword as a drunk rainbow: hues slosh and hiccup, and a lopsided bold/italic wave makes the letters bob.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
