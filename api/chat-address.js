import { readFileSync } from 'fs'
import { resolve } from 'path'
import { handlePreflightAndValidation, callGemini } from './_lib/gemini.js'

export default async function handler(req, res) {
  if (handlePreflightAndValidation(req, res)) return

  try {
    const { imageBase64, itemName, category, messages } = req.body

    if (!itemName) {
      return res.status(400).json({ error: 'itemName は必須です' })
    }

    const base64Data = imageBase64 ? imageBase64.replace(/^data:image\/[a-z]+;base64,/, '') : null

    // プロンプトファイルから思考フレームワークを読み込む
    let basePrompt
    try {
      const promptPath = resolve(process.cwd(), 'prompts/address-chat.md')
      basePrompt = readFileSync(promptPath, 'utf-8')
    } catch (e) {
      console.warn('⚠️ prompts/address-chat.md が見つかりません。デフォルトプロンプトを使用します')
      basePrompt = 'あなたは片付けアドバイザーです。アイテムの置き場所を一緒に考えてください。'
    }

    const systemInstruction = `${basePrompt}

## 今回のアイテム
- 名前: ${itemName}
- カテゴリ: ${category || '不明'}`

    // 会話履歴を構築（Gemini APIはuserロールから始まる必要がある）
    const contents = []

    const initialParts = [
      { text: `この部屋の写真を見て、「${itemName}」の住所（定位置）を一緒に決めたいです。まず最初の提案やヒアリングをお願いします。` },
    ]
    if (base64Data) {
      initialParts.push({
        inlineData: { mimeType: 'image/jpeg', data: base64Data },
      })
    }
    contents.push({ role: 'user', parts: initialParts })

    if (messages && messages.length > 0) {
      for (const msg of messages) {
        contents.push({
          role: msg.role === 'ai' ? 'model' : 'user',
          parts: [{ text: msg.text }],
        })
      }
    }

    const response = await callGemini('gemini-2.0-flash', {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 300,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini API エラー',
      })
    }

    const data = await response.json()
    let replyText = ''
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.text) replyText += part.text
      }
    }

    res.json({ success: true, reply: replyText })
  } catch (error) {
    console.error('チャットサーバーエラー:', error)
    res.status(500).json({ error: 'チャット処理中にエラーが発生しました' })
  }
}
