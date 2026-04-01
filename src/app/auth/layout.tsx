import { I18nProvider } from "@/i18n/i18n-provider";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <I18nProvider initialLocale="pt">
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-emerald-600">Meu Cesto</h1>
        </div>
        {children}
      </div>
    </I18nProvider>
  );
}
