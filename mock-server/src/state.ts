import { randomBytes } from 'crypto'

export function generateState(): string {
  return randomBytes(16).toString('hex')
}
