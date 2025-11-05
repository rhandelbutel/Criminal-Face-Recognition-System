"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { CameraIcon, Cog6ToothIcon, PhotoIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard", icon: CameraIcon },
  { href: "/train", label: "Train", icon: Cog6ToothIcon },
  { href: "/recognize", label: "Recognize", icon: PhotoIcon },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 rounded-xl bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 shadow px-2 py-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}>
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}



