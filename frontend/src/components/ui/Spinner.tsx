import { cn } from '@/lib/utils'

function Spinner({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary',
        className
      )}
      role="status"
      aria-label="Loading"
      {...props}
    />
  )
}

export { Spinner }