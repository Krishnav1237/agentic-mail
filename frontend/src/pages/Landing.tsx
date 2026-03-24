import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { motion, useScroll, useTransform, AnimatePresence, Variants } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

function Starfield() {
  const ref = useRef<any>();
  
  const positions = useMemo(() => {
    const pos = new Float32Array(8000 * 3);
    for (let i = 0; i < 8000; i++) {
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos((Math.random() * 2) - 1);
        const r = Math.cbrt(Math.random()) * 25; 
        pos[i*3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i*3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i*3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, []);

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.x -= delta / 18;
      ref.current.rotation.y -= delta / 22;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.015} color="#ffffff" transparent opacity={0.9} sizeAttenuation={true} depthWrite={false} />
    </points>
  );
}

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const fadeUpChild: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 1.4, ease: [0.16, 1, 0.3, 1] } }
};

const FadeInText = ({ children, delay = 0, className = '' }: { children: React.ReactNode, delay?: number, className?: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-10%" }}
    transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay }}
    className={className}
  >
    {children}
  </motion.div>
);

const ParallaxImage = ({ src, glowColor, delay = 0, reverse = false }: { src: string, glowColor: string, delay?: number, reverse?: boolean }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 60 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay }}
      className="relative w-full max-w-[480px] aspect-square flex items-center justify-center group"
    >
      <div className={`absolute inset-0 ${glowColor} blur-[120px] rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-1000 scale-75 mix-blend-screen bg-blend-screen pointer-events-none`} />
      <motion.img 
        src={src} 
        alt="Core visual" 
        className="w-full h-full object-contain relative z-10 mix-blend-screen [mask-image:radial-gradient(circle_at_center,black_40%,transparent_80%)]"
        animate={{ 
          y: reverse ? [-20, 20, -20] : [20, -20, 20],
          rotate: reverse ? [-0.5, 0.5, -0.5] : [0.5, -0.5, 0.5] 
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
};

export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.15], [1, 0.95]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -100]); 

  const [email, setEmail] = useState('');
  const [joined, setJoined] = useState(false);

  // Hidden Admin Keyboard Listener
  useEffect(() => {
    let keyBuffer = '';
    const ADMIN_CODE = 'admin';
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      keyBuffer += e.key.toLowerCase();
      if (keyBuffer.length > ADMIN_CODE.length) {
        keyBuffer = keyBuffer.slice(-ADMIN_CODE.length);
      }
      if (keyBuffer === ADMIN_CODE) {
        window.location.href = `${API_BASE}/auth/google`;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if(email) setJoined(true);
  };

  return (
    <div className="bg-black text-white selection:bg-white/20 relative">
      <div className="fixed inset-0 z-0 h-screen w-full bg-[#020202] pointer-events-none">
         <Canvas camera={{ position: [0, 0, 12], fov: 60 }} dpr={[1, 2]}>
            <Starfield />
         </Canvas>
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000_100%)] opacity-70" />
      </div>
      
      {/* NAVBAR */}
      <nav className="fixed top-0 inset-x-0 z-50 h-[80px] flex items-center justify-center bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
         <div className="w-full max-w-[1400px] px-6 md:px-12 flex items-center justify-between pointer-events-auto">
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1.2, ease: "easeOut" }} className="flex items-center gap-3">
               <span className="text-white font-semibold tracking-widest text-[11px] uppercase">
                 SIL <span className="text-white/30 px-2 font-light">|</span> Student Intelligence Layer
               </span>
            </motion.div>
         </div>
      </nav>

      {/* FOREGROUND CONTENT */}
      <motion.div style={{ y }} className="relative z-10 w-full flex flex-col items-center flex-1">
         
         {/* HERO */}
         <section className="min-h-[100vh] w-full flex flex-col justify-center items-center px-6 text-center pt-20 pb-10">
            <motion.div style={{ opacity, scale }} className="max-w-5xl mx-auto flex flex-col items-center gap-6 pb-12 mt-10">
               
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 2, ease: "easeOut" }}
                 className="inline-flex items-center gap-3 px-6 py-2 rounded-full border border-white/10 bg-white/[0.02] backdrop-blur-xl mb-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] relative group overflow-hidden"
               >
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                 <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/80">Waitlist Open - Core Infrastructure Online</span>
               </motion.div>
               
               <motion.h1 
                 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                 className="text-[60px] md:text-[100px] lg:text-[140px] font-light tracking-tighter leading-[0.95] bg-clip-text text-transparent bg-gradient-to-b from-white via-white/80 to-white/30 pb-4"
               >
                 Your inbox,<br />runs itself.
               </motion.h1>

               <motion.p 
                 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                 className="text-base md:text-xl text-white/50 max-w-2xl font-light leading-relaxed mt-2"
               >
                 Connect your personal Gmail or .EDU account. Never miss an assignment, never drop a recruiter thread. The agent plans, parses, and executes autonomously.
               </motion.p>

               <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} className="mt-10 w-full max-w-lg">
                 <AnimatePresence mode="wait">
                   {!joined ? (
                     <motion.form key="form" onSubmit={handleWaitlist} exit={{ opacity: 0, scale: 0.95 }} className="flex flex-col sm:flex-row items-center gap-2 p-1.5 rounded-full border border-white/10 bg-white/[0.02] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05),_0_0_40px_rgba(255,255,255,0.02)] focus-within:border-white/30 focus-within:bg-white/[0.04] transition-all duration-500">
                       <input 
                         type="email" required placeholder="personal or .edu email" value={email} onChange={e => setEmail(e.target.value)}
                         className="flex-1 w-full bg-transparent border-none text-sm text-white px-6 py-4 outline-none placeholder:text-white/30"
                       />
                       <button type="submit" className="w-full sm:w-auto h-[44px] px-8 rounded-full bg-white text-black text-[11px] font-bold uppercase tracking-[0.15em] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                         Priority Access
                       </button>
                     </motion.form>
                   ) : (
                     <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center justify-center gap-3 px-8 py-5 rounded-full bg-white/10 border border-white/20 text-white font-medium text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                       Waitlist Secured. We'll be in touch.
                     </motion.div>
                   )}
                 </AnimatePresence>
               </motion.div>

            </motion.div>
         </section>

         {/* NARRATIVE SEQUENCE */}
         
         <section className="py-24 md:py-32 w-full flex flex-col md:flex-row justify-center items-center px-6 md:px-12 border-t border-white/[0.05] gap-12 md:gap-24">
            <div className="flex-1 max-w-2xl w-full">
               <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-10%" }}>
                  <motion.div variants={fadeUpChild} className="inline-flex items-center gap-3 mb-8 px-4 py-1.5 rounded-full border border-white/5 bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                     <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/50">The Academic Pipeline</span>
                  </motion.div>
                  <motion.h2 variants={fadeUpChild} className="text-[40px] md:text-[60px] lg:text-[70px] font-light leading-[1.05] tracking-tight mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
                     Never manually track an assignment again.
                  </motion.h2>
                  <motion.p variants={fadeUpChild} className="text-base md:text-xl text-white/40 leading-relaxed max-w-xl font-light">
                     Long, unstructured emails from professors parse instantly. Deadlines, projects, and reading materials map directly to your calendar and task workflow automatically.
                  </motion.p>
               </motion.div>
            </div>
            
            <div className="flex-1 w-full flex justify-center lg:justify-end">
               <FadeInText delay={0.2} className="flex justify-center items-center">
                  <ParallaxImage src="/assets/syllabus.png" glowColor="bg-blue-500/20" />
               </FadeInText>
            </div>
         </section>

         <section className="py-24 md:py-32 w-full flex flex-col md:flex-row-reverse justify-center items-center px-6 md:px-12 border-t border-white/[0.05] gap-12 md:gap-24">
            <div className="flex-1 max-w-2xl w-full">
               <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-10%" }}>
                  <motion.div variants={fadeUpChild} className="inline-flex items-center gap-3 mb-8 px-4 py-1.5 rounded-full border border-white/5 bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                     <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/50">Predictive Drafting</span>
                  </motion.div>
                  <motion.h2 variants={fadeUpChild} className="text-[40px] md:text-[60px] lg:text-[70px] font-light leading-[1.05] tracking-tight mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
                     Respond completely without typing a word.
                  </motion.h2>
                  <motion.p variants={fadeUpChild} className="text-base md:text-xl text-white/40 leading-relaxed max-w-xl font-light">
                     The Heavy Planner reads the context of deep email threads and writes full, culturally accurate replies targeting execution workflows.
                  </motion.p>
               </motion.div>
            </div>
            
            <div className="flex-1 w-full flex justify-center lg:justify-start">
               <FadeInText delay={0.2} className="flex justify-center items-center">
                  <ParallaxImage src="/assets/drafts.png" glowColor="bg-purple-500/20" reverse delay={0.2} />
               </FadeInText>
            </div>
         </section>

         <section className="py-24 md:py-32 w-full flex flex-col md:flex-row justify-center items-center px-6 md:px-12 border-t border-white/[0.05] gap-12 md:gap-24">
            <div className="flex-1 max-w-2xl w-full">
               <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-10%" }}>
                  <motion.div variants={fadeUpChild} className="inline-flex items-center gap-3 mb-8 px-4 py-1.5 rounded-full border border-white/5 bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                     <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/50">Information Annihilation</span>
                  </motion.div>
                  <motion.h2 variants={fadeUpChild} className="text-[40px] md:text-[60px] lg:text-[70px] font-light leading-[1.05] tracking-tight mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
                     A violently clean inbox baseline.
                  </motion.h2>
                  <motion.p variants={fadeUpChild} className="text-base md:text-xl text-white/40 leading-relaxed max-w-xl font-light">
                     Operations like archiving newsletters or college promos execute autonomously in the background. Protect your absolute signal-to-noise ratio.
                  </motion.p>
               </motion.div>
            </div>
            
            <div className="flex-1 w-full flex justify-center lg:justify-end">
               <FadeInText delay={0.2} className="flex justify-center items-center w-full">
                  <ParallaxImage src="/assets/inbox.png" glowColor="bg-rose-500/20" delay={0.4} />
               </FadeInText>
            </div>
         </section>

         <section className="py-24 md:py-32 w-full flex flex-col md:flex-row-reverse justify-center items-center px-6 md:px-12 border-t border-white/[0.05] gap-12 md:gap-24">
            <div className="flex-1 max-w-2xl w-full">
               <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-10%" }}>
                  <motion.div variants={fadeUpChild} className="inline-flex items-center gap-3 mb-8 px-4 py-1.5 rounded-full border border-white/5 bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                     <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/50">The Opportunity Pipeline</span>
                  </motion.div>
                  <motion.h2 variants={fadeUpChild} className="text-[40px] md:text-[60px] lg:text-[70px] font-light leading-[1.05] tracking-tight mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
                     Your network, run entirely on autopilot.
                  </motion.h2>
                  <motion.p variants={fadeUpChild} className="text-base md:text-xl text-white/40 leading-relaxed max-w-xl font-light">
                     Recruiters are identified immediately. Screening calls are cross-referenced with your class schedule, and professional workflows are resolved autonomously.
                  </motion.p>
               </motion.div>
            </div>
            
            <div className="flex-1 w-full flex justify-center lg:justify-start">
               <FadeInText delay={0.2} className="flex justify-center items-center w-full">
                  <ParallaxImage src="/assets/network.png" glowColor="bg-emerald-500/20" reverse delay={0.6} />
               </FadeInText>
            </div>
         </section>

         {/* UTILITIES GRID */}
         <section className="py-24 md:py-32 w-full flex flex-col justify-center items-center px-6 md:px-12 border-t border-white/[0.05]">
            <FadeInText className="text-center mb-16 md:mb-24 max-w-3xl">
               <h3 className="text-3xl md:text-5xl font-light tracking-tight text-white mb-6">Everything you need. Zero noise.</h3>
               <p className="text-base md:text-lg text-white/40 font-light leading-relaxed">Whether you connect your standard personal email or your university account, the agent adapts natively to your domain restrictions and workflow constraints.</p>
            </FadeInText>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 max-w-6xl w-full">
               {[
                 { title: 'Spam Annihilation', desc: 'Newsletters are silently archived out of your primary view without complex rules.' },
                 { title: 'Syllabus Parsing', desc: 'Deadlines and reading assignments extracted and structured automatically.' },
                 { title: 'Recruiter Workflows', desc: 'Internship matches and follow-ups drafted for you using deep context.' },
                 { title: 'Coffee Chat Syncing', desc: 'Suggests strategic meeting times based on your active classes and labs.' },
                 { title: 'Conflict Detection', desc: 'Knows immediately if a club meeting overlaps your primary academic schedule.' },
                 { title: 'Approval Gated', desc: 'The agent will never send a high-stakes, professional email without your sign-off.' },
                 { title: 'Redis Edge Hashing', desc: 'Runs seamlessly in the background with near-zero latency state management.' },
                 { title: 'Absolute Privacy', desc: 'Encrypted Provider tokens at rest. Your academic data is yours alone.' },
               ].map((item, i) => (
                 <FadeInText key={item.title} delay={i * 0.05} className="group relative overflow-hidden rounded-[24px] border border-white/[0.05] bg-white/[0.01] backdrop-blur-md p-8 hover:bg-white/[0.03] hover:border-white/[0.1] transition-all duration-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl" />
                    <h4 className="text-sm font-semibold text-white/90 mb-3 relative z-10">{item.title}</h4>
                    <p className="text-[13px] text-white/40 leading-relaxed font-light relative z-10">{item.desc}</p>
                 </FadeInText>
               ))}
            </div>
         </section>

         {/* TERMINAL WAITLIST CTA */}
         <section className="pt-32 pb-8 w-full flex flex-col justify-center items-center px-6 text-center border-t border-white/[0.05] bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.02)_0%,transparent_80%)] relative z-20">
            <FadeInText className="flex flex-col items-center w-full max-w-2xl mx-auto">
               <h2 className="text-5xl md:text-[70px] font-light tracking-tighter mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white via-white/80 to-white/30 leading-[1.05]">Ready to upgrade?</h2>
               <p className="text-base md:text-lg text-white/40 font-light mb-12">Connect your domain and let the agent govern the chaos.</p>
               
               <AnimatePresence mode="wait">
                 {!joined ? (
                   <motion.form key="form-bottom" onSubmit={handleWaitlist} exit={{ opacity: 0, scale: 0.95 }} className="flex flex-col sm:flex-row items-center gap-3 w-full p-2 rounded-full border border-white/10 bg-white/[0.01] backdrop-blur-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05),_0_20px_40px_rgba(0,0,0,0.5)] focus-within:border-white/20 transition-colors">
                     <input 
                       type="email" required placeholder="personal or .edu email" value={email} onChange={e => setEmail(e.target.value)}
                       className="w-full h-12 bg-transparent border-none text-[15px] text-white px-6 outline-none placeholder:text-white/20"
                     />
                     <button type="submit" className="w-full sm:w-auto h-12 px-10 rounded-full bg-white text-black text-[10px] font-bold uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 flex-shrink-0">
                        Join Waitlist
                     </button>
                   </motion.form>
                 ) : (
                   <motion.div key="success-bottom" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-white/5 border border-white/10 text-white font-medium text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                     Waitlist Secured. We'll be in touch.
                   </motion.div>
                 )}
               </AnimatePresence>
            </FadeInText>
            
            <div className="mt-16 flex gap-6 md:gap-12 items-center text-[9px] font-bold uppercase tracking-[0.2em] text-white/20">
               <span>SIL © 2026</span>
            </div>
         </section>

      </motion.div>
    </div>
  );
}
