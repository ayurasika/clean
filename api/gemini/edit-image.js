import { handlePreflightAndValidation, callGemini, extractImage } from '../_lib/gemini.js'
import { createAnalysisPrompt, createEditPrompt } from '../_lib/prompts.js'
import { inspectGeneratedImage } from '../_lib/inspect.js'

export default async function handler(req, res) {
  if (handlePreflightAndValidation(req, res)) return

  try {
    const { imageBase64, editType, highQuality } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    const useProModel = highQuality === true
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // ============================================================
    // JSONモードによる現状分析
    // ============================================================
    console.log('🔍 AI現状分析開始')

    let removeList = []
    let roomType = 'general'
    let protectedBoundaries = []
    let criticalAppliances = []

    try {
      const analysisPrompt = createAnalysisPrompt()

      const analysisResponse = await callGemini('gemini-2.0-flash', {
        contents: [
          {
            parts: [
              { text: analysisPrompt },
              { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      })

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json()
        const analysisText = analysisData.candidates?.[0]?.content?.parts?.[0]?.text || ''

        try {
          const analysisJson = JSON.parse(analysisText)

          if (analysisJson.critical_appliances && Array.isArray(analysisJson.critical_appliances)) {
            criticalAppliances = analysisJson.critical_appliances
              .filter(item => item.bbox && Array.isArray(item.bbox) && item.bbox.length === 4)
              .map(item => ({
                item: item.item,
                type: item.type || 'appliance',
                bbox: item.bbox,
                confidence: item.confidence || 0.8
              }))
          }

          if (analysisJson.remove_items && Array.isArray(analysisJson.remove_items)) {
            removeList = analysisJson.remove_items.map(item => `${item.location}の${item.item}`)
          }

          if (analysisJson.keep_items && Array.isArray(analysisJson.keep_items)) {
            protectedBoundaries = analysisJson.keep_items
              .filter(item => item.bbox && Array.isArray(item.bbox) && item.bbox.length === 4)
              .map(item => ({ item: item.item, bbox: item.bbox }))
          }

          if (analysisJson.room_type) {
            roomType = analysisJson.room_type
          }

          console.log('✅ 分析完了 - 部屋:', roomType, 'REMOVE:', removeList.length, '保護:', protectedBoundaries.length)
        } catch (parseError) {
          const itemMatches = analysisText.matchAll(/"item":\s*"([^"]+)"/g)
          for (const match of itemMatches) {
            removeList.push(match[1])
          }
        }
      } else {
        removeList = ['カウンターの上の書類・紙類', 'カウンターの上の小物・雑貨', '散らばった食器・コップ', 'ゴミ・空き箱・包装紙', '床の上の物']
        roomType = 'kitchen'
      }
    } catch (analysisError) {
      console.log('⚠️ 分析エラー:', analysisError.message)
      removeList = ['カウンターの上の書類・紙類', 'カウンターの上の小物・雑貨', '散らばった食器・コップ', 'ゴミ・空き箱・包装紙', '床の上の物']
      roomType = 'kitchen'
    }

    // ============================================================
    // 画像生成
    // ============================================================
    const generateImage = async (fixInstruction = null, attemptNumber = 1, isRetry = false) => {
      let editPrompt = createEditPrompt(editType, removeList, roomType, protectedBoundaries, criticalAppliances)

      if (!useProModel) {
        const flashCleanupBoost = `
############################################################
#  ⚡ FLASH MODEL: AGGRESSIVE CLEANUP REQUIRED ⚡           #
############################################################

THIS IMAGE MUST LOOK DRAMATICALLY DIFFERENT AFTER CLEANING.
A subtle change is NOT acceptable. The transformation must be OBVIOUS.

🎯 YOUR MISSION: Make this room look like a PROFESSIONAL CLEANER spent 2 hours here.

REMOVE AGGRESSIVELY:
✗ ALL papers, documents, mail on surfaces → REMOVE COMPLETELY
✗ ALL dishes, cups, bottles → REMOVE COMPLETELY
✗ ALL clothes, bags, personal items → REMOVE COMPLETELY
✗ ALL small clutter and random objects → REMOVE COMPLETELY
✗ ALL trash and packaging → REMOVE COMPLETELY

RESULT REQUIRED:
✓ Countertops: 90% EMPTY (only fixed appliances remain)
✓ Tables: COMPLETELY CLEAR
✓ Floor: NO loose items visible
✓ The "BEFORE vs AFTER" difference must be SHOCKING

IF THE OUTPUT LOOKS SIMILAR TO INPUT → THIS IS A FAILURE

############################################################

`
        editPrompt = flashCleanupBoost + editPrompt
      }

      if (fixInstruction) {
        editPrompt = `
############################################################
#  RETRY ATTEMPT - PREVIOUS GENERATION FAILED              #
############################################################

【FAILURE REASON】
${fixInstruction}

【MANDATORY FIX】
You MUST fix this issue. The previous image was REJECTED because important items were removed or altered.

【REMINDER - PROTECTED ITEMS】
${criticalAppliances.length > 0
  ? criticalAppliances.map(a => `- ${a.item} at bbox[${a.bbox?.join(', ') || 'detected'}] - MUST REMAIN`).join('\n')
  : '- All kitchen appliances (cooktop, sink, etc.) MUST REMAIN\n- All large furniture MUST REMAIN'}

DO NOT repeat the same mistake. Be MORE CONSERVATIVE this time.

############################################################

${editPrompt}`
      }

      let temperature
      if (isRetry) {
        temperature = 0.3
      } else if (useProModel) {
        temperature = editType === 'future_vision_stronger' ? 0.5 : 0.4
      } else {
        temperature = editType === 'future_vision_stronger' ? 0.8 : 0.65
      }

      const modelName = useProModel
        ? 'gemini-3-pro-image-preview'
        : 'gemini-2.5-flash-image'

      console.log(`画像生成 試行${attemptNumber} - モデル: ${modelName}, temp: ${temperature}`)

      const response = await callGemini(modelName, {
        contents: [
          {
            parts: [
              { text: editPrompt },
              { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['Image', 'Text'],
          temperature,
        },
      })

      return response
    }

    // 503エラー対策: リトライ + フォールバック
    let response = await generateImage(null, 1)
    let usedFallbackModel = false
    let actualModelUsed = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image'

    if (response.status === 503) {
      for (let retryCount = 1; retryCount <= 2; retryCount++) {
        console.log(`🔄 503リトライ ${retryCount}/2`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        response = await generateImage(null, 1)
        if (response.ok || response.status !== 503) break
      }

      if (response.status === 503 && useProModel) {
        console.log('🔄 Flashにフォールバック')
        const fallbackResponse = await callGemini('gemini-2.5-flash-image', {
          contents: [
            {
              parts: [
                { text: createEditPrompt(editType, removeList, roomType, protectedBoundaries, criticalAppliances) },
                { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['Image', 'Text'],
            temperature: editType === 'future_vision_stronger' ? 0.8 : 0.7,
          },
        })

        if (fallbackResponse.ok) {
          response = fallbackResponse
          usedFallbackModel = true
          actualModelUsed = 'gemini-2.5-flash-image'
        }
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))

      if (response.status === 429) {
        return res.status(429).json({
          error: 'APIのレート制限に達しました。少し時間をおいてから再度お試しください。',
          retryAfter: 30
        })
      }
      if (response.status === 503) {
        return res.status(503).json({
          error: 'AIモデルが現在混雑しています。しばらく待ってから再度お試しください。',
          retryAfter: 10
        })
      }
      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini API エラー',
      })
    }

    const data = await response.json()
    let generatedImageBase64 = extractImage(data)

    if (!generatedImageBase64) {
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text
      return res.status(500).json({
        error: '画像の生成に失敗しました。AIがテキストのみを返しました。',
        aiResponse: textResponse?.substring(0, 200)
      })
    }

    // 検品フェーズ + リトライ
    let inspectionResult = null
    let didRetry = false
    let finalImageBase64 = generatedImageBase64

    inspectionResult = await inspectGeneratedImage(base64Data, generatedImageBase64, roomType)

    if (inspectionResult?.verdict === 'FAIL') {
      console.log('🔄 検品FAIL - リトライ開始')
      const retryResponse = await generateImage(inspectionResult.fix_instruction, 2, true)

      if (retryResponse.ok) {
        const retryData = await retryResponse.json()
        const retryImageBase64 = extractImage(retryData)

        if (retryImageBase64) {
          const retryInspection = await inspectGeneratedImage(base64Data, retryImageBase64, roomType)
          if (retryInspection) inspectionResult = retryInspection
          finalImageBase64 = retryImageBase64
          didRetry = true
        }
      }
    }

    res.json({
      success: true,
      imageBase64: finalImageBase64,
      imageUrl: `data:image/png;base64,${finalImageBase64}`,
      model: actualModelUsed,
      usedFallback: usedFallbackModel,
      fallbackReason: usedFallbackModel ? 'Gemini 3 Proが混雑していたため、2.5 Flashで生成しました' : null,
      usage: {
        flash: { used: 0, limit: 50 },
        pro: { used: 0, limit: 10 },
      },
      debug: {
        roomType,
        removeItemCount: removeList.length,
        protectedBoundariesCount: protectedBoundaries.length,
        criticalAppliancesCount: criticalAppliances.length,
        inspectionResult: inspectionResult || { message: '検品未実施' },
        didRetry,
        usedFallbackModel,
        actualModelUsed,
      }
    })
  } catch (error) {
    console.error('Gemini サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
}
