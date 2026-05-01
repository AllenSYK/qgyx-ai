export default function Loading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 h-20 animate-pulse rounded-[28px] bg-white/80 shadow-sm" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-3xl bg-white/80 shadow-sm" />
        ))}
      </div>
      <div className="mt-6 h-96 animate-pulse rounded-[28px] bg-white/80 shadow-sm" />
    </main>
  );
}
