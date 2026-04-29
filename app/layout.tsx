import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider, THEME_STORAGE_KEY } from "@/lib/theme-context";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LockIn.",
  description: "Training, recovery, and progress dashboard",
};

const themeScript = `try{const t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='olive'||t==='lavender'||t==='terracotta'){document.documentElement.setAttribute('data-theme',t)}else{document.documentElement.setAttribute('data-theme','olive')}}catch{document.documentElement.setAttribute('data-theme','olive')}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
