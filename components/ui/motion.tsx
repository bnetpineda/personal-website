"use client";

import { motion, type Variants, useReducedMotion } from "motion/react";
import { type ReactNode, useState, useEffect } from "react";

// Custom hook to safely use reduced motion without hydration mismatch
function useSafeReducedMotion() {
  const [isClient, setIsClient] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    setTimeout(() => setIsClient(true), 0);
  }, []);

  // Return false on server and initial client render to match SSR
  // Only use actual value after hydration is complete
  return isClient ? shouldReduceMotion : false;
}

// Animation variants
const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const fadeInUpVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

const fadeInDownVariants: Variants = {
  hidden: { opacity: 0, y: -40 },
  visible: { opacity: 1, y: 0 },
};

const fadeInLeftVariants: Variants = {
  hidden: { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0 },
};

const fadeInRightVariants: Variants = {
  hidden: { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0 },
};

const scaleInVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1 },
};

const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

type AnimationVariant = 
  | "fadeIn" 
  | "fadeInUp" 
  | "fadeInDown" 
  | "fadeInLeft" 
  | "fadeInRight" 
  | "scaleIn";

interface AnimatedProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  once?: boolean;
}

interface FadeInProps extends AnimatedProps {
  variant?: AnimationVariant;
}

const variantMap: Record<AnimationVariant, Variants> = {
  fadeIn: fadeInVariants,
  fadeInUp: fadeInUpVariants,
  fadeInDown: fadeInDownVariants,
  fadeInLeft: fadeInLeftVariants,
  fadeInRight: fadeInRightVariants,
  scaleIn: scaleInVariants,
};

export function FadeIn({
  children,
  className,
  variant = "fadeInUp",
  delay = 0,
  duration = 0.5,
  once = true,
}: FadeInProps) {
  const shouldReduceMotion = useSafeReducedMotion();

  const finalVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      }
    : variantMap[variant];

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "-100px" }}
      variants={finalVariants}
      transition={{ duration: shouldReduceMotion ? 0 : duration, delay: shouldReduceMotion ? 0 : delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface StaggerContainerProps extends AnimatedProps {
  staggerDelay?: number;
}

export function StaggerContainer({
  children,
  className,
  delay = 0,
  staggerDelay = 0.1,
  once = true,
}: StaggerContainerProps) {
  const shouldReduceMotion = useSafeReducedMotion();
  
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "-100px" }}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: shouldReduceMotion ? 0 : staggerDelay,
            delayChildren: shouldReduceMotion ? 0 : delay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  duration = 0.5,
}: Omit<AnimatedProps, "delay" | "once">) {
  const shouldReduceMotion = useSafeReducedMotion();

  const finalVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      }
    : staggerItemVariants;

  return (
    <motion.div
      variants={finalVariants}
      transition={{ duration: shouldReduceMotion ? 0 : duration, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Hover animations for interactive elements
export function HoverScale({
  children,
  className,
  scale = 1.05,
}: {
  children: ReactNode;
  className?: string;
  scale?: number;
}) {
  const shouldReduceMotion = useSafeReducedMotion();

  return (
    <motion.div
      whileHover={shouldReduceMotion ? {} : { scale }}
      whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Text reveal animation
export function TextReveal({
  children,
  className,
  delay = 0,
}: AnimatedProps) {
  const shouldReduceMotion = useSafeReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
      whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: shouldReduceMotion ? 0 : delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Export motion for custom animations
export { motion };
export { staggerContainerVariants, staggerItemVariants };
