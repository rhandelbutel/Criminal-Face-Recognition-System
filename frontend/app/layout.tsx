import "../styles/globals.css";
import React from "react";
import { Inter } from "next/font/google";
import { Nav } from "../components/Nav";

export const metadata = {
  title: "Criminal Face Recognition",
  description: "LBPH-based face recognition demo",
};

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-gray-900 bg-grid`}> 
        <div className="mx-auto max-w-6xl p-4 md:p-6">
          <header className="mb-6 md:mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Criminal Face Recognition</h1>
            </div>
            <Nav />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}



