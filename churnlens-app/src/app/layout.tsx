import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChurnLens",
  description: "AI Customer Risk Analyst",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="h-full flex bg-[#F9F7F4]">
        {/* Sidebar nav */}
        <nav className="w-[60px] shrink-0 bg-[#1C1917] flex flex-col items-center pt-5 pb-4 gap-2">
          {/* Logo mark */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-3 shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>

          <NavLink href="/" title="Chat">
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </NavLink>

          <NavLink href="/dashboard" title="Dashboard">
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </NavLink>
        </nav>

        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}

function NavLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      title={title}
      className="w-10 h-10 rounded-xl flex items-center justify-center text-stone-500 hover:text-white hover:bg-white/10 transition-all duration-150"
    >
      {children}
    </Link>
  );
}
