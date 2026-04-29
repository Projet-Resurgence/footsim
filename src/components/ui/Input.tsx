import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Props = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm placeholder:text-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent',
        className,
      )}
      {...rest}
    />
  );
});
