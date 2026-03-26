export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-emerald-600">Lista</h1>
      </div>
      {children}
    </div>
  );
}
