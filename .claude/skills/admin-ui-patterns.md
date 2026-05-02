# ClawForge Admin UI Patterns

## Applies to

Files in `admin/src/`

## Component conventions

- All pages use `"use client"` directive (Next.js 15 App Router client components)
- Page layout: `<Sidebar />` + `<main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">`
- Background: `bg-base-200` on the outer flex container
- Page header: `<h2 className="text-2xl font-bold">` + `<p className="text-sm text-base-content/50 mt-1">`

## DaisyUI theme ("clawforge")

Defined in `admin/tailwind.config.ts`:

- Primary: `#3b82f6` (blue-500), Secondary: `#6366f1` (indigo-500), Accent: `#06b6d4` (cyan-500)
- Neutral: `#0f172a` (slate-900), Base-100: `#ffffff`, Base-200: `#f8fafc`, Base-300: `#f1f5f9`
- Success: `#22c55e`, Warning: `#f59e0b`, Error: `#ef4444`, Info: `#3b82f6`
- Border radius: box `0.75rem`, btn `0.5rem`, badge `1rem`
- Use DaisyUI semantic classes: `btn`, `card`, `badge`, `table`, `alert`, `tabs`, `stat`, `loading`
- Never use raw Tailwind colors for semantic elements — use `text-primary`, `bg-error`, `badge-success`, etc.

## Shared components (in `admin/src/components/`)

- `Card`, `CardTitle`, `StatCard` — from `card.tsx`
- `Badge` (with variants: success, danger, warning, info) — from `badge.tsx`
- `Sidebar` — from `sidebar.tsx`
- `StatSkeleton`, `TableSkeleton`, `CardSkeleton` — from `skeleton.tsx`
- `useToast` (with `success()` and `error()` methods) — from `toast.tsx`

## Data fetching pattern

- Use `getAuth()` from `@/lib/auth` for token + orgId
- Use API functions from `@/lib/api` (never raw fetch)
- Use `Promise.allSettled` for parallel requests on page load
- Auth redirect: `if (!auth) { router.replace("/login"); return; }`
- Loading state: show skeleton components while data loads

## Animation (Framer Motion)

- Use `motion` from `framer-motion` for enter/exit animations
- `AnimatePresence` for list items
- Standard enter: `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}`
- Stagger children with `transition={{ delay: index * 0.05 }}`

## Tables

- Use DaisyUI `table table-sm` class
- Header: `<tr className="text-base-content/40 text-xs uppercase">`
- Wrap in `<div className="overflow-x-auto -mx-5">` inside Card for full-width tables
- Status columns use `<Badge>` component

## Custom animations available (from tailwind.config.ts)

- `animate-fade-in`, `animate-fade-in-up`, `animate-slide-in-right`
- `animate-slide-in-left`, `animate-scale-in`, `animate-pulse-slow`
