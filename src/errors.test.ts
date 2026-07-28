import { describe, expect, test } from 'bun:test'
import { BackendServerError, shouldSkipBackendError } from './errors'

describe('shouldSkipBackendError', () => {
  test('skips a backend outage when display_errors is off', () => {
    expect(shouldSkipBackendError(new BackendServerError('down'), false)).toBe(
      true
    )
  })

  test('does not skip a backend outage when display_errors is on', () => {
    expect(shouldSkipBackendError(new BackendServerError('down'), true)).toBe(
      false
    )
  })

  test('does not skip a non-backend error regardless of display_errors', () => {
    expect(shouldSkipBackendError(new Error('boom'), false)).toBe(false)
    expect(shouldSkipBackendError(new Error('boom'), true)).toBe(false)
  })

  test('does not skip a non-Error value', () => {
    expect(shouldSkipBackendError('not an error', false)).toBe(false)
  })
})
