import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Stalla Ciravolo", template: "%s · Stalla Ciravolo" },
  description: "Gestionale della Stalla Ciravolo",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2e1c10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-dvh">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              toast: "!bg-paper !text-ink !border !border-[#b89a66] !rounded-[3px] !font-serif !text-[15px]",
              error: "!border-blood !text-blood",
              success: "!border-sage",
            },
          }}
        />
      </body>
    </html>
  );
}
