import { describe, expect, it } from 'vitest'
import { sanitizeModes } from './controlStore'

describe('sanitizeModes', () => {
  it('keeps valid saved modes', () => {
    expect(sanitizeModes({ padMode: 'mute', keyMode: 'step' })).toEqual({
      padMode: 'mute',
      keyMode: 'step',
    })
  })

  it('falls back to Trigger / Play notes for missing or unknown values', () => {
    expect(sanitizeModes(null)).toEqual({ padMode: 'trigger', keyMode: 'play' })
    expect(sanitizeModes({ padMode: 'bogus', keyMode: 7 })).toEqual({
      padMode: 'trigger',
      keyMode: 'play',
    })
  })
})
