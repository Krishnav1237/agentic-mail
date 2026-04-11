import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const MailIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const StaggeredText = ({
  text,
  delay,
  stagger = 0.04,
  className = '',
  mode = 'ltr',
}: {
  text: string;
  delay: number;
  stagger?: number;
  className?: string;
  mode?: 'ltr' | 'rtl';
}) => {
  const chars = text.split('');

  return (
    <span className={className}>
      {chars.map((char, index) => {
        // RTL logic: last character appears first
        const letterDelay = delay + (mode === 'rtl' ? (chars.length - 1 - index) : index) * stagger;

        return (
          <motion.span
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.01,
              delay: letterDelay,
            }}
            style={{
              display: 'inline-block',
              whiteSpace: char === ' ' ? 'pre' : 'normal',
            }}
          >
            {char}
          </motion.span>
        );
      })}
    </span>
  );
};

export const BrandLogo = () => {
  const [stage, setStage] = useState<'icon' | 'animating' | 'final'>('icon');

  useEffect(() => {
    const timer = setTimeout(() => {
      setStage('animating');
    }, 400);

    const finalTimer = setTimeout(() => {
      setStage('final');
    }, 5500);

    return () => {
      clearTimeout(timer);
      clearTimeout(finalTimer);
    };
  }, []);

  const stagger = 0.05;
  const splitDelay = 0.6; // Icon starts splitting here
  const textDelay = 1.1;  // Words start appearing

  return (
    <div className="relative flex items-center justify-start overflow-visible">
      <div className="flex items-center gap-2 sm:gap-3 relative">
        {/* LEFT SECTION (IIL | Inbox) - Reveals RTL */}
        <div className="flex items-center gap-2 sm:gap-3">
          <StaggeredText
            text="IIL"
            delay={textDelay + (5 + 1) * stagger}
            stagger={stagger}
            mode="rtl"
            className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em] text-white [text-shadow:0_0_20px_rgba(255,255,255,0.15)] sm:text-[11px] sm:tracking-[0.3em] md:text-[12px]"
          />

          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.01, delay: textDelay + 5 * stagger }}
            className="whitespace-nowrap text-[10px] font-bold text-white/22 sm:text-[11px] md:text-[12px]"
          >
            |
          </motion.span>

          {/* ORIGINAL REPO STRUCTURE: flex flex-col leading-[1.1] text-left */}
          <div className="flex flex-col leading-[1.1] text-left relative">
            <div className="flex items-center whitespace-nowrap">
              <StaggeredText
                text="Inbox"
                delay={textDelay}
                stagger={stagger}
                mode="rtl"
                className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em] text-white [text-shadow:0_0_20px_rgba(255,255,255,0.15)] sm:text-[11px] sm:tracking-[0.3em] md:text-[12px]"
              />

              {/* THE ANIMATION ANCHOR: Natural gap in "Inbox Intelligence" */}
              <div className="relative w-[0.3em] sm:w-[0.5em] flex items-center justify-center pointer-events-none">
                <AnimatePresence>
                  {stage !== 'final' && (
                    <motion.div
                      className="absolute flex items-center justify-center z-10"
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.8 } }}
                    >
                      <div className="relative w-8 h-8">
                        <div className="absolute inset-x-0 w-1/2 overflow-hidden bg-transparent" />

                        <div className="absolute inset-0 bg-white/10 blur-2xl rounded-full" />

                        <motion.div
                          className="absolute inset-0 w-1/2 overflow-hidden"
                          animate={
                            stage === 'animating' ? { x: -140, opacity: [1, 1, 1, 0] } : { x: 0 }
                          }
                          transition={{
                            duration: 2.0,
                            delay: splitDelay,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                        >
                          <MailIcon className="w-8 h-8 text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.5)]" />
                        </motion.div>

                        <motion.div
                          className="absolute inset-0 w-1/2 left-1/2 overflow-hidden"
                          animate={
                            stage === 'animating' ? { x: 180, opacity: [1, 1, 1, 0] } : { x: 0 }
                          }
                          transition={{
                            duration: 2.0,
                            delay: splitDelay,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                        >
                          <MailIcon className="w-8 h-8 text-white -translate-x-1/2 drop-shadow-[0_0_12px_rgba(255,255,255,0.5)]" />
                        </motion.div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <StaggeredText
                text="Intelligence"
                delay={textDelay}
                stagger={stagger}
                mode="ltr"
                className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em] text-white [text-shadow:0_0_20px_rgba(255,255,255,0.15)] sm:text-[11px] sm:tracking-[0.3em] md:text-[12px]"
              />
            </div>

            <StaggeredText
              text="Layer"
              delay={textDelay}
              stagger={stagger}
              mode="rtl"
              className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 [text-shadow:0_0_20px_rgba(255,255,255,0.15)] sm:text-[11px] sm:tracking-[0.3em] md:text-[12px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};