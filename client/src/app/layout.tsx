import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mesa Certa | Cadastro",
  description: "Cadastre seu restaurante para começar a cotar com fornecedores.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
