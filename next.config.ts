import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["elope-rethink-lying.ngrok-free.dev"],
  // Особистий кабінет курʼєра переїхав у Telegram-бота — старі посилання
  // (/cabinet, /cabinet/login тощо) ведуть до бота.
  async redirects() {
    const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "powerdrive_scooter_bot";
    return [
      { source: "/cabinet", destination: `https://t.me/${bot}`, permanent: false },
      { source: "/cabinet/:path*", destination: `https://t.me/${bot}`, permanent: false },
    ];
  },
};

export default nextConfig;
