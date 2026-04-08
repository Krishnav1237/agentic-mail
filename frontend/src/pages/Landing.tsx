import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  AnimatePresence,
  motion,
  useScroll,
  useTransform,
  type Variants,
} from 'framer-motion';
import { joinWaitlist } from '../lib/waitlist';

const launchProofCards = [
  {
    label: 'Intent recognized',
    title: 'The message is read for what it requires.',
    desc: 'IIL identifies requests, deadlines, decisions, and next actions inside the thread.',
  },
  {
    label: 'Work prepared',
    title: 'Execution starts with context already in place.',
    desc: 'Replies, tasks, timing, and follow-ups are prepared from the state of the conversation.',
  },
  {
    label: 'Continuity maintained',
    title: 'The work stays live after the email is gone.',
    desc: 'Open loops remain tracked across threads and time until they move forward or close.',
  },
] as const;

const narrativeSections = [
  {
    label: 'Commitment Extraction',
    title: 'See what the message actually requires.',
    desc: 'Instead of rereading threads to figure out what matters, IIL pulls out the commitment, owner, timing, and next step.',
    src: '/assets/syllabus.png',
    glowColor: 'bg-blue-500/20',
    reverse: false,
    layout: 'default' as const,
  },
  {
    label: 'Response Preparation',
    title: 'Replies that move the work forward.',
    desc: 'Responses are prepared from thread history and current context, so the next email reflects what has happened and what still needs to happen.',
    src: '/assets/drafts.png',
    glowColor: 'bg-purple-500/20',
    reverse: true,
    layout: 'reverse' as const,
  },
  {
    label: 'Commitment Continuity',
    title: 'The follow-through does not disappear with the thread.',
    desc: 'IIL keeps open commitments visible, tracks what is waiting, and maintains continuity until the loop is closed.',
    src: '/assets/inbox.png',
    glowColor: 'bg-rose-500/20',
    reverse: false,
    layout: 'default' as const,
  },
  {
    label: 'Opportunity Execution',
    title: 'Timing-sensitive messages stay actionable.',
    desc: 'Introductions, meetings, requests, and opportunities stay attached to the response and follow-through they require.',
    src: '/assets/network.png',
    glowColor: 'bg-emerald-500/20',
    reverse: true,
    layout: 'reverse' as const,
  },
] as const;

const featureCards = [
  {
    title: 'Intent Extraction',
    desc: 'The thread is read for what it requires, not just what it says.',
  },
  {
    title: 'Response Preparation',
    desc: 'Replies are prepared from thread history and execution context.',
  },
  {
    title: 'Deadline Tracking',
    desc: 'Deadlines are identified, recorded, and kept visible while they matter.',
  },
  {
    title: 'Follow-Up Continuity',
    desc: 'Open loops stay active across threads and time until they are closed.',
  },
  {
    title: 'Approval Controls',
    desc: 'High-impact actions always require your confirmation.',
  },
  {
    title: 'Execution State',
    desc: 'The system keeps track of what is pending, waiting, active, and done.',
  },
  {
    title: 'Opportunity Tracking',
    desc: 'Timing-sensitive messages stay connected to the next move they require.',
  },
  {
    title: 'Privacy First',
    desc: 'Encrypted tokens. You control what the agent can execute.',
  },
] as const;

function Starfield() {
  const ref = useRef<any>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(8000 * 3);
    for (let i = 0; i < 8000; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = Math.cbrt(Math.random()) * 25;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, []);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x -= delta / 18;
      ref.current.rotation.y -= delta / 22;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.015}
        color="#ffffff"
        transparent
        opacity={0.9}
        sizeAttenuation={true}
        depthWrite={false}
      />
    </points>
  );
}

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const fadeUpChild: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 1.4, ease: [0.16, 1, 0.3, 1] },
  },
};

const FadeInText = ({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-10%' }}
    transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay }}
    className={className}
  >
    {children}
  </motion.div>
);

const ParallaxImage = ({
  src,
  glowColor,
  delay = 0,
  reverse = false,
  alt = 'Core visual',
}: {
  src: string;
  glowColor: string;
  delay?: number;
  reverse?: boolean;
  alt?: string;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 60 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay }}
      className="relative w-full max-w-[480px] aspect-square flex items-center justify-center group"
    >
      <div
        className={`absolute inset-0 ${glowColor} blur-[120px] rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-1000 scale-75 mix-blend-screen bg-blend-screen pointer-events-none`}
      />
      <motion.img
        src={src}
        alt={alt}
        className="w-full h-full object-contain relative z-10 mix-blend-screen [mask-image:radial-gradient(circle_at_center,black_40%,transparent_80%)]"
        animate={{
          y: reverse ? [-20, 20, -20] : [20, -20, 20],
          rotate: reverse ? [-0.5, 0.5, -0.5] : [0.5, -0.5, 0.5],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
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
  const [waitlistStatus, setWaitlistStatus] = useState<
    'idle' | 'created' | 'duplicate'
  >('idle');
  const [waitlistMessage, setWaitlistMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [waitlistError, setWaitlistError] = useState('');

  const handleWaitlist = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setSubmitting(true);
    setWaitlistError('');

    try {
      const response = await joinWaitlist(email);
      setWaitlistStatus(response.status);
      setWaitlistMessage(response.message);
      setEmail('');
    } catch (err) {
      console.error('Failed to join waitlist', err);
      setWaitlistError(
        'Waitlist signup is temporarily unavailable. Please try again in a bit.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative bg-black text-white selection:bg-white/20">
      <div className="pointer-events-none fixed inset-0 z-0 h-screen w-full bg-[#020202]">
        <Canvas camera={{ position: [0, 0, 12], fov: 60 }} dpr={[1, 2]}>
          <Starfield />
        </Canvas>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000_100%)] opacity-70" />
      </div>

      <nav className="pointer-events-none fixed inset-x-0 top-0 z-50 flex h-[80px] items-center justify-center bg-gradient-to-b from-black/80 to-transparent">
        <div className="pointer-events-auto flex w-full max-w-[1400px] items-center justify-between px-6 md:px-12">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="flex items-center gap-3"
          >
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white">
              IIL <span className="px-2 font-light text-white/30">|</span> Inbox
              Intelligence Layer
            </span>
          </motion.div>
        </div>
      </nav>

      <motion.div
        style={{ y }}
        className="relative z-10 flex w-full flex-1 flex-col items-center"
      >
        <section className="flex min-h-[100vh] w-full flex-col items-center justify-center px-6 pb-10 pt-20 text-center">
          <motion.div
            style={{ opacity, scale }}
            className="mx-auto mt-10 flex max-w-5xl flex-col items-center gap-6 pb-12"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 2, ease: 'easeOut' }}
              className="relative mb-4 inline-flex items-center gap-3 overflow-hidden rounded-full border border-white/10 bg-white/[0.02] px-6 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] transition-transform duration-1000 group-hover:translate-x-[100%]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
                Early Access - Personal Email Supported
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 1.4,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.1,
              }}
              className="bg-gradient-to-b from-white via-white/80 to-white/30 bg-clip-text pb-4 text-[60px] font-light leading-[0.95] tracking-tighter text-transparent md:text-[100px] lg:text-[140px]"
            >
              Email creates commitments.
              <br />
              IIL runs them.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 1.4,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.2,
              }}
              className="mt-2 max-w-2xl text-base font-light leading-relaxed text-white/50 md:text-xl"
            >
              Requests, deadlines, follow-ups, scheduling, and opportunities all
              arrive through email. IIL turns that incoming communication into
              structured execution.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 1.4,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.3,
              }}
              className="mt-10 w-full max-w-lg"
            >
              <AnimatePresence mode="wait">
                {waitlistStatus === 'idle' ? (
                  <motion.form
                    key="form"
                    onSubmit={handleWaitlist}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),_0_0_40px_rgba(255,255,255,0.02)] transition-all duration-500 focus-within:border-white/30 focus-within:bg-white/[0.04] sm:flex-row"
                  >
                    <input
                      type="email"
                      required
                      placeholder="enter your personal email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full flex-1 border-none bg-transparent px-6 py-4 text-sm text-white outline-none placeholder:text-white/30"
                    />
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex h-[44px] w-full items-center justify-center gap-2 rounded-full bg-white px-8 text-[11px] font-bold uppercase tracking-[0.15em] text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all hover:scale-[1.02] active:scale-95 sm:w-auto"
                    >
                      {submitting ? 'Submitting...' : 'Get Priority Access'}
                    </button>
                  </motion.form>
                ) : (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center justify-center gap-3 rounded-full border border-white/20 bg-white/10 px-8 py-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  >
                    {waitlistMessage}
                  </motion.div>
                )}
              </AnimatePresence>

              {waitlistError && (
                <p className="mt-4 text-sm text-rose-300" role="alert">
                  {waitlistError}
                </p>
              )}
            </motion.div>
          </motion.div>
        </section>

        <section className="w-full px-6 pb-20 md:px-12">
          <FadeInText className="mx-auto flex max-w-6xl flex-col items-center text-center">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/5 bg-white/[0.02] px-4 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                Inbox to Execution
              </span>
            </div>
            <h2 className="mt-6 max-w-3xl text-3xl font-light tracking-tight text-white md:text-5xl">
              From incoming message to live execution.
            </h2>
            <p className="mt-4 max-w-2xl text-base font-light leading-relaxed text-white/40 md:text-lg">
              The system reads the thread, prepares the next step, and keeps the
              work moving after the message has been read.
            </p>
          </FadeInText>

          <div className="mx-auto mt-10 grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
            {launchProofCards.map((card, index) => (
              <FadeInText
                key={card.label}
                delay={index * 0.08}
                className="rounded-[24px] border border-white/[0.05] bg-white/[0.02] p-8 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                  {card.label}
                </div>
                <h3 className="mt-5 text-2xl font-light leading-tight text-white">
                  {card.title}
                </h3>
                <p className="mt-4 text-sm font-light leading-7 text-white/40">
                  {card.desc}
                </p>
              </FadeInText>
            ))}
          </div>
        </section>

        {narrativeSections.map((section, index) => (
          <section
            key={section.label}
            className={`flex w-full flex-col items-center justify-center gap-12 border-t border-white/[0.05] px-6 py-24 md:px-12 md:py-32 ${
              section.layout === 'reverse'
                ? 'md:flex-row-reverse'
                : 'md:flex-row'
            } md:gap-24`}
          >
            <div className="w-full max-w-2xl flex-1">
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-10%' }}
              >
                <motion.div
                  variants={fadeUpChild}
                  className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/5 bg-white/[0.02] px-4 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                    {section.label}
                  </span>
                </motion.div>
                <motion.h2
                  variants={fadeUpChild}
                  className="mb-8 bg-gradient-to-b from-white to-white/50 bg-clip-text text-[40px] font-light leading-[1.05] tracking-tight text-transparent md:text-[60px] lg:text-[70px]"
                >
                  {section.title}
                </motion.h2>
                <motion.p
                  variants={fadeUpChild}
                  className="max-w-xl text-base font-light leading-relaxed text-white/40 md:text-xl"
                >
                  {section.desc}
                </motion.p>
              </motion.div>
            </div>

            <div
              className={`flex w-full flex-1 justify-center ${
                section.layout === 'reverse'
                  ? 'lg:justify-start'
                  : 'lg:justify-end'
              }`}
            >
              <FadeInText
                delay={0.2}
                className="flex w-full items-center justify-center"
              >
                <ParallaxImage
                  src={section.src}
                  glowColor={section.glowColor}
                  reverse={section.reverse}
                  delay={index * 0.2}
                  alt={section.title}
                />
              </FadeInText>
            </div>
          </section>
        ))}

        <section className="flex w-full flex-col items-center justify-center border-t border-white/[0.05] px-6 py-24 md:px-12 md:py-32">
          <FadeInText className="mb-16 max-w-3xl text-center md:mb-24">
            <h3 className="mb-6 text-3xl font-light tracking-tight text-white md:text-5xl">
              What the system keeps running.
            </h3>
            <p className="text-base font-light leading-relaxed text-white/40 md:text-lg">
              Prepared responses, tracked commitments, deadlines, approvals, and
              continuity across email-driven work.
            </p>
          </FadeInText>
          <div className="grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
            {featureCards.map((item, index) => (
              <FadeInText
                key={item.title}
                delay={index * 0.05}
                className="group relative overflow-hidden rounded-[24px] border border-white/[0.05] bg-white/[0.01] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-md transition-all duration-500 hover:border-white/[0.1] hover:bg-white/[0.03]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />
                <h4 className="relative z-10 mb-3 text-sm font-semibold text-white/90">
                  {item.title}
                </h4>
                <p className="relative z-10 text-[13px] font-light leading-relaxed text-white/40">
                  {item.desc}
                </p>
              </FadeInText>
            ))}
          </div>
        </section>

        <section className="relative z-20 flex w-full flex-col items-center justify-center border-t border-white/[0.05] bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.02)_0%,transparent_80%)] px-6 pb-8 pt-32 text-center">
          <FadeInText className="mx-auto flex w-full max-w-2xl flex-col items-center">
            <h2 className="mb-8 bg-gradient-to-b from-white via-white/80 to-white/30 bg-clip-text text-5xl font-light leading-[1.05] tracking-tighter text-transparent md:text-[70px]">
              Ready to stop carrying every thread in your head?
            </h2>
            <p className="mb-12 text-base font-light text-white/40 md:text-lg">
              Join early access to an execution layer that keeps email-driven
              work moving.
            </p>

            <AnimatePresence mode="wait">
              {waitlistStatus === 'idle' ? (
                <motion.form
                  key="form-bottom"
                  onSubmit={handleWaitlist}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex w-full flex-col items-center gap-3 rounded-full border border-white/10 bg-white/[0.01] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),_0_20px_40px_rgba(0,0,0,0.5)] backdrop-blur-3xl transition-colors focus-within:border-white/20 sm:flex-row"
                >
                  <input
                    type="email"
                    required
                    placeholder="enter your personal email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-12 w-full border-none bg-transparent px-6 text-[15px] text-white outline-none placeholder:text-white/20"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-12 w-full flex-shrink-0 items-center justify-center gap-2 rounded-full bg-white px-10 text-[10px] font-bold uppercase tracking-[0.2em] text-black transition-all hover:scale-[1.02] active:scale-95 sm:w-auto"
                  >
                    {submitting ? 'Submitting...' : 'Join Waitlist'}
                  </button>
                </motion.form>
              ) : (
                <motion.div
                  key="success-bottom"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-3 rounded-full border border-white/10 bg-white/5 px-8 py-4 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                >
                  {waitlistMessage}
                </motion.div>
              )}
            </AnimatePresence>
          </FadeInText>

          {waitlistError && (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {waitlistError}
            </p>
          )}

          <div className="mt-16 flex items-center gap-6 text-[9px] font-bold uppercase tracking-[0.2em] text-white/20 md:gap-12">
            <span>IIL (c) 2026</span>
          </div>
        </section>
      </motion.div>
    </div>
  );
}
