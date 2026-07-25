// The shop is in Phnom Penh; hosts run containers in UTC. Set this before the
// server boots so every timestamp is Cambodia time. See src/lib/tz.ts.
process.env.TZ = process.env.TZ || "Asia/Phnom_Penh";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
