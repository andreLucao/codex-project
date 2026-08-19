type HelloResponse = {
  message: string;
  timestamp: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getHello(): Promise<HelloResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/hello`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const data = await getHello();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Next.js + Express</h1>
      {data ? (
        <div className="rounded-lg border border-black/10 p-6 text-center">
          <p className="text-lg">{data.message}</p>
          <p className="mt-2 text-sm opacity-60">{data.timestamp}</p>
        </div>
      ) : (
        <p className="text-red-600">
          Could not reach the API at {API_URL}. Is the server running?
        </p>
      )}
    </main>
  );
}
