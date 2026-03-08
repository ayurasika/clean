import { setCorsHeaders } from './_lib/gemini.js'

export default function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  // サーバーレスでは永続カウンタがないため、ダミー応答
  res.json({
    success: true,
    usage: {
      flash: { used: 0, limit: 50 },
      pro: { used: 0, limit: 10 },
      inspection: { used: 0, limit: 100 },
      retry: { used: 0, limit: 50 },
    },
  })
}
