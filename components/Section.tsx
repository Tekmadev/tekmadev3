import { cn } from "@/lib/cn";

type SectionProps = {
  id?: string;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
  as?: "section" | "div";
};

export function Section({ id, className, containerClassName, children, as = "section" }: SectionProps) {
  const Tag = as;
  return (
    <Tag id={id} className={cn("relative w-full", className)}>
      <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10", containerClassName)}>
        {children}
      </div>
    </Tag>
  );
}

export function Eyebrow({
  children,
  className,
  centered,
}: {
  children: React.ReactNode;
  className?: string;
  centered?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 text-ink-3",
        centered ? "justify-center" : "",
        className,
      )}
    >
      <span className="h-px w-8 bg-ink-4" />
      <span className="eyebrow">{children}</span>
    </div>
  );
}
