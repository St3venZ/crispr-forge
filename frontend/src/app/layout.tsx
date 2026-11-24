import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRISPR-Forge · 零信任原核 CRISPR/Cas9 全自动设计工作台",
  description:
    "从真实 NCBI RefSeq / 本地 GenBank/FASTA 序列到 12 点硅片仿真验证、交互式可缩放基因座图谱、模拟琼脂糖凝胶电泳与实验台移液表。",
};

const ANTI_FLASH_SCRIPT = `
(function() {
  try {
    var root = document.documentElement;
    var savedTheme = window.localStorage.getItem('crispr_forge_theme') || 'system';
    var isDark = savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');

    var pct = 100;
    var rawPct = window.localStorage.getItem('crispr_forge_font_scale_pct');
    if (rawPct !== null) {
      var parsed = parseInt(rawPct, 10);
      if (!isNaN(parsed)) pct = Math.max(84, Math.min(120, parsed));
    } else {
      var legacy = window.localStorage.getItem('crispr_forge_font_scale');
      if (legacy === 'compact') pct = 92;
      else if (legacy === 'large') pct = 112;
    }
    root.style.fontSize = (16 * pct / 100).toFixed(2) + 'px';
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased selection:bg-blue-200/80 selection:text-slate-950 dark:selection:bg-sky-500/30 dark:selection:text-sky-100">
        {children}
      </body>
    </html>
  );
}
