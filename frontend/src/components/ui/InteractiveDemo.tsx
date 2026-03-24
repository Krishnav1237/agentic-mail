import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function InteractiveDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const sequence = [3500, 3500, 4500];
    let timeout: ReturnType<typeof setTimeout>;

    const advance = (currentStep: number) => {
      timeout = setTimeout(() => {
        const nextStep = (currentStep + 1) % 3;
        setStep(nextStep);
        advance(nextStep);
      }, sequence[currentStep]);
    };

    advance(0);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="w-full h-[450px] bg-black rounded-lg border border-white/5 flex flex-col font-mono relative overflow-hidden">
       {/* Top Bar */}
       <div className="h-10 border-b border-white/5 flex items-center justify-between px-4 bg-white/[0.02]">
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">coreLoop.ts - Execution Trace</div>
          <div className="text-[10px] uppercase tracking-widest flex items-center gap-2">
             <div className={`w-2 h-2 rounded-full ${step === 0 ? 'bg-yellow-500 animate-pulse' : step === 1 ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`} />
             <span className="text-neutral-400">{step === 0 ? 'BullMQ Ingesting' : step === 1 ? 'HeavyPlanner Executing' : 'Pending Approval'}</span>
          </div>
       </div>

       <div className="flex-1 flex text-xs">
          {/* Sidebar */}
          <div className="w-48 border-r border-white/5 p-4 hidden md:block bg-white/[0.01]">
             <div className="mb-6 opacity-40">
                <div className="mb-2 text-white">Redis Cache</div>
                <div className="pl-2">state_hash: ok</div>
             </div>
             <div className="mb-6 opacity-40">
                <div className="mb-2 text-white">Tool Registry</div>
                <div className="pl-2">create_task</div>
                <div className="pl-2">draft_reply [GATE]</div>
             </div>
             <div className="mb-6 opacity-40">
                <div className="mb-2 text-white">Postgres</div>
                <div className="pl-2">agent_actions</div>
                <div className="pl-2">episodic_memory</div>
             </div>
          </div>

          {/* Main Execution View */}
          <div className="flex-1 p-6 relative bg-black overflow-y-auto">
             <AnimatePresence mode="wait">
               {step === 0 && (
                 <motion.div key="step0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="text-neutral-500 mb-6 font-semibold">[stage: PERCEIVE_AND_FILTER]</div>
                    <div className="border border-white/10 p-4 rounded-md bg-white/[0.02] text-neutral-300">
                       <span className="text-amber-400 font-bold">[SYNC]</span> CS-341: "Updated Final Project Syllabus"
                    </div>
                    <div className="border border-white/10 p-4 rounded-md bg-white/[0.02] text-neutral-300">
                       <span className="text-amber-400 font-bold">[SYNC]</span> Greenhouse: "Action Required - SWE Summer 2025"
                    </div>
                    <div className="border border-white/10 p-4 rounded-md bg-white/[0.02] text-neutral-300">
                       <span className="text-amber-400 font-bold">[SYNC]</span> College Bookstore: "Save 15% on textbook rentals"
                    </div>
                 </motion.div>
               )}

               {step === 1 && (
                 <motion.div key="step1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="text-neutral-500 mb-6 font-semibold">[stage: NORMALIZE_AND_PLAN]</div>
                    
                    <motion.div initial={{ x: -10 }} animate={{ x: 0 }} className="border-l-2 border-indigo-500 pl-4 py-2 text-neutral-300">
                       <span className="text-neutral-500">Payload 1:</span> CS-341: Updated Syllabus.<br/>
                       <span className="text-emerald-400">{'> '} TOOL CALL:</span> create_task(title: 'Review CS-341 Specs')
                    </motion.div>
                    
                    <motion.div initial={{ x: -10 }} animate={{ x: 0 }} transition={{ delay: 0.5 }} className="border-l-2 border-indigo-500 pl-4 py-2 text-neutral-300 mt-4">
                       <span className="text-neutral-500">Payload 2:</span> Greenhouse SWE Summer 2025.<br/>
                       <span className="text-emerald-400">{'> '} PIPELINE EVENT:</span> classify_opportunity('Internship: SWE')<br/>
                       <span className="text-blue-400">{'> '} TOOL CALL:</span> draft_reply('Confirming availability for screening.')
                    </motion.div>

                    <motion.div initial={{ x: -10 }} animate={{ x: 0 }} transition={{ delay: 1 }} className="border-l-2 border-indigo-500 pl-4 py-2 text-neutral-300 mt-4">
                       <span className="text-neutral-500">Payload 3:</span> Bookstore Promo.<br/>
                       <span className="text-amber-400">{'> '} FAST_PLANNER:</span> Match rule 'Promotional'<br/>
                       <span className="text-red-400">{'> '} TOOL CALL:</span> archive_email(id) - *Idempotent safe*
                    </motion.div>
                 </motion.div>
               )}

               {step === 2 && (
                 <motion.div key="step2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col justify-center items-center text-center">
                    <div className="text-3xl font-bold mb-4 text-white">Execution Cycle Complete.</div>
                    <div className="rounded border border-indigo-500/30 bg-indigo-500/10 p-4 mb-4 text-left font-sans shadow-lg max-w-sm">
                       <div className="text-xs text-indigo-400 font-bold uppercase tracking-widest mb-2">Pending Human Approval</div>
                       <div className="text-sm text-neutral-200">The agent drafted a reply to the SWE Summer 2025 recruiter. This is a high-risk tool (`send_reply`) and requires preview execution.</div>
                    </div>
                    <div className="text-neutral-500 mt-4">
                       1 Task created · 1 Draft ready · 1 Thread archived<br/>
                       <span className="text-[10px] opacity-50 mt-2 block">state_hash updated via redis_client</span>
                    </div>
                 </motion.div>
               )}
             </AnimatePresence>
          </div>
       </div>
    </div>
  );
}
