import { handlePreflightAndValidation, callGemini, extractImage } from '../_lib/gemini.js'
import { validateImage, getClientIp, friendlyUpstreamError, GENERIC_SERVER_ERROR, logError } from '../_lib/security.js'
import { tryConsume, LIMIT_MESSAGES } from '../_lib/ratelimit.js'

export default async function handler(req, res) {
  if (handlePreflightAndValidation(req, res)) return

  try {
    const image = validateImage(req.body.imageBase64)
    if (!image.ok) {
      return res.status(image.status).json({ error: image.error })
    }
    const base64Data = image.data

    // 画像生成（Flash）として数える
    const limit = await tryConsume({ tier: 'flash', ip: getClientIp(req), ipBucket: 'image' })
    if (!limit.ok) {
      return res.status(429).json({ error: LIMIT_MESSAGES[limit.reason], code: 'DAILY_LIMIT' })
    }

    const inpaintPrompt = `Clean up this room. Remove all clutter and mess from the floor and surfaces. Keep furniture in place. Restore the original floor and wall textures where items are removed.`

    const response = await callGemini('gemini-3.1-flash-image', {
      contents: [
        {
          parts: [
            { text: inpaintPrompt },
            { inlineData: { mimeType: image.mimeType, data: base64Data } },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['Image', 'Text'],
        temperature: 0.3,
      },
    })

    if (!response.ok) {
      console.error(`Inpainting Gemini API エラー: HTTP ${response.status}`)
      const f = friendlyUpstreamError(response.status)
      return res.status(f.status).json({ error: f.error })
    }

    const data = await response.json()
    const generatedImageBase64 = extractImage(data)

    if (!generatedImageBase64) {
      return res.status(500).json({ error: 'Inpainting 画像の生成に失敗しました' })
    }

    res.json({
      success: true,
      imageBase64: generatedImageBase64,
      imageUrl: `data:image/png;base64,${generatedImageBase64}`,
    })
  } catch (error) {
    logError('Inpainting サーバーエラー', error)
    res.status(500).json({ error: GENERIC_SERVER_ERROR })
  }
}
