import "../styles/globals.css";
import React from "react";

export const metadata = {
  title: "Criminal Face Recognition",
  description: "LBPH-based face recognition demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <div className="max-w-5xl mx-auto p-4">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Criminal Face Recognition</h1>
            <nav className="flex gap-4 text-sm">
              <a className="hover:underline" href="/">Dashboard</a>
              <a className="hover:underline" href="/train">Train</a>
              <a className="hover:underline" href="/recognize">Recognize</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}


