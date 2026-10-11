import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/site-header";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Shoe Rental", template: "%s · Shoe Rental" },
  description: "Rent shoes by the wear you actually use.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Day or night mode the visitor picked (none: follow the device setting).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="en"
      data-theme={theme ?? undefined}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
