import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, CheckCircle2, Sparkles, BrainCircuit } from 'lucide-react';

export function ProductDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => (s + 1) % 4);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto rounded-xl border border-white/[0.1] bg-[#0A0A0A] shadow-2xl shadow-indigo-500/10 overflow-hidden relative">
      {/* Window Controls */}
      <div className="h-10 border-b border-white/[0.05] bg-[#050505] flex items-center px-4 gap-2">
        <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
        <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
        <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
        <div className="ml-4 text-[10px] font-mono text-neutral-500">
          inbox-os.beta
        </div>
      </div>

      <div className="flex h-[380px]">
        {/* Sidebar */}
        <div className="w-48 border-r border-white/[0.05] p-4 flex flex-col gap-2 bg-[#050505]">
          <div className="text-[10px] font-semibold tracking-wider text-neutral-500 mb-2 px-2">
            WORKSPACE
          </div>
          <div
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${step < 2 ? 'bg-white/10 text-white' : 'text-neutral-500'}`}
          >
            <Mail size={14} /> Inbox
          </div>
          <div
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${step >= 2 ? 'bg-white/10 text-white' : 'text-neutral-500'}`}
          >
            <CheckCircle2 size={14} /> Tasks
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8 relative bg-[#0A0A0A] overflow-hidden">
          <AnimatePresence mode="wait">
            {step < 2 ? (
              <motion.div
                key="inbox"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-medium text-white mb-6">
                  Inbox (1 Unread)
                </h3>

                <motion.div
                  layout
                  className={`p-5 rounded-lg border transition-colors duration-1000 ${step === 1 ? 'border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.15)]' : 'border-white/[0.05] bg-white/[0.02]'} relative`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        Prof. Smith{' '}
                        <span className="text-xs text-neutral-500 font-normal ml-2">
                          10:42 AM
                        </span>
                      </div>
                      <div className="text-sm text-neutral-200 mt-1">
                        CS401: Final Project Guidelines
                      </div>
                      <div className="text-xs text-neutral-400 mt-2 leading-relaxed max-w-lg">
                        Please review the syllabus. The final submission is due
                        this Friday by 11:59 PM.
                      </div>
                    </div>
                    <AnimatePresence>
                      {step === 1 && (
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded text-[11px] font-medium border border-indigo-500/30"
                        >
                          <Sparkles size={12} /> Auto-Extracting...
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>

                <div className="p-5 rounded-lg border border-white/[0.05] bg-transparent opacity-40">
                  <div className="text-sm font-medium text-white">
                    GitHub{' '}
                    <span className="text-xs text-neutral-500 font-normal ml-2">
                      Yesterday
                    </span>
                  </div>
                  <div className="text-sm text-neutral-400 mt-1">
                    [outlook-bot] PR #42 merged seamlessly
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="tasks"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-4 h-full flex flex-col"
              >
                <h3 className="text-lg font-medium text-white mb-6">
                  Active Tasks
                </h3>

                <motion.div
                  layoutId="task-card"
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  className="p-5 rounded-lg border border-white/[0.08] bg-white/[0.02] shadow-xl relative"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-4 h-4 mt-0.5 rounded-full border border-neutral-600 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-white">
                          Submit Final Project (CS401)
                        </div>
                        <div className="mt-2 text-[11px] text-neutral-500 flex items-center gap-1.5">
                          <BrainCircuit size={12} className="text-indigo-400" />{' '}
                          Auto-extracted strictly from inbox triage
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] font-medium px-2 py-1 bg-red-500/10 text-red-500 rounded border border-red-500/20">
                      Due Friday
                    </div>
                  </div>
                </motion.div>

                <div className="mt-auto pb-4">
                  <div className="flex items-center justify-between text-neutral-500 border-t border-white/[0.05] pt-4">
                    <span className="text-xs">1 tasks pending</span>
                    <span className="text-xs">0 overdue</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
