export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-10">
      <div className="border border-line bg-paper px-6 py-12 text-center sm:px-10">
        <h1 className="font-display text-2xl font-bold">No card at this link</h1>
        <p className="mx-auto mt-3 max-w-sm text-ink-soft">
          The link may have a typo, or the card was removed by whoever made it.
        </p>
      </div>
    </main>
  );
}
