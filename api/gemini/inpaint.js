import { handlePreflightAndValidation, callGemini, extractImage } from '../_lib/gemini.js'

export default async function handler(req, res) {
  if (handlePreflightAndValidation(req, res)) return

  try {
    const { imageBase64 } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    const inpaintPrompt = `Clean up this room. Remove all clutter and mess from the floor and surfaces. Keep furniture in place. Restore the original floor and wall textures where items are removed.`

    const response = await callGemini('gemini-2.5-flash-image', {
      contents: [
        {
          parts: [
            { text: inpaintPrompt },
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['Image', 'Text'],
        temperature: 0.3,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini Inpainting API エラー',
      })
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
    console.error('Gemini Inpainting サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
}
