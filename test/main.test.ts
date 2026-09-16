import {expect, test} from 'bun:test'

const {default: antimono} = await import('#src/main.ts')

test('should run', () => {
  const result = antimono()
  expect(result).toBe('antimono') // TODO Test actual functionality
})
