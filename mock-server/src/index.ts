import { createApp } from './app'
import { startRefreshLoop } from './refresh'

const clientId = process.env.SLACK_CLIENT_ID
const clientSecret = process.env.SLACK_CLIENT_SECRET
const PORT = 3000

if (!clientId || !clientSecret) {
  console.error(
    'Error: SLACK_CLIENT_ID and SLACK_CLIENT_SECRET environment variables are required.'
  )
  process.exit(1)
}

createApp(clientId, clientSecret).listen(PORT, () => {
  console.log(`Mock server running at http://localhost:${PORT}`)
  startRefreshLoop()
})
