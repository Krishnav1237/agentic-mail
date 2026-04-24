import {
  type FormEvent,
  type ReactNode,
  useEffect,
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
import { getWaitlistStats, joinWaitlist } from '../lib/waitlist';
import { ThemeToggle } from '../components/ThemeToggle';
import { BrandLogo } from '../components/BrandLogo';

const launchProofCards = [
  {
    label: 'Hidden deadlines',
    title: 'Important dates get buried in busy threads.',
    desc: 'Meeting times, due dates, and promised follow-ups are easy to miss inside long conversations.',
  },
  {
    label: 'Scattered requests',
    title: 'One inbox can create a lot of small work.',
    desc: 'Replies, approvals, scheduling, and shared details end up spread across messages and memory.',
  },
  {
    label: 'Lost follow-through',
    title: 'Reading the email does not finish the work.',
    desc: 'Open loops disappear after the thread is read, then return later as stress or missed action.',
  },
] as const;

const narrativeSections = [
  {
    label: 'Dates and commitments',
    title: 'It finds what matters, and when it matters.',
    desc: 'Due dates, meeting times, and promised actions are pulled out of the thread before they get missed.',
    src: '/assets/syllabus.png',
    lightSrc: '/assets/syllabus-light.png',
    glowColor: 'bg-blue-500/20',
    reverse: false,
    layout: 'default' as const,
  },
  {
    label: 'Clear next steps',
    title: 'It turns messages into actions you can handle.',
    desc: 'Requests, approvals, and follow-ups become structured next steps instead of staying buried in email.',
    src: '/assets/drafts.png',
    lightSrc: '/assets/drafts-light.png',
    glowColor: 'bg-purple-500/20',
    reverse: true,
    layout: 'reverse' as const,
  },
  {
    label: 'Open work stays visible',
    title: 'It keeps unfinished work in view.',
    desc: 'You can see what is pending, what needs a reply, and what is still waiting on someone else.',
    src: '/assets/inbox.png',
    lightSrc: '/assets/inbox-light.png',
    glowColor: 'bg-rose-500/20',
    reverse: false,
    layout: 'default' as const,
  },
  {
    label: 'Less inbox overhead',
    title: 'It helps you move faster with less effort.',
    desc: 'You spend less time rereading threads and less energy trying to remember what still needs attention.',
    src: '/assets/network.png',
    lightSrc: '/assets/network-light.png',
    glowColor: 'bg-emerald-500/20',
    reverse: true,
    layout: 'reverse' as const,
  },
] as const;

const featureCards = [
  {
    title: 'Commitments found',
    desc: 'Pulls out what each message is asking for.',
  },
  {
    title: 'Deadlines surfaced',
    desc: 'Highlights dates, due times, and scheduling details.',
  },
  {
    title: 'Replies prepared',
    desc: 'Drafts responses with the right context.',
  },
  {
    title: 'Follow-ups tracked',
    desc: 'Keeps open loops from getting lost.',
  },
  {
    title: 'Requests organized',
    desc: 'Turns scattered asks into clear next steps.',
  },
  {
    title: 'Status made visible',
    desc: 'Shows what is pending, waiting, active, or done.',
  },
  {
    title: 'Less to remember',
    desc: 'Reduces the mental load of staying on top of email.',
  },
  {
    title: 'You stay in control',
    desc: 'Important actions still require your approval.',
  },
] as const;

const waitlistBenefits = [
  'Priority onboarding access',
  'Direct product feedback',
  'Personal email preferred',
] as const;

// ─── Nav Checkpoints ──────────────────────────────────────────────────────────

const checkpoints = [
  { id: 'hero', label: 'Intro' },
  { id: 'problem', label: 'Problem' },
  { id: 'execution', label: 'How It Works' },
  { id: 'features', label: 'Features' },
  { id: 'waitlist', label: 'Waitlist' },
];

const pageRailClassName =
  'mx-auto w-full max-w-[1360px] px-4 sm:px-5 lg:px-6 xl:px-8';

const waitlistCountFormatter = new Intl.NumberFormat('en-US');

const scrollToSection = (sectionId: string) => {
  const section = document.getElementById(sectionId);
  if (!section) return;

  // Dynamically measure the actual navbar height
  const nav = document.querySelector('nav');
  const navHeight = nav ? nav.getBoundingClientRect().height : 100;

  const isLargeScreen = window.innerWidth >= 1024;

  if (isLargeScreen) {
    // On desktop: scroll to the section top, letting CSS justify-center
    // naturally position the heading in the visual center of the viewport
    const buffer = 20;
    const y =
      section.getBoundingClientRect().top + window.scrollY - navHeight - buffer;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  } else {
    // On mobile/tablet: target the first heading directly since sections
    // don't have enough height for CSS centering to work properly
    const firstContent = section.querySelector('h2, h3, .inline-flex');
    const target = firstContent || section;
    const buffer = 24;
    const y =
      target.getBoundingClientRect().top + window.scrollY - navHeight - buffer;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
};

function PageRail({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${pageRailClassName} ${className}`.trim()}>{children}</div>
  );
}

function useActiveSection() {
  const [activeSection, setActiveSection] = useState('hero');

  useEffect(() => {
    const sectionIds = checkpoints.map(({ id }) => id);

    const updateActiveSection = () => {
      const marker = window.innerHeight * 0.45;
      let nextSection = sectionIds[0] ?? 'hero';

      sectionIds.forEach((id) => {
        const element = document.getElementById(id);
        if (!element) return;

        if (element.getBoundingClientRect().top <= marker) {
          nextSection = id;
        }
      });

      setActiveSection((current) =>
        current === nextSection ? current : nextSection
      );
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);

    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, []);

  return activeSection;
}

function CenterNav({ activeSection }: { activeSection: string }) {
  return (
    <div className="flex w-full justify-center">
      <div className="relative flex max-w-[280px] flex-wrap items-center justify-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl sm:max-w-none sm:flex-nowrap sm:gap-1 sm:p-1.5 md:gap-1.5 md:px-4">
        {checkpoints.map((cp, idx) => {
          const isActive = activeSection === cp.id;
          const isFirstOrLast = idx === 0 || idx === checkpoints.length - 1;
          return (
            <motion.a
              key={cp.id}
              href={`#${cp.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(cp.id);
              }}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              aria-current={isActive ? 'page' : undefined}
              data-active={isActive ? 'true' : 'false'}
              className={`nav-link relative inline-flex h-8 shrink-0 items-center justify-center rounded-full border text-[8px] font-semibold uppercase tracking-[0.12em] transition-all duration-300 sm:h-9 sm:text-[9px] sm:tracking-[0.15em] md:h-11 md:text-[10px] md:tracking-[0.18em] ${
                isFirstOrLast ? 'px-4 md:px-8' : 'px-3 md:px-5'
              } ${
                isActive
                  ? 'border-transparent text-white'
                  : 'border-transparent text-white/68 hover:border-white/10 hover:bg-white/[0.06] hover:text-white/92'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeNavBubble"
                  className="nav-active-pill absolute inset-0 -z-10 rounded-full border border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.08))] shadow-[0_12px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.16)]"
                  transition={{ type: 'spring', bounce: 0.25, duration: 0.6 }}
                />
              )}
              <span className="nav-link-label relative z-10">{cp.label}</span>
            </motion.a>
          );
        })}
      </div>
    </div>
  );
}

function Starfield() {
  const ref = useRef<any>(null);

  const { fieldPositions, accentPositions } = useMemo(() => {
    const field = new Float32Array(8400 * 3);
    const accent = new Float32Array(1500 * 3);

    for (let i = 0; i < 8400; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = Math.cbrt(Math.random()) * 28;
      field[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      field[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      field[i * 3 + 2] = r * Math.cos(phi);
    }

    for (let i = 0; i < 1500; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = Math.cbrt(Math.random()) * 18;
      accent[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      accent[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      accent[i * 3 + 2] = r * Math.cos(phi);
    }

    return {
      fieldPositions: field,
      accentPositions: accent,
    };
  }, []);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x -= delta / 18;
      ref.current.rotation.y -= delta / 22;
    }
  });

  return (
    <group ref={ref}>
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={fieldPositions.length / 3}
            array={fieldPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.024}
          color="#f7fbff"
          transparent
          opacity={0.82}
          sizeAttenuation={true}
          depthWrite={false}
        />
      </points>

      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={accentPositions.length / 3}
            array={accentPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.048}
          color="#ffffff"
          transparent
          opacity={0.96}
          sizeAttenuation={true}
          depthWrite={false}
        />
      </points>
    </group>
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
  lightSrc,
  glowColor,
  delay = 0,
  reverse = false,
  alt = 'Core visual',
}: {
  src: string;
  lightSrc?: string;
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
      className="parallax-image-container relative flex aspect-square w-full max-w-[280px] items-center justify-center group sm:max-w-[360px] md:max-w-[480px]"
    >
      <div
        className={`absolute inset-0 ${glowColor} blur-[120px] rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-1000 scale-75 mix-blend-screen bg-blend-screen pointer-events-none`}
      />
      <motion.img
        src={src}
        alt={alt}
        className="dark-asset relative z-10 h-full w-full object-contain mix-blend-screen"
        animate={{
          y: reverse ? [-20, 20, -20] : [20, -20, 20],
          rotate: reverse ? [-0.5, 0.5, -0.5] : [0.5, -0.5, 0.5],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      {lightSrc && (
        <motion.img
          src={lightSrc}
          alt={alt}
          className="light-asset relative z-10 hidden h-full w-full object-contain mix-blend-screen transform-gpu"
          animate={{
            y: reverse ? [-20, 20, -20] : [20, -20, 20],
            rotate: reverse ? [-0.5, 0.5, -0.5] : [0.5, -0.5, 0.5],
          }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </motion.div>
  );
};

export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.15], [1, 0.95]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const activeSection = useActiveSection();

  const navRef = useRef<HTMLElement>(null);
  const [navHeight, setNavHeight] = useState(80);
  const [email, setEmail] = useState('');
  const [waitlistTotal, setWaitlistTotal] = useState<number | null>(null);
  const [waitlistStatsState, setWaitlistStatsState] = useState<
    'loading' | 'ready' | 'error'
  >('loading');
  const [waitlistStatus, setWaitlistStatus] = useState<
    'idle' | 'created' | 'duplicate'
  >('idle');
  const [waitlistMessage, setWaitlistMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [waitlistError, setWaitlistError] = useState('');

  // Dynamic navbar height observer for perfect scroll alignment
  useEffect(() => {
    if (!navRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        setNavHeight(height);
        // Apply height + buffer to the document root for global scroll matching
        document.documentElement.style.scrollPaddingTop = `${height + 40}px`;
      }
    });

    observer.observe(navRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadWaitlistStats = async () => {
      try {
        const response = await getWaitlistStats();
        if (!isActive) return;

        setWaitlistTotal(response.total);
        setWaitlistStatsState('ready');
      } catch (error) {
        console.error('Failed to fetch waitlist stats', error);
        if (!isActive) return;

        setWaitlistStatsState('error');
      }
    };

    void loadWaitlistStats();

    return () => {
      isActive = false;
    };
  }, []);

  const handleWaitlist = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setSubmitting(true);
    setWaitlistError('');

    try {
      // Ensure the email has @gmail.com appended if it doesn't already
      const fullEmail = email.toLowerCase().includes('@')
        ? email
        : `${email}@gmail.com`;

      const response = await joinWaitlist(fullEmail);
      setWaitlistStatus(response.status);
      setWaitlistMessage(response.message);
      if (typeof response.total === 'number') {
        setWaitlistTotal(response.total);
        setWaitlistStatsState('ready');
      } else if (response.status === 'created') {
        setWaitlistTotal((current) =>
          current === null ? current : current + 1
        );
      }
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

  const liveWaitlistLabel =
    waitlistTotal !== null
      ? `${waitlistCountFormatter.format(waitlistTotal)} waiting`
      : waitlistStatsState === 'loading'
        ? 'Loading...'
        : 'Waitlist open';

  return (
    <div className="relative bg-black text-white selection:bg-white/20">
      <div className="pointer-events-none fixed inset-0 z-0 h-screen w-full bg-[#020202]">
        <Canvas camera={{ position: [0, 0, 12], fov: 60 }} dpr={[1, 2]}>
          <Starfield />
        </Canvas>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_12%,#000_100%)] opacity-44" />
      </div>

      <nav
        ref={navRef}
        className="pointer-events-none fixed inset-x-0 top-0 z-50"
      >
        {/* Dynamic Nav Shield - Blurs scrolling content below the navbar elements */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          className="absolute inset-x-0 top-0 -z-10 bg-black/5 backdrop-blur-xl transition-all duration-300"
          style={{
            height: navHeight + 24,
            maskImage:
              'linear-gradient(to bottom, black 0%, black 80%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 0%, black 80%, transparent 100%)',
          }}
        />

        <div className="nav-flare absolute inset-x-0 top-0 -z-20 h-32 bg-gradient-to-b from-black/60 via-black/20 to-transparent" />

        <PageRail className="pt-4">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="pointer-events-auto relative flex flex-col items-center gap-4 sm:min-h-[68px] lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-0"
          >
            {/* Top Row for Mobile (Brand & Toggle) / Col 1 & 3 for Desktop */}
            <div className="flex w-full items-center justify-between lg:contents">
              <div className="flex items-center justify-start lg:w-full">
                <BrandLogo />
              </div>

              {/* Actions - Right on mobile, Col 3 on desktop */}
              <div className="flex items-center justify-end lg:order-3 lg:w-full">
                <ThemeToggle className="scale-90 lg:scale-100" />
              </div>
            </div>

            {/* Nav - Center for everything */}
            <div className="order-2 flex w-full justify-center lg:order-2">
              <CenterNav activeSection={activeSection} />
            </div>
          </motion.div>
        </PageRail>
      </nav>

      <motion.div
        style={{ y }}
        className="relative z-10 flex w-full flex-1 flex-col items-center"
      >
        <section
          id="hero"
          className="w-full transition-all duration-300"
          style={{ paddingTop: navHeight + 48 }}
        >
          <PageRail
            className="flex flex-col items-center justify-center pb-16 text-center transition-all duration-300"
            style={{ minHeight: `calc(100svh - ${navHeight + 48}px)` }}
          >
            <motion.div
              style={{ opacity, scale }}
              className="mx-auto flex max-w-[1120px] flex-col items-center gap-5"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 2, ease: 'easeOut' }}
                className="relative mb-4 inline-flex items-center gap-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.06)] sm:gap-3 sm:px-5 sm:py-2"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff22] opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00ff22] shadow-[0_0_12px_#00ff22]"></span>
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">
                  Private beta waitlist
                </span>
                <span className="h-3 w-px bg-white/10" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/96">
                  {liveWaitlistLabel}
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
                className="max-w-[10.5ch] pb-2 text-center text-[40px] font-light leading-tight tracking-[-0.02em] [text-wrap:balance] sm:text-[58px] md:text-[104px] md:leading-[1.0] lg:text-[144px]"
              >
                <span className="block bg-gradient-to-b from-white via-white/[0.60] to-white/10 bg-clip-text text-transparent">
                  Your{' '}
                  <span className="gold-text-fix bg-gradient-to-b from-[#FBF5B7] via-[#D4AF37] to-[#996515] bg-clip-text text-transparent">
                    inbox
                  </span>
                </span>
                <span className="block bg-gradient-to-b from-white/10 via-white/[0.60] to-white bg-clip-text text-transparent [text-shadow:0_0_24px_rgba(255,255,255,0.08)]">
                  runs itself!
                </span>
              </motion.h1>

              <motion.p
                style={{ opacity: 1, transform: 'none' }}
                className="mt-2 max-w-2xl mx-auto text-center text-base font-light leading-relaxed text-white/40 md:text-xl"
              >
                IIL turns emails into clear tasks, replies, and follow-ups.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 1.4,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.32,
                }}
                className="mt-6 w-full max-w-2xl sm:mt-10"
              >
                <AnimatePresence mode="wait">
                  {waitlistStatus === 'idle' ? (
                    <motion.form
                      key="form"
                      onSubmit={handleWaitlist}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="mx-auto flex w-full flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),_0_0_40px_rgba(255,255,255,0.02)] transition-all duration-500 focus-within:border-white/30 focus-within:bg-white/[0.04] sm:w-fit sm:flex-row sm:rounded-full"
                    >
                      <div className="relative flex w-full flex-1 items-center">
                        <input
                          type="text"
                          required
                          placeholder="Gmail username"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="w-full flex-1 border-none bg-transparent px-6 py-4 text-sm text-white outline-none placeholder:text-white/50"
                        />
                        <span className="pointer-events-none pr-6 text-sm font-medium text-white/20">
                          @gmail.com
                        </span>
                      </div>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="flex h-[44px] w-full flex-none items-center justify-center gap-2 rounded-full bg-white px-6 text-[10px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all hover:scale-[1.02] active:scale-95 sm:w-auto sm:px-12 sm:text-[11px] sm:tracking-[0.15em]"
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
          </PageRail>
        </section>

        <section
          id="problem"
          className="flex min-h-[calc(100svh-100px)] w-full flex-col justify-center pb-12 md:pb-24"
        >
          <PageRail>
            <FadeInText className="flex flex-col items-center text-center">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)]">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/64">
                  The Problem
                </span>
              </div>
              <h2 className="mt-4 max-w-[54rem] text-2xl font-light tracking-tight text-white sm:mt-6 sm:text-3xl md:text-5xl">
                Reading email is easy. Keeping up is not.
              </h2>
              <p
                className="mt-2 max-w-4xl text-base font-light leading-relaxed text-white/40 md:text-xl"
                style={{ opacity: 1, transform: 'none' }}
              >
                The hard part is remembering what each message needs from you.
                Deadlines, follow-ups, scheduling, requests, and key details get
                buried across threads.
              </p>
            </FadeInText>

            <div className="mt-10 grid w-full grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
              {launchProofCards.map((card, index) => (
                <FadeInText
                  key={card.label}
                  delay={index * 0.08}
                  className="group relative overflow-hidden rounded-[24px] border border-white/[0.05] bg-white/[0.02] p-8 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-500 hover:border-white/[0.1] hover:bg-white/[0.04]"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="relative z-10 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    {card.label}
                  </div>
                  <h3 className="relative z-10 mt-4 text-xl font-light leading-tight text-white sm:mt-5 sm:text-2xl">
                    {card.title}
                  </h3>
                  <p className="relative z-10 mt-4 text-sm font-light leading-7 text-white/40">
                    {card.desc}
                  </p>
                </FadeInText>
              ))}
            </div>
          </PageRail>
        </section>

        <div id="execution" className="w-full">
          {narrativeSections.map((section, index) => (
            <section
              key={section.label}
              className="flex min-h-[calc(100svh-100px)] w-full flex-col justify-center"
            >
              <PageRail
                className={`flex flex-col items-center justify-center gap-8 sm:gap-12 ${
                  section.layout === 'reverse'
                    ? 'md:flex-row-reverse'
                    : 'md:flex-row'
                } md:gap-24`}
              >
                <div className="w-full max-w-[44rem] flex-1">
                  <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: '-10%' }}
                  >
                    <motion.div
                      variants={fadeUpChild}
                      className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)]"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/64">
                        {section.label}
                      </span>
                    </motion.div>
                    <motion.h2
                      variants={fadeUpChild}
                      className="mb-6 pb-4 bg-gradient-to-b from-white via-white/92 to-white/70 bg-clip-text text-[28px] font-light leading-[1.05] tracking-tight text-transparent sm:mb-8 sm:text-[40px] md:text-[60px] lg:text-[70px]"
                    >
                      {section.title}
                    </motion.h2>
                    <motion.p
                      variants={fadeUpChild}
                      style={{ opacity: 1, transform: 'none' }}
                      className="mt-2 max-w-2xl text-base font-light leading-relaxed text-white/40 md:text-xl"
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
                      lightSrc={section.lightSrc}
                      glowColor={section.glowColor}
                      reverse={section.reverse}
                      delay={index * 0.2}
                      alt={section.title}
                    />
                  </FadeInText>
                </div>
              </PageRail>
            </section>
          ))}
        </div>

        <section
          id="features"
          className="flex min-h-[calc(100svh-100px)] w-full flex-col items-center justify-center"
        >
          <PageRail>
            <FadeInText className="mb-10 w-full md:mb-14">
              <div className="mx-auto flex flex-col items-center gap-6 text-center">
                <h3 className="max-w-[44rem] text-2xl font-light tracking-tight text-white sm:text-3xl md:text-5xl">
                  What it handles for you.
                </h3>
                <p
                  className="mt-2 max-w-2xl text-base font-light leading-relaxed text-white/40 md:text-xl"
                  style={{ opacity: 1, transform: 'none' }}
                >
                  It finds the work inside email, keeps it visible, and helps
                  you follow through without relying on memory.
                </p>
              </div>
            </FadeInText>
            <div className="grid w-full grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
              {featureCards.map((item, index) => (
                <FadeInText
                  key={item.title}
                  delay={index * 0.05}
                  className="group relative overflow-hidden rounded-[20px] border border-white/[0.05] bg-white/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-500 hover:border-white/[0.1] hover:bg-white/[0.04] sm:rounded-[24px] sm:p-8"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />
                  <h4 className="relative z-10 mb-2 text-[11px] font-semibold text-white/96 sm:mb-3 sm:text-sm">
                    {item.title}
                  </h4>
                  <p className="relative z-10 text-[10px] font-light leading-relaxed text-white/40 sm:text-[13px]">
                    {item.desc}
                  </p>
                </FadeInText>
              ))}
            </div>
          </PageRail>
        </section>

        <section
          id="waitlist"
          className="relative z-20 w-full pb-8 pt-32 text-center"
        >
          <PageRail className="flex flex-col items-center">
            <FadeInText className="flex w-full max-w-2xl flex-col items-center">
              <h2 className="mb-6 bg-gradient-to-b from-white via-white/[0.7] to-white/[0.3] bg-clip-text text-3xl font-light leading-snug tracking-tight text-transparent sm:mb-8 sm:text-4xl md:text-[70px] md:leading-[1.15]">
                Ready to stop carrying every thread in your head?
              </h2>
              <p
                className="mt-2 mb-12 max-w-2xl text-base font-light leading-relaxed text-white/40 md:text-xl"
                style={{ opacity: 1, transform: 'none' }}
              >
                Join the waitlist for priority onboarding, early feedback
                access, and first release invites.
              </p>

              <AnimatePresence mode="wait">
                {waitlistStatus === 'idle' ? (
                  <motion.form
                    key="form-bottom"
                    onSubmit={handleWaitlist}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),_0_0_40px_rgba(255,255,255,0.02)] transition-colors focus-within:border-white/20 focus-within:bg-white/[0.04] sm:flex-row sm:gap-3 sm:rounded-full"
                  >
                    <div className="relative flex w-full flex-1 items-center">
                      <input
                        type="text"
                        required
                        placeholder="Gmail username"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="w-full flex-1 border-none bg-transparent px-6 py-4 text-sm text-white outline-none placeholder:text-white/50"
                      />
                      <span className="pointer-events-none pr-6 text-sm font-medium text-white/20">
                        @gmail.com
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex h-12 w-full flex-shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 text-[9px] font-bold uppercase tracking-[0.15em] text-black transition-all hover:scale-[1.02] active:scale-95 sm:w-auto sm:px-10 sm:text-[10px] sm:tracking-[0.2em]"
                    >
                      {submitting ? 'Submitting...' : 'Get Priority Access'}
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

            <div className="mt-16 flex items-center gap-6 text-[9px] font-bold uppercase tracking-[0.2em] text-white/40 md:gap-12">
              <span>IIL (c) 2026</span>
            </div>
          </PageRail>
        </section>
      </motion.div>
    </div>
  );
}
