"use client"

import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className={cn("h-8 w-8 shrink-0", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="16" fill="#29483B" />
      <path
        d="M19 20v-5h9M45 20v-5h-9M19 44v5h9M45 44v5h-9"
        stroke="#F8F4EA"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 25h16M22 32h20M24 39h16"
        stroke="#C69C4A"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M40.5 21.5c-3.2-3.1-9.4-3.5-12.6-.8-3.7 3.1-2.3 8.6 3.3 9.8l5.4 1.2c5.8 1.3 7.1 6.8 2.8 9.9-3.5 2.5-9.7 1.8-13.1-1.6"
        stroke="#F8F4EA"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 32h4M42 32h4"
        stroke="#78A98A"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
