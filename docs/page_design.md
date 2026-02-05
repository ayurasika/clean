#1.トップページ

<!DOCTYPE html>
<html class="light" lang="ja"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>かたづけナビ AI - ホーム画面</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400&amp;family=Noto+Sans+JP:wght@200;300;400&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..300,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        "cream": "#F9F7F2",
                        "beige-soft": "#F2EFE9",
                        "sage-muted": "#9EB3A2",
                        "sage-light": "#DCE3DE",
                        "text-main": "#5C5852",
                        "text-light": "#8E8A82",
                    },
                    fontFamily: {
                        "sans": ["Inter", "Noto Sans JP", "sans-serif"]
                    },
                    borderRadius: {
                        "3xl": "24px",
                        "4xl": "32px",
                    },
                },
            },
        }
    </script>
<style type="text/tailwindcss">
        :root {
            --neumorph-subtle: 4px 4px 12px rgba(0, 0, 0, 0.03), -4px -4px 12px rgba(255, 255, 255, 0.8);
            --neumorph-inset: inset 2px 2px 5px rgba(0, 0, 0, 0.02), inset -2px -2px 5px rgba(255, 255, 255, 0.7);
        }
        body {
            font-family: 'Noto Sans JP', 'Inter', sans-serif;
            -webkit-font-smoothing: antialiased;
            background-color: #F9F7F2;
        }
        .soft-shadow {
            box-shadow: var(--neumorph-subtle);
        }
        .soft-inset {
            box-shadow: var(--neumorph-inset);
        }
        .progress-bar-bg {
            background: #EAE7E0;
        }
    </style>
<style>
    body {
      min-height: max(884px, 100dvh);
    }
  </style>
  </head>
<body class="text-text-main min-h-screen font-light">
<header class="flex items-center bg-cream/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 justify-between">
<div class="flex size-10 items-center justify-center rounded-full bg-beige-soft soft-shadow">
<span class="material-symbols-outlined text-text-main font-light">menu</span>
</div>
<h2 class="text-text-main text-sm font-light leading-tight tracking-[0.15em] flex-1 text-center">かたづけナビ AI</h2>
<div class="flex size-10 items-center justify-end">
<button class="flex items-center justify-center rounded-full h-10 w-10 bg-beige-soft soft-shadow overflow-hidden">
<span class="material-symbols-outlined font-light">person</span>
</button>
</div>
</header>
<main class="max-w-md mx-auto px-6 pb-32">
<div class="pt-8 pb-8 text-left">
<p class="text-text-light text-xs tracking-widest mb-1 font-light uppercase">Welcome back</p>
<h1 class="text-text-main text-3xl font-extralight leading-tight">おはようございます</h1>
</div>
<div class="bg-beige-soft p-8 rounded-3xl soft-shadow mb-8">
<div class="flex justify-between items-end mb-4">
<span class="text-text-main text-sm tracking-wide">お部屋の散らかり具合</span>
<span class="text-sage-muted text-2xl font-light">15<span class="text-xs ml-0.5">%</span></span>
</div>
<div class="w-full h-3 progress-bar-bg rounded-full soft-inset relative overflow-hidden">
<div class="absolute top-0 left-0 h-full bg-sage-muted rounded-full" style="width: 15%"></div>
</div>
<p class="text-text-light text-[11px] mt-4 leading-relaxed font-light">
                現在は非常にクリーンな状態です。この静かな環境を楽しみましょう。
            </p>
</div>
<h3 class="text-text-light text-[10px] tracking-[0.25em] mb-6 uppercase text-center">Today's Suggestion</h3>
<div class="bg-white p-6 rounded-3xl soft-shadow border border-white/50 mb-10">
<div class="flex gap-4 items-start mb-6">
<div class="flex-1">
<p class="text-text-main text-lg font-light mb-1">リビングの雑誌整理</p>
<div class="flex items-center gap-1.5 text-text-light">
<span class="material-symbols-outlined text-sm font-light">schedule</span>
<p class="text-[11px] font-light">約 5 分のワーク</p>
</div>
</div>
<div class="w-20 h-20 bg-beige-soft rounded-2xl bg-cover bg-center soft-inset" style='background-image: url("https://lh3.googleusercontent.com/aida-public/AB6AXuDnvbaOkALFPxcSkop5j7bsmq2jhL6QxKCOie0GW4ATQSG-WaKp8HG6lRHVCqhMae0FvYlne9UW88fW2cfsw-6nrhj4N2LNkW8dTBSXswmKLfcXba24-Hn17dWnDevK_gccB1cI8K4HlctCXUmXe2mC1JmKvVOUHy3DKpkAhGkzu8OjTDTSq_EiIRf3OUKDQ3SfEMPrrx05U9EpAJfTnECpCL2cpn6fhVdQhgcrgR-OGJZIS7rE-JRtJjGkGhhak6fsPcyuTZw0zoUr");'>
</div>
</div>
<button class="w-full py-4 rounded-full bg-sage-muted text-white text-xs tracking-[0.2em] font-light soft-shadow transition-transform active:scale-[0.98] uppercase">
                はじめる
            </button>
</div>
<div class="bg-beige-soft/50 p-6 rounded-3xl border border-white/40 flex flex-col items-center gap-3">
<span class="material-symbols-outlined text-sage-muted text-lg">spa</span>
<p class="text-text-light text-xs font-light text-center leading-relaxed">
                「一つ手に入れたら、一つ手放す」<br/>
                それが心地よい空間を保つための魔法です。
            </p>
</div>
</main>
<nav class="fixed bottom-8 left-1/2 -translate-x-1/2 w-[85%] max-w-[340px] bg-white/70 backdrop-blur-xl border border-white/50 rounded-full px-4 py-3 flex items-center justify-around soft-shadow z-50">
<button class="text-sage-muted flex flex-col items-center gap-0.5 p-2">
<span class="material-symbols-outlined text-[22px] fill-1">home</span>
<span class="text-[9px] font-light tracking-tighter uppercase">Home</span>
</button>
<button class="text-text-light flex flex-col items-center gap-0.5 p-2">
<span class="material-symbols-outlined text-[22px] font-light">auto_awesome</span>
<span class="text-[9px] font-light tracking-tighter uppercase">Plan</span>
</button>
<button class="text-text-light flex flex-col items-center gap-0.5 p-2">
<span class="material-symbols-outlined text-[22px] font-light">monitoring</span>
<span class="text-[9px] font-light tracking-tighter uppercase">Log</span>
</button>
<button class="text-text-light flex flex-col items-center gap-0.5 p-2">
<span class="material-symbols-outlined text-[22px] font-light">settings</span>
<span class="text-[9px] font-light tracking-tighter uppercase">Set</span>
</button>
</nav>

</body></html>

#2.カメラ画面
<!DOCTYPE html>

<html class="dark" lang="ja"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Kataduke Navi AI - Camera</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        "primary": "#195de6",
                        "background-light": "#f6f6f8",
                        "background-dark": "#111621",
                    },
                    fontFamily: {
                        "display": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"]
                    },
                    borderRadius: {
                        "DEFAULT": "1rem",
                        "lg": "2rem",
                        "xl": "3rem",
                        "full": "9999px"
                    },
                },
            },
        }
    </script>
<style>
        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            -webkit-tap-highlight-color: transparent;
        }
        .soft-glow {
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
        }
        .shutter-outer {
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
        }
        .glass-panel {
            background: rgba(28, 31, 38, 0.6);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
        }
    </style>
<style>
    body {
      min-height: max(884px, 100dvh);
    }
  </style>
  </head>
<body class="bg-background-light dark:bg-background-dark text-white overflow-hidden">
<div class="relative flex h-screen w-full flex-col overflow-hidden max-w-[480px] mx-auto shadow-2xl">
<!-- Camera Viewport (Background) -->
<div class="absolute inset-0 z-0 overflow-hidden bg-slate-900">
<div class="h-full w-full bg-cover bg-center opacity-80" data-alt="Modern clean living room interior perspective" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuBCs2dtuTQBtevgAnlwCHsM_3TPJZagtxrXlKdDSRBdqFmoAthF5YJvNu-bwpuNmceeeZ0TLQEwpFVo9SKLgnkoO5ldLoaAyHupp9S0KXv7oqTOygxLi4xsOVr3ARYtnkv84tp-AiUGSp_-q3JKBBtOukV3DfmjcmLnpFCjtBKF7HZRR4Yk16d1soHr7NngZxBicB1ifdVZG7DwFAIlkZbWf8ZounjnxeJADc-e2gOEu5xolqPU8IwqXu6lwuXcQkF9KGvVfcZunrs8');">
</div>
<!-- AI Scanning Reticle (Soft Minimalist) -->
<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
<div class="relative w-64 h-64 border-2 border-primary/30 rounded-xl flex items-center justify-center">
<div class="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-xl"></div>
<div class="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-xl"></div>
<div class="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-xl"></div>
<div class="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-xl"></div>
<!-- AI Hint Label -->
<div class="bg-primary px-3 py-1 rounded-full text-xs font-bold tracking-wider animate-pulse flex items-center gap-1">
<span class="material-symbols-outlined text-[14px]">auto_fix_high</span>
<span>ANALYZING ROOM</span>
</div>
</div>
</div>
</div>
<!-- Top App Bar -->
<div class="relative z-10 flex items-center p-6 justify-between pt-12">
<div class="flex size-10 shrink-0 items-center justify-center rounded-full glass-panel cursor-pointer">
<span class="material-symbols-outlined text-white text-[20px]">close</span>
</div>
<div class="glass-panel px-4 py-2 rounded-full flex items-center gap-2 border border-white/10">
<div class="size-2 bg-green-400 rounded-full animate-pulse"></div>
<h2 class="text-white text-sm font-semibold leading-tight tracking-wide">高画質モード</h2>
</div>
<div class="flex size-10 shrink-0 items-center justify-center rounded-full glass-panel cursor-pointer">
<span class="material-symbols-outlined text-white text-[20px]">flash_on</span>
</div>
</div>
<!-- Floating UI Hints (Map/Nav Minimal) -->
<div class="mt-auto px-6 mb-4 relative z-10">
<div class="glass-panel p-4 rounded-xl border border-white/5 flex items-center gap-4">
<div class="size-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
<span class="material-symbols-outlined text-primary">location_on</span>
</div>
<div>
<p class="text-[10px] text-white/50 uppercase font-bold tracking-widest">Current Area</p>
<p class="text-sm font-medium">リビングルーム (Living Room)</p>
</div>
</div>
</div>
<!-- Bottom Controls -->
<div class="relative z-10 pb-10 px-6">
<div class="flex items-center justify-between gap-4">
<!-- Gallery Thumbnail -->
<button class="flex shrink-0 items-center justify-center rounded-full size-12 bg-white/10 glass-panel overflow-hidden border border-white/20">
<div class="size-full bg-cover bg-center" data-alt="Thumbnail of previous clean room photo" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuCVMmCHQCtiXzRlRhJbnPMRwXye_P7QXQ9NORTCd-0DamR-r6Gy_pAISL1nROlcXczhFuzK6cdfx3Wui1BfCPtEFdbTn_gHy5rJTztNHwxIGqXDIVKv50jaEPULq23ML8p_I2S8ISjEBOzBH_9XjcIkOZlpSOOH586HDLWsS_sLtRhDfQHnBIHj6GaK30MVq6M0Pmb74gN_C7qDtR-wjz2a53mAvudRJ7MB_r0RX_LAP4nevsOc9Eu-ktHvwRtcShEuxhNqpaez4LOK');">
</div>
</button>
<!-- Shutter Button Area -->
<div class="flex-1 flex justify-center">
<button class="relative flex items-center justify-center rounded-full size-20 bg-white/20 border-2 border-white/30 p-1 group">
<div class="size-full bg-white rounded-full soft-glow flex items-center justify-center shutter-outer">
<div class="size-16 rounded-full border border-slate-100"></div>
</div>
</button>
</div>
<!-- Camera Switch -->
<button class="flex shrink-0 items-center justify-center rounded-full size-12 glass-panel border border-white/10 text-white hover:bg-white/20 transition-colors">
<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 0, 'wght' 300;">sync</span>
</button>
</div>
<!-- Mode Selector Minimal -->
<div class="flex justify-center mt-6 gap-6">
<span class="text-xs font-bold text-white/40 tracking-widest uppercase">Video</span>
<span class="text-xs font-bold text-white tracking-widest uppercase relative">
                    Photo
                    <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 size-1 bg-primary rounded-full"></div>
</span>
<span class="text-xs font-bold text-white/40 tracking-widest uppercase">Panorama</span>
</div>
</div>
<!-- Minimal Navigation Tab Bar -->
<div class="relative z-10 flex gap-2 border-t border-white/5 bg-background-dark/80 px-4 pb-8 pt-3 backdrop-blur-md">
<a class="flex flex-1 flex-col items-center justify-center gap-1 text-white/40" href="#">
<span class="material-symbols-outlined text-[24px]">home</span>
</a>
<a class="flex flex-1 flex-col items-center justify-center gap-1 text-primary" href="#">
<span class="material-symbols-outlined text-[24px]" style="font-variation-settings: 'FILL' 1;">photo_camera</span>
</a>
<a class="flex flex-1 flex-col items-center justify-center gap-1 text-white/40" href="#">
<span class="material-symbols-outlined text-[24px]">history</span>
</a>
<a class="flex flex-1 flex-col items-center justify-center gap-1 text-white/40" href="#">
<span class="material-symbols-outlined text-[24px]">person</span>
</a>
</div>
</div>
</body></html>

#3.画像生成中
<!DOCTYPE html>
<html class="light" lang="ja"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>AI生成中 - かたづけナビ AI</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700&amp;family=Noto+Sans+JP:wght@400;500;700&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        "cream-bg": "#F9F7F2",
                        "sage-green": "#8DAA91",
                        "soft-beige": "#F2EFE9",
                        "text-main": "#5C564E"
                    },
                    fontFamily: {
                        "sans": ["M PLUS Rounded 1c", "Noto Sans JP", "sans-serif"]
                    },
                    borderRadius: {
                        "DEFAULT": "1.25rem",
                        "lg": "2.5rem",
                        "xl": "3.5rem"
                    },
                },
            },
        }
    </script>
<style type="text/tailwindcss">
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        body {
            background-color: #F9F7F2;
            color: #5C564E;
            min-height: 100dvh;
        }
        .room-fill-overlay {
            background: linear-gradient(to top, rgba(141, 170, 145, 0.08) 65%, transparent 65%);
        }
    </style>
<style>
    body {
      min-height: max(884px, 100dvh);
    }
  </style>
  </head>
<body class="font-sans antialiased overflow-hidden">
<div class="relative flex h-screen w-full flex-col items-center justify-between py-16 px-6">
<div class="absolute top-0 w-full flex justify-between px-8 pt-5 opacity-40">
<span class="text-[13px] font-bold">9:41</span>
<div class="flex gap-1.5 items-center">
<span class="material-symbols-outlined text-[16px]">signal_cellular_4_bar</span>
<span class="material-symbols-outlined text-[16px]">wifi</span>
<span class="material-symbols-outlined text-[18px]">battery_full</span>
</div>
</div>
<div class="absolute inset-0 z-0 room-fill-overlay"></div>
<div class="z-10 text-center mt-4">
<div class="mb-4 inline-flex items-center justify-center size-14 rounded-full bg-[#8DAA91]/10 text-[#8DAA91]">
<span class="material-symbols-outlined text-3xl">auto_fix_high</span>
</div>
<h2 class="text-[#8DAA91] text-sm font-bold tracking-widest uppercase">AI Processing</h2>
</div>
<div class="relative z-10 flex flex-col items-center justify-center w-full max-w-sm flex-1">
<div class="grid grid-cols-3 gap-6 items-center justify-center relative">
<div class="flex flex-col items-center gap-2 transform scale-110">
<div class="size-24 rounded-[2.5rem] bg-[#F2EFE9] shadow-sm flex items-center justify-center border-2 border-white/50">
<span class="material-symbols-outlined text-[#8DAA91] text-4xl">chair</span>
</div>
</div>
<div class="flex flex-col items-center gap-2 transform -translate-y-16">
<div class="size-20 rounded-[2rem] bg-[#F2EFE9] shadow-sm flex items-center justify-center border-2 border-white/50">
<span class="material-symbols-outlined text-[#8DAA91]/80 text-3xl">potted_plant</span>
</div>
</div>
<div class="flex flex-col items-center gap-2 transform scale-105">
<div class="size-20 rounded-[2rem] bg-[#F2EFE9] shadow-sm flex items-center justify-center border-2 border-white/50">
<span class="material-symbols-outlined text-[#8DAA91]/80 text-3xl">light</span>
</div>
</div>
<div class="absolute -top-4 -right-2 text-[#8DAA91]/30">
<span class="material-symbols-outlined text-xl">colors_spark</span>
</div>
<div class="absolute top-1/2 -left-8 text-[#8DAA91]/20">
<span class="material-symbols-outlined text-2xl">auto_awesome</span>
</div>
</div>
</div>
<div class="relative z-10 w-full flex flex-col items-center gap-10 mb-8">
<div class="space-y-3 text-center">
<h1 class="text-[#5C564E] tracking-tight text-[26px] font-bold px-4">
                    魔法をかけています...
                </h1>
<p class="text-[#8DAA91] text-base font-medium">
                    AIがあなたのお部屋を理想の空間へ
                </p>
</div>
<div class="w-full max-w-[280px] flex flex-col gap-4">
<div class="flex justify-between items-end px-1">
<div class="flex items-center gap-2">
<span class="flex h-2 w-2 rounded-full bg-[#8DAA91] opacity-70"></span>
<p class="text-[#5C564E] text-sm font-medium">家具を整頓中...</p>
</div>
<p class="text-[#5C564E] text-lg font-bold">65%</p>
</div>
<div class="h-3.5 w-full rounded-full bg-[#F2EFE9] overflow-hidden p-0.5 border border-white/50">
<div class="h-full rounded-full bg-[#8DAA91]" style="width: 65%;"></div>
</div>
<p class="text-[#A39E96] text-[13px] text-center font-normal">
                    あと少しで完了します。このままお待ちください。
                </p>
</div>
</div>
<div class="absolute -bottom-20 -left-20 size-64 bg-[#8DAA91]/5 rounded-full blur-3xl"></div>
<div class="absolute top-1/4 -right-20 size-64 bg-[#F2EFE9]/40 rounded-full blur-3xl"></div>
</div>

</body></html>

#4.画像生成完了画面
<!DOCTYPE html>
<html class="light" lang="ja"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>かたづけナビ AI - 未来予想図</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400&amp;family=Noto+Sans+JP:wght@200;300;400&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        "cream": "#F9F7F2",
                        "beige-soft": "#F2EFE9",
                        "sage-muted": "#9EB3A2",
                        "sage-light": "#DCE3DE",
                        "text-main": "#5C5852",
                        "text-light": "#8E8A82",
                    },
                    fontFamily: {
                        "sans": ["Inter", "Noto Sans JP", "sans-serif"]
                    },
                    borderRadius: {
                        "3xl": "24px",
                        "4xl": "32px",
                    },
                },
            },
        }
    </script>
<style type="text/tailwindcss">
        :root {
            --neumorph-subtle: 4px 4px 12px rgba(0, 0, 0, 0.03), -4px -4px 12px rgba(255, 255, 255, 0.8);
            --neumorph-inset: inset 2px 2px 5px rgba(0, 0, 0, 0.02), inset -2px -2px 5px rgba(255, 255, 255, 0.7);
        }
        body {
            font-family: 'Noto Sans JP', 'Inter', sans-serif;
            -webkit-font-smoothing: antialiased;
            background-color: #F9F7F2;
        }
        .soft-shadow {
            box-shadow: var(--neumorph-subtle);
        }
        .soft-inset {
            box-shadow: var(--neumorph-inset);
        }
    </style>
<style>
    body {
      min-height: max(884px, 100dvh);
    }
  </style>
  </head>
<body class="text-text-main min-h-screen font-light">
<header class="flex items-center bg-cream/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 justify-between">
<div class="flex size-10 items-center justify-center rounded-full bg-beige-soft soft-shadow">
<span class="material-symbols-outlined text-text-main font-light">menu</span>
</div>
<h2 class="text-text-main text-sm font-light leading-tight tracking-[0.15em] flex-1 text-center">かたづけナビ AI</h2>
<div class="flex size-10 items-center justify-end">
<button class="flex items-center justify-center rounded-full h-10 w-10 bg-beige-soft soft-shadow overflow-hidden">
<span class="material-symbols-outlined font-light">person</span>
</button>
</div>
</header>
<main class="max-w-md mx-auto px-6 pb-40">
<div class="pt-8 pb-6 text-center">
<h1 class="text-text-main text-2xl font-extralight leading-tight">未来予想図</h1>
<p class="text-text-light text-xs tracking-widest mt-2 font-light">お部屋が綺麗になった後のイメージです</p>
</div>
<div class="relative bg-white rounded-3xl soft-shadow overflow-hidden mb-8 aspect-[4/5] border border-white/50">
<div class="absolute inset-0 bg-cover bg-center" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuDnvbaOkALFPxcSkop5j7bsmq2jhL6QxKCOie0GW4ATQSG-WaKp8HG6lRHVCqhMae0FvYlne9UW88fW2cfsw-6nrhj4N2LNkW8dTBSXswmKLfcXba24-Hn17dWnDevK_gccB1cI8K4HlctCXUmXe2mC1JmKvVOUHy3DKpkAhGkzu8OjTDTSq_EiIRf3OUKDQ3SfEMPrrx05U9EpAJfTnECpCL2cpn6fhVdQhgcrgR-OGJZIS7rE-JRtJjGkGhhak6fsPcyuTZw0zoUr');">
<div class="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-soft-light" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuDnvbaOkALFPxcSkop5j7bsmq2jhL6QxKCOie0GW4ATQSG-WaKp8HG6lRHVCqhMae0FvYlne9UW88fW2cfsw-6nrhj4N2LNkW8dTBSXswmKLfcXba24-Hn17dWnDevK_gccB1cI8K4HlctCXUmXe2mC1JmKvVOUHy3DKpkAhGkzu8OjTDTSq_EiIRf3OUKDQ3SfEMPrrx05U9EpAJfTnECpCL2cpn6fhVdQhgcrgR-OGJZIS7rE-JRtJjGkGhhak6fsPcyuTZw0zoUr'); filter: saturate(1.2) brightness(1.1);"></div>
</div>
<div class="absolute inset-0 flex flex-col">
<div class="h-1/2 w-full border-b-2 border-white/80 relative">
<div class="absolute bottom-2 left-4 bg-black/20 backdrop-blur-md px-3 py-1 rounded-full">
<span class="text-white text-[10px] tracking-widest uppercase">After</span>
</div>
</div>
<div class="h-1/2 w-full relative">
<div class="absolute top-2 left-4 bg-black/20 backdrop-blur-md px-3 py-1 rounded-full">
<span class="text-white text-[10px] tracking-widest uppercase">Before</span>
</div>
</div>
</div>
<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-12 h-12 bg-white/90 rounded-full soft-shadow border border-white">
<span class="material-symbols-outlined text-sage-muted text-xl rotate-90">unfold_more</span>
</div>
</div>
<div class="flex flex-col gap-4 px-2">
<button class="w-full py-5 rounded-full bg-sage-muted text-white text-sm tracking-[0.2em] font-light soft-shadow active:scale-[0.98] transition-transform">
                片付ける！
            </button>
<button class="w-full py-5 rounded-full bg-white text-text-main text-sm tracking-[0.2em] font-light soft-shadow border border-white/50 active:scale-[0.98] transition-transform">
                もっと綺麗に
            </button>
<button class="mt-4 text-text-light text-xs font-light tracking-widest underline underline-offset-4 active:opacity-60">
                撮り直す
            </button>
</div>
</main>
<nav class="fixed bottom-8 left-1/2 -translate-x-1/2 w-[85%] max-w-[340px] bg-white/70 backdrop-blur-xl border border-white/50 rounded-full px-4 py-3 flex items-center justify-around soft-shadow z-50">
<button class="text-text-light flex flex-col items-center gap-0.5 p-2">
<span class="material-symbols-outlined text-[22px] font-light">home</span>
<span class="text-[9px] font-light tracking-tighter uppercase">Home</span>
</button>
<button class="text-sage-muted flex flex-col items-center gap-0.5 p-2">
<span class="material-symbols-outlined text-[22px] fill-1">auto_awesome</span>
<span class="text-[9px] font-light tracking-tighter uppercase">Plan</span>
</button>
<button class="text-text-light flex flex-col items-center gap-0.5 p-2">
<span class="material-symbols-outlined text-[22px] font-light">monitoring</span>
<span class="text-[9px] font-light tracking-tighter uppercase">Log</span>
</button>
<button class="text-text-light flex flex-col items-center gap-0.5 p-2">
<span class="material-symbols-outlined text-[22px] font-light">settings</span>
<span class="text-[9px] font-light tracking-tighter uppercase">Set</span>
</button>
</nav>

</body></html>