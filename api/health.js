import { setCorsHeaders } from './_lib/gemini.js'

export default function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  res.json({ status: 'ok', version: '3.4-vercel' })
}
