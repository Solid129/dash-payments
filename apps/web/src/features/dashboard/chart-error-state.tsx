export function ChartErrorState({ message = "Couldn't load this chart." }: { message?: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
