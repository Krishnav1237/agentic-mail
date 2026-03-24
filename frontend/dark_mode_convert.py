import os

files = [
    'src/pages/Deadlines.tsx',
    'src/pages/Opportunities.tsx',
    'src/pages/Inbox.tsx',
    'src/pages/Settings.tsx',
    'src/pages/Agent.tsx',
    'src/components/EmailRow.tsx',
    'src/components/TaskRow.tsx',
    'src/components/Pagination.tsx',
    'src/components/ConnectPrompt.tsx',
    'src/components/EmptyState.tsx'
]

replacements = {
    'text-slate-950': 'text-white drop-shadow-sm',
    'text-slate-900': 'text-white',
    'text-slate-600': 'text-slate-400 font-light',
    'text-slate-500': 'text-cyan-500/80',
    'bg-white/70': 'bg-slate-900/60 border border-slate-800/80',
    'bg-white/75': 'bg-slate-900/60 border border-slate-800/80',
    'bg-white/80': 'bg-slate-900/60 border border-slate-800/80',
    'bg-white/85': 'bg-slate-900/60',
    'bg-white': 'bg-slate-900/80 border border-slate-800',
    'border-slate-200/80': 'border-slate-800',
    'border-slate-200/90': 'border-slate-800',
    'border-slate-200': 'border-slate-800',
    'border-white/70': 'border-slate-800',
    'bg-slate-50/80': 'bg-slate-900/40',
    'bg-slate-50': 'bg-slate-900/40',
    'text-cyan-700': 'text-cyan-400',
    'text-amber-600': 'text-amber-400',
    'text-emerald-600': 'text-emerald-400',
    'text-emerald-700': 'text-emerald-400',
    'text-rose-700': 'text-rose-400',
    'bg-rose-50': 'bg-rose-900/20',
    'border-rose-200': 'border-rose-800/50',
    'bg-cyan-50/80': 'bg-cyan-900/20 text-cyan-400 border border-cyan-800',
    'text-cyan-800': 'text-cyan-400',
    'text-cyan-950': 'text-cyan-400',
    'ring-slate-100': 'ring-slate-800',
    'bg-cyan-100': 'bg-cyan-900/30 text-cyan-400',
    'text-amber-700': 'text-amber-400',
    'text-amber-800': 'text-amber-400',
    'bg-amber-50': 'bg-amber-900/20'
}

for file in files:
    path = os.path.join('/Users/HP/outlook-bot/frontend', file)
    if os.path.exists(path):
        with open(path, 'r') as f:
            content = f.read()
        for k, v in replacements.items():
            content = content.replace(k, v)
        with open(path, 'w') as f:
            f.write(content)
        print(f"Updated {file}")
