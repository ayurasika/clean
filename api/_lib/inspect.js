/**
 * 検品フェーズ（Self-Critic）- server.js から移植
 */
import { callGemini } from './gemini.js'

export async function inspectGeneratedImage(originalBase64, generatedBase64, roomType, apiKey) {
  const inspectionPrompt = `You are a STRICT quality control inspector for AI-generated cleaned room images.

Compare these TWO images:
1. ORIGINAL image (the messy room)
2. GENERATED image (the cleaned version)

Check the following criteria STRICTLY:

【CRITERION 1: STRUCTURAL INTEGRITY】
- Are all major furniture items (tables, chairs, sofas, beds, shelves) still in the SAME position?
- Are walls, windows, and doors preserved correctly?
- Is the camera angle and perspective EXACTLY the same?

【CRITERION 2: APPLIANCE PRESERVATION - MOST CRITICAL】
THIS IS THE MOST IMPORTANT CHECK. Score 0 if ANY appliance is removed or significantly altered.
Kitchen appliances to check:
- IH cooktop / stove / gas range (コンロ)
- Sink and faucet (シンク・蛇口)
- Refrigerator (冷蔵庫)
- Microwave (電子レンジ)
- Range hood / exhaust fan (換気扇)
- Dishwasher (食洗機)
- Rice cooker, toaster, coffee maker

Other appliances to check:
- TV, monitors, computers
- Air conditioner units
- Washing machine, dryer
- Vacuum cleaner (if visible)

FAIL IMMEDIATELY if:
- Any appliance visible in ORIGINAL is missing in GENERATED
- Any appliance has changed shape, color, or position significantly
- Appliance controls/buttons have disappeared

【CRITERION 3: CLEANUP EFFECTIVENESS - BE EXTREMELY STRICT】
You MUST be very harsh in scoring this criterion. Most AI-generated "cleaned" images are NOT clean enough.

Score 0-3 (FAIL) if ANY of these are true:
- You can still see papers, documents, or mail anywhere
- You can still see dishes, cups, or bottles on surfaces
- You can still see clothes, bags, or personal items
- You can still see toys or random objects on floor/stairs
- The counter/table surfaces are not at least 80% empty
- The floor is not completely clear of loose items
- At first glance, you cannot IMMEDIATELY tell this is a "cleaned" version

Score 4-6 (FAIL) if:
- Some clutter was removed but significant items remain
- The change is noticeable but not dramatic

Score 7-8 (BORDERLINE PASS) if:
- Most visible clutter is gone
- Surfaces are mostly clear
- The transformation is noticeable

Score 9-10 (CLEAR PASS) ONLY if:
- The transformation is SHOCKING - like a different room
- All surfaces are 90%+ empty (only fixed appliances remain)
- Floor is COMPLETELY clear
- It looks like a professional cleaning service spent hours

BE HARSH. If in doubt, score LOWER. A score of 10 should be rare.

【OUTPUT FORMAT - JSON only】
{
  "verdict": "PASS or FAIL",
  "structural_integrity": {
    "score": 0-10,
    "issues": ["list any problems found, or empty array if none"]
  },
  "appliance_preservation": {
    "score": 0-10,
    "missing_appliances": ["list any appliances that were removed or altered"],
    "issues": ["list any problems found, or empty array if none"]
  },
  "cleanup_effectiveness": {
    "score": 0-10,
    "issues": ["list any problems found, or empty array if none"]
  },
  "overall_reason": "brief explanation of the verdict",
  "fix_instruction": "if FAIL, provide specific instructions to fix the issue in the next generation"
}

Scoring guide:
- 9-10: Excellent, meets all requirements
- 7-8: Good, minor issues
- 5-6: Acceptable, some concerns
- 0-4: Poor, major problems

Verdict guide:
- PASS: ALL three scores >= 8 (cleanup_effectiveness MUST be >= 8)
- FAIL: Any score < 8

IMPORTANT: Be a strict inspector. It is better to FAIL a mediocre result than to PASS something that doesn't look dramatically cleaner.`

  try {
    const response = await callGemini('gemini-2.0-flash', {
      contents: [
        {
          parts: [
            { text: inspectionPrompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: originalBase64,
              },
            },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: generatedBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    })

    if (!response.ok) {
      console.log('⚠️ 検品API呼び出し失敗')
      return null
    }

    const data = await response.json()
    const inspectionText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    try {
      const inspectionResult = JSON.parse(inspectionText)
      console.log('🔍 検品結果:', inspectionResult.verdict)
      return inspectionResult
    } catch (parseError) {
      console.log('⚠️ 検品結果のJSONパースエラー')
      return null
    }
  } catch (error) {
    console.log('⚠️ 検品処理エラー:', error.message)
    return null
  }
}
