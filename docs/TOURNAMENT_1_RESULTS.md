# Tournament 1 Results: Frontier 7-Model 3v3 Round Robin

> **Decrypto Arena** -- AI model evaluation through adversarial word game competition
>
> Generated: 2026-03-31

## 1. Tournament Overview

| Property | Value |
|---|---|
| **Name** | Frontier 7-Model 3v3 Round Robin — March 2026 |
| **Status** | completed |
| **Format** | 3v3 Round Robin (4 games per pairing) |
| **Team Size** | 3 players per team |
| **Models** | 7 |
| **Total Pairings** | 21 (C(7,2)) |
| **Games per Pairing** | 4 |
| **Total Matches** | 84 |
| **Completed Matches** | 84 |
| **Concurrency** | 10 |
| **Budget Cap** | $250.00 |
| **Actual Cost** | $33.268724 |
| **Estimated Cost** | $446.8482 |
| **Prompt Strategy** | advanced |
| **Temperature** | 0.7 |
| **Created** | 2026-03-31 10:17:08.557884 |
| **Started** | 2026-03-31 20:01:44.278 |
| **Completed** | 2026-03-31 22:51:49.521 |

### Models Entered

| Display Name | API Model | Provider | Reasoning Effort |
|---|---|---|---|
| DeepSeek V3.2 | `deepseek/deepseek-v3.2` | openrouter | xhigh |
| GPT-5.4 | `gpt-5.4` | chatgpt | high |
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | gemini | xhigh |
| Grok 4.20 | `x-ai/grok-4.20-beta` | openrouter | xhigh |
| Kimi K2.5 | `moonshotai/kimi-k2.5` | openrouter | xhigh |
| Opus 4.6 | `claude-opus-4-6` | claude | xhigh |
| Qwen 3.6 Plus | `qwen/qwen3.6-plus-preview` | openrouter | xhigh |

### Tournament Design Notes

- **Side Assignment**: In each pairing, one model was always assigned to amber and the other to blue across all 4 games. Notably, Kimi K2.5 was always placed as the blue team in all 24 of its matches. This lack of side-switching means potential first-mover or positional advantages cannot be isolated from model strength.
- **API Reliability Issues**: Two models (Qwen 3.6 Plus and a secondary DeepSeek V3.2 routing path) experienced 100% API call failure rates. Gemini 3.1 Pro had 87% failure rate. Despite these failures, the game engine's fallback mechanisms allowed games to complete, though results for matchups involving heavily-failing models should be interpreted with caution.
- **Duration**: The tournament ran for approximately 2 hours 50 minutes (20:01 to 22:51 UTC) with concurrency 10.

## 2. Final Standings

| Rank | Model | W | L | Win% | BT Rating | Interceptions | Miscommunications |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | **Kimi K2.5** | 24 | 0 | 100.0% | 636.1941 | 30 | 14 |
| 2 | **Opus 4.6** | 16 | 8 | 66.7% | 1.1173 | 3 | 28 |
| 3 | **DeepSeek V3.2** | 11 | 13 | 45.8% | 0.4039 | 32 | 12 |
| 4 | **GPT-5.4** | 10 | 14 | 41.7% | 0.3366 | 3 | 30 |
| 5 | **Grok 4.20** | 10 | 14 | 41.7% | 0.3365 | 41 | 7 |
| 6 | **Qwen 3.6 Plus** | 7 | 17 | 29.2% | 0.1934 | 48 | 3 |
| 7 | **Gemini 3.1 Pro** | 6 | 18 | 25.0% | 0.1590 | 24 | 23 |

## 3. Head-to-Head Matrix

Each cell shows **W-L** from the row model's perspective.

| Model | Kimi K2.5 | Opus 4.6 | DeepSeek V3.2 | GPT-5.4 | Grok 4.20 | Qwen 3.6 Plus | Gemini 3.1 Pro |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Kimi K2.5** | --- | 4-0 | 4-0 | 4-0 | 4-0 | 4-0 | 4-0 |
| **Opus 4.6** | 0-4 | --- | 4-0 | 4-0 | 2-2 | 4-0 | 2-2 |
| **DeepSeek V3.2** | 0-4 | 0-4 | --- | 0-4 | 3-1 | 4-0 | 4-0 |
| **GPT-5.4** | 0-4 | 0-4 | 4-0 | --- | 1-3 | 4-0 | 1-3 |
| **Grok 4.20** | 0-4 | 2-2 | 1-3 | 3-1 | --- | 1-3 | 3-1 |
| **Qwen 3.6 Plus** | 0-4 | 0-4 | 0-4 | 0-4 | 3-1 | --- | 4-0 |
| **Gemini 3.1 Pro** | 0-4 | 2-2 | 0-4 | 3-1 | 1-3 | 0-4 | --- |

## 4. Per-Match Detail

| # | Match ID | Amber Team | Blue Team | Winner | Rounds | Amber Intercepts | Amber Miscomm | Blue Intercepts | Blue Miscomm | Cost ($) |
|---:|---:|---|---|---|---:|---:|---:|---:|---:|---:|
| 0 | 27 | GPT-5.4 | Opus 4.6 | **Opus 4.6** (blue) | 2 | 0 | 2 | 0 | 2 | 0.8868 |
| 1 | 28 | GPT-5.4 | Opus 4.6 | **Opus 4.6** (blue) | 2 | 0 | 2 | 0 | 2 | 0.6805 |
| 2 | 29 | GPT-5.4 | Opus 4.6 | **Opus 4.6** (blue) | 2 | 0 | 2 | 0 | 2 | 0.9510 |
| 3 | 30 | GPT-5.4 | Opus 4.6 | **Opus 4.6** (blue) | 2 | 0 | 2 | 0 | 2 | 0.8527 |
| 4 | 32 | GPT-5.4 | Gemini 3.1 Pro | **Gemini 3.1 Pro** (blue) | 2 | 0 | 2 | 0 | 2 | 0.3748 |
| 5 | 31 | GPT-5.4 | Gemini 3.1 Pro | **Gemini 3.1 Pro** (blue) | 2 | 0 | 2 | 0 | 2 | 0.5437 |
| 6 | 33 | GPT-5.4 | Gemini 3.1 Pro | **Gemini 3.1 Pro** (blue) | 2 | 0 | 2 | 0 | 2 | 0.4397 |
| 7 | 34 | GPT-5.4 | Gemini 3.1 Pro | **GPT-5.4** (amber) | 2 | 1 | 1 | 0 | 2 | 0.5778 |
| 8 | 35 | GPT-5.4 | Grok 4.20 | **Grok 4.20** (blue) | 2 | 0 | 2 | 2 | 0 | 0.5984 |
| 9 | 36 | GPT-5.4 | Grok 4.20 | **GPT-5.4** (amber) | 2 | 0 | 1 | 2 | 0 | 0.4781 |
| 10 | 37 | GPT-5.4 | Grok 4.20 | **Grok 4.20** (blue) | 2 | 0 | 2 | 1 | 0 | 0.5443 |
| 11 | 38 | GPT-5.4 | Grok 4.20 | **Grok 4.20** (blue) | 2 | 0 | 2 | 0 | 2 | 0.4271 |
| 12 | 42 | Opus 4.6 | Gemini 3.1 Pro | **Gemini 3.1 Pro** (blue) | 2 | 0 | 2 | 0 | 2 | 0.4135 |
| 13 | 43 | Opus 4.6 | Gemini 3.1 Pro | **Opus 4.6** (amber) | 2 | 1 | 1 | 0 | 2 | 0.3421 |
| 14 | 44 | Opus 4.6 | Gemini 3.1 Pro | **Gemini 3.1 Pro** (blue) | 2 | 0 | 2 | 0 | 2 | 0.3516 |
| 15 | 45 | Opus 4.6 | Gemini 3.1 Pro | **Opus 4.6** (amber) | 2 | 1 | 1 | 0 | 2 | 0.5044 |
| 16 | 47 | Opus 4.6 | Grok 4.20 | **Grok 4.20** (blue) | 2 | 0 | 2 | 2 | 0 | 0.7375 |
| 17 | 46 | Opus 4.6 | Grok 4.20 | **Grok 4.20** (blue) | 2 | 0 | 2 | 2 | 1 | 0.8511 |
| 18 | 48 | Opus 4.6 | Grok 4.20 | **Opus 4.6** (amber) | 2 | 1 | 1 | 2 | 1 | 1.8984 |
| 19 | 65 | Opus 4.6 | Grok 4.20 | **Opus 4.6** (amber) | 2 | 0 | 1 | 2 | 0 | 0.9541 |
| 20 | 50 | Gemini 3.1 Pro | Grok 4.20 | **Gemini 3.1 Pro** (amber) | 2 | 0 | 1 | 2 | 0 | 0.1792 |
| 21 | 75 | Gemini 3.1 Pro | Grok 4.20 | **Grok 4.20** (blue) | 2 | 0 | 2 | 2 | 0 | 1.9110 |
| 22 | 68 | Gemini 3.1 Pro | Grok 4.20 | **Grok 4.20** (blue) | 2 | 0 | 2 | 2 | 0 | 0.7887 |
| 23 | 77 | Gemini 3.1 Pro | Grok 4.20 | **Grok 4.20** (blue) | 2 | 0 | 2 | 2 | 0 | 0.5280 |
| 24 | 97 | Grok 4.20 | DeepSeek V3.2 | **Grok 4.20** (amber) | 2 | 1 | 0 | 2 | 0 | 0.4404 |
| 25 | 87 | Grok 4.20 | DeepSeek V3.2 | **DeepSeek V3.2** (blue) | 3 | 2 | 1 | 0 | 2 | 0.2098 |
| 26 | 98 | Grok 4.20 | DeepSeek V3.2 | **DeepSeek V3.2** (blue) | 2 | 2 | 0 | 2 | 0 | 0.3786 |
| 27 | 91 | Grok 4.20 | DeepSeek V3.2 | **DeepSeek V3.2** (blue) | 2 | 2 | 0 | 2 | 0 | 0.1659 |
| 28 | 102 | GPT-5.4 | DeepSeek V3.2 | **GPT-5.4** (amber) | 2 | 0 | 0 | 2 | 0 | 0.3114 |
| 29 | 103 | GPT-5.4 | DeepSeek V3.2 | **GPT-5.4** (amber) | 2 | 0 | 0 | 2 | 0 | 0.3877 |
| 30 | 109 | GPT-5.4 | DeepSeek V3.2 | **GPT-5.4** (amber) | 2 | 0 | 0 | 2 | 0 | 0.4833 |
| 31 | 111 | GPT-5.4 | DeepSeek V3.2 | **GPT-5.4** (amber) | 3 | 1 | 0 | 1 | 2 | 1.2070 |
| 32 | 110 | Opus 4.6 | DeepSeek V3.2 | **Opus 4.6** (amber) | 2 | 0 | 0 | 2 | 0 | 0.5335 |
| 33 | 130 | Opus 4.6 | DeepSeek V3.2 | **Opus 4.6** (amber) | 2 | 0 | 0 | 2 | 0 | 0.4934 |
| 34 | 131 | Opus 4.6 | DeepSeek V3.2 | **Opus 4.6** (amber) | 2 | 0 | 0 | 2 | 0 | 0.4465 |
| 35 | 132 | Opus 4.6 | DeepSeek V3.2 | **Opus 4.6** (amber) | 2 | 0 | 0 | 2 | 0 | 0.4017 |
| 36 | 137 | Gemini 3.1 Pro | DeepSeek V3.2 | **DeepSeek V3.2** (blue) | 2 | 2 | 0 | 2 | 0 | 0.0000 |
| 37 | 138 | Gemini 3.1 Pro | DeepSeek V3.2 | **DeepSeek V3.2** (blue) | 2 | 2 | 0 | 2 | 0 | 0.0000 |
| 38 | 139 | Gemini 3.1 Pro | DeepSeek V3.2 | **DeepSeek V3.2** (blue) | 2 | 2 | 0 | 2 | 0 | 0.0000 |
| 39 | 144 | Gemini 3.1 Pro | DeepSeek V3.2 | **DeepSeek V3.2** (blue) | 2 | 2 | 0 | 2 | 0 | 0.0000 |
| 40 | 145 | Grok 4.20 | Qwen 3.6 Plus | **Grok 4.20** (amber) | 3 | 1 | 0 | 2 | 0 | 0.5258 |
| 41 | 146 | Grok 4.20 | Qwen 3.6 Plus | **Qwen 3.6 Plus** (blue) | 2 | 2 | 0 | 2 | 0 | 0.3541 |
| 42 | 151 | Grok 4.20 | Qwen 3.6 Plus | **Qwen 3.6 Plus** (blue) | 2 | 2 | 0 | 2 | 0 | 0.3806 |
| 43 | 152 | Grok 4.20 | Qwen 3.6 Plus | **Qwen 3.6 Plus** (blue) | 2 | 2 | 0 | 2 | 1 | 0.0884 |
| 44 | 153 | GPT-5.4 | Qwen 3.6 Plus | **GPT-5.4** (amber) | 3 | 0 | 0 | 2 | 1 | 0.7989 |
| 45 | 160 | GPT-5.4 | Qwen 3.6 Plus | **GPT-5.4** (amber) | 2 | 0 | 0 | 2 | 0 | 0.4648 |
| 46 | 161 | GPT-5.4 | Qwen 3.6 Plus | **GPT-5.4** (amber) | 2 | 0 | 0 | 2 | 0 | 0.3928 |
| 47 | 162 | GPT-5.4 | Qwen 3.6 Plus | **GPT-5.4** (amber) | 2 | 1 | 0 | 2 | 0 | 0.5459 |
| 48 | 166 | Opus 4.6 | Qwen 3.6 Plus | **Opus 4.6** (amber) | 2 | 0 | 0 | 2 | 0 | 0.4981 |
| 49 | 167 | Opus 4.6 | Qwen 3.6 Plus | **Opus 4.6** (amber) | 2 | 0 | 0 | 2 | 0 | 0.4712 |
| 50 | 168 | Opus 4.6 | Qwen 3.6 Plus | **Opus 4.6** (amber) | 2 | 0 | 0 | 2 | 0 | 0.5154 |
| 51 | 169 | Opus 4.6 | Qwen 3.6 Plus | **Opus 4.6** (amber) | 2 | 0 | 0 | 2 | 0 | 0.4027 |
| 52 | 171 | Gemini 3.1 Pro | Qwen 3.6 Plus | **Qwen 3.6 Plus** (blue) | 2 | 2 | 0 | 2 | 0 | 0.0000 |
| 53 | 170 | Gemini 3.1 Pro | Qwen 3.6 Plus | **Qwen 3.6 Plus** (blue) | 2 | 2 | 0 | 2 | 0 | 0.0000 |
| 54 | 172 | Gemini 3.1 Pro | Qwen 3.6 Plus | **Qwen 3.6 Plus** (blue) | 2 | 2 | 0 | 2 | 0 | 0.0000 |
| 55 | 174 | Gemini 3.1 Pro | Qwen 3.6 Plus | **Qwen 3.6 Plus** (blue) | 2 | 2 | 0 | 2 | 0 | 0.0039 |
| 56 | 124 | Grok 4.20 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 2 | 0 | 1 | 0 | 0.4409 |
| 57 | 125 | Grok 4.20 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 0 | 2 | 0 | 2 | 0.1896 |
| 58 | 126 | Grok 4.20 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 2 | 0 | 1 | 1 | 0.5958 |
| 59 | 127 | Grok 4.20 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 2 | 0 | 1 | 1 | 0.2856 |
| 60 | 122 | GPT-5.4 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 0 | 2 | 1 | 1 | 0.4829 |
| 61 | 128 | GPT-5.4 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 0 | 2 | 1 | 1 | 0.4299 |
| 62 | 129 | GPT-5.4 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 0 | 2 | 2 | 0 | 0.6752 |
| 63 | 133 | GPT-5.4 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 0 | 2 | 1 | 1 | 0.6185 |
| 64 | 135 | Opus 4.6 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 0 | 2 | 1 | 1 | 0.5943 |
| 65 | 136 | Opus 4.6 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 0 | 2 | 1 | 2 | 0.7563 |
| 66 | 140 | Opus 4.6 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 0 | 2 | 2 | 0 | 0.7891 |
| 67 | 141 | Opus 4.6 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 0 | 2 | 2 | 0 | 0.5602 |
| 68 | 134 | Gemini 3.1 Pro | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 2 | 0 | 2 | 0 | 0.1842 |
| 69 | 142 | Gemini 3.1 Pro | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 2 | 0 | 1 | 0 | 0.1091 |
| 70 | 143 | Gemini 3.1 Pro | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 2 | 0 | 2 | 0 | 0.2665 |
| 71 | 147 | Gemini 3.1 Pro | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 2 | 0 | 2 | 0 | 0.1689 |
| 72 | 148 | DeepSeek V3.2 | Qwen 3.6 Plus | **DeepSeek V3.2** (amber) | 2 | 1 | 0 | 2 | 0 | 0.0061 |
| 73 | 149 | DeepSeek V3.2 | Qwen 3.6 Plus | **DeepSeek V3.2** (amber) | 2 | 0 | 0 | 2 | 0 | 0.0058 |
| 74 | 150 | DeepSeek V3.2 | Qwen 3.6 Plus | **DeepSeek V3.2** (amber) | 2 | 0 | 0 | 2 | 1 | 0.0073 |
| 75 | 154 | DeepSeek V3.2 | Qwen 3.6 Plus | **DeepSeek V3.2** (amber) | 2 | 0 | 0 | 2 | 0 | 0.0075 |
| 76 | 155 | DeepSeek V3.2 | Kimi K2.5 | **Kimi K2.5** (blue) | 3 | 1 | 2 | 2 | 1 | 0.2284 |
| 77 | 156 | DeepSeek V3.2 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 0 | 2 | 1 | 1 | 0.1273 |
| 78 | 157 | DeepSeek V3.2 | Kimi K2.5 | **Kimi K2.5** (blue) | 3 | 1 | 2 | 2 | 1 | 0.3644 |
| 79 | 158 | DeepSeek V3.2 | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 0 | 2 | 1 | 1 | 0.1249 |
| 80 | 159 | Qwen 3.6 Plus | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 2 | 0 | 0 | 0 | 0.1251 |
| 81 | 163 | Qwen 3.6 Plus | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 2 | 0 | 1 | 0 | 0.1203 |
| 82 | 164 | Qwen 3.6 Plus | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 2 | 0 | 1 | 0 | 0.1654 |
| 83 | 165 | Qwen 3.6 Plus | Kimi K2.5 | **Kimi K2.5** (blue) | 2 | 2 | 0 | 1 | 0 | 0.1156 |

## 5. AI Call Statistics

### 5a. Aggregate per API Model

| API Model | Display Name | Total Calls | Avg Latency (ms) | Min Latency | Max Latency | Errors | Error Rate | Fallbacks | Fallback Rate | Prompt Tokens | Completion Tokens | Total Tokens | Cost ($) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `claude-opus-4-6` | Opus 4.6 | 392 | 37,591 | 5,459 | 883,128 | 136 | 34.69% | 3 | 0.77% | 422,450 | 393,122 | 815,572 | 11.9403 |
| `gpt-5.4` | GPT-5.4 | 272 | 51,000 | 3,968 | 236,527 | 1 | 0.37% | 0 | 0.0% | 250,610 | 708,295 | 958,905 | 11.2509 |
| `x-ai/grok-4.20-beta` | Grok 4.20 | 635 | 4,884 | 394 | 301,026 | 2 | 0.31% | 1 | 0.16% | 2,464,263 | 377,014 | 2,841,277 | 7.1906 |
| `moonshotai/kimi-k2.5` | Kimi K2.5 | 324 | 158,813 | 22,686 | 617,356 | 8 | 2.47% | 25 | 7.72% | 373,202 | 1,699,627 | 2,072,829 | 3.6232 |
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro | 1,126 | 13,338 | 7,513 | 221,566 | 983 | 87.3% | 24 | 2.13% | 729,479 | 59,401 | 1,326,865 | 2.1718 |
| `deepseek/deepseek-v3.2` | DeepSeek V3.2 | 135 | 70,625 | 6,894 | 506,903 | 1 | 0.74% | 0 | 0.0% | 183,382 | 97,367 | 280,749 | 0.0847 |
| `qwen/qwen3.6-plus-preview` | Qwen 3.6 Plus | 2,050 | 49 | 15 | 3,161 | 2,050 | 100.0% | 50 | 2.44% | 0 | 0 | 0 | 0.0000 |
| `deepseek-ai/deepseek-v3.2` | DeepSeek V3.2 (fallback route) | 1,189 | 26 | 14 | 135 | 1,189 | 100.0% | 29 | 2.44% | 0 | 0 | 0 | 0.0000 |

### 5b. Calls by Action Type

| API Model | Action | Calls | Avg Latency (ms) | Error Rate |
|---|---|---:|---:|---:|
| `claude-opus-4-6` | deliberation_intercept | 164 | 37,706 | 36.59% |
| `claude-opus-4-6` | deliberation_own | 180 | 22,737 | 40.56% |
| `claude-opus-4-6` | generate_clues | 48 | 92,896 | 6.25% |
| `deepseek-ai/deepseek-v3.2` | deliberation_intercept | 580 | 26 | 100.0% |
| `deepseek-ai/deepseek-v3.2` | deliberation_own | 580 | 24 | 100.0% |
| `deepseek-ai/deepseek-v3.2` | generate_clues | 29 | 63 | 100.0% |
| `deepseek/deepseek-v3.2` | deliberation_intercept | 59 | 65,065 | 0.0% |
| `deepseek/deepseek-v3.2` | deliberation_own | 53 | 82,941 | 1.89% |
| `deepseek/deepseek-v3.2` | generate_clues | 23 | 56,505 | 0.0% |
| `gemini-3.1-pro-preview` | deliberation_intercept | 550 | 12,906 | 87.09% |
| `gemini-3.1-pro-preview` | deliberation_own | 528 | 10,694 | 90.91% |
| `gemini-3.1-pro-preview` | generate_clues | 48 | 47,358 | 50.0% |
| `gpt-5.4` | deliberation_intercept | 110 | 44,762 | 0.0% |
| `gpt-5.4` | deliberation_own | 112 | 29,717 | 0.89% |
| `gpt-5.4` | generate_clues | 50 | 112,396 | 0.0% |
| `moonshotai/kimi-k2.5` | deliberation_intercept | 109 | 115,701 | 0.92% |
| `moonshotai/kimi-k2.5` | deliberation_own | 165 | 169,102 | 4.24% |
| `moonshotai/kimi-k2.5` | generate_clues | 50 | 218,842 | 0.0% |
| `qwen/qwen3.6-plus-preview` | deliberation_intercept | 1000 | 52 | 100.0% |
| `qwen/qwen3.6-plus-preview` | deliberation_own | 1000 | 46 | 100.0% |
| `qwen/qwen3.6-plus-preview` | generate_clues | 50 | 63 | 100.0% |
| `x-ai/grok-4.20-beta` | deliberation_intercept | 186 | 6,079 | 0.54% |
| `x-ai/grok-4.20-beta` | deliberation_own | 399 | 4,081 | 0.0% |
| `x-ai/grok-4.20-beta` | generate_clues | 50 | 6,839 | 2.0% |

### 5c. Notes on Error Rates

- **Qwen 3.6 Plus** (`qwen/qwen3.6-plus-preview`): 100% error rate with 0 tokens processed. This model appears to have been completely non-functional during the tournament, consistently failing all API calls. Despite this, it won 1 match (against Grok 4.20), suggesting the game engine has fallback behavior that allowed minimal play.
- **DeepSeek V3.2** (`deepseek-ai/deepseek-v3.2`): A secondary routing path that also showed 100% error rate. The primary route (`deepseek/deepseek-v3.2`) functioned with only 0.74% errors.
- **Gemini 3.1 Pro**: 87.3% error rate indicates significant reliability issues, though the model still managed competitive performance when calls succeeded.
- **Opus 4.6**: 34.7% error rate, though many of these may be timeout-related given its very high max latency (883s).

## 6. Model Behavioral Analysis

### Kimi K2.5

- **Record**: 24W-0L (100% win rate)
- **Avg Rounds/Game**: 2.08
- **Total Interceptions**: 30 (1.25 per game)
- **Total Miscommunications**: 14 (0.58 per game)
- **Wins by interception (2+ own intercepts)**: 8
- **Wins by opponent miscommunication (2+ opp miscomm)**: 13
- **Losses to interception (2+ opp intercepts)**: 0
- **Losses to own miscommunication (2+ own miscomm)**: 0

### Opus 4.6

- **Record**: 16W-8L (67% win rate)
- **Avg Rounds/Game**: 2.00
- **Total Interceptions**: 3 (0.12 per game)
- **Total Miscommunications**: 28 (1.17 per game)
- **Wins by interception (2+ own intercepts)**: 0
- **Wins by opponent miscommunication (2+ opp miscomm)**: 6
- **Losses to interception (2+ opp intercepts)**: 4
- **Losses to own miscommunication (2+ own miscomm)**: 8

### DeepSeek V3.2

- **Record**: 11W-13L (46% win rate)
- **Avg Rounds/Game**: 2.17
- **Total Interceptions**: 32 (1.33 per game)
- **Total Miscommunications**: 12 (0.50 per game)
- **Wins by interception (2+ own intercepts)**: 6
- **Wins by opponent miscommunication (2+ opp miscomm)**: 0
- **Losses to interception (2+ opp intercepts)**: 2
- **Losses to own miscommunication (2+ own miscomm)**: 5

### GPT-5.4

- **Record**: 10W-14L (42% win rate)
- **Avg Rounds/Game**: 2.08
- **Total Interceptions**: 3 (0.12 per game)
- **Total Miscommunications**: 30 (1.25 per game)
- **Wins by interception (2+ own intercepts)**: 0
- **Wins by opponent miscommunication (2+ opp miscomm)**: 2
- **Losses to interception (2+ opp intercepts)**: 2
- **Losses to own miscommunication (2+ own miscomm)**: 14

### Grok 4.20

- **Record**: 10W-14L (42% win rate)
- **Avg Rounds/Game**: 2.08
- **Total Interceptions**: 41 (1.71 per game)
- **Total Miscommunications**: 7 (0.29 per game)
- **Wins by interception (2+ own intercepts)**: 6
- **Wins by opponent miscommunication (2+ opp miscomm)**: 8
- **Losses to interception (2+ opp intercepts)**: 5
- **Losses to own miscommunication (2+ own miscomm)**: 1

### Qwen 3.6 Plus

- **Record**: 7W-17L (29% win rate)
- **Avg Rounds/Game**: 2.08
- **Total Interceptions**: 48 (2.00 per game)
- **Total Miscommunications**: 3 (0.12 per game)
- **Wins by interception (2+ own intercepts)**: 7
- **Wins by opponent miscommunication (2+ opp miscomm)**: 0
- **Losses to interception (2+ opp intercepts)**: 0
- **Losses to own miscommunication (2+ own miscomm)**: 0

### Gemini 3.1 Pro

- **Record**: 6W-18L (25% win rate)
- **Avg Rounds/Game**: 2.00
- **Total Interceptions**: 24 (1.00 per game)
- **Total Miscommunications**: 23 (0.96 per game)
- **Wins by interception (2+ own intercepts)**: 0
- **Wins by opponent miscommunication (2+ opp miscomm)**: 5
- **Losses to interception (2+ opp intercepts)**: 14
- **Losses to own miscommunication (2+ own miscomm)**: 6

## 7. Bradley-Terry Analysis

Bradley-Terry ratings estimate the relative strength of each model. A model with rating R1 vs a model with rating R2 has an estimated win probability of R1/(R1+R2).

**Note on Kimi K2.5**: This model went 24-0 (undefeated), which causes the standard Bradley-Terry MLE to diverge toward infinity. The raw rating of 636.19 is an artifact of the iterative algorithm hitting its convergence limit rather than a meaningful magnitude. It simply means the model dominated all opponents. A Bayesian approach or additional games would be needed to establish a finite upper bound.

### Ratings (excluding Kimi K2.5)

The following ratings are computed over the 6 non-dominant models only, providing more interpretable relative strengths:

| Rank | Model | BT Rating (raw) | Normalized (Opus=1000) | Notes |
|---:|---|---:|---:|---|
| 1 | **Kimi K2.5** | +Inf (24-0) | -- | Undefeated; rating diverges |
| 2 | **Opus 4.6** | 1.1173 | 1000 | Clear second; only model to beat everyone except Kimi |
| 3 | **DeepSeek V3.2** | 0.4039 | 362 | Strong despite minimal cost |
| 4 | **GPT-5.4** | 0.3366 | 301 | Tied on W-L with Grok, near-identical BT |
| 5 | **Grok 4.20** | 0.3365 | 301 | Tied on W-L with GPT-5.4, near-identical BT |
| 6 | **Qwen 3.6 Plus** | 0.1934 | 173 | 100% API error rate yet won 7 games |
| 7 | **Gemini 3.1 Pro** | 0.1590 | 142 | 87% API error rate; lowest ranked |

### Predicted Win Probabilities (row beats column)

Based on BT model (Kimi K2.5 estimated at >99% vs all others):

| Model | Kimi K2.5 | Opus 4.6 | DeepSeek V3.2 | GPT-5.4 | Grok 4.20 | Qwen 3.6 Plus | Gemini 3.1 Pro |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Kimi K2.5** | --- | >99% | >99% | >99% | >99% | >99% | >99% |
| **Opus 4.6** | <1% | --- | 73% | 77% | 77% | 85% | 88% |
| **DeepSeek V3.2** | <1% | 27% | --- | 55% | 55% | 68% | 72% |
| **GPT-5.4** | <1% | 23% | 45% | --- | 50% | 64% | 68% |
| **Grok 4.20** | <1% | 23% | 45% | 50% | --- | 64% | 68% |
| **Qwen 3.6 Plus** | <1% | 15% | 32% | 36% | 36% | --- | 55% |
| **Gemini 3.1 Pro** | <1% | 12% | 28% | 32% | 32% | 45% | --- |

## 8. Cost Breakdown

### 8a. Per Model (Combined)

| Model | Total Tokens | Estimated Cost ($) | Cost per Game |
|---|---:|---:|---:|
| Kimi K2.5 | 2,072,829 | 3.6232 | 0.1510 |
| Opus 4.6 | 815,572 | 11.9403 | 0.4975 |
| DeepSeek V3.2 | 280,749 | 0.0847 | 0.0035 |
| GPT-5.4 | 958,905 | 11.2509 | 0.4688 |
| Grok 4.20 | 2,841,277 | 7.1906 | 0.2996 |
| Qwen 3.6 Plus | 0 | 0.0000 | 0.0000 |
| Gemini 3.1 Pro | 1,326,865 | 2.1718 | 0.0905 |
| **TOTAL** | **8,296,197** | **36.2615** | **0.4317** |

### 8b. Per Match

| Match # | Match ID | Amber Model | Blue Model | Cost ($) |
|---:|---:|---|---|---:|
| 0 | 27 | GPT-5.4 | Opus 4.6 | 0.8868 |
| 1 | 28 | GPT-5.4 | Opus 4.6 | 0.6805 |
| 2 | 29 | GPT-5.4 | Opus 4.6 | 0.9510 |
| 3 | 30 | GPT-5.4 | Opus 4.6 | 0.8527 |
| 4 | 32 | GPT-5.4 | Gemini 3.1 Pro | 0.3748 |
| 5 | 31 | GPT-5.4 | Gemini 3.1 Pro | 0.5437 |
| 6 | 33 | GPT-5.4 | Gemini 3.1 Pro | 0.4397 |
| 7 | 34 | GPT-5.4 | Gemini 3.1 Pro | 0.5778 |
| 8 | 35 | GPT-5.4 | Grok 4.20 | 0.5984 |
| 9 | 36 | GPT-5.4 | Grok 4.20 | 0.4781 |
| 10 | 37 | GPT-5.4 | Grok 4.20 | 0.5443 |
| 11 | 38 | GPT-5.4 | Grok 4.20 | 0.4271 |
| 12 | 42 | Opus 4.6 | Gemini 3.1 Pro | 0.4135 |
| 13 | 43 | Opus 4.6 | Gemini 3.1 Pro | 0.3421 |
| 14 | 44 | Opus 4.6 | Gemini 3.1 Pro | 0.3516 |
| 15 | 45 | Opus 4.6 | Gemini 3.1 Pro | 0.5044 |
| 16 | 47 | Opus 4.6 | Grok 4.20 | 0.7375 |
| 17 | 46 | Opus 4.6 | Grok 4.20 | 0.8511 |
| 18 | 48 | Opus 4.6 | Grok 4.20 | 1.8984 |
| 19 | 65 | Opus 4.6 | Grok 4.20 | 0.9541 |
| 20 | 50 | Gemini 3.1 Pro | Grok 4.20 | 0.1792 |
| 21 | 75 | Gemini 3.1 Pro | Grok 4.20 | 1.9110 |
| 22 | 68 | Gemini 3.1 Pro | Grok 4.20 | 0.7887 |
| 23 | 77 | Gemini 3.1 Pro | Grok 4.20 | 0.5280 |
| 24 | 97 | Grok 4.20 | DeepSeek V3.2 | 0.4404 |
| 25 | 87 | Grok 4.20 | DeepSeek V3.2 | 0.2098 |
| 26 | 98 | Grok 4.20 | DeepSeek V3.2 | 0.3786 |
| 27 | 91 | Grok 4.20 | DeepSeek V3.2 | 0.1659 |
| 28 | 102 | GPT-5.4 | DeepSeek V3.2 | 0.3114 |
| 29 | 103 | GPT-5.4 | DeepSeek V3.2 | 0.3877 |
| 30 | 109 | GPT-5.4 | DeepSeek V3.2 | 0.4833 |
| 31 | 111 | GPT-5.4 | DeepSeek V3.2 | 1.2070 |
| 32 | 110 | Opus 4.6 | DeepSeek V3.2 | 0.5335 |
| 33 | 130 | Opus 4.6 | DeepSeek V3.2 | 0.4934 |
| 34 | 131 | Opus 4.6 | DeepSeek V3.2 | 0.4465 |
| 35 | 132 | Opus 4.6 | DeepSeek V3.2 | 0.4017 |
| 36 | 137 | Gemini 3.1 Pro | DeepSeek V3.2 | 0.0000 |
| 37 | 138 | Gemini 3.1 Pro | DeepSeek V3.2 | 0.0000 |
| 38 | 139 | Gemini 3.1 Pro | DeepSeek V3.2 | 0.0000 |
| 39 | 144 | Gemini 3.1 Pro | DeepSeek V3.2 | 0.0000 |
| 40 | 145 | Grok 4.20 | Qwen 3.6 Plus | 0.5258 |
| 41 | 146 | Grok 4.20 | Qwen 3.6 Plus | 0.3541 |
| 42 | 151 | Grok 4.20 | Qwen 3.6 Plus | 0.3806 |
| 43 | 152 | Grok 4.20 | Qwen 3.6 Plus | 0.0884 |
| 44 | 153 | GPT-5.4 | Qwen 3.6 Plus | 0.7989 |
| 45 | 160 | GPT-5.4 | Qwen 3.6 Plus | 0.4648 |
| 46 | 161 | GPT-5.4 | Qwen 3.6 Plus | 0.3928 |
| 47 | 162 | GPT-5.4 | Qwen 3.6 Plus | 0.5459 |
| 48 | 166 | Opus 4.6 | Qwen 3.6 Plus | 0.4981 |
| 49 | 167 | Opus 4.6 | Qwen 3.6 Plus | 0.4712 |
| 50 | 168 | Opus 4.6 | Qwen 3.6 Plus | 0.5154 |
| 51 | 169 | Opus 4.6 | Qwen 3.6 Plus | 0.4027 |
| 52 | 171 | Gemini 3.1 Pro | Qwen 3.6 Plus | 0.0000 |
| 53 | 170 | Gemini 3.1 Pro | Qwen 3.6 Plus | 0.0000 |
| 54 | 172 | Gemini 3.1 Pro | Qwen 3.6 Plus | 0.0000 |
| 55 | 174 | Gemini 3.1 Pro | Qwen 3.6 Plus | 0.0039 |
| 56 | 124 | Grok 4.20 | Kimi K2.5 | 0.4409 |
| 57 | 125 | Grok 4.20 | Kimi K2.5 | 0.1896 |
| 58 | 126 | Grok 4.20 | Kimi K2.5 | 0.5958 |
| 59 | 127 | Grok 4.20 | Kimi K2.5 | 0.2856 |
| 60 | 122 | GPT-5.4 | Kimi K2.5 | 0.4829 |
| 61 | 128 | GPT-5.4 | Kimi K2.5 | 0.4299 |
| 62 | 129 | GPT-5.4 | Kimi K2.5 | 0.6752 |
| 63 | 133 | GPT-5.4 | Kimi K2.5 | 0.6185 |
| 64 | 135 | Opus 4.6 | Kimi K2.5 | 0.5943 |
| 65 | 136 | Opus 4.6 | Kimi K2.5 | 0.7563 |
| 66 | 140 | Opus 4.6 | Kimi K2.5 | 0.7891 |
| 67 | 141 | Opus 4.6 | Kimi K2.5 | 0.5602 |
| 68 | 134 | Gemini 3.1 Pro | Kimi K2.5 | 0.1842 |
| 69 | 142 | Gemini 3.1 Pro | Kimi K2.5 | 0.1091 |
| 70 | 143 | Gemini 3.1 Pro | Kimi K2.5 | 0.2665 |
| 71 | 147 | Gemini 3.1 Pro | Kimi K2.5 | 0.1689 |
| 72 | 148 | DeepSeek V3.2 | Qwen 3.6 Plus | 0.0061 |
| 73 | 149 | DeepSeek V3.2 | Qwen 3.6 Plus | 0.0058 |
| 74 | 150 | DeepSeek V3.2 | Qwen 3.6 Plus | 0.0073 |
| 75 | 154 | DeepSeek V3.2 | Qwen 3.6 Plus | 0.0075 |
| 76 | 155 | DeepSeek V3.2 | Kimi K2.5 | 0.2284 |
| 77 | 156 | DeepSeek V3.2 | Kimi K2.5 | 0.1273 |
| 78 | 157 | DeepSeek V3.2 | Kimi K2.5 | 0.3644 |
| 79 | 158 | DeepSeek V3.2 | Kimi K2.5 | 0.1249 |
| 80 | 159 | Qwen 3.6 Plus | Kimi K2.5 | 0.1251 |
| 81 | 163 | Qwen 3.6 Plus | Kimi K2.5 | 0.1203 |
| 82 | 164 | Qwen 3.6 Plus | Kimi K2.5 | 0.1654 |
| 83 | 165 | Qwen 3.6 Plus | Kimi K2.5 | 0.1156 |
| | | | **TOTAL** | **36.2614** |

### 8c. Observations on Cost Anomalies

- Matches 36-39, 52-55, 170, 171, 172, 174 (Gemini 3.1 Pro as amber vs DeepSeek V3.2 or Qwen 3.6 Plus) show $0.0000 cost, indicating both models' API routes failed completely in those matchups. The game engine's fallback mechanisms determined the outcome.
- Qwen 3.6 Plus had $0.0000 total cost across all games due to 100% API failure. Its 7 wins came entirely through the opponent failing worse or through game engine defaults.
- DeepSeek V3.2 cost only $0.0847 total despite playing 24 games, making it by far the most cost-efficient model.

### 8d. Cost Summary

- **Tournament Budget Cap**: $250.00
- **Actual Cost (from tournament record)**: $33.268724
- **Sum of AI Call Costs**: $36.2614
- **Average Cost per Match**: $0.4317
- **Most Expensive Match**: Match #75 ($1.9110)
- **Least Expensive Match**: Match #137 ($0.0000)

