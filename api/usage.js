import { setCorsHeaders } from './_lib/gemini.js'
import { getClientIp, logError } from './_lib/security.js'
import { getUsage } from './_lib/ratelimit.js'

export default async function handler(req, res) {
  setCorsHeaders(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { usage, you } = await getUsage(getClientIp(req))
    res.json({ success: true, usage, you })
  } catch (error) {
    logError('使用状況取得エラー', error)
    res.status(500).json({ success: false, error: '使用状況を取得できませんでした' })
  }
}
