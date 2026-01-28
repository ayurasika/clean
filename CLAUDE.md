# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**かたづけナビ AI** - An AI-powered room organization assistant app that helps users clean up their rooms by:
1. Taking photos of messy rooms
2. Generating "future vision" images showing the room cleaned up (using Gemini Image-to-Image)
3. Analyzing cleanup spots and providing prioritized task lists
4. Providing strategic analysis of where to start cleaning (using Claude API)

## Development Commands

```bash
# Start both frontend and backend concurrently
npm run dev:all

# Start only Vite frontend (port 5173)
npm run dev

# Start only Express backend server (port 3001)
npm run server

# Build for production
npm run build

# Preview production build
npm run preview
```

## Architecture

### Frontend (Vue 3 + Vite)
- **Entry**: `src/main.js` → `src/App.vue`
- **Router**: `src/router/index.js` - Routes: `/` (home), `/camera`, `/about`
- **State**: Pinia store at `src/stores/room.js` - manages dirty level, analysis results, tasks, future vision URL
- **Key Views**:
  - `src/views/HomeView.vue` - Main dashboard with progress bar, missions, task list
  - `src/components/CameraView.vue` - Camera capture, image generation, cleanup analysis flow

### Backend (Express)
- **Server**: `server.js` (port 3001)
- Proxies requests to Claude API and Gemini API to avoid CORS issues
- Implements usage tracking with daily limits (Flash: 50/day, Pro: 10/day)
- Features self-critic inspection phase with auto-retry for failed image generations

### API Flow
1. **Image Generation**: `/api/gemini/edit-image` - Uses Gemini 2.5 Flash Image (or 2.0 Flash Pro for high quality)
2. **Cleanup Spots Analysis**: `/api/analyze-cleanup-spots` - Uses Gemini 2.5 Flash Preview
3. **Strategic Analysis**: `/api/analyze` - Uses Claude Sonnet for zone selection and task planning

### Frontend-Backend Communication
- Vite dev server proxies `/api/*` requests to backend (configured in `vite.config.js`)
- Supports ngrok tunneling for mobile device testing

## Environment Variables

Required in `.env`:
- `VITE_CLAUDE_API_KEY` - Anthropic API key
- `VITE_GEMINI_API_KEY` - Google Gemini API key
- `VITE_API_BASE_URL` - Optional, defaults to empty string for relative paths

## Key Utilities

- `src/utils/gemini.js` - Gemini API wrapper (generateFutureVision, analyzeCleanupSpots)
- `src/utils/claude.js` - Claude API wrapper (analyzeImageWithClaude)

## Styling

Uses Tailwind CSS v4 with PostCSS. Main styles in `src/assets/main.css`.

---

## Current Project Status (2026-01-29)

### Summary
プロジェクトは基本機能が動作する状態ですが、本番デプロイには複数の修正が必要です。

### 作りかけ・未完成の機能

| 箇所 | 状態 | 詳細 |
|------|------|------|
| `src/utils/claude.js:54` | TODO | `parseTasksFromAnalysis()` のタスク抽出ロジックが未実装（基本的なパターンマッチのみ） |
| `src/utils/openai.js` | 非推奨 | ファイル全体が `@deprecated`。スタブ実装のみで機能しない。削除推奨 |
| `src/utils/gemini.js:87` | 未実装 | `inpaintCleanRoom()` の `maskBase64` パラメータが未使用 |

### エラーが発生しうる箇所

| 箇所 | リスク | 問題 |
|------|--------|------|
| `server.js:108,473,579,709` | 高 | API キーの存在チェックなし。未設定時にサーバー起動後クラッシュ |
| `server.js:516-532` | 中 | JSON パース失敗時に `null` を返すが、呼び出し元で構造検証なし |
| `CameraView.vue:291-312` | 中 | `extractJsonFromAnalysis()` の正規表現が不正なJSONにもマッチする可能性 |
| `CameraView.vue:275-277` | 低 | `setTimeout` でリダイレクト。コンポーネント破棄時のクリーンアップなし |
| `server.js:821-879` | 低 | リトライロジックで `usageTracker` への並行アクセス（レースコンディション） |

### セキュリティ上の問題

| 箇所 | 重大度 | 問題 |
|------|--------|------|
| `.env` | **CRITICAL** | 実際のAPIキーがファイルに平文で記載。Git履歴に残っている可能性 |
| `server.js:86` | 高 | `cors()` がパラメータなしで全オリジン許可（CSRF脆弱性） |
| `vite.config.js:22` | 中 | `allowedHosts: 'all'` でHostヘッダーインジェクション可能 |
| `server.js:191,900,980` | 中 | エラーメッセージで内部情報（スタックトレース等）を露出 |

---

## Deployment Tasks (優先順位順)

### P0: Critical（デプロイ前に必須）

- [ ] **APIキーのローテーション**
  - `.env` のキー（Claude, Gemini）を全て再発行
  - Git履歴からの漏洩を前提に対応

- [ ] **CORS設定の修正** (`server.js:86`)
  ```javascript
  // Before
  app.use(cors())
  // After
  app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'] }))
  ```

- [ ] **環境変数バリデーション追加** (`server.js` 起動時)
  ```javascript
  const requiredEnvVars = ['VITE_CLAUDE_API_KEY', 'VITE_GEMINI_API_KEY']
  requiredEnvVars.forEach(key => {
    if (!process.env[key]) throw new Error(`Missing required env: ${key}`)
  })
  ```

### P1: High（本番運用に重要）

- [ ] **ボタンの多重クリック防止** (`CameraView.vue`)
  - 生成中・分析中はボタンを `disabled` にする
  - `isLoading` 状態を追加

- [ ] **フェッチのタイムアウト設定**
  - `AbortController` でタイムアウト（30秒程度）を設定
  - `gemini.js`, `claude.js`, `server.js` のfetch呼び出しすべてに適用

- [ ] **入力バリデーション強化** (`server.js`, `CameraView.vue`)
  - 画像サイズ上限チェック（例: 10MB）
  - Base64形式の検証

- [ ] **エラーメッセージのサニタイズ** (`server.js`)
  - 内部エラーを汎用メッセージに置換
  - スタックトレースをログのみに

### P2: Medium（品質向上）

- [ ] **不要ファイルの削除**
  - `src/utils/openai.js` を削除

- [ ] **設定値の外部化** (`server.js`)
  - `dailyLimits` を環境変数または設定ファイルへ
  - Geminiモデル名を環境変数化

- [ ] **Vite本番用プロキシ設定**
  - `vite.config.js` のプロキシ設定を本番環境向けに調整
  - または本番はNginx等でリバースプロキシ

- [ ] **リクエストレート制限の追加**
  - `express-rate-limit` 等でIP単位の制限

### P3: Low（改善推奨）

- [ ] **TODO実装**: `claude.js:54` のタスク抽出ロジック改善
- [ ] **maskBase64実装または削除**: `gemini.js` のinpaint機能
- [ ] **setTimeout クリーンアップ**: `CameraView.vue:275`
- [ ] **ログレベル制御**: 本番では詳細ログを抑制

---

## Deployment Checklist

```
□ P0タスク完了
□ npm run build 成功
□ 本番用 .env 設定（APIキー、ALLOWED_ORIGINS等）
□ Node.js 20.19+ または 22.12+ 確認
□ サーバー起動テスト（npm run server）
□ フロントエンドビルド配信設定（Nginx/Vercel等）
□ HTTPS設定
□ ドメイン・DNS設定
```
