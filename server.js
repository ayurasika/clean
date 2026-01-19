/**
 * Claude API プロキシサーバー
 * フロントエンドからのリクエストを中継してCORS問題を回避
 */

import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// CORS設定
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}))

app.use(express.json({ limit: '10mb' }))

// Claude API プロキシエンドポイント
app.post('/api/analyze', async (req, res) => {
  try {
    const { imageBase64 } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    // Base64データからプレフィックスを除去
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.VITE_CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: `あなたは「片付けの司令塔AI」です。この部屋の写真を戦略的に分析してください。

## 分析のステップ

### STEP 1: ゾーニング分析
部屋を以下のようなエリア（ゾーン）に分けて認識してください：
- デスク周り
- ベッド周り
- 床・通路
- クローゼット・収納
- 本棚・シェルフ
- キッチン周り
- その他

### STEP 2: 戦略的エリア選定
認識したエリアの中から、**最も短時間で達成感が出て、片付けのハードルが低いエリア**を1つだけ選んでください。

選定基準：
1. 5〜15分で目に見える成果が出せる
2. 精神的・肉体的負担が少ない
3. 片付けると他のエリアにも良い影響を与える
4. 「やった！」という達成感を得やすい

### STEP 3: 具体的タスクの提案
選んだエリアに特化した、具体的で実行可能なタスクを3つ提案してください。
各タスクは「〇〇を△△する」という明確な形式で書いてください。

## 出力形式

まず、分析コメントを2〜3文で書いてください。

次に、必ず以下のJSON形式で出力してください：
{
  "dirtyLevel": 0-100の数値,
  "selectedZone": "選んだエリア名",
  "reason": "なぜこのエリアから始めるべきか（ユーザーを励ます温かい言葉で）",
  "tasks": ["タスク1", "タスク2", "タスク3"],
  "estimatedTime": "推定所要時間（例：10分）",
  "zones": ["認識した全エリアのリスト"]
}`,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Claude API エラー:', errorData)
      return res.status(response.status).json({
        error: errorData.error?.message || 'Claude API エラー',
      })
    }

    const data = await response.json()
    res.json({
      success: true,
      analysis: data.content[0].text,
      rawResponse: data,
    })
  } catch (error) {
    console.error('サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================
// Gemini API エンドポイント（Imagen 3 / Gemini 2.0 Flash）
// Image-to-Image 変換で元の部屋の構造を維持しながら編集
// ============================================================

/**
 * Gemini で画像を編集（未来予想図生成）
 * gemini-2.5-flash-image を使用
 */
app.post('/api/gemini/edit-image', async (req, res) => {
  try {
    const { imageBase64, editType } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    // Base64データからプレフィックスを除去
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // より強力な編集プロンプト
    // 具体的に何を消すか、どう変えるかを明確に指示
    let editPrompt = ''
    if (editType === 'future_vision') {
      editPrompt = `Transform this messy room into a perfectly clean minimalist space.

MUST REMOVE (erase completely and fill with clean texture):
- Every single item on the floor (clothes, papers, trash, bags, boxes, anything)
- Everything on tables and desks except one decorative item
- All visible clutter, mess, and disorganization

MUST CHANGE:
- Floor should be 100% visible and spotless
- All surfaces should be empty and clean
- Create a dramatic "before and after" difference

Keep the room structure, furniture positions, walls, and windows the same.
This should look like a professional interior design photo.`
    } else if (editType === 'organize') {
      editPrompt = `Transform this room: Remove ALL items from floor. Empty all surfaces. Make it minimalist and spotless.`
    } else {
      editPrompt = `Make this room perfectly clean. Remove everything from the floor and surfaces.`
    }

    // Gemini 2.5 Flash Image API
    // AI Studio と同じ設定: responseModalities で Image を指定
    console.log('=== 画像編集リクエスト ===')
    console.log('プロンプト:', editPrompt)

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.VITE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: editPrompt,
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['Image', 'Text'],
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Gemini API エラー:', errorData)

      // クォータエラーの場合、少し待ってリトライを促す
      if (response.status === 429) {
        return res.status(429).json({
          error: 'APIのレート制限に達しました。少し時間をおいてから再度お試しください。',
          retryAfter: 30
        })
      }

      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini API エラー',
      })
    }

    const data = await response.json()

    // デバッグ: レスポンス構造を詳細に出力
    console.log('=== Gemini レスポンス詳細 ===')
    console.log('candidates存在:', !!data.candidates)
    if (data.candidates && data.candidates[0]) {
      console.log('content存在:', !!data.candidates[0].content)
      if (data.candidates[0].content && data.candidates[0].content.parts) {
        console.log('parts数:', data.candidates[0].content.parts.length)
        data.candidates[0].content.parts.forEach((part, i) => {
          console.log(`part[${i}] keys:`, Object.keys(part))
          if (part.text) {
            console.log(`part[${i}] text (最初の200文字):`, part.text.substring(0, 200))
          }
          if (part.inlineData) {
            console.log(`part[${i}] inlineData.mimeType:`, part.inlineData.mimeType)
            console.log(`part[${i}] inlineData.data長さ:`, part.inlineData.data?.length || 0)
          }
        })
      }
    }
    console.log('=== レスポンス詳細終了 ===')

    // レスポンスから画像データを抽出
    let generatedImageBase64 = null
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const parts = data.candidates[0].content.parts
      for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('image/')) {
          generatedImageBase64 = part.inlineData.data
          console.log('画像データ抽出成功! mimeType:', part.inlineData.mimeType)
          break
        }
      }
    }

    if (!generatedImageBase64) {
      console.log('画像が生成されませんでした。テキストのみのレスポンスの可能性があります。')
      // テキストレスポンスがある場合は表示
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.log('テキストレスポンス:', data.candidates[0].content.parts[0].text.substring(0, 500))
      }
      return res.status(500).json({ error: '画像の生成に失敗しました。AIがテキストのみを返しました。' })
    }

    res.json({
      success: true,
      imageBase64: generatedImageBase64,
      imageUrl: `data:image/png;base64,${generatedImageBase64}`,
    })
  } catch (error) {
    console.error('Gemini サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Imagen 3 を使用した画像編集（フォールバック）
 */
async function handleImagen3Request(req, res, base64Data, editPrompt) {
  try {
    // Imagen 3 API を呼び出し
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${process.env.VITE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [
            {
              prompt: editPrompt,
              image: {
                bytesBase64Encoded: base64Data,
              },
            },
          ],
          parameters: {
            sampleCount: 1,
            aspectRatio: '1:1',
            safetyFilterLevel: 'block_few',
            personGeneration: 'allow_adult',
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Imagen 3 API エラー:', errorData)
      return res.status(response.status).json({
        error: errorData.error?.message || 'Imagen 3 API エラー',
      })
    }

    const data = await response.json()

    if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
      const generatedImageBase64 = data.predictions[0].bytesBase64Encoded
      res.json({
        success: true,
        imageBase64: generatedImageBase64,
        imageUrl: `data:image/jpeg;base64,${generatedImageBase64}`,
      })
    } else {
      res.status(500).json({ error: '画像の生成に失敗しました' })
    }
  } catch (error) {
    console.error('Imagen 3 エラー:', error)
    res.status(500).json({ error: error.message })
  }
}

/**
 * Gemini Inpainting エンドポイント
 * ゴミや散らかった物だけを消去して、元の床/壁のテクスチャで埋める
 */
app.post('/api/gemini/inpaint', async (req, res) => {
  try {
    const { imageBase64, maskBase64, editType } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // Inpainting 用のプロンプト
    const inpaintPrompt = `Clean up this room. Remove all clutter and mess from the floor and surfaces. Keep furniture in place.`

    // Gemini 2.5 Flash Image API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.VITE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: inpaintPrompt,
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['Image', 'Text'],
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Gemini Inpainting API エラー:', errorData)
      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini Inpainting API エラー',
      })
    }

    const data = await response.json()

    let generatedImageBase64 = null
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const parts = data.candidates[0].content.parts
      for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('image/')) {
          generatedImageBase64 = part.inlineData.data
          break
        }
      }
    }

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
})

// ============================================================
// レガシー: OpenAI 画像生成エンドポイント（後方互換性のため残す）
// ============================================================
app.post('/api/generate-image', async (req, res) => {
  // Gemini エンドポイントにリダイレクト
  req.body.editType = 'future_vision'
  return res.redirect(307, '/api/gemini/edit-image')
})

// ============================================================
// 片付け場所分析エンドポイント（Gemini で場所と行動を特定）
// ============================================================
app.post('/api/analyze-cleanup-spots', async (req, res) => {
  try {
    const { imageBase64 } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // 片付け場所を特定するプロンプト
    const analyzePrompt = `この部屋の写真を分析して、片付けが必要な場所と具体的なアクションをリストアップしてください。

以下のJSON形式で出力してください：
{
  "spots": [
    {
      "location": "場所の名前（例：テーブルの上、床の左側、デスク周り）",
      "items": "そこにある散らかっているもの",
      "action": "具体的な片付けアクション",
      "priority": "high/medium/low",
      "estimatedTime": "推定時間（例：2分）"
    }
  ],
  "totalEstimatedTime": "全体の推定時間",
  "encouragement": "ユーザーを励ます一言メッセージ"
}

注意点：
- 最も目立つ/簡単に片付けられる場所から順に並べる
- 各アクションは具体的で実行しやすいものにする
- 日本語で回答する
- 優先度は「すぐできて達成感がある」ものをhighに`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${process.env.VITE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: analyzePrompt,
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Gemini 分析 API エラー:', errorData)
      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini API エラー',
      })
    }

    const data = await response.json()

    // テキストレスポンスを抽出
    let analysisText = ''
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const parts = data.candidates[0].content.parts
      for (const part of parts) {
        if (part.text) {
          analysisText = part.text
          break
        }
      }
    }

    console.log('片付け分析レスポンス:', analysisText.substring(0, 500))

    // JSONを抽出
    let analysisResult = null
    try {
      // JSON部分を抽出（```json ... ``` または { ... } を探す）
      const jsonMatch = analysisText.match(/\{[\s\S]*"spots"[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      }
    } catch (parseError) {
      console.error('JSON パースエラー:', parseError)
    }

    if (!analysisResult) {
      // JSONパースに失敗した場合、テキストをそのまま返す
      return res.json({
        success: true,
        rawText: analysisText,
        spots: [],
      })
    }

    res.json({
      success: true,
      ...analysisResult,
    })
  } catch (error) {
    console.error('片付け分析サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
})

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`プロキシサーバーが起動しました: http://localhost:${PORT}`)
})
