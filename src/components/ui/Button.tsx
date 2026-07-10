import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost' | 'danger' | 'outline' | 'soft' | 'gold';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 ' +
  'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 select-none';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent/90 shadow-sm shadow-accent/25',
  ghost: 'bg-transparent text-text hover:bg-border/60',
  danger: 'bg-danger text-white hover:bg-danger/90 shadow-sm shadow-danger/20',
  outline: 'bg-transparent border border-border text-text hover:border-accent/60 hover:text-accent',
  soft: 'bg-accent/10 text-accent hover:bg-accent/20',
  gold: 'bg-gold text-on-accent hover:bg-gold/90 shadow-sm shadow-gold/25',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = 'primary', size = 'md', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    />
  );
});
