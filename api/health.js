import { setCorsHeaders } from './_lib/gemini.js'

export default function handler(req, res) {
  setCorsHeaders(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  res.json({ status: 'ok', version: '3.5-vercel' })
}
